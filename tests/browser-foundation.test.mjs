import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { BROWSER_CONNECT_ORIGINS } from '../src/network-policy.js'

const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
const app = await readFile(new URL('../app/app.js', import.meta.url), 'utf8')
const receiptVerify = await readFile(new URL('../src/receipt-verify.js', import.meta.url), 'utf8')
const verifyUx = await readFile(new URL('../app/verify-ux.js', import.meta.url), 'utf8')
const styles = await readFile(new URL('../app/styles.css', import.meta.url), 'utf8')
const headers = await readFile(new URL('../app/_headers', import.meta.url), 'utf8')

test('browser UI keeps direct file timestamping local and pending semantics explicit', () => {
  assert.match(index, /Timestamp or verify a file/)
  assert.match(index, /id="file"[^>]*type="file"/)
  assert.doesNotMatch(index, /id="description"/)
  assert.doesNotMatch(index, /include-metadata/)
  assert.doesNotMatch(index, /Canonical Manifest v1/)
  assert.match(index, /Waiting for Bitcoin is not Bitcoin confirmation/)
  assert.match(index, /check it again in about 3 hours/i)
  assert.match(index, /send them the original file and its ProofStamp receipt/i)
  assert.match(app, /createPendingFileTimestamp\(preparedSnapshot\.agreement\.sha256\)/)
  assert.match(app, /createPendingReceiptV2\(preparedSnapshot\.agreement, stamp\)/)
  assert.match(app, /Submitting a blinded file fingerprint/)
})

test('create and verify are presented as separate compact modes', () => {
  assert.match(index, /id="mode-create"[^>]*type="radio"/)
  assert.match(index, /id="mode-verify"[^>]*type="radio"/)
  assert.match(index, /class="tabs"/)
  assert.match(styles, /#mode-create:checked ~ #verify-panel/)
  assert.match(styles, /#mode-verify:checked ~ #create-panel/)
  assert.match(styles, /create-panel:has\(#result:not\(\[hidden\]\)\) #prepare-stage/)
  assert.match(styles, /create-panel:has\(#timestamp-result:not\(\[hidden\]\)\) #result/)
})

test('primary saved ProofStamp flow is two inputs before network checks', () => {
  assert.match(index, /Check a file and its receipt/)
  assert.match(index, /1\. File/)
  assert.match(index, /2\. ProofStamp receipt/)
  assert.match(index, /id="saved-original-file"[^>]*type="file"/)
  assert.match(index, /id="saved-receipt"[^>]*type="file"/)
  assert.match(index, />Verify ProofStamp</)
  assert.match(index, /Files stay on this device\. They are not uploaded to ProofStamp/)
  assert.match(app, /runSavedProofCheck\(\{ verifyFile: true \}\)/)
  assert.match(app, /dualSha256File\(candidateFile\)/)
  assert.match(app, /agreement\.sha256 !== receiptFileSha256\(validated\.receipt\)/)
  assert.match(app, /No calendar or Bitcoin request was made/)
})

test('receipt-only timestamp status remains a secondary path', () => {
  assert.match(index, /id="check-receipt-only"/)
  assert.match(index, /Only have the receipt\? Check timestamp status/)
  assert.match(app, /runSavedProofCheck\(\{ verifyFile: false \}\)/)
})

test('verification result separates file matching from Bitcoin timestamp status', () => {
  assert.match(index, /File matches the receipt/)
  assert.match(index, /Bitcoin timestamp verified/)
  assert.match(index, /Bitcoin timestamp still pending/)
  assert.match(index, /Keep this receipt and check again in about 3 hours/)
  assert.match(index, /id="save-checked-receipt"[^>]*>Save receipt</)
  assert.match(index, /id="verify-another"[^>]*>Verify another ProofStamp</)
  assert.match(styles, /saved-result-active #verify-panel/)
  assert.match(verifyUx, /verificationResult\.dataset\.source = source/)
  assert.match(verifyUx, /The selected file is different from the file recorded in this ProofStamp/)
})

test('new .ots proof is presented as directly verifiable with the original file', () => {
  assert.match(index, /stamped directly against the original file SHA-256/i)
  assert.match(index, /Save \.ots proof/)
  assert.match(index, /Open OpenTimestamps\.org verifier/)
  assert.match(index, /original file together with the downloaded \.ots proof/i)
  assert.match(app, /\.ots`, pending\.stamp\.proofBytes/)
})

test('legacy Manifest-v1 receipts remain supported without being the new proof target', () => {
  assert.match(receiptVerify, /if \(version === 1\)/)
  assert.match(receiptVerify, /proofTarget: 'manifest-v1'/)
  assert.match(app, /Legacy Manifest commitment/)
  assert.match(index, /Older Manifest-v1 ProofStamp receipts remain supported/)
})

test('verification result states the product claim boundary', () => {
  assert.match(index, /confirms exact file bytes and timestamp evidence/i)
  assert.match(index, /does not prove authorship/i)
  assert.match(index, /whether the contents are true/i)
})

test('browser coordinators contain no direct outbound request primitive', () => {
  for (const source of [app, verifyUx]) {
    assert.doesNotMatch(source, /\bfetch\s*\(/)
    assert.doesNotMatch(source, /XMLHttpRequest/)
    assert.doesNotMatch(source, /WebSocket/)
    assert.doesNotMatch(source, /sendBeacon/)
  }
})

test('static CSP contains exactly the reviewed browser network origins', () => {
  const match = headers.match(/connect-src ([^;]+);/)
  assert.ok(match)
  assert.deepEqual(match[1].trim().split(/\s+/), [...BROWSER_CONNECT_ORIGINS])
  assert.doesNotMatch(headers, /connect-src https:;/)
  assert.doesNotMatch(headers, /connect-src \*;/)
  assert.match(headers, /form-action 'none'/)
  assert.match(headers, /frame-ancestors 'none'/)
  assert.match(headers, /'wasm-unsafe-eval'/)
})
