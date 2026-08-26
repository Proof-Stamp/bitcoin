import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import test from 'node:test'
import {
  DetachedTimestampFile,
  OpAppend,
  OpSHA256,
  hexToBytes,
  makePending,
} from '@otskit/core'
import { createLocalDraftV1 } from '../src/local-draft-v1.js'
import { createPendingReceiptV1 } from '../src/pending-receipt-v1.js'
import {
  MAX_PROOF_OPERATIONS,
  MAX_PROOF_TREE_DEPTH,
  inspectOpenTimestampsProof,
  upgradeOpenTimestampsProof,
} from '../src/ots-upgrade-verify.js'
import { parseAndValidateProofStampReceiptText } from '../src/receipt-verify-v1.js'
import { UPGRADE_CALENDARS } from '../src/network-policy.js'

const STAMP_CALENDAR = 'https://a.pool.opentimestamps.org'
const FILE_SHA = '31'.repeat(32)

function pendingProof(digest, uri = UPGRADE_CALENDARS[0]) {
  const detached = DetachedTimestampFile.fromHash(new OpSHA256(), digest)
  detached.timestamp.addAttestation(makePending(uri))
  return detached.serializeToBytes()
}

async function validReceipt() {
  const manifest = {
    format: 'proofstamp-manifest',
    version: 1,
    hashAlgorithm: 'sha256',
    evidence: [{ sha256: FILE_SHA, size: 9 }],
  }
  const agreement = {
    algorithm: 'sha256',
    sha256: FILE_SHA,
    webCryptoSha256: FILE_SHA,
    rustSha256: FILE_SHA,
    agreed: true,
  }
  const draft = await createLocalDraftV1(manifest, agreement, webcrypto.subtle)
  const proofBytes = pendingProof(hexToBytes(draft.manifestCommitmentSha256))
  return createPendingReceiptV1(draft, {
    status: 'pending',
    manifestCommitmentSha256: draft.manifestCommitmentSha256,
    proofBytes,
    calendarsAttempted: [STAMP_CALENDAR],
    calendarsAccepted: [STAMP_CALENDAR],
    calendarsFailed: [],
    redundancy: 'reduced',
  }, webcrypto.subtle)
}

test('application proof parser rejects trees deeper than the product limit', () => {
  const detached = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(1))
  let stamp = detached.timestamp
  for (let depth = 0; depth <= MAX_PROOF_TREE_DEPTH; depth += 1) {
    stamp = stamp.add(new OpAppend(Uint8Array.of(depth & 0xff)))
  }
  stamp.addAttestation(makePending(UPGRADE_CALENDARS[0]))
  assert.throws(
    () => inspectOpenTimestampsProof(detached.serializeToBytes()),
    /application depth limit/,
  )
})

test('application proof parser rejects excessive operation fanout before attestation traversal', () => {
  const detached = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(2))
  for (let index = 0; index <= MAX_PROOF_OPERATIONS; index += 1) {
    const branch = detached.timestamp.add(new OpAppend(Uint8Array.of(index & 0xff, (index >>> 8) & 0xff)))
    branch.addAttestation(makePending(UPGRADE_CALENDARS[0]))
  }
  assert.throws(
    () => inspectOpenTimestampsProof(detached.serializeToBytes()),
    /operation limit/,
  )
})

test('deterministic garbage corpus fails closed without non-Error parser escapes', () => {
  let state = 0x9e3779b9
  const nextByte = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state & 0xff
  }

  for (let sample = 1; sample <= 256; sample += 1) {
    const bytes = new Uint8Array((sample * 37) % 511 + 1)
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = nextByte()
    try {
      inspectOpenTimestampsProof(bytes)
    } catch (error) {
      assert.ok(error instanceof Error)
    }
  }
})

test('representative truncations of a valid proof fail closed', () => {
  const proof = pendingProof(new Uint8Array(32).fill(7))
  for (const cut of [1, 8, 31, 32, Math.floor(proof.length / 2), proof.length - 1]) {
    assert.throws(() => inspectOpenTimestampsProof(proof.slice(0, cut)))
  }
})

test('receipt import rejects duplicate object keys and unknown fields', async () => {
  const receipt = await validReceipt()
  const plain = JSON.stringify(receipt)
  const duplicate = plain.replace('"status":"pending"', '"status":"pending","status":"pending"')
  await assert.rejects(
    parseAndValidateProofStampReceiptText(duplicate, webcrypto.subtle),
    /duplicate object key/,
  )

  const unknown = { ...receipt, claimedOwner: 'Mallory' }
  await assert.rejects(
    parseAndValidateProofStampReceiptText(JSON.stringify(unknown), webcrypto.subtle),
    /unknown field/,
  )

  const nestedUnknown = {
    ...receipt,
    openTimestamps: { ...receipt.openTimestamps, trustedByEveryone: true },
  }
  await assert.rejects(
    parseAndValidateProofStampReceiptText(JSON.stringify(nestedUnknown), webcrypto.subtle),
    /unknown field/,
  )
})

test('receipt import rejects misleading verification and calendar metadata', async () => {
  const receipt = await validReceipt()
  const fakePendingVerification = {
    ...receipt,
    bitcoinVerification: {
      method: 'blockstream-esplora-raw-header',
      consensusValidation: false,
      blockHeight: 900000,
      blockHash: 'aa'.repeat(32),
      blockTime: 1_800_000_000,
    },
  }
  await assert.rejects(
    parseAndValidateProofStampReceiptText(JSON.stringify(fakePendingVerification), webcrypto.subtle),
    /Pending receipt must not contain/,
  )

  const contradictoryCalendars = {
    ...receipt,
    openTimestamps: {
      ...receipt.openTimestamps,
      calendarsFailed: [STAMP_CALENDAR],
    },
  }
  await assert.rejects(
    parseAndValidateProofStampReceiptText(JSON.stringify(contradictoryCalendars), webcrypto.subtle),
    /both accepted and failed/,
  )

  const fakeVerified = {
    ...receipt,
    status: 'bitcoin-attestation-verified',
    bitcoinVerification: {
      method: 'blockstream-esplora-raw-header',
      consensusValidation: false,
      blockHeight: 900000,
      blockHash: 'aa'.repeat(32),
      blockTime: 1_800_000_000,
    },
  }
  await assert.rejects(
    parseAndValidateProofStampReceiptText(JSON.stringify(fakeVerified), webcrypto.subtle),
    /does not contain a Bitcoin attestation/,
  )
})

test('calendar 404 keeps a proof pending without treating it as corruption', async () => {
  const proof = pendingProof(new Uint8Array(32).fill(8))
  const result = await upgradeOpenTimestampsProof(proof, {
    fetchImpl: async () => new Response('', { status: 404 }),
    timeoutMs: 100,
  })
  assert.equal(result.state, 'pending')
  assert.equal(result.changed, false)
  assert.equal(result.failedCalendars.length, 0)
  assert.deepEqual(result.queriedCalendars, [UPGRADE_CALENDARS[0]])
})

test('malformed and timed-out calendar upgrades remain isolated failures', async () => {
  const proof = pendingProof(new Uint8Array(32).fill(9))
  const malformed = await upgradeOpenTimestampsProof(proof, {
    fetchImpl: async () => new Response(Uint8Array.of(0xff, 0x00, 0x01), { status: 200 }),
    timeoutMs: 100,
  })
  assert.equal(malformed.state, 'pending')
  assert.equal(malformed.failedCalendars.length, 1)

  const timedOut = await upgradeOpenTimestampsProof(proof, {
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason ?? new Error('aborted')), { once: true })
    }),
    timeoutMs: 5,
  })
  assert.equal(timedOut.state, 'pending')
  assert.equal(timedOut.failedCalendars.length, 1)
})
