import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { BROWSER_CONNECT_ORIGINS } from '../src/network-policy.js'

const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
const app = await readFile(new URL('../app/app.js', import.meta.url), 'utf8')
const headers = await readFile(new URL('../app/_headers', import.meta.url), 'utf8')

test('browser UI keeps source stamping local and pending semantics explicit', () => {
  assert.match(index, /id="file"[^>]*type="file"/)
  assert.doesNotMatch(index, /mailto:/i)
  assert.match(index, /Not submitted yet/)
  assert.match(index, /Waiting for Bitcoin is not Bitcoin confirmation/)
  assert.match(index, /Check the receipt again in about 3 hours/)
  assert.match(index, /receipt already contains the timestamp proof/)
  assert.match(app, /timestampBadge\.textContent = 'Waiting for Bitcoin'/)
})

test('saved ProofStamp flow can verify candidate file bytes locally before network status checks', () => {
  assert.match(index, /id="saved-original-file"[^>]*type="file"/)
  assert.match(index, /Choose the original file, or any file you want to compare with this ProofStamp/)
  assert.match(index, /It stays on this device/)
  assert.match(app, /dualSha256File\(candidateFile\)/)
  assert.match(app, /agreement\.sha256 !== validated\.receipt\.localHashAgreement\.fileSha256/)
  assert.match(app, /This file does not match this ProofStamp/)
  assert.match(app, /No calendar or Bitcoin request was made/)
  assert.match(app, /File matches this ProofStamp/)
})

test('browser UI exposes the independent verification path without adding a runtime dependency', () => {
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
