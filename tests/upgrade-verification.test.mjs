import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import test from 'node:test'
import {
  DetachedTimestampFile,
  OpSHA256,
  StreamSerializationContext,
  Timestamp,
  hexToBytes,
  makeBitcoin,
  makePending,
} from '@otskit/core'
import { createLocalDraftV1 } from '../src/local-draft-v1.js'
import { createPendingReceiptV1 } from '../src/pending-receipt-v1.js'
import { manifestCommitmentHex } from '../src/manifest-v1.js'
import { UPGRADE_CALENDARS, BLOCKSTREAM_ESPLORA_API } from '../src/network-policy.js'
import {
  inspectOpenTimestampsProof,
  MAX_IMPORTED_OTS_BYTES,
  upgradeOpenTimestampsProof,
  verifyBitcoinAttestations,
} from '../src/ots-upgrade-verify.js'
import {
  parseAndValidateProofStampReceiptText,
  updateReceiptWithProof,
} from '../src/receipt-verify-v1.js'

function serializeTimestamp(timestamp) {
  const context = new StreamSerializationContext()
  timestamp.serialize(context)
  return context.getOutput()
}

function pendingProof(digest, uri = UPGRADE_CALENDARS[0]) {
  const detached = DetachedTimestampFile.fromHash(new OpSHA256(), digest)
  detached.timestamp.addAttestation(makePending(uri))
  return detached.serializeToBytes()
}

function completedProof(digest, height = 840000) {
  const detached = DetachedTimestampFile.fromHash(new OpSHA256(), digest)
  detached.timestamp.addAttestation(makeBitcoin(height))
  return detached.serializeToBytes()
}

function calendarBitcoinResponse(digest, height = 840000) {
  const timestamp = new Timestamp(digest)
  timestamp.addAttestation(makeBitcoin(height))
  return serializeTimestamp(timestamp)
}

function displayHeaderHash(rawHeader) {
  const first = createHash('sha256').update(rawHeader).digest()
  return createHash('sha256').update(first).digest().reverse().toString('hex')
}

function headerForMerkleRoot(root, time = 1_700_000_000) {
  const header = new Uint8Array(80)
  header.set(root, 36)
  header[68] = time & 0xff
  header[69] = (time >>> 8) & 0xff
  header[70] = (time >>> 16) & 0xff
  header[71] = (time >>> 24) & 0xff
  return header
}

test('pending proof upgrades only through an exact approved calendar origin', async () => {
  const digest = new Uint8Array(32).fill(7)
  const proof = pendingProof(digest)
  const responseBytes = calendarBitcoinResponse(digest)
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    return new Response(responseBytes, { status: 200, headers: { 'content-length': String(responseBytes.length) } })
  }

  const upgraded = await upgradeOpenTimestampsProof(proof, { fetchImpl })
  assert.equal(upgraded.state, 'bitcoin-attested')
  assert.equal(upgraded.changed, true)
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /^https:\/\/alice\.btc\.calendar\.opentimestamps\.org\/timestamp\/[0-9a-f]{64}$/)
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls[0].options.redirect, 'error')
  assert.equal(calls[0].options.credentials, 'omit')
})

test('unapproved pending calendar URI never becomes a browser request destination', async () => {
  const digest = new Uint8Array(32).fill(8)
  const proof = pendingProof(digest, 'https://evil.example')
  let requests = 0
  const upgraded = await upgradeOpenTimestampsProof(proof, {
    fetchImpl: async () => {
      requests += 1
      throw new Error('must not be called')
    },
  })
  assert.equal(requests, 0)
  assert.equal(upgraded.state, 'pending')
  assert.deepEqual(upgraded.skippedUnapprovedCalendars, ['https://evil.example'])
})

test('oversized imported OpenTimestamps proof fails before parsing', () => {
  assert.throws(
    () => inspectOpenTimestampsProof(new Uint8Array(MAX_IMPORTED_OTS_BYTES + 1)),
    /exceeds/,
  )
})

test('browser Bitcoin verification authenticates the raw block header and verifies its merkle root', async () => {
  const digest = new Uint8Array(32).map((_, index) => index + 1)
  const height = 840000
  const proof = completedProof(digest, height)
  const header = headerForMerkleRoot(digest)
  const blockHash = displayHeaderHash(header)

  const fetchImpl = async (url) => {
    if (url === `${BLOCKSTREAM_ESPLORA_API}/block-height/${height}`) return new Response(blockHash, { status: 200 })
    if (url === `${BLOCKSTREAM_ESPLORA_API}/block/${blockHash}/header`) {
      return new Response(Buffer.from(header).toString('hex'), { status: 200 })
    }
    throw new Error(`unexpected URL ${url}`)
  }

  const result = await verifyBitcoinAttestations(proof, { fetchImpl, subtle: webcrypto.subtle })
  assert.equal(result.valid, true)
  assert.equal(result.method, 'blockstream-esplora-raw-header')
  assert.equal(result.consensusValidation, false)
  assert.equal(result.earliest.height, height)
  assert.equal(result.earliest.blockHash, blockHash)
  assert.equal(result.earliest.blockTime, 1_700_000_000)
})

test('Bitcoin verification fails when an authenticated block header has the wrong merkle root', async () => {
  const digest = new Uint8Array(32).fill(3)
  const height = 840001
  const proof = completedProof(digest, height)
  const wrongRoot = new Uint8Array(32).fill(4)
  const header = headerForMerkleRoot(wrongRoot)
  const blockHash = displayHeaderHash(header)
  const fetchImpl = async (url) => {
    if (url.endsWith(`/block-height/${height}`)) return new Response(blockHash, { status: 200 })
    if (url.endsWith(`/block/${blockHash}/header`)) return new Response(Buffer.from(header).toString('hex'), { status: 200 })
    throw new Error(`unexpected URL ${url}`)
  }
  await assert.rejects(
    verifyBitcoinAttestations(proof, { fetchImpl, subtle: webcrypto.subtle }),
    /verification failed/,
  )
})

test('saved ProofStamp receipt is validated across manifest, local hash, proof digest, and proof SHA-256', async () => {
  const fileSha = '11'.repeat(32)
  const manifest = {
    format: 'proofstamp-manifest',
    version: 1,
    hashAlgorithm: 'sha256',
    evidence: [{ sha256: fileSha, size: 1 }],
  }
  const agreement = {
    algorithm: 'sha256',
    sha256: fileSha,
    webCryptoSha256: fileSha,
    rustSha256: fileSha,
    agreed: true,
  }
  const draft = await createLocalDraftV1(manifest, agreement, webcrypto.subtle)
  const commitment = await manifestCommitmentHex(manifest, webcrypto.subtle)
  const proofBytes = pendingProof(hexToBytes(commitment))
  const stamp = {
    status: 'pending',
    manifestCommitmentSha256: commitment,
    proofBytes,
    calendarsAttempted: ['https://a.pool.opentimestamps.org'],
    calendarsAccepted: ['https://a.pool.opentimestamps.org'],
    calendarsFailed: [],
    redundancy: 'reduced',
  }
  const receipt = await createPendingReceiptV1(draft, stamp, webcrypto.subtle)
  const validated = await parseAndValidateProofStampReceiptText(JSON.stringify(receipt), webcrypto.subtle)
  assert.equal(validated.proof.fileDigestSha256, commitment)
  assert.equal(validated.manifest.evidence[0].sha256, fileSha)
})

test('updated receipt records browser verification method without claiming independent consensus validation', async () => {
  const fileSha = '22'.repeat(32)
  const manifest = {
    format: 'proofstamp-manifest',
    version: 1,
    hashAlgorithm: 'sha256',
    evidence: [{ sha256: fileSha, size: 2 }],
  }
  const agreement = { algorithm: 'sha256', sha256: fileSha, webCryptoSha256: fileSha, rustSha256: fileSha, agreed: true }
  const draft = await createLocalDraftV1(manifest, agreement, webcrypto.subtle)
  const commitment = draft.manifestCommitmentSha256
  const initialProof = pendingProof(hexToBytes(commitment))
  const calendar = 'https://a.pool.opentimestamps.org'
  const receipt = await createPendingReceiptV1(draft, {
    status: 'pending', manifestCommitmentSha256: commitment, proofBytes: initialProof,
    calendarsAttempted: [calendar], calendarsAccepted: [calendar], calendarsFailed: [], redundancy: 'reduced',
  }, webcrypto.subtle)
  const completed = completedProof(hexToBytes(commitment), 900000)
  const verification = {
    valid: true,
    method: 'blockstream-esplora-raw-header',
    consensusValidation: false,
    earliest: { height: 900000, blockHash: 'aa'.repeat(32), blockTime: 1_800_000_000 },
  }
  const updated = await updateReceiptWithProof(receipt, completed, verification, webcrypto.subtle)
  assert.equal(updated.status, 'bitcoin-attestation-verified')
  assert.equal(updated.bitcoinVerification.consensusValidation, false)
  assert.equal(updated.bitcoinVerification.blockHeight, 900000)
})
