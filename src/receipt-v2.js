import { inspectOpenTimestampsProof, MAX_IMPORTED_OTS_BYTES } from './ots-upgrade-verify.js'

export const RECEIPT_V2_FORMAT = 'proofstamp-receipt'
export const RECEIPT_V2_VERSION = 2
export const MAX_IMPORTED_RECEIPT_BYTES_V2 = 256 * 1024
export const MAX_RECEIPT_JSON_DEPTH_V2 = 32
export const MAX_RECEIPT_CALENDARS_V2 = 16
export const MAX_RECEIPT_CALENDAR_URL_BYTES_V2 = 512

const HEX64_RE = /^[0-9a-f]{64}$/
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const TOP_LEVEL_KEYS = new Set([
  'format',
  'version',
  'status',
  'target',
  'proofTarget',
  'fileSha256',
  'localHashAgreement',
  'openTimestamps',
  'bitcoinVerification',
])
const HASH_AGREEMENT_KEYS = new Set(['algorithm', 'fileSha256', 'webCryptoSha256', 'rustSha256'])
const OTS_KEYS = new Set([
  'proofBase64',
  'proofSha256',
  'calendarsAttempted',
  'calendarsAccepted',
  'calendarsFailed',
  'redundancy',
])
const BITCOIN_VERIFICATION_KEYS = new Set([
  'method',
  'consensusValidation',
  'blockHeight',
  'blockHash',
  'blockTime',
])

function utf8Bytes(text) {
  return new TextEncoder().encode(text)
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object`)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} must be a plain object`)
}

function assertAllowedKeys(value, allowed, required, label) {
  assertPlainObject(value, label)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown field ${JSON.stringify(key)}`)
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label} is missing required field ${JSON.stringify(key)}`)
  }
}

function assertNoDuplicateObjectKeys(text) {
  let index = 0

  function skipWhitespace() {
    while (index < text.length && /\s/.test(text[index])) index += 1
  }

  function readString() {
    const start = index
    index += 1
    let escaped = false
    while (index < text.length) {
      const character = text[index]
      index += 1
      if (escaped) {
        escaped = false
        continue
      }
      if (character === '\\') {
        escaped = true
        continue
      }
      if (character === '"') return JSON.parse(text.slice(start, index))
    }
    throw new Error('Receipt JSON string is unterminated')
  }

  function skipPrimitive() {
    while (index < text.length && !/[\s,\]}]/.test(text[index])) index += 1
  }

  function scanValue(depth) {
    if (depth > MAX_RECEIPT_JSON_DEPTH_V2) throw new Error(`Receipt JSON exceeds the ${MAX_RECEIPT_JSON_DEPTH_V2}-level nesting limit`)
    skipWhitespace()
    const character = text[index]
    if (character === '{') return scanObject(depth + 1)
    if (character === '[') return scanArray(depth + 1)
    if (character === '"') return readString()
    skipPrimitive()
  }

  function scanObject(depth) {
    index += 1
    skipWhitespace()
    if (text[index] === '}') {
      index += 1
      return
    }
    const keys = new Set()
    while (index < text.length) {
      skipWhitespace()
      if (text[index] !== '"') throw new Error('Receipt JSON object key is invalid')
      const key = readString()
      if (keys.has(key)) throw new Error(`Receipt JSON contains duplicate object key ${JSON.stringify(key)}`)
      keys.add(key)
      skipWhitespace()
      if (text[index] !== ':') throw new Error('Receipt JSON object separator is invalid')
      index += 1
      scanValue(depth)
      skipWhitespace()
      if (text[index] === '}') {
        index += 1
        return
      }
      if (text[index] !== ',') throw new Error('Receipt JSON object delimiter is invalid')
      index += 1
    }
    throw new Error('Receipt JSON object is unterminated')
  }

  function scanArray(depth) {
    index += 1
    skipWhitespace()
    if (text[index] === ']') {
      index += 1
      return
    }
    while (index < text.length) {
      scanValue(depth)
      skipWhitespace()
      if (text[index] === ']') {
        index += 1
        return
      }
      if (text[index] !== ',') throw new Error('Receipt JSON array delimiter is invalid')
      index += 1
    }
    throw new Error('Receipt JSON array is unterminated')
  }

  scanValue(0)
  skipWhitespace()
  if (index !== text.length) throw new Error('Receipt JSON contains trailing data')
}

function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  if (typeof btoa !== 'function') throw new Error('Base64 encoding is unavailable')
  return btoa(binary)
}

function base64ToBytes(value, label) {
  if (typeof value !== 'string' || value.length === 0 || !BASE64_RE.test(value)) throw new Error(`${label} is not canonical base64`)
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

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(bytes, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('Web Crypto SHA-256 is unavailable')
  const digest = await subtle.digest('SHA-256', bytes)
  return bytesToHex(new Uint8Array(digest))
}

function assertCalendarOrigin(value, label) {
  if (typeof value !== 'string' || utf8Bytes(value).byteLength > MAX_RECEIPT_CALENDAR_URL_BYTES_V2) {
    throw new Error(`${label} contains an invalid calendar address`)
  }
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${label} contains an invalid calendar address`)
  }
  if (
    parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash ||
    (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.origin !== value.replace(/\/$/, '')
  ) throw new Error(`${label} must contain HTTPS calendar origins only`)
  return parsed.origin
}

function assertCalendarArray(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || value.length > MAX_RECEIPT_CALENDARS_V2 || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} contains an invalid number of calendar origins`)
  }
  const normalized = value.map((item) => assertCalendarOrigin(item, label))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must not contain duplicate calendar origins`)
  return normalized
}

function assertCalendarMetadata(ots) {
  const attempted = assertCalendarArray(ots.calendarsAttempted, 'calendarsAttempted', { allowEmpty: false })
  const accepted = assertCalendarArray(ots.calendarsAccepted, 'calendarsAccepted', { allowEmpty: false })
  const failed = assertCalendarArray(ots.calendarsFailed, 'calendarsFailed')
  const attemptedSet = new Set(attempted)
  const acceptedSet = new Set(accepted)
  const failedSet = new Set(failed)
  for (const calendar of acceptedSet) {
    if (!attemptedSet.has(calendar)) throw new Error('calendarsAccepted must be a subset of calendarsAttempted')
    if (failedSet.has(calendar)) throw new Error('A calendar cannot be both accepted and failed')
  }
  for (const calendar of failedSet) if (!attemptedSet.has(calendar)) throw new Error('calendarsFailed must be a subset of calendarsAttempted')
  if (acceptedSet.size + failedSet.size !== attemptedSet.size) throw new Error('Calendar metadata is incomplete')
  if (ots.redundancy !== 'normal' && ots.redundancy !== 'reduced') throw new Error('Receipt redundancy value is invalid')
  if (ots.redundancy !== (accepted.length >= 2 ? 'normal' : 'reduced')) throw new Error('Receipt redundancy does not match the accepted calendar count')
}

function assertBitcoinVerificationShape(verification) {
  assertAllowedKeys(verification, BITCOIN_VERIFICATION_KEYS, BITCOIN_VERIFICATION_KEYS, 'bitcoinVerification')
  if (verification.method !== 'blockstream-esplora-raw-header' || verification.consensusValidation !== false) {
    throw new Error('Unsupported Bitcoin verification metadata')
  }
  if (!Number.isSafeInteger(verification.blockHeight) || verification.blockHeight < 0) throw new Error('bitcoinVerification.blockHeight is invalid')
  if (typeof verification.blockHash !== 'string' || !HEX64_RE.test(verification.blockHash)) throw new Error('bitcoinVerification.blockHash is invalid')
  if (!Number.isSafeInteger(verification.blockTime) || verification.blockTime <= 0) throw new Error('bitcoinVerification.blockTime is invalid')
}

function assertHashAgreement(agreement) {
  assertAllowedKeys(agreement, HASH_AGREEMENT_KEYS, HASH_AGREEMENT_KEYS, 'localHashAgreement')
  if (
    agreement.algorithm !== 'sha256' || !HEX64_RE.test(agreement.fileSha256) ||
    agreement.fileSha256 !== agreement.webCryptoSha256 || agreement.fileSha256 !== agreement.rustSha256
  ) throw new Error('Receipt local hash agreement is invalid')
}

function assertReceiptV2Shape(receipt) {
  const required = new Set(['format', 'version', 'status', 'target', 'proofTarget', 'fileSha256', 'localHashAgreement', 'openTimestamps'])
  assertAllowedKeys(receipt, TOP_LEVEL_KEYS, required, 'Receipt')
  if (receipt.format !== RECEIPT_V2_FORMAT || receipt.version !== RECEIPT_V2_VERSION || receipt.target !== 'bitcoin') {
    throw new Error('Unsupported ProofStamp receipt')
  }
  if (receipt.proofTarget !== 'file-sha256') throw new Error('Unsupported ProofStamp proof target')
  if (receipt.status !== 'pending' && receipt.status !== 'bitcoin-attestation-verified') throw new Error('Unsupported ProofStamp receipt status')
  if (typeof receipt.fileSha256 !== 'string' || !HEX64_RE.test(receipt.fileSha256)) throw new Error('Receipt file SHA-256 is invalid')
  assertHashAgreement(receipt.localHashAgreement)
  if (receipt.localHashAgreement.fileSha256 !== receipt.fileSha256) throw new Error('Receipt file SHA-256 does not match local hash agreement')

  const ots = receipt.openTimestamps
  assertAllowedKeys(ots, OTS_KEYS, OTS_KEYS, 'openTimestamps')
  if (typeof ots.proofBase64 !== 'string' || !HEX64_RE.test(ots.proofSha256)) throw new Error('Receipt OpenTimestamps proof metadata is invalid')
  assertCalendarMetadata(ots)

  if (receipt.status === 'bitcoin-attestation-verified') {
    if (!Object.hasOwn(receipt, 'bitcoinVerification')) throw new Error('Verified receipt is missing bitcoinVerification metadata')
    assertBitcoinVerificationShape(receipt.bitcoinVerification)
  } else if (Object.hasOwn(receipt, 'bitcoinVerification')) {
    throw new Error('Pending receipt must not contain bitcoinVerification metadata')
  }
}

function assertVerificationResult(verification) {
  if (
    !verification || verification.valid !== true || verification.method !== 'blockstream-esplora-raw-header' ||
    verification.consensusValidation !== false || !verification.earliest ||
    !Number.isSafeInteger(verification.earliest.height) || verification.earliest.height < 0 ||
    typeof verification.earliest.blockHash !== 'string' || !HEX64_RE.test(verification.earliest.blockHash) ||
    !Number.isSafeInteger(verification.earliest.blockTime) || verification.earliest.blockTime <= 0
  ) throw new Error('Unsupported Bitcoin verification result')
}

export async function createPendingReceiptV2(hashAgreement, stampResult, subtle = globalThis.crypto?.subtle) {
  assertHashAgreement(hashAgreement)
  if (stampResult?.status !== 'pending' || !(stampResult.proofBytes instanceof Uint8Array)) throw new Error('A valid pending OpenTimestamps result is required')
  if (stampResult.fileSha256 !== hashAgreement.fileSha256 || stampResult.digestSha256 !== hashAgreement.fileSha256) {
    throw new Error('Pending proof does not match the file SHA-256')
  }
  if (!Array.isArray(stampResult.calendarsAccepted) || stampResult.calendarsAccepted.length < 1) throw new Error('At least one accepted calendar is required')

  const receipt = {
    format: RECEIPT_V2_FORMAT,
    version: RECEIPT_V2_VERSION,
    status: 'pending',
    target: 'bitcoin',
    proofTarget: 'file-sha256',
    fileSha256: hashAgreement.fileSha256,
    localHashAgreement: hashAgreement,
    openTimestamps: {
      proofBase64: bytesToBase64(stampResult.proofBytes),
      proofSha256: await sha256Hex(stampResult.proofBytes, subtle),
      calendarsAttempted: [...stampResult.calendarsAttempted],
      calendarsAccepted: [...stampResult.calendarsAccepted],
      calendarsFailed: [...stampResult.calendarsFailed],
      redundancy: stampResult.redundancy,
    },
  }
  assertReceiptV2Shape(receipt)
  return Object.freeze(receipt)
}

export async function parseAndValidateProofStampReceiptV2Text(text, subtle = globalThis.crypto?.subtle) {
  if (typeof text !== 'string') throw new TypeError('Receipt text is required')
  const encoded = utf8Bytes(text)
  if (encoded.byteLength === 0 || encoded.byteLength > MAX_IMPORTED_RECEIPT_BYTES_V2) {
    throw new Error(`Receipt must be between 1 and ${MAX_IMPORTED_RECEIPT_BYTES_V2} bytes`)
  }
  if (encoded[0] === 0xef && encoded[1] === 0xbb && encoded[2] === 0xbf) throw new Error('Receipt must not start with a UTF-8 BOM')

  let receipt
  try {
    receipt = JSON.parse(text)
  } catch (cause) {
    throw new Error('Receipt is not valid JSON', { cause })
  }
  assertNoDuplicateObjectKeys(text)
  assertReceiptV2Shape(receipt)

  const proofBytes = base64ToBytes(receipt.openTimestamps.proofBase64, 'openTimestamps.proofBase64')
  if (proofBytes.byteLength > MAX_IMPORTED_OTS_BYTES) throw new Error('Embedded OpenTimestamps proof is too large')
  if (await sha256Hex(proofBytes, subtle) !== receipt.openTimestamps.proofSha256) throw new Error('Embedded OpenTimestamps proof SHA-256 does not match the receipt')
  const proof = inspectOpenTimestampsProof(proofBytes)
  if (proof.fileDigestSha256 !== receipt.fileSha256) throw new Error('OpenTimestamps proof is not bound directly to the receipt file SHA-256')
  if (receipt.status === 'bitcoin-attestation-verified') {
    if (proof.state !== 'bitcoin-attested') throw new Error('Verified receipt does not contain a Bitcoin attestation')
    if (!proof.bitcoinHeights.includes(receipt.bitcoinVerification.blockHeight)) throw new Error('Verified receipt block height is not present in the OpenTimestamps proof')
  }

  return Object.freeze({ receipt, proofBytes, proof, proofTarget: 'file-sha256' })
}

export async function updateReceiptV2WithProof(receipt, proofBytes, verification = null, subtle = globalThis.crypto?.subtle) {
  assertReceiptV2Shape(receipt)
  const proof = inspectOpenTimestampsProof(proofBytes)
  if (proof.fileDigestSha256 !== receipt.fileSha256) throw new Error('Updated OpenTimestamps proof does not match the receipt file SHA-256')

  const next = {
    format: RECEIPT_V2_FORMAT,
    version: RECEIPT_V2_VERSION,
    status: verification ? 'bitcoin-attestation-verified' : 'pending',
    target: 'bitcoin',
    proofTarget: 'file-sha256',
    fileSha256: receipt.fileSha256,
    localHashAgreement: receipt.localHashAgreement,
    openTimestamps: {
      proofBase64: bytesToBase64(proofBytes),
      proofSha256: await sha256Hex(proofBytes, subtle),
      calendarsAttempted: [...receipt.openTimestamps.calendarsAttempted],
      calendarsAccepted: [...receipt.openTimestamps.calendarsAccepted],
      calendarsFailed: [...receipt.openTimestamps.calendarsFailed],
      redundancy: receipt.openTimestamps.redundancy,
    },
  }

  if (verification) {
    assertVerificationResult(verification)
    if (!proof.bitcoinHeights.includes(verification.earliest.height)) throw new Error('Bitcoin verification height is not present in the updated OpenTimestamps proof')
    next.bitcoinVerification = {
      method: verification.method,
      consensusValidation: false,
      blockHeight: verification.earliest.height,
      blockHash: verification.earliest.blockHash,
      blockTime: verification.earliest.blockTime,
    }
  }

  assertReceiptV2Shape(next)
  return Object.freeze(next)
}
