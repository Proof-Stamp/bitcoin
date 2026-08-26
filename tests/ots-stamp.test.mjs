import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  DetachedTimestampFile,
  StreamSerializationContext,
  Timestamp,
  makePending,
} from '@otskit/core'
import {
  APPROVED_OTS_CALENDARS,
  CalendarSubmissionError,
  OTS_CALENDAR_RESPONSE_LIMIT_BYTES,
  createPendingTimestamp,
} from '../src/ots-stamp.js'
import { createPendingReceiptV1 } from '../src/pending-receipt-v1.js'

const COMMITMENT = '4a44dc15364204a80fe80e9039455cc1608281820fe2b24c6f9b7a82340e05f0'

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/../g), (pair) => Number.parseInt(pair, 16))
}

function fixedRandom(bytes) {
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = index + 1
  return bytes
}

function calendarTimestampBytes(digest, calendar) {
  const timestamp = new Timestamp(digest)
  timestamp.addAttestation(makePending(calendar))
  const context = new StreamSerializationContext()
  timestamp.serialize(context)
  return context.getOutput()
}

function successResponse(digest, calendar) {
  return new Response(calendarTimestampBytes(digest, calendar), {
    status: 200,
    headers: { 'content-type': 'application/vnd.opentimestamps.v1' },
  })
}

function makeFetch({ fail = new Set(), oversized = new Set(), malformed = new Set(), calls = [] } = {}) {
  return async (url, options) => {
    calls.push({ url, options })
    const calendar = url.replace(/\/digest$/, '')
    if (fail.has(calendar)) return new Response('', { status: 503 })
    if (oversized.has(calendar)) {
      return new Response(new Uint8Array(OTS_CALENDAR_RESPONSE_LIMIT_BYTES + 1), { status: 200 })
    }
    if (malformed.has(calendar)) return new Response(Uint8Array.of(0xff, 0xff), { status: 200 })
    return successResponse(new Uint8Array(options.body), calendar)
  }
}

test('calendar allowlist is fixed and auditable', () => {
  assert.deepEqual(APPROVED_OTS_CALENDARS, [
    'https://a.pool.opentimestamps.org',
    'https://b.pool.opentimestamps.org',
    'https://a.pool.eternitywall.com',
  ])
})

test('stamping blinds the Manifest commitment and merges all successful calendar responses', async () => {
  const calls = []
  const result = await createPendingTimestamp(COMMITMENT, {
    fetchImpl: makeFetch({ calls }),
    randomValues: fixedRandom,
    timeoutMs: 1000,
  })

  assert.equal(result.status, 'pending')
  assert.equal(result.redundancy, 'normal')
  assert.deepEqual(result.calendarsAccepted, APPROVED_OTS_CALENDARS)
  assert.deepEqual(result.calendarsFailed, [])
  assert.equal(calls.length, 3)

  const rawCommitment = hexToBytes(COMMITMENT)
  for (const [index, call] of calls.entries()) {
    assert.equal(call.url, `${APPROVED_OTS_CALENDARS[index]}/digest`)
    assert.equal(call.options.method, 'POST')
    assert.equal(call.options.redirect, 'error')
    assert.equal(call.options.credentials, 'omit')
    assert.equal(call.options.referrerPolicy, 'no-referrer')
    assert.equal(call.options.headers.Accept, 'application/vnd.opentimestamps.v1')
    assert.equal(call.options.body.byteLength, 32)
    assert.notDeepEqual(new Uint8Array(call.options.body), rawCommitment)
  }
  assert.deepEqual(new Uint8Array(calls[0].options.body), new Uint8Array(calls[1].options.body))

  const proof = DetachedTimestampFile.deserialize(result.proofBytes)
  assert.deepEqual(proof.fileDigest(), rawCommitment)
  const pending = proof.timestamp.getAttestations().filter((attestation) => attestation.kind === 'pending')
  assert.equal(pending.length, 3)
})

test('one calendar failure keeps the two successful responses', async () => {
  const failedCalendar = APPROVED_OTS_CALENDARS[0]
  const result = await createPendingTimestamp(COMMITMENT, {
    fetchImpl: makeFetch({ fail: new Set([failedCalendar]) }),
    randomValues: fixedRandom,
    timeoutMs: 1000,
  })

  assert.equal(result.redundancy, 'normal')
  assert.deepEqual(result.calendarsFailed, [failedCalendar])
  assert.equal(result.calendarsAccepted.length, 2)
  assert.ok(result.proofBytes.length > 0)
})

test('one successful calendar still returns a pending proof with reduced redundancy', async () => {
  const failed = new Set(APPROVED_OTS_CALENDARS.slice(0, 2))
  const result = await createPendingTimestamp(COMMITMENT, {
    fetchImpl: makeFetch({ fail: failed }),
    randomValues: fixedRandom,
    timeoutMs: 1000,
  })

  assert.equal(result.redundancy, 'reduced')
  assert.equal(result.calendarsAccepted.length, 1)
  assert.equal(result.calendarsFailed.length, 2)
})

test('oversized and malformed calendar responses fail independently', async () => {
  const result = await createPendingTimestamp(COMMITMENT, {
    fetchImpl: makeFetch({
      oversized: new Set([APPROVED_OTS_CALENDARS[0]]),
      malformed: new Set([APPROVED_OTS_CALENDARS[1]]),
    }),
    randomValues: fixedRandom,
    timeoutMs: 1000,
  })

  assert.equal(result.redundancy, 'reduced')
  assert.deepEqual(result.calendarsAccepted, [APPROVED_OTS_CALENDARS[2]])
  assert.equal(result.calendarsFailed.length, 2)
})

test('zero accepted calendars fail closed', async () => {
  await assert.rejects(
    createPendingTimestamp(COMMITMENT, {
      fetchImpl: makeFetch({ fail: new Set(APPROVED_OTS_CALENDARS) }),
      randomValues: fixedRandom,
      timeoutMs: 1000,
    }),
    CalendarSubmissionError,
  )
})

test('pending receipt embeds the exact .ots proof and preserves the local evidence binding', async () => {
  const stamp = await createPendingTimestamp(COMMITMENT, {
    fetchImpl: makeFetch(),
    randomValues: fixedRandom,
    timeoutMs: 1000,
  })
  const localDraft = {
    format: 'proofstamp-local-draft',
    version: 1,
    status: 'local-only-not-timestamped',
    canonicalManifestUtf8Base64: 'e30=',
    manifestCommitmentSha256: COMMITMENT,
    localHashAgreement: {
      algorithm: 'sha256',
      fileSha256: '0'.repeat(64),
      webCryptoSha256: '0'.repeat(64),
      rustSha256: '0'.repeat(64),
    },
  }

  const receipt = await createPendingReceiptV1(localDraft, stamp)
  assert.equal(receipt.format, 'proofstamp-receipt')
  assert.equal(receipt.status, 'pending')
  assert.equal(receipt.target, 'bitcoin')
  assert.equal(receipt.manifestCommitmentSha256, COMMITMENT)
  assert.equal(receipt.openTimestamps.redundancy, 'normal')
  assert.equal(receipt.openTimestamps.calendarsAccepted.length, 3)
  assert.deepEqual(
    Uint8Array.from(atob(receipt.openTimestamps.proofBase64), (char) => char.charCodeAt(0)),
    stamp.proofBytes,
  )
})

test('static build uses only the approved calendar origins', async () => {
  const headers = await readFile(new URL('../app/_headers', import.meta.url), 'utf8')
  const connect = headers.match(/connect-src ([^;]+);/)?.[1]
  assert.equal(
    connect,
    'https://a.pool.opentimestamps.org https://b.pool.opentimestamps.org https://a.pool.eternitywall.com',
  )
  assert.ok(!connect.includes("'self'"))
  assert.ok(!connect.includes('https: '))

  const builtStamp = await readFile(new URL('../dist/ots-stamp.js', import.meta.url), 'utf8')
  const builtCore = await readFile(new URL('../dist/vendor/otskit-core.js', import.meta.url), 'utf8')
  assert.ok(builtStamp.includes("from './vendor/otskit-core.js'"))
  assert.ok(!builtStamp.includes("from '@otskit/core'"))
  assert.ok(builtCore.length > 1000)
})
