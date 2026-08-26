import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { StreamSerializationContext, Timestamp, makePending } from '@otskit/core'
import { APPROVED_OTS_CALENDARS, createPendingTimestamp } from '../src/ots-stamp.js'

const [outputPath] = process.argv.slice(2)
if (!outputPath) throw new Error('Usage: node scripts/generate-proofstamp-pending-fixture.mjs <output.ots>')

const commitment = '4a44dc15364204a80fe80e9039455cc1608281820fe2b24c6f9b7a82340e05f0'

function fixedRandom(bytes) {
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = index + 1
  return bytes
}

function responseFor(digest, calendar) {
  const timestamp = new Timestamp(digest)
  timestamp.addAttestation(makePending(calendar))
  const context = new StreamSerializationContext()
  timestamp.serialize(context)
  return new Response(context.getOutput(), {
    status: 200,
    headers: { 'content-type': 'application/vnd.opentimestamps.v1' },
  })
}

const calls = []
const result = await createPendingTimestamp(commitment, {
  randomValues: fixedRandom,
  timeoutMs: 1000,
  fetchImpl: async (url, options) => {
    calls.push(url)
    const calendar = url.replace(/\/digest$/, '')
    assert.ok(APPROVED_OTS_CALENDARS.includes(calendar))
    return responseFor(new Uint8Array(options.body), calendar)
  },
})

assert.equal(calls.length, APPROVED_OTS_CALENDARS.length)
await writeFile(outputPath, result.proofBytes)
console.log(`Wrote ${result.proofBytes.length} ProofStamp pending .ots bytes`)
