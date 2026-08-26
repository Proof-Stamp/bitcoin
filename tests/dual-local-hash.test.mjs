import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import test from 'node:test'

import {
  MAX_BROWSER_FILE_BYTES,
  dualSha256Bytes,
  dualSha256File,
  webCryptoSha256Bytes,
} from '../src/local-hash.js'

const encoder = new TextEncoder()

function fakeRustHasher(expected) {
  return async (bytes) => expected ?? webCryptoSha256Bytes(bytes, webcrypto.subtle)
}

test('dual SHA-256 accepts matching independent digests', async () => {
  const bytes = encoder.encode('abc')
  const result = await dualSha256Bytes(bytes, {
    subtle: webcrypto.subtle,
    rustHasher: fakeRustHasher(),
  })
  assert.equal(result.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(result.webCryptoSha256, result.rustSha256)
  assert.equal(result.agreed, true)
})

test('dual SHA-256 fails closed on disagreement', async () => {
  const bytes = encoder.encode('abc')
  await assert.rejects(
    dualSha256Bytes(bytes, {
      subtle: webcrypto.subtle,
      rustHasher: fakeRustHasher('0'.repeat(64)),
    }),
    /disagree/,
  )
})

test('file hashing reads one local byte sequence and preserves exact size', async () => {
  const bytes = encoder.encode('local file bytes')
  let reads = 0
  const file = {
    size: bytes.byteLength,
    async arrayBuffer() {
      reads += 1
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    },
  }

  const result = await dualSha256File(file, {
    subtle: webcrypto.subtle,
    rustHasher: fakeRustHasher(),
  })
  assert.equal(reads, 1)
  assert.equal(result.size, bytes.byteLength)
})

test('browser hashing rejects files over the explicit v0 memory limit', async () => {
  const file = {
    size: MAX_BROWSER_FILE_BYTES + 1,
    async arrayBuffer() { throw new Error('must not read oversized file') },
  }
  await assert.rejects(dualSha256File(file, { rustHasher: fakeRustHasher() }), /exceeds/)
})

test('file hashing fails if the bytes returned do not match the advertised size', async () => {
  const file = {
    size: 10,
    async arrayBuffer() { return new Uint8Array([1, 2, 3]).buffer },
  }
  await assert.rejects(
    dualSha256File(file, { subtle: webcrypto.subtle, rustHasher: fakeRustHasher() }),
    /byte length changed/,
  )
})
