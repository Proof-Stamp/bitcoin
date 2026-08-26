import {
  DetachedTimestampFile,
  OpAppend,
  OpSHA256,
  StreamDeserializationContext,
  Timestamp,
  hexToBytes,
  makeMerkleTree,
} from '@otskit/core'

export const APPROVED_OTS_CALENDARS = Object.freeze([
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
])

export const OTS_CALENDAR_RESPONSE_LIMIT_BYTES = 10_000
export const OTS_CALENDAR_TIMEOUT_MS = 8_000
export const OTS_NONCE_BYTES = 16

const OTS_HEADERS = Object.freeze({
  Accept: 'application/vnd.opentimestamps.v1',
  'Content-Type': 'application/x-www-form-urlencoded',
})

function bytesEqual(a, b) {
  if (a.length !== b.length) return false
  let different = 0
  for (let i = 0; i < a.length; i += 1) different |= a[i] ^ b[i]
  return different === 0
}

function validateCommitmentHex(value) {
  const hex = String(value || '').trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new TypeError('Manifest commitment must be a 64-character SHA-256 hex string')
  return hex
}

function randomNonce(randomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto)) {
  if (typeof randomValues !== 'function') throw new Error('Secure random generation is unavailable')
  const nonce = new Uint8Array(OTS_NONCE_BYTES)
  randomValues(nonce)
  return nonce
}

async function readResponseLimited(response, limit = OTS_CALENDAR_RESPONSE_LIMIT_BYTES) {
  const declared = response.headers?.get?.('content-length')
  if (declared !== null && declared !== undefined && /^\d+$/.test(declared) && Number(declared) > limit) {
    throw new Error(`Calendar response exceeds ${limit} bytes`)
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > limit) throw new Error(`Calendar response exceeds ${limit} bytes`)
    return bytes
  }

  const reader = response.body.getReader()
  const output = new Uint8Array(limit)
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return output.slice(0, received)
      const next = received + value.byteLength
      if (next > limit) {
        await reader.cancel()
        throw new Error(`Calendar response exceeds ${limit} bytes`)
      }
      output.set(value, received)
      received = next
    }
  } finally {
    reader.releaseLock()
  }
}

async function submitCalendar(calendar, digest, fetchImpl, timeoutMs) {
  if (!APPROVED_OTS_CALENDARS.includes(calendar)) throw new Error('Calendar is not approved')
  if (typeof fetchImpl !== 'function') throw new Error('Browser fetch is unavailable')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Calendar request timed out')), timeoutMs)
  try {
    const response = await fetchImpl(`${calendar}/digest`, {
      method: 'POST',
      headers: OTS_HEADERS,
      body: digest,
      signal: controller.signal,
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    if (!response?.ok) throw new Error(`Calendar returned HTTP ${response?.status ?? 'error'}`)

    const responseBytes = await readResponseLimited(response)
    const context = new StreamDeserializationContext(responseBytes)
    const timestamp = Timestamp.deserialize(context, digest)
    context.assertEof()
    return timestamp
  } finally {
    clearTimeout(timeout)
  }
}

export class CalendarSubmissionError extends Error {
  constructor(message, failures = []) {
    super(message)
    this.name = 'CalendarSubmissionError'
    this.failures = failures
  }
}

export async function createPendingTimestamp(
  manifestCommitmentSha256,
  {
    fetchImpl = globalThis.fetch,
    randomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto),
    timeoutMs = OTS_CALENDAR_TIMEOUT_MS,
  } = {},
) {
  const commitmentHex = validateCommitmentHex(manifestCommitmentSha256)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new RangeError('Invalid calendar timeout')

  const commitment = hexToBytes(commitmentHex)
  const detached = DetachedTimestampFile.fromHash(new OpSHA256(), commitment)

  // OpenTimestamps privacy blinding: calendars receive SHA256(commitment || random nonce),
  // not the raw ProofStamp Manifest commitment.
  const nonceAppended = detached.timestamp.add(new OpAppend(randomNonce(randomValues)))
  const blinded = nonceAppended.add(new OpSHA256())
  const merkleTip = makeMerkleTree([blinded])
  const submissionDigest = merkleTip.getDigest()

  if (bytesEqual(submissionDigest, commitment)) throw new Error('OpenTimestamps blinding failed closed')

  const settled = await Promise.allSettled(
    APPROVED_OTS_CALENDARS.map((calendar) => submitCalendar(calendar, submissionDigest, fetchImpl, timeoutMs)),
  )

  const accepted = []
  const failed = []
  settled.forEach((entry, index) => {
    const calendar = APPROVED_OTS_CALENDARS[index]
    if (entry.status === 'fulfilled') {
      try {
        merkleTip.merge(entry.value)
        accepted.push(calendar)
      } catch (error) {
        failed.push(Object.freeze({ calendar, error: error instanceof Error ? error.name : 'Error' }))
      }
    } else {
      failed.push(Object.freeze({ calendar, error: entry.reason instanceof Error ? entry.reason.name : 'Error' }))
    }
  })

  if (accepted.length === 0) {
    throw new CalendarSubmissionError('No approved OpenTimestamps calendar accepted the submission', failed)
  }

  const proofBytes = detached.serializeToBytes()
  const reparsed = DetachedTimestampFile.deserialize(proofBytes)
  if (!bytesEqual(reparsed.fileDigest(), commitment)) throw new Error('Generated OpenTimestamps proof is not bound to the Manifest commitment')

  return Object.freeze({
    status: 'pending',
    manifestCommitmentSha256: commitmentHex,
    proofBytes,
    calendarsAttempted: APPROVED_OTS_CALENDARS,
    calendarsAccepted: Object.freeze([...accepted]),
    calendarsFailed: Object.freeze(failed.map(({ calendar }) => calendar)),
    redundancy: accepted.length >= 2 ? 'normal' : 'reduced',
  })
}
