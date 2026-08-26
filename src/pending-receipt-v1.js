export const PENDING_RECEIPT_FORMAT = 'proofstamp-receipt'
export const PENDING_RECEIPT_VERSION = 1
export const PENDING_RECEIPT_STATUS = 'pending'

function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  if (typeof btoa !== 'function') throw new Error('Base64 encoding is unavailable')
  return btoa(binary)
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(bytes, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('Web Crypto SHA-256 is unavailable')
  const digest = await subtle.digest('SHA-256', bytes)
  return bytesToHex(new Uint8Array(digest))
}

export async function createPendingReceiptV1(localDraft, stampResult, subtle = globalThis.crypto?.subtle) {
  if (localDraft?.format !== 'proofstamp-local-draft' || localDraft?.version !== 1 || localDraft?.status !== 'local-only-not-timestamped') {
    throw new Error('A valid ProofStamp local draft is required')
  }
  if (stampResult?.status !== 'pending' || !(stampResult.proofBytes instanceof Uint8Array)) {
    throw new Error('A valid pending OpenTimestamps result is required')
  }
  if (localDraft.manifestCommitmentSha256 !== stampResult.manifestCommitmentSha256) {
    throw new Error('Pending proof does not match the local Manifest commitment')
  }
  if (!Array.isArray(stampResult.calendarsAccepted) || stampResult.calendarsAccepted.length < 1) {
    throw new Error('At least one accepted calendar is required')
  }

  const proofSha256 = await sha256Hex(stampResult.proofBytes, subtle)
  return Object.freeze({
    format: PENDING_RECEIPT_FORMAT,
    version: PENDING_RECEIPT_VERSION,
    status: PENDING_RECEIPT_STATUS,
    target: 'bitcoin',
    canonicalManifestUtf8Base64: localDraft.canonicalManifestUtf8Base64,
    manifestCommitmentSha256: localDraft.manifestCommitmentSha256,
    localHashAgreement: localDraft.localHashAgreement,
    openTimestamps: Object.freeze({
      proofBase64: bytesToBase64(stampResult.proofBytes),
      proofSha256,
      calendarsAttempted: Object.freeze([...stampResult.calendarsAttempted]),
      calendarsAccepted: Object.freeze([...stampResult.calendarsAccepted]),
      calendarsFailed: Object.freeze([...stampResult.calendarsFailed]),
      redundancy: stampResult.redundancy,
    }),
  })
}
