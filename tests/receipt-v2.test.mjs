import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { createPendingReceiptV2, parseAndValidateProofStampReceiptV2Text } from '../src/receipt-v2.js'
import {
  parseAndValidateProofStampReceiptText,
  receiptFileSha256,
  receiptTimestampDigestSha256,
} from '../src/receipt-verify.js'

const fileBytes = await readFile(new URL('./fixtures/opentimestamps/hello-world.txt', import.meta.url))
const proofBytes = new Uint8Array(await readFile(new URL('./fixtures/opentimestamps/hello-world.txt.ots', import.meta.url)))
const fileSha256 = createHash('sha256').update(fileBytes).digest('hex')
const calendars = ['https://a.pool.opentimestamps.org']
const agreement = Object.freeze({
  algorithm: 'sha256',
  fileSha256,
  webCryptoSha256: fileSha256,
  rustSha256: fileSha256,
})
const stamp = Object.freeze({
  status: 'pending',
  digestSha256: fileSha256,
  fileSha256,
  proofBytes,
  calendarsAttempted: calendars,
  calendarsAccepted: calendars,
  calendarsFailed: [],
  redundancy: 'reduced',
})

test('receipt v2 timestamps the original file SHA-256 directly', async () => {
  const receipt = await createPendingReceiptV2(agreement, stamp)
  assert.equal(receipt.version, 2)
  assert.equal(receipt.proofTarget, 'file-sha256')
  assert.equal(receipt.fileSha256, fileSha256)

  const validated = await parseAndValidateProofStampReceiptV2Text(JSON.stringify(receipt))
  assert.equal(validated.proof.fileDigestSha256, fileSha256)
  assert.equal(validated.receipt.fileSha256, fileSha256)
})

test('unified receipt parser recognizes v2 and exposes the file as the timestamp digest', async () => {
  const receipt = await createPendingReceiptV2(agreement, stamp)
  const validated = await parseAndValidateProofStampReceiptText(JSON.stringify(receipt))
  assert.equal(validated.proofTarget, 'file-sha256')
  assert.equal(receiptFileSha256(validated.receipt), fileSha256)
  assert.equal(receiptTimestampDigestSha256(validated.receipt), fileSha256)
})

test('receipt v2 fails closed if the recorded file hash is not the .ots digest', async () => {
  const receipt = await createPendingReceiptV2(agreement, stamp)
  const altered = {
    ...receipt,
    fileSha256: '00'.repeat(32),
    localHashAgreement: {
      ...receipt.localHashAgreement,
      fileSha256: '00'.repeat(32),
      webCryptoSha256: '00'.repeat(32),
      rustSha256: '00'.repeat(32),
    },
  }
  await assert.rejects(
    parseAndValidateProofStampReceiptV2Text(JSON.stringify(altered)),
    /not bound directly to the receipt file SHA-256/,
  )
})

test('receipt v2 rejects unknown and duplicate fields', async () => {
  const receipt = await createPendingReceiptV2(agreement, stamp)
  await assert.rejects(
    parseAndValidateProofStampReceiptV2Text(JSON.stringify({ ...receipt, extra: true })),
    /unknown field/,
  )
  const text = JSON.stringify(receipt).replace('{', '{"version":2,')
  await assert.rejects(parseAndValidateProofStampReceiptV2Text(text), /duplicate object key/)
})
