import {
  canonicalManifestText,
  manifestCommitmentHex,
} from './manifest-v1.js'
import { dualSha256File, MAX_BROWSER_FILE_BYTES } from './local-hash.js'
import { createLocalDraftV1 } from './local-draft-v1.js'
import { createPendingTimestamp } from './ots-stamp.js'
import { createPendingReceiptV1 } from './pending-receipt-v1.js'
import {
  upgradeOpenTimestampsProof,
  verifyBitcoinAttestations,
} from './ots-upgrade-verify.js'
import {
  MAX_IMPORTED_RECEIPT_BYTES,
  parseAndValidateProofStampReceiptText,
  updateReceiptWithProof,
} from './receipt-verify-v1.js'

const form = document.querySelector('#prepare-form')
const fileInput = document.querySelector('#file')
const descriptionInput = document.querySelector('#description')
const includeMetadataInput = document.querySelector('#include-metadata')
const prepareButton = document.querySelector('#prepare-button')
const status = document.querySelector('#status')
const result = document.querySelector('#result')
const fileSha = document.querySelector('#file-sha')
const manifestCommitment = document.querySelector('#manifest-commitment')
const manifestText = document.querySelector('#manifest-text')
const downloadManifestButton = document.querySelector('#download-manifest')
const downloadDraftButton = document.querySelector('#download-draft')
const submitTimestampButton = document.querySelector('#submit-timestamp')
const timestampResult = document.querySelector('#timestamp-result')
const timestampBadge = document.querySelector('#timestamp-badge')
const calendarCount = document.querySelector('#calendar-count')
const proofSha = document.querySelector('#proof-sha')
const timestampNote = document.querySelector('#timestamp-note')
const downloadProofButton = document.querySelector('#download-proof')
const downloadReceiptButton = document.querySelector('#download-receipt')
const checkCurrentProofButton = document.querySelector('#check-current-proof')

const savedReceiptInput = document.querySelector('#saved-receipt')
const checkSavedProofButton = document.querySelector('#check-saved-proof')
const savedStatus = document.querySelector('#saved-status')
const verificationResult = document.querySelector('#verification-result')
const verificationKicker = document.querySelector('#verification-kicker')
const verificationBadge = document.querySelector('#verification-badge')
const verifiedCommitment = document.querySelector('#verified-commitment')
const verifiedHeightRow = document.querySelector('#verified-height-row')
const verifiedHashRow = document.querySelector('#verified-hash-row')
const verifiedTimeRow = document.querySelector('#verified-time-row')
const verifiedHeight = document.querySelector('#verified-height')
const verifiedBlockHash = document.querySelector('#verified-block-hash')
const verifiedBlockTime = document.querySelector('#verified-block-time')
const verificationMethod = document.querySelector('#verification-method')
const verificationNote = document.querySelector('#verification-note')
const saveCheckedReceiptButton = document.querySelector('#save-checked-receipt')
const saveCheckedProofButton = document.querySelector('#save-checked-proof')

let prepared = null
let pending = null
let checked = null

function setStatus(message, isError = false) {
  status.textContent = message
  status.classList.toggle('error', isError)
}

function setSavedStatus(message, isError = false) {
  savedStatus.textContent = message
  savedStatus.classList.toggle('error', isError)
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function downloadText(filename, text, type = 'application/json') {
  downloadBlob(filename, new Blob([text], { type }))
}

function downloadBytes(filename, bytes, type = 'application/vnd.opentimestamps.v1') {
  downloadBlob(filename, new Blob([bytes], { type }))
}

function safeBaseName(name) {
  const trimmed = String(name || 'proofstamp').replace(/[\\/]/g, '_').slice(0, 120)
  return trimmed || 'proofstamp'
}

function receiptBaseName(name) {
  return safeBaseName(String(name || 'proofstamp').replace(/\.proofstamp-receipt\.json$/i, '').replace(/\.json$/i, ''))
}

function invalidatePrepared() {
  if (!prepared && !pending) return
  prepared = null
  pending = null
  result.hidden = true
  timestampResult.hidden = true
  setStatus('The inputs changed. Run the local checks again before submitting.')
}

function resetVerificationRows() {
  verifiedHeightRow.hidden = true
  verifiedHashRow.hidden = true
  verifiedTimeRow.hidden = true
  verifiedHeight.textContent = ''
  verifiedBlockHash.textContent = ''
  verifiedBlockTime.textContent = ''
}

function renderChecked(resultPackage) {
  const { receipt, verification, upgrade } = resultPackage
  checked = resultPackage
  verifiedCommitment.textContent = receipt.manifestCommitmentSha256
  resetVerificationRows()

  if (verification) {
    verificationKicker.textContent = 'Bitcoin attestation verified'
    verificationBadge.textContent = 'Verified via browser'
    verifiedHeight.textContent = String(verification.earliest.height)
    verifiedBlockHash.textContent = verification.earliest.blockHash
    verifiedBlockTime.textContent = new Date(verification.earliest.blockTime * 1000).toISOString()
    verifiedHeightRow.hidden = false
    verifiedHashRow.hidden = false
    verifiedTimeRow.hidden = false
    verificationMethod.textContent = 'OpenTimestamps + Blockstream raw block header'
    verificationNote.textContent = 'The proof has a Bitcoin attestation that matches the fetched raw block header. The explorer supplies the current best-chain block hash at that height; ProofStamp does not independently run Bitcoin consensus in the browser.'
  } else {
    verificationKicker.textContent = 'Proof checked'
    verificationBadge.textContent = 'Pending'
    verificationMethod.textContent = 'OpenTimestamps calendar upgrade check'
    const skipped = upgrade.skippedUnapprovedCalendars.length
    const failed = upgrade.failedCalendars.length
    const notes = ['No verified Bitcoin attestation is available yet. Keep the updated receipt and .ots proof and check again later.']
    if (skipped > 0) notes.push(`${skipped} unapproved calendar address${skipped === 1 ? ' was' : 'es were'} ignored without making a request.`)
    if (failed > 0) notes.push(`${failed} approved calendar request${failed === 1 ? '' : 's'} failed during this check.`)
    verificationNote.textContent = notes.join(' ')
  }

  verificationResult.hidden = false
}

async function checkReceiptProof(receipt, proofBytes, baseName) {
  const upgrade = await upgradeOpenTimestampsProof(proofBytes)
  let verification = null
  if (upgrade.state === 'bitcoin-attested') {
    verification = await verifyBitcoinAttestations(upgrade.proofBytes)
  }
  const updatedReceipt = await updateReceiptWithProof(receipt, upgrade.proofBytes, verification)
  const resultPackage = Object.freeze({
    receipt: updatedReceipt,
    proofBytes: upgrade.proofBytes,
    verification,
    upgrade,
    baseName,
  })
  renderChecked(resultPackage)
  return resultPackage
}

fileInput.addEventListener('change', invalidatePrepared)
descriptionInput.addEventListener('input', invalidatePrepared)
includeMetadataInput.addEventListener('change', invalidatePrepared)

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  result.hidden = true
  timestampResult.hidden = true
  prepared = null
  pending = null
  setStatus('')

  const [file] = fileInput.files
  if (!file) {
    setStatus('Choose one file first.', true)
    return
  }
  if (file.size > MAX_BROWSER_FILE_BYTES) {
    setStatus('This browser version accepts files up to 50 MiB.', true)
    return
  }

  prepareButton.disabled = true
  fileInput.disabled = true
  try {
    setStatus('Reading the file locally and running two independent SHA-256 checks…')
    const agreement = await dualSha256File(file)

    const evidence = { sha256: agreement.sha256, size: file.size }
    if (includeMetadataInput.checked) {
      if (file.name) evidence.name = file.name
      if (file.type) evidence.mediaType = file.type
    }

    const manifest = {
      format: 'proofstamp-manifest',
      version: 1,
      hashAlgorithm: 'sha256',
      evidence: [evidence],
    }
    if (descriptionInput.value.length > 0) manifest.description = descriptionInput.value

    const canonical = canonicalManifestText(manifest)
    const commitment = await manifestCommitmentHex(manifest)
    const draft = await createLocalDraftV1(manifest, agreement)

    prepared = { file, manifest, canonical, commitment, draft }
    fileSha.textContent = agreement.sha256
    manifestCommitment.textContent = commitment
    manifestText.textContent = canonical
    result.hidden = false
    submitTimestampButton.disabled = false
    setStatus('Both local SHA-256 methods agree. Nothing has been submitted yet.')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Local preparation failed.', true)
  } finally {
    prepareButton.disabled = false
    fileInput.disabled = false
  }
})

submitTimestampButton.addEventListener('click', async () => {
  if (!prepared || pending) return
  submitTimestampButton.disabled = true
  try {
    setStatus('Submitting a blinded Manifest commitment to the approved OpenTimestamps calendars…')
    const stamp = await createPendingTimestamp(prepared.commitment)
    const receipt = await createPendingReceiptV1(prepared.draft, stamp)
    pending = { stamp, receipt }

    calendarCount.textContent = `${stamp.calendarsAccepted.length} of ${stamp.calendarsAttempted.length}`
    proofSha.textContent = receipt.openTimestamps.proofSha256
    timestampBadge.textContent = 'Pending'
    timestampNote.textContent = stamp.redundancy === 'reduced'
      ? 'Only one calendar accepted this submission. The proof is valid but has reduced upgrade redundancy. Keep the pending proof.'
      : 'The timestamp is pending Bitcoin confirmation. Keep the receipt and .ots proof so it can be upgraded later.'
    timestampResult.hidden = false
    setStatus(stamp.redundancy === 'reduced'
      ? 'Timestamp submitted with reduced calendar redundancy. This is not Bitcoin confirmation yet.'
      : 'Timestamp submitted. This is not Bitcoin confirmation yet.')
  } catch (error) {
    submitTimestampButton.disabled = false
    setStatus(error instanceof Error ? error.message : 'Timestamp submission failed.', true)
  }
})

checkCurrentProofButton.addEventListener('click', async () => {
  if (!prepared || !pending) return
  checkCurrentProofButton.disabled = true
  try {
    setStatus('Checking approved calendars for an upgrade and verifying any Bitcoin attestation…')
    const checkedCurrent = await checkReceiptProof(pending.receipt, pending.stamp.proofBytes, safeBaseName(prepared.file.name))
    pending = {
      stamp: { ...pending.stamp, proofBytes: checkedCurrent.proofBytes },
      receipt: checkedCurrent.receipt,
    }
    proofSha.textContent = checkedCurrent.receipt.openTimestamps.proofSha256
    if (checkedCurrent.verification) {
      timestampBadge.textContent = 'Bitcoin attestation verified'
      setStatus('Bitcoin attestation verified in the browser using a self-authenticated raw block header.')
    } else {
      setStatus('Still pending. No verified Bitcoin attestation is available yet.')
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Bitcoin status check failed.', true)
  } finally {
    checkCurrentProofButton.disabled = false
  }
})

checkSavedProofButton.addEventListener('click', async () => {
  verificationResult.hidden = true
  checked = null
  setSavedStatus('')
  const [receiptFile] = savedReceiptInput.files
  if (!receiptFile) {
    setSavedStatus('Choose a ProofStamp receipt first.', true)
    return
  }
  if (receiptFile.size === 0 || receiptFile.size > MAX_IMPORTED_RECEIPT_BYTES) {
    setSavedStatus('The receipt file is outside the supported size limit.', true)
    return
  }

  checkSavedProofButton.disabled = true
  savedReceiptInput.disabled = true
  try {
    setSavedStatus('Validating the receipt locally…')
    const validated = await parseAndValidateProofStampReceiptText(await receiptFile.text())
    setSavedStatus('Receipt bindings are valid. Checking approved calendars and Bitcoin status…')
    const resultPackage = await checkReceiptProof(validated.receipt, validated.proofBytes, receiptBaseName(receiptFile.name))
    setSavedStatus(resultPackage.verification
      ? 'Receipt is internally consistent and its Bitcoin attestation verified through the browser check.'
      : 'Receipt is internally consistent. The OpenTimestamps proof is still pending.')
  } catch (error) {
    setSavedStatus(error instanceof Error ? error.message : 'Receipt check failed.', true)
  } finally {
    checkSavedProofButton.disabled = false
    savedReceiptInput.disabled = false
  }
})

downloadManifestButton.addEventListener('click', () => {
  if (!prepared) return
  downloadText(`${safeBaseName(prepared.file.name)}.proofstamp-manifest.json`, prepared.canonical)
})

downloadDraftButton.addEventListener('click', () => {
  if (!prepared) return
  downloadText(`${safeBaseName(prepared.file.name)}.proofstamp-draft.json`, `${JSON.stringify(prepared.draft, null, 2)}\n`)
})

downloadProofButton.addEventListener('click', () => {
  if (!prepared || !pending) return
  downloadBytes(`${safeBaseName(prepared.file.name)}.proofstamp.ots`, pending.stamp.proofBytes)
})

downloadReceiptButton.addEventListener('click', () => {
  if (!prepared || !pending) return
  downloadText(`${safeBaseName(prepared.file.name)}.proofstamp-receipt.json`, `${JSON.stringify(pending.receipt, null, 2)}\n`)
})

saveCheckedProofButton.addEventListener('click', () => {
  if (!checked) return
  downloadBytes(`${checked.baseName}.proofstamp.ots`, checked.proofBytes)
})

saveCheckedReceiptButton.addEventListener('click', () => {
  if (!checked) return
  downloadText(`${checked.baseName}.proofstamp-receipt.json`, `${JSON.stringify(checked.receipt, null, 2)}\n`)
})
