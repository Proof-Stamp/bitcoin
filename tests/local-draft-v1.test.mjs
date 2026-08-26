import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import test from 'node:test'

import { parseCanonicalManifestBytes } from '../src/manifest-v1.js'
import { createLocalDraftV1, LOCAL_DRAFT_STATUS } from '../src/local-draft-v1.js'

const fileSha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
const manifest = {
  format: 'proofstamp-manifest',
  version: 1,
  hashAlgorithm: 'sha256',
  evidence: [{ sha256: fileSha, size: 3 }],
}
const agreement = {
  algorithm: 'sha256',
  sha256: fileSha,
  webCryptoSha256: fileSha,
  rustSha256: fileSha,
  agreed: true,
}

test('local draft preserves exact canonical manifest bytes and marks itself not timestamped', async () => {
  const draft = await createLocalDraftV1(manifest, agreement, webcrypto.subtle)
  assert.equal(draft.status, LOCAL_DRAFT_STATUS)
  assert.match(draft.manifestCommitmentSha256, /^[0-9a-f]{64}$/)

  const canonicalBytes = Uint8Array.from(Buffer.from(draft.canonicalManifestUtf8Base64, 'base64'))
  const parsed = parseCanonicalManifestBytes(canonicalBytes)
  assert.deepEqual(parsed, manifest)
  assert.equal(draft.localHashAgreement.fileSha256, fileSha)
})

test('local draft rejects absent or inconsistent hash agreement', async () => {
  await assert.rejects(createLocalDraftV1(manifest, null, webcrypto.subtle), /agreement is required/)
  await assert.rejects(
    createLocalDraftV1(manifest, { ...agreement, rustSha256: '0'.repeat(64) }, webcrypto.subtle),
    /internally inconsistent/,
  )
})

test('local draft rejects a manifest bound to a different file hash', async () => {
  const other = structuredClone(manifest)
  other.evidence[0].sha256 = '0'.repeat(64)
  await assert.rejects(createLocalDraftV1(other, agreement, webcrypto.subtle), /does not match/)
})
