import { dualSha256File, MAX_BROWSER_FILE_BYTES } from './local-hash.js'
import { createPendingFileTimestamp } from './ots-stamp.js'
import { createPendingReceiptV2 } from './receipt-v2.js'
import {
  upgradeOpenTimestampsProof,
  verifyBitcoinAttestations,
} from './ots-upgrade-verify.js'
import {
  MAX_IMPORTED_RECEIPT_BYTES,
  parseAndValidateProofStampReceiptText,
  receiptFileSha256,
  receiptTimestampDigestSha256,
  updateReceiptWithProof,
} from './receipt-verify.js'

const form = document.querySelector('#prepare-form')
const fileInput = document.querySelector('#file')
const prepareButton = document.querySelector('#prepare-button')
const status = document.querySelector('#status')
const result = document.querySelector('#result')
const fileSha = document.querySelector('#file-sha')
const submitTimestampButton = document.querySelector('#submit-timestamp')
const timestampResult = document.querySelector('#timestamp-result')
const timestampBadge = document.querySelector('#timestamp-badge')
const calendarCount = document.querySelector('#calendar-count')
const proofSha = document.querySelector('#proof-sha')
const timestampNote = document.querySelector('#timestamp-note')
const downloadProofButton = document.querySelector('#download-proof')
const downloadReceiptButton = document.querySelector('#download-receipt')
const checkCurrentProofButton = document.querySelector('#check-current-proof')
const verifyOpenTimestampsCurrentLink = document.querySelector('#verify-opentimestamps-current')

const savedReceiptInput = document.querySelector('#saved-receipt')
const savedOriginalFileInput = document.querySelector('#saved-original-file')
const checkSavedProofButton = document.querySelector('#check-saved-proof')
const checkReceiptOnlyButton = document.querySelector('#check-receipt-only')
const savedStatus = document.querySelector('#saved-status')
const verificationResult = document.querySelector('#verification-result')
const verificationKicker = document.querySelector('#verification-kicker')
const verificationHeading = document.querySelector('#verification-heading')
const verificationBadge = document.querySelector('#verification-badge')
const verifiedFileRow = document.querySelector('#verified-file-row')
const verifiedFileSha = document.querySelector('#verified-file-sha')
const verifiedDigestLabel = document.querySelector('#verified-digest-label')
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
const verifyOpenTimestampsCheckedLink = document.querySelector('#verify-opentimestamps-checked')

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

function proofBytesHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

function legacyOpenTimestampsVerifierUrl(proofBytes, digestSha256) {
  const url = new URL('https://opentimestamps.org/')
  url.searchParams.set('algorithm', 'SHA256')
  url.searchParams.set('digest', digestSha256)
  url.searchParams.set('ots', proofBytesHex(proofBytes))
  url.hash = 'stamp-and-verify'
  return url.toString()
}

function setOfficialOpenTimestampsVerifierLink(link, proofBytes, receipt = null) {
  if (receipt?.version === 1) {
    link.href = legacyOpenTimestampsVerifierUrl(proofBytes, receipt.manifestCommitmentSha256)
    link.dataset.mode = 'legacy-prefilled'
  } else {
    link.href = 'https://opentimestamps.org/#stamp-and-verify'
    link.dataset.mode = 'direct-file'
  }
  link.hidden = false
}

function clearChecked() {
  checked = null
  verificationResult.hidden = true
  verifyOpenTimestampsCheckedLink.hidden = true
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
  verifyOpenTimestampsCurrentLink.hidden = true
  if (activeVerificationRun?.source === 'current') activeVerificationRun = null
  clearChecked()
  setStatus('The file changed. Check it locally again before timestamping it.')
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

function renderChecked(resultPackage) {
  const { receipt, verification, upgrade, fileVerification = null } = resultPackage
  checked = Object.freeze({ ...resultPackage, source: 'saved' })
  const timestampDigest = receiptTimestampDigestSha256(receipt)
  verifiedCommitment.textContent = timestampDigest
  verifiedDigestLabel.textContent = receipt.version === 2 ? 'Timestamped file SHA-256' : 'Legacy Manifest commitment'
  setOfficialOpenTimestampsVerifierLink(verifyOpenTimestampsCheckedLink, resultPackage.proofBytes, receipt)
  resetVerificationRows()

  if (fileVerification?.matches) {
    verifiedFileSha.textContent = fileVerification.sha256
    verifiedFileRow.hidden = false
  }

  if (verification) {
    if (fileVerification?.matches) {
      verificationKicker.textContent = 'File matches this ProofStamp'
      verificationHeading.textContent = 'Verified'
      verificationBadge.textContent = 'File + Bitcoin verified'
    } else {
      verificationKicker.textContent = 'Receipt checked'
      verificationHeading.textContent = 'Bitcoin timestamp verified'
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
    verificationNote.textContent = receipt.version === 2
      ? 'This ProofStamp timestamps the file SHA-256 directly. The downloaded .ots proof can be paired with the original file in standard OpenTimestamps tools.'
      : 'This is a legacy Manifest-v1 ProofStamp. The file is bound through its Manifest rather than directly as the OpenTimestamps digest.'
  } else {
    if (fileVerification?.matches) {
      verificationKicker.textContent = 'File matches this ProofStamp'
      verificationHeading.textContent = 'File matches'
      verificationBadge.textContent = 'Waiting for Bitcoin'
      verificationMethod.textContent = 'Local dual SHA-256 match + OpenTimestamps calendar upgrade check'
    } else {
      verificationKicker.textContent = 'Receipt checked'
      verificationHeading.textContent = 'Timestamp status'
      verificationBadge.textContent = 'Waiting for Bitcoin'
      verificationMethod.textContent = 'OpenTimestamps calendar upgrade check'
    }
    const skipped = upgrade.skippedUnapprovedCalendars.length
    const failed = upgrade.failedCalendars.length
    const notes = ['No verified Bitcoin attestation is available yet. Keep the receipt and check again later.']
    if (skipped > 0) notes.push(`${skipped} unapproved calendar address${skipped === 1 ? ' was' : 'es were'} ignored.`)
    if (failed > 0) notes.push(`${failed} approved calendar request${failed === 1 ? '' : 's'} failed during this check.`)
    verificationNote.textContent = notes.join(' ')
  }

  verificationResult.hidden = false
}

async function checkReceiptProof(receipt, proofBytes, baseName) {
  const upgrade = await upgradeOpenTimestampsProof(proofBytes)
  let verification = null
  if (upgrade.state === 'bitcoin-attested') verification = await verifyBitcoinAttestations(upgrade.proofBytes)
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
for (const input of [savedReceiptInput, savedOriginalFileInput]) {
  input.addEventListener('change', () => {
    if (activeVerificationRun?.source === 'saved') activeVerificationRun = null
    clearChecked()
    setSavedStatus('')
  })
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  result.hidden = true
  timestampResult.hidden = true
  verifyOpenTimestampsCurrentLink.hidden = true
  clearChecked()
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
  prepareButton.disabled = true
  fileInput.disabled = true
  try {
    setStatus('Reading the file locally and running two independent SHA-256 checks…')
    const agreement = await dualSha256File(file)
    if (epoch !== sourceEpoch) return

    prepared = { file, agreement }
    fileSha.textContent = agreement.sha256
    result.hidden = false
    submitTimestampButton.disabled = false
    setStatus('Both local SHA-256 methods agree. Nothing has been submitted yet.')
  } catch (error) {
    if (epoch === sourceEpoch) setStatus(error instanceof Error ? error.message : 'Local file check failed.', true)
  } finally {
    prepareButton.disabled = false
    fileInput.disabled = false
  }
})

submitTimestampButton.addEventListener('click', async () => {
  if (!prepared || pending) return
  const epoch = sourceEpoch
  const preparedSnapshot = prepared
  submitTimestampButton.disabled = true
  try {
    setStatus('Submitting a blinded file fingerprint to the approved OpenTimestamps calendars…')
    const stamp = await createPendingFileTimestamp(preparedSnapshot.agreement.sha256)
    const receipt = await createPendingReceiptV2(preparedSnapshot.agreement, stamp)
    if (epoch !== sourceEpoch || prepared !== preparedSnapshot) return
    pending = { stamp, receipt }

    calendarCount.textContent = `${stamp.calendarsAccepted.length} of ${stamp.calendarsAttempted.length}`
    proofSha.textContent = receipt.openTimestamps.proofSha256
    timestampBadge.textContent = 'Waiting for Bitcoin'
    timestampNote.textContent = stamp.redundancy === 'reduced'
      ? 'Timestamp accepted by one calendar. Save the receipt and check again in about 3 hours.'
      : 'Save the receipt. You can close this page and check it again in about 3 hours.'
    setOfficialOpenTimestampsVerifierLink(verifyOpenTimestampsCurrentLink, stamp.proofBytes, receipt)
    timestampResult.hidden = false
    setStatus('Timestamp request accepted. The .ots proof is bound directly to this file SHA-256.')
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
    setStatus('Checking the timestamp status…')
    const checkedCurrent = await checkReceiptProof(
      pendingSnapshot.receipt,
      pendingSnapshot.stamp.proofBytes,
      safeBaseName(preparedSnapshot.file.name),
    )
    if (!verificationRunIsCurrent(run) || epoch !== sourceEpoch || prepared !== preparedSnapshot || pending !== pendingSnapshot) return
    pending = {
      stamp: { ...pendingSnapshot.stamp, proofBytes: checkedCurrent.proofBytes },
      receipt: checkedCurrent.receipt,
    }
    proofSha.textContent = checkedCurrent.receipt.openTimestamps.proofSha256
    setOfficialOpenTimestampsVerifierLink(verifyOpenTimestampsCurrentLink, checkedCurrent.proofBytes, checkedCurrent.receipt)
    if (checkedCurrent.verification) {
      const block = checkedCurrent.verification.earliest
      timestampBadge.textContent = 'Bitcoin timestamp verified'
      timestampNote.textContent = `Verified in Bitcoin block ${block.height}, ${new Date(block.blockTime * 1000).toISOString()}. Save the updated receipt.`
      setStatus('Bitcoin timestamp verified. The receipt now contains the verified block evidence.')
    } else {
      timestampBadge.textContent = 'Waiting for Bitcoin'
      timestampNote.textContent = 'Still waiting for Bitcoin. Keep the receipt and check again later. You can close this page.'
      setStatus('Still waiting for Bitcoin. Nothing is wrong.')
    }
  } catch (error) {
    if (verificationRunIsCurrent(run) && epoch === sourceEpoch) setStatus(error instanceof Error ? error.message : 'Timestamp status check failed.', true)
  } finally {
    if (verificationRunIsCurrent(run)) activeVerificationRun = null
    checkCurrentProofButton.disabled = false
  }
})

async function runSavedProofCheck({ verifyFile }) {
  clearChecked()
  setSavedStatus('')
  const [receiptFile] = savedReceiptInput.files
  const [candidateFile] = savedOriginalFileInput.files

  if (!receiptFile) {
    setSavedStatus(verifyFile ? 'Choose the file and its ProofStamp receipt.' : 'Choose a ProofStamp receipt first.', true)
    return
  }
  if (verifyFile && !candidateFile) {
    setSavedStatus('Choose the file you want to verify.', true)
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
  checkReceiptOnlyButton.disabled = true
  savedReceiptInput.disabled = true
  savedOriginalFileInput.disabled = true
  try {
    setSavedStatus('Checking the receipt locally…')
    const validated = await parseAndValidateProofStampReceiptText(await receiptFile.text())
    if (!verificationRunIsCurrent(run)) return

    let fileVerification = null
    if (verifyFile) {
      setSavedStatus('Checking the file locally…')
      const agreement = await dualSha256File(candidateFile)
      if (!verificationRunIsCurrent(run)) return
      if (agreement.sha256 !== receiptFileSha256(validated.receipt)) {
        setSavedStatus('This file does not match this ProofStamp. No calendar or Bitcoin request was made.', true)
        return
      }
      fileVerification = Object.freeze({ matches: true, sha256: agreement.sha256 })
      setSavedStatus('File matches. Checking timestamp status…')
    } else {
      setSavedStatus('Receipt is valid. Checking timestamp status…')
    }

    const resultPackage = await checkReceiptProof(validated.receipt, validated.proofBytes, receiptBaseName(receiptFile.name))
    if (!verificationRunIsCurrent(run)) return
    const checkedPackage = Object.freeze({ ...resultPackage, fileVerification })
    renderChecked(checkedPackage)
    if (fileVerification) {
      setSavedStatus(resultPackage.verification
        ? 'Verified. The file matches and the Bitcoin timestamp is available.'
        : 'The file matches. The Bitcoin timestamp is still pending.')
    } else {
      setSavedStatus(resultPackage.verification
        ? 'Receipt is valid and its Bitcoin timestamp is available.'
        : 'Receipt is valid. The Bitcoin timestamp is still pending.')
    }
  } catch (error) {
    if (verificationRunIsCurrent(run)) setSavedStatus(error instanceof Error ? error.message : 'ProofStamp check failed.', true)
  } finally {
    if (verificationRunIsCurrent(run)) activeVerificationRun = null
    checkSavedProofButton.disabled = false
    checkReceiptOnlyButton.disabled = false
    savedReceiptInput.disabled = false
    savedOriginalFileInput.disabled = false
  }
}

checkSavedProofButton.addEventListener('click', () => runSavedProofCheck({ verifyFile: true }))
checkReceiptOnlyButton.addEventListener('click', () => runSavedProofCheck({ verifyFile: false }))

downloadProofButton.addEventListener('click', () => {
  if (!prepared || !pending) return
  downloadBytes(`${safeBaseName(prepared.file.name)}.ots`, pending.stamp.proofBytes)
})

downloadReceiptButton.addEventListener('click', () => {
  if (!prepared || !pending) return
  downloadText(`${safeBaseName(prepared.file.name)}.proofstamp-receipt.json`, `${JSON.stringify(pending.receipt, null, 2)}\n`)
})

saveCheckedProofButton.addEventListener('click', () => {
  if (!checked) return
  downloadBytes(`${checked.baseName}.ots`, checked.proofBytes)
})

saveCheckedReceiptButton.addEventListener('click', () => {
  if (!checked) return
  downloadText(`${checked.baseName}.proofstamp-receipt.json`, `${JSON.stringify(checked.receipt, null, 2)}\n`)
})
