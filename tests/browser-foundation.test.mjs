import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { BROWSER_CONNECT_ORIGINS } from '../src/network-policy.js'

const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
const app = await readFile(new URL('../app/app.js', import.meta.url), 'utf8')
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

test('primary saved ProofStamp flow verifies file bytes locally before network status checks', () => {
  assert.match(index, /Verify a file with its ProofStamp receipt/)
  assert.match(index, /id="saved-original-file"[^>]*type="file"/)
  assert.match(index, /id="saved-receipt"[^>]*type="file"/)
  assert.match(index, /Verify file \+ ProofStamp/)
  assert.match(index, /Neither file is uploaded to ProofStamp/)
  assert.match(app, /runSavedProofCheck\(\{ verifyFile: true \}\)/)
  assert.match(app, /dualSha256File\(candidateFile\)/)
  assert.match(app, /agreement\.sha256 !== validated\.receipt\.localHashAgreement\.fileSha256/)
  assert.match(app, /This file does not match this ProofStamp/)
  assert.match(app, /No calendar or Bitcoin request was made/)
  assert.match(app, /This file matches this ProofStamp/)
})

test('receipt-only Bitcoin status check remains available as a secondary path', () => {
  assert.match(index, /id="check-receipt-only"/)
  assert.match(index, /Check receipt status only/)
  assert.match(app, /runSavedProofCheck\(\{ verifyFile: false \}\)/)
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
  assert.match(app, /new URL\('https:\/\/opentimestamps\.org\/'\)/)
  assert.match(app, /searchParams\.set\('algorithm', 'SHA256'\)/)
  assert.match(app, /searchParams\.set\('digest', manifestCommitmentSha256\)/)
  assert.match(app, /searchParams\.set\('ots', proofBytesHex\(proofBytes\)\)/)
})

test('verification result states the product claim boundary', () => {
  assert.match(index, /exact file bytes match the timestamped record/)
  assert.match(index, /does not prove who created the file/)
  assert.match(index, /does not prove.*contents are true/i)
})

test('browser UI exposes the independent verification path without adding a runtime dependency', () => {
  assert.match(index, /opentimestamps\.org\/#stamp-and-verify/)
  assert.match(index, /github\.com\/Proof-Stamp\/ots\/blob\/main\/docs\/independent-verification\.md/)
  assert.match(index, /standard OpenTimestamps tooling and your own Bitcoin Core node/)
})

test('application coordinator contains no direct outbound request primitive', () => {
  assert.doesNotMatch(app, /\bfetch\s*\(/)
  assert.doesNotMatch(app, /XMLHttpRequest/)
  assert.doesNotMatch(app, /WebSocket/)
  assert.doesNotMatch(app, /sendBeacon/)
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
