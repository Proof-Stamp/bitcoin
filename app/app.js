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
const savedOriginalFileInput = document.querySelector('#saved-original-file')
const checkSavedProofButton = document.querySelector('#check-saved-proof')
const savedStatus = document.querySelector('#saved-status')
const verificationResult = document.querySelector('#verification-result')
const verificationKicker = document.querySelector('#verification-kicker')
const verificationHeading = document.querySelector('#verification-heading')
const verificationBadge = document.querySelector('#verification-badge')
const verifiedFileRow = document.querySelector('#verified-file-row')
const verifiedFileSha = document.querySelector('#verified-file-sha')
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
let sourceEpoch = 0
let activeVerificationRun = null

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

function clearChecked(source = null) {
  if (source && checked?.source !== source) return
  checked = null
  verificationResult.hidden = true
}

function beginVerificationRun(source) {
  const token = Object.freeze({ source, id: Symbol(source) })
  activeVerificationRun = token
  return token
}

function verificationRunIsCurrent(token) {
  return activeVerificationRun === token
}

function invalidatePrepared() {
  sourceEpoch += 1
  prepared = null
  pending = null
  result.hidden = true
  timestampResult.hidden = true
  if (activeVerificationRun?.source === 'current') activeVerificationRun = null
  clearChecked('current')
  setStatus('The inputs changed. Check the file locally again before submitting.')
}

function resetVerificationRows() {
  verifiedFileRow.hidden = true
  verifiedHeightRow.hidden = true
  verifiedHashRow.hidden = true
  verifiedTimeRow.hidden = true
  verifiedFileSha.textContent = ''
  verifiedHeight.textContent = ''
  verifiedBlockHash.textContent = ''
  verifiedBlockTime.textContent = ''
}

function renderChecked(resultPackage, source) {
  const { receipt, verification, upgrade, fileVerification = null } = resultPackage
  checked = Object.freeze({ ...resultPackage, source })
  verifiedCommitment.textContent = receipt.manifestCommitmentSha256
  resetVerificationRows()

  if (fileVerification?.matches) {
    verifiedFileSha.textContent = fileVerification.sha256
    verifiedFileRow.hidden = false
  }

  if (verification) {
    if (fileVerification?.matches) {
      verificationKicker.textContent = 'File matches this ProofStamp'
      verificationHeading.textContent = 'ProofStamp verified'
      verificationBadge.textContent = 'File + Bitcoin verified'
    } else {
      verificationKicker.textContent = 'Bitcoin attestation verified'
      verificationHeading.textContent = 'Bitcoin status'
      verificationBadge.textContent = 'Verified via browser'
    }
    verifiedHeight.textContent = String(verification.earliest.height)
    verifiedBlockHash.textContent = verification.earliest.blockHash
    verifiedBlockTime.textContent = new Date(verification.earliest.blockTime * 1000).toISOString()
    verifiedHeightRow.hidden = false
    verifiedHashRow.hidden = false
    verifiedTimeRow.hidden = false
    verificationMethod.textContent = fileVerification?.matches
      ? 'Local dual SHA-256 match + OpenTimestamps + Blockstream raw block header'
      : 'OpenTimestamps + Blockstream raw block header'
    verificationNote.textContent = fileVerification?.matches
      ? 'The selected file has exactly the same SHA-256 fingerprint as the file recorded in this ProofStamp. The OpenTimestamps proof also has a Bitcoin attestation that matches the fetched raw block header. ProofStamp does not independently run Bitcoin consensus in the browser.'
      : 'The proof has a Bitcoin attestation that matches the fetched raw block header. The explorer supplies the current best-chain block hash at that height; ProofStamp does not independently run Bitcoin consensus in the browser.'
  } else {
    if (fileVerification?.matches) {
      verificationKicker.textContent = 'File matches this ProofStamp'
      verificationHeading.textContent = 'File verified'
      verificationBadge.textContent = 'Waiting for Bitcoin'
      verificationMethod.textContent = 'Local dual SHA-256 match + OpenTimestamps calendar upgrade check'
    } else {
      verificationKicker.textContent = 'Proof checked'
      verificationHeading.textContent = 'Bitcoin status'
      verificationBadge.textContent = 'Waiting for Bitcoin'
      verificationMethod.textContent = 'OpenTimestamps calendar upgrade check'
    }
    const skipped = upgrade.skippedUnapprovedCalendars.length
    const failed = upgrade.failedCalendars.length
    const notes = [fileVerification?.matches
      ? 'The selected file matches this ProofStamp. No verified Bitcoin attestation is available yet. You can close this page, keep the updated receipt, and check again later today.'
      : 'No verified Bitcoin attestation is available yet. You can close this page, keep the updated receipt, and check again later today.']
    notes.push('The receipt already contains the timestamp proof; saving the separate .ots file is optional and useful for independent verification.')
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
  return Object.freeze({
    receipt: updatedReceipt,
    proofBytes: upgrade.proofBytes,
    verification,
    upgrade,
    baseName,
  })
}

fileInput.addEventListener('change', invalidatePrepared)
descriptionInput.addEventListener('input', invalidatePrepared)
includeMetadataInput.addEventListener('change', invalidatePrepared)
for (const input of [savedReceiptInput, savedOriginalFileInput]) {
  input.addEventListener('change', () => {
    if (activeVerificationRun?.source === 'saved') activeVerificationRun = null
    clearChecked('saved')
    setSavedStatus('')
  })
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  result.hidden = true
  timestampResult.hidden = true
  clearChecked('current')
  prepared = null
  pending = null
  activeVerificationRun = null
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

  const epoch = ++sourceEpoch
  const description = descriptionInput.value
  const includeMetadata = includeMetadataInput.checked
  prepareButton.disabled = true
  fileInput.disabled = true
  descriptionInput.disabled = true
  includeMetadataInput.disabled = true
  try {
    setStatus('Reading the file locally and running two independent SHA-256 checks…')
    const agreement = await dualSha256File(file)

    const evidence = { sha256: agreement.sha256, size: file.size }
    if (includeMetadata) {
      if (file.name) evidence.name = file.name
      if (file.type) evidence.mediaType = file.type
    }

    const manifest = {
      format: 'proofstamp-manifest',
      version: 1,
      hashAlgorithm: 'sha256',
      evidence: [evidence],
    }
    if (description.length > 0) manifest.description = description

    const canonical = canonicalManifestText(manifest)
    const commitment = await manifestCommitmentHex(manifest)
    const draft = await createLocalDraftV1(manifest, agreement)
    if (epoch !== sourceEpoch) return

    prepared = { file, manifest, canonical, commitment, draft }
    fileSha.textContent = agreement.sha256
    manifestCommitment.textContent = commitment
    manifestText.textContent = canonical
    result.hidden = false
    submitTimestampButton.disabled = false
    setStatus('Both local SHA-256 methods agree. Nothing has been submitted yet.')
  } catch (error) {
    if (epoch === sourceEpoch) setStatus(error instanceof Error ? error.message : 'Local preparation failed.', true)
  } finally {
    prepareButton.disabled = false
    fileInput.disabled = false
    descriptionInput.disabled = false
    includeMetadataInput.disabled = false
  }
})

submitTimestampButton.addEventListener('click', async () => {
  if (!prepared || pending) return
  const epoch = sourceEpoch
  const preparedSnapshot = prepared
  submitTimestampButton.disabled = true
  try {
    setStatus('Submitting a blinded Manifest commitment to the approved OpenTimestamps calendars…')
    const stamp = await createPendingTimestamp(preparedSnapshot.commitment)
    const receipt = await createPendingReceiptV1(preparedSnapshot.draft, stamp)
    if (epoch !== sourceEpoch || prepared !== preparedSnapshot) return
    pending = { stamp, receipt }

    calendarCount.textContent = `${stamp.calendarsAccepted.length} of ${stamp.calendarsAttempted.length}`
    proofSha.textContent = receipt.openTimestamps.proofSha256
    timestampBadge.textContent = 'Waiting for Bitcoin'
    timestampNote.textContent = stamp.redundancy === 'reduced'
      ? 'Only one calendar accepted this submission. Save the receipt, then check it again in about 3 hours. The separate .ots proof is optional for normal ProofStamp use.'
      : 'Save the receipt, then check it again in about 3 hours. You can close this page. The separate .ots proof is optional for normal ProofStamp use.'
    timestampResult.hidden = false
    setStatus(stamp.redundancy === 'reduced'
      ? 'Timestamp request accepted with reduced calendar redundancy. It is still waiting for Bitcoin.'
      : 'Timestamp request accepted. It is now waiting for Bitcoin.')
  } catch (error) {
    if (epoch === sourceEpoch) setStatus(error instanceof Error ? error.message : 'Timestamp submission failed.', true)
  } finally {
    if (epoch === sourceEpoch && prepared === preparedSnapshot && !pending) submitTimestampButton.disabled = false
  }
})

checkCurrentProofButton.addEventListener('click', async () => {
  if (!prepared || !pending) return
  const epoch = sourceEpoch
  const preparedSnapshot = prepared
  const pendingSnapshot = pending
  const run = beginVerificationRun('current')
  checkCurrentProofButton.disabled = true
  try {
    setStatus('Checking approved calendars for an upgrade and verifying any Bitcoin attestation…')
    const checkedCurrent = await checkReceiptProof(pendingSnapshot.receipt, pendingSnapshot.stamp.proofBytes, safeBaseName(preparedSnapshot.file.name))
    if (!verificationRunIsCurrent(run) || epoch !== sourceEpoch || prepared !== preparedSnapshot || pending !== pendingSnapshot) return
    renderChecked(checkedCurrent, 'current')
    pending = {
      stamp: { ...pendingSnapshot.stamp, proofBytes: checkedCurrent.proofBytes },
      receipt: checkedCurrent.receipt,
    }
    proofSha.textContent = checkedCurrent.receipt.openTimestamps.proofSha256
    if (checkedCurrent.verification) {
      timestampBadge.textContent = 'Bitcoin attestation verified'
      setStatus('Bitcoin attestation verified in the browser using a self-authenticated raw block header.')
    } else {
      timestampBadge.textContent = 'Waiting for Bitcoin'
      setStatus('Still waiting for Bitcoin. Nothing is wrong. Save the receipt and check again later today.')
    }
  } catch (error) {
    if (verificationRunIsCurrent(run) && epoch === sourceEpoch) {
      setStatus(error instanceof Error ? error.message : 'Bitcoin status check failed.', true)
    }
  } finally {
    if (verificationRunIsCurrent(run)) activeVerificationRun = null
    checkCurrentProofButton.disabled = false
  }
})

checkSavedProofButton.addEventListener('click', async () => {
  clearChecked('saved')
  setSavedStatus('')
  const [receiptFile] = savedReceiptInput.files
  const [candidateFile] = savedOriginalFileInput.files
  if (!receiptFile) {
    setSavedStatus('Choose a ProofStamp receipt first.', true)
    return
  }
  if (receiptFile.size === 0 || receiptFile.size > MAX_IMPORTED_RECEIPT_BYTES) {
    setSavedStatus('The receipt file is outside the supported size limit.', true)
    return
  }
  if (candidateFile && candidateFile.size > MAX_BROWSER_FILE_BYTES) {
    setSavedStatus('The file to verify is larger than the 50 MiB browser limit.', true)
    return
  }

  const run = beginVerificationRun('saved')
  checkSavedProofButton.disabled = true
  savedReceiptInput.disabled = true
  savedOriginalFileInput.disabled = true
  try {
    setSavedStatus('Validating the receipt locally…')
    const validated = await parseAndValidateProofStampReceiptText(await receiptFile.text())
    if (!verificationRunIsCurrent(run)) return

    let fileVerification = null
    if (candidateFile) {
      setSavedStatus('Checking the selected file locally with two independent SHA-256 methods…')
      const agreement = await dualSha256File(candidateFile)
      if (!verificationRunIsCurrent(run)) return
      if (agreement.sha256 !== validated.receipt.localHashAgreement.fileSha256) {
        setSavedStatus('This file does not match this ProofStamp. Its SHA-256 fingerprint is different. No calendar or Bitcoin request was made.', true)
        return
      }
      fileVerification = Object.freeze({ matches: true, sha256: agreement.sha256 })
      setSavedStatus('File matches the ProofStamp locally. Checking approved calendars and Bitcoin status…')
    } else {
      setSavedStatus('Receipt bindings are valid. Checking approved calendars and Bitcoin status…')
    }

    const resultPackage = await checkReceiptProof(validated.receipt, validated.proofBytes, receiptBaseName(receiptFile.name))
    if (!verificationRunIsCurrent(run)) return
    const checkedPackage = Object.freeze({ ...resultPackage, fileVerification })
    renderChecked(checkedPackage, 'saved')
    if (fileVerification) {
      setSavedStatus(resultPackage.verification
        ? 'File matches this ProofStamp and its Bitcoin attestation verified through the browser check.'
        : 'File matches this ProofStamp. The timestamp is still waiting for Bitcoin.')
    } else {
      setSavedStatus(resultPackage.verification
        ? 'Receipt is internally consistent and its Bitcoin attestation verified through the browser check. Add the original file above if you also want to verify the file itself.'
        : 'Receipt is internally consistent. The proof is still waiting for Bitcoin. Add the original file above if you also want to verify the file itself.')
    }
  } catch (error) {
    if (verificationRunIsCurrent(run)) setSavedStatus(error instanceof Error ? error.message : 'Receipt check failed.', true)
  } finally {
    if (verificationRunIsCurrent(run)) activeVerificationRun = null
    checkSavedProofButton.disabled = false
    savedReceiptInput.disabled = false
    savedOriginalFileInput.disabled = false
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
