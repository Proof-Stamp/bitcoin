import { rustSha256Bytes } from './rust-sha256.js'

export const HASH_ALGORITHM = 'SHA-256'
export const MAX_BROWSER_FILE_BYTES = 50 * 1024 * 1024

export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function webCryptoSha256Bytes(bytes, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('Web Crypto SHA-256 is unavailable')
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const digest = await subtle.digest(HASH_ALGORITHM, input)
  return bytesToHex(new Uint8Array(digest))
}

export async function dualSha256Bytes(
  bytes,
  { subtle = globalThis.crypto?.subtle, rustHasher = rustSha256Bytes } = {},
) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (typeof rustHasher !== 'function') throw new Error('Independent Rust SHA-256 is unavailable')

  const [webCryptoSha256, rustSha256] = await Promise.all([
    webCryptoSha256Bytes(input, subtle),
    rustHasher(input),
  ])

  if (webCryptoSha256 !== rustSha256) {
    throw new Error('Independent SHA-256 checks disagree')
  }

  return Object.freeze({
    algorithm: 'sha256',
    sha256: webCryptoSha256,
    webCryptoSha256,
    rustSha256,
    agreed: true,
  })
}

export async function dualSha256File(file, options = {}) {
  if (!file || typeof file.arrayBuffer !== 'function' || !Number.isSafeInteger(file.size) || file.size < 0) {
    throw new TypeError('A valid local file is required')
  }
  if (file.size > MAX_BROWSER_FILE_BYTES) {
    throw new RangeError(`File exceeds the ${MAX_BROWSER_FILE_BYTES}-byte browser hashing limit`)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.byteLength !== file.size) throw new Error('Local file byte length changed while reading')

  const agreement = await dualSha256Bytes(bytes, options)
  return Object.freeze({ ...agreement, size: file.size })
}
