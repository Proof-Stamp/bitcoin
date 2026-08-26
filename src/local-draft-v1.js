import {
  canonicalManifestBytes,
  manifestCommitmentHex,
  parseCanonicalManifestBytes,
} from './manifest-v1.js'

export const LOCAL_DRAFT_FORMAT = 'proofstamp-local-draft'
export const LOCAL_DRAFT_VERSION = 1
export const LOCAL_DRAFT_STATUS = 'local-only-not-timestamped'

function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  if (typeof btoa !== 'function') throw new Error('Base64 encoding is unavailable')
  return btoa(binary)
}

export async function createLocalDraftV1(manifest, agreement, subtle = globalThis.crypto?.subtle) {
  if (!agreement || agreement.agreed !== true) {
    throw new Error('Dual SHA-256 agreement is required before creating a local draft')
  }
  if (agreement.algorithm !== 'sha256' || agreement.sha256 !== agreement.webCryptoSha256 || agreement.sha256 !== agreement.rustSha256) {
    throw new Error('Dual SHA-256 agreement is internally inconsistent')
  }
  if (manifest?.evidence?.[0]?.sha256 !== agreement.sha256) {
    throw new Error('Manifest file fingerprint does not match the agreed local SHA-256')
  }

  const canonicalBytes = canonicalManifestBytes(manifest)
  parseCanonicalManifestBytes(canonicalBytes)
  const commitment = await manifestCommitmentHex(manifest, subtle)

  return Object.freeze({
    format: LOCAL_DRAFT_FORMAT,
    version: LOCAL_DRAFT_VERSION,
    status: LOCAL_DRAFT_STATUS,
    canonicalManifestUtf8Base64: bytesToBase64(canonicalBytes),
    manifestCommitmentSha256: commitment,
    localHashAgreement: Object.freeze({
      algorithm: 'sha256',
      fileSha256: agreement.sha256,
      webCryptoSha256: agreement.webCryptoSha256,
      rustSha256: agreement.rustSha256,
    }),
  })
}
