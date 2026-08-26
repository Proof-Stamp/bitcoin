import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

import { dualSha256Bytes, webCryptoSha256Bytes } from '../src/local-hash.js'
import { rustSha256Bytes } from '../src/rust-sha256.js'

const vectors = [
  new Uint8Array(),
  new TextEncoder().encode('abc'),
  Uint8Array.from({ length: 65 }, (_, index) => index),
  Uint8Array.from({ length: (1024 * 1024) + 17 }, (_, index) => index % 251),
]

for (const bytes of vectors) {
  const webCryptoHash = await webCryptoSha256Bytes(bytes, webcrypto.subtle)
  const rustHash = await rustSha256Bytes(bytes)
  const agreement = await dualSha256Bytes(bytes, { subtle: webcrypto.subtle })

  assert.equal(rustHash, webCryptoHash)
  assert.equal(agreement.sha256, webCryptoHash)
  assert.equal(agreement.webCryptoSha256, agreement.rustSha256)
  assert.equal(agreement.agreed, true)
}

assert.equal(
  (await dualSha256Bytes(new TextEncoder().encode('abc'), { subtle: webcrypto.subtle })).sha256,
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
)

console.log('Embedded Rust/WASM and Web Crypto dual SHA-256 checks passed')
