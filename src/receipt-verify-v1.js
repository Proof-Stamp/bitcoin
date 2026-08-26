import { parseCanonicalManifestBytes, manifestCommitmentHex } from './manifest-v1.js'
import { inspectOpenTimestampsProof, MAX_IMPORTED_OTS_BYTES } from './ots-upgrade-verify.js'

export const MAX_IMPORTED_RECEIPT_BYTES = 256 * 1024
const HEX64_RE = /^[0-9a-f]{64}$/
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function utf8Bytes(text) {
  return new TextEncoder().encode(text)
}

function base64ToBytes(value, label) {
  if (typeof value !== 'string' || value.length === 0 || !BASE64_RE.test(value)) {
    throw new Error(`${label} is not canonical base64`)
  }
  let binary
  try {
    binary = atob(value)
  } catch (cause) {
    throw new Error(`${label} is not valid base64`, { cause })
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  let check = ''
  for (const byte of bytes) check += String.fromCharCode(byte)
  if (btoa(check) !== value) throw new Error(`${label} is not canonical base64`)
  return bytes
}

function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
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

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be an array of strings`)
  }
}

function assertReceiptShape(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('Receipt must be a JSON object')
  if (receipt.format !== 'proofstamp-receipt' || receipt.version !== 1 || receipt.target !== 'bitcoin') {
    throw new Error('Unsupported ProofStamp receipt')
  }
  if (receipt.status !== 'pending' && receipt.status !== 'bitcoin-attestation-verified') {
    throw new Error('Unsupported ProofStamp receipt status')
  }
  if (typeof receipt.canonicalManifestUtf8Base64 !== 'string' || !HEX64_RE.test(receipt.manifestCommitmentSha256)) {
    throw new Error('Receipt manifest binding is invalid')
  }
  const agreement = receipt.localHashAgreement
  if (!agreement || agreement.algorithm !== 'sha256' || agreement.fileSha256 !== agreement.webCryptoSha256 || agreement.fileSha256 !== agreement.rustSha256 || !HEX64_RE.test(agreement.fileSha256)) {
    throw new Error('Receipt local hash agreement is invalid')
  }
  const ots = receipt.openTimestamps
  if (!ots || typeof ots !== 'object' || typeof ots.proofBase64 !== 'string' || !HEX64_RE.test(ots.proofSha256)) {
    throw new Error('Receipt OpenTimestamps proof metadata is invalid')
  }
  assertStringArray(ots.calendarsAttempted, 'calendarsAttempted')
  assertStringArray(ots.calendarsAccepted, 'calendarsAccepted')
  assertStringArray(ots.calendarsFailed, 'calendarsFailed')
  if (ots.redundancy !== 'normal' && ots.redundancy !== 'reduced') throw new Error('Receipt redundancy value is invalid')
}

export async function parseAndValidateProofStampReceiptText(text, subtle = globalThis.crypto?.subtle) {
  if (typeof text !== 'string') throw new TypeError('Receipt text is required')
  const encoded = utf8Bytes(text)
  if (encoded.byteLength === 0 || encoded.byteLength > MAX_IMPORTED_RECEIPT_BYTES) {
    throw new Error(`Receipt must be between 1 and ${MAX_IMPORTED_RECEIPT_BYTES} bytes`)
  }
  if (encoded[0] === 0xef && encoded[1] === 0xbb && encoded[2] === 0xbf) throw new Error('Receipt must not start with a UTF-8 BOM')

  let receipt
  try {
    receipt = JSON.parse(text)
  } catch (cause) {
    throw new Error('Receipt is not valid JSON', { cause })
  }
  assertReceiptShape(receipt)

  const manifestBytes = base64ToBytes(receipt.canonicalManifestUtf8Base64, 'canonicalManifestUtf8Base64')
  const manifest = parseCanonicalManifestBytes(manifestBytes)
  const commitment = await manifestCommitmentHex(manifest, subtle)
  if (commitment !== receipt.manifestCommitmentSha256) throw new Error('Receipt Manifest commitment does not match its canonical Manifest bytes')
  if (manifest.evidence[0].sha256 !== receipt.localHashAgreement.fileSha256) {
    throw new Error('Receipt local file hash does not match the committed Manifest')
  }

  const proofBytes = base64ToBytes(receipt.openTimestamps.proofBase64, 'openTimestamps.proofBase64')
  if (proofBytes.byteLength > MAX_IMPORTED_OTS_BYTES) throw new Error('Embedded OpenTimestamps proof is too large')
  if (await sha256Hex(proofBytes, subtle) !== receipt.openTimestamps.proofSha256) {
    throw new Error('Embedded OpenTimestamps proof SHA-256 does not match the receipt')
  }
  const proof = inspectOpenTimestampsProof(proofBytes)
  if (proof.fileDigestSha256 !== receipt.manifestCommitmentSha256) {
    throw new Error('OpenTimestamps proof is not bound to the receipt Manifest commitment')
  }

  return Object.freeze({ receipt, manifest, manifestBytes, proofBytes, proof })
}

export async function updateReceiptWithProof(
  validatedReceipt,
  proofBytes,
  verification = null,
  subtle = globalThis.crypto?.subtle,
) {
  assertReceiptShape(validatedReceipt)
  const proof = inspectOpenTimestampsProof(proofBytes)
  if (proof.fileDigestSha256 !== validatedReceipt.manifestCommitmentSha256) {
    throw new Error('Updated OpenTimestamps proof does not match the receipt Manifest commitment')
  }

  const next = {
    format: 'proofstamp-receipt',
    version: 1,
    status: verification ? 'bitcoin-attestation-verified' : 'pending',
    target: 'bitcoin',
    canonicalManifestUtf8Base64: validatedReceipt.canonicalManifestUtf8Base64,
    manifestCommitmentSha256: validatedReceipt.manifestCommitmentSha256,
    localHashAgreement: validatedReceipt.localHashAgreement,
    openTimestamps: {
      proofBase64: bytesToBase64(proofBytes),
      proofSha256: await sha256Hex(proofBytes, subtle),
      calendarsAttempted: [...validatedReceipt.openTimestamps.calendarsAttempted],
      calendarsAccepted: [...validatedReceipt.openTimestamps.calendarsAccepted],
      calendarsFailed: [...validatedReceipt.openTimestamps.calendarsFailed],
      redundancy: validatedReceipt.openTimestamps.redundancy,
    },
  }

  if (verification) {
    if (verification.valid !== true || verification.method !== 'blockstream-esplora-raw-header' || verification.consensusValidation !== false) {
      throw new Error('Unsupported Bitcoin verification result')
    }
    next.bitcoinVerification = {
      method: verification.method,
      consensusValidation: false,
      blockHeight: verification.earliest.height,
      blockHash: verification.earliest.blockHash,
      blockTime: verification.earliest.blockTime,
    }
  }

  return Object.freeze(next)
}
