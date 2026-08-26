import {
  canonicalManifestText,
  manifestCommitmentHex,
} from './manifest-v1.js'
import { dualSha256File, MAX_BROWSER_FILE_BYTES } from './local-hash.js'
import { createLocalDraftV1 } from './local-draft-v1.js'
import { createPendingTimestamp } from './ots-stamp.js'
import { createPendingReceiptV1 } from './pending-receipt-v1.js'

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

let prepared = null
let pending = null

function setStatus(message, isError = false) {
  status.textContent = message
  status.classList.toggle('error', isError)
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
  const trimmed = String(name || 'file').replace(/[\\/]/g, '_').slice(0, 120)
  return trimmed || 'file'
}

function invalidatePrepared() {
  if (!prepared && !pending) return
  prepared = null
  pending = null
  result.hidden = true
  timestampResult.hidden = true
  setStatus('The inputs changed. Run the local checks again before submitting.')
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
