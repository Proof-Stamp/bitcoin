import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { BROWSER_CONNECT_ORIGINS } from '../src/network-policy.js'

const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
const app = await readFile(new URL('../app/app.js', import.meta.url), 'utf8')
const verifyUx = await readFile(new URL('../app/verify-ux.js', import.meta.url), 'utf8')
const styles = await readFile(new URL('../app/styles.css', import.meta.url), 'utf8')
const headers = await readFile(new URL('../app/_headers', import.meta.url), 'utf8')

test('browser UI keeps source stamping local and pending semantics explicit', () => {
  assert.match(index, /Create a ProofStamp/)
  assert.match(index, /id="file"[^>]*type="file"/)
  assert.doesNotMatch(index, /mailto:/i)
  assert.match(index, /Not submitted yet/)
  assert.match(index, /Waiting for Bitcoin is not Bitcoin confirmation/)
  assert.match(index, /check it again in about 3 hours/i)
  assert.match(index, /receipt already contains the timestamp proof/i)
  assert.match(index, /send them the original file and its ProofStamp receipt/i)
  assert.match(app, /timestampBadge\.textContent = 'Waiting for Bitcoin'/)
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

test('primary saved ProofStamp flow is framed as two simple inputs before network checks', () => {
  assert.match(index, /Check a file and its receipt/)
  assert.match(index, /1\. File/)
  assert.match(index, /2\. ProofStamp receipt/)
  assert.match(index, /id="saved-original-file"[^>]*type="file"/)
  assert.match(index, /id="saved-receipt"[^>]*type="file"/)
  assert.match(index, />Verify ProofStamp</)
  assert.match(index, /Files stay on this device\. They are not uploaded to ProofStamp/)
  assert.match(app, /runSavedProofCheck\(\{ verifyFile: true \}\)/)
  assert.match(app, /dualSha256File\(candidateFile\)/)
  assert.match(app, /agreement\.sha256 !== validated\.receipt\.localHashAgreement\.fileSha256/)
  assert.match(app, /This file does not match this ProofStamp/)
  assert.match(app, /No calendar or Bitcoin request was made/)
})

test('receipt-only Bitcoin status check remains available as a secondary path', () => {
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
  assert.match(index, /id="verify-another"[^>]*>Verify another file</)
  assert.match(styles, /saved-result-active #verify-panel/)
  assert.match(verifyUx, /verificationResult\.dataset\.source = source/)
  assert.match(verifyUx, /The selected file is different from the file recorded in this ProofStamp/)
})

test('normal UI keeps protocol internals behind progressive disclosure', () => {
  assert.match(index, /<details class="advanced-details">/)
  assert.match(index, /<summary>Advanced options<\/summary>/)
  assert.match(index, /<summary>Technical details<\/summary>/)
  assert.match(index, /Manifest commitment/)
  assert.match(index, /Save separate \.ots proof/)
})

test('official OpenTimestamps verifier handoff preloads the proof digest instead of the source file hash', () => {
  assert.match(index, /id="verify-opentimestamps-current"/)
  assert.match(index, /id="verify-opentimestamps-checked"/)
  assert.match(index, /Verify this proof on OpenTimestamps\.org/)
  assert.match(index, /official verifier with this proof and its Manifest commitment prefilled/i)
  assert.match(index, /Your source file is not sent/)
  assert.match(app, /new URL\('https:\/\/opentimestamps\.org\/'\)/)
  assert.match(app, /searchParams\.set\('algorithm', 'SHA256'\)/)
  assert.match(app, /searchParams\.set\('digest', manifestCommitmentSha256\)/)
  assert.match(app, /searchParams\.set\('ots', proofBytesHex\(proofBytes\)\)/)
})

test('verification result states the product claim boundary', () => {
  assert.match(index, /confirms exact file bytes and timestamp evidence/i)
  assert.match(index, /does not prove authorship/i)
  assert.match(index, /whether the contents are true/i)
})

test('browser UI exposes the independent verification path without adding a runtime dependency', () => {
  assert.match(index, /opentimestamps\.org\/#stamp-and-verify/)
  assert.match(index, /github\.com\/Proof-Stamp\/ots\/blob\/main\/docs\/independent-verification\.md/)
  assert.match(index, /standard OpenTimestamps tooling and your own Bitcoin Core node/)
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
