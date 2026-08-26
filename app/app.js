import {
  canonicalManifestText,
  manifestCommitmentHex,
} from './manifest-v1.js'
import { dualSha256File, MAX_BROWSER_FILE_BYTES } from './local-hash.js'
import { createLocalDraftV1 } from './local-draft-v1.js'

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

let prepared = null

function setStatus(message, isError = false) {
  status.textContent = message
  status.classList.toggle('error', isError)
}

function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function safeBaseName(name) {
  const trimmed = String(name || 'file').replace(/[\\/]/g, '_').slice(0, 120)
  return trimmed || 'file'
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  result.hidden = true
  prepared = null
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
    setStatus('Both local SHA-256 methods agree. Nothing has been submitted to a timestamp service.')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Local preparation failed.', true)
  } finally {
    prepareButton.disabled = false
    fileInput.disabled = false
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
