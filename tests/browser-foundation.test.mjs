import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { BROWSER_CONNECT_ORIGINS } from '../src/network-policy.js'

const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
const app = await readFile(new URL('../app/app.js', import.meta.url), 'utf8')
const headers = await readFile(new URL('../app/_headers', import.meta.url), 'utf8')

test('browser UI accepts exactly one source file, has no email handoff, and keeps pending semantics explicit', () => {
  assert.match(index, /id="file"[^>]*type="file"/)
  assert.doesNotMatch(index, /mailto:/i)
  assert.match(index, /Not submitted yet/)
  assert.match(index, /Waiting for Bitcoin is not Bitcoin confirmation/)
  assert.match(app, /timestampBadge\.textContent = 'Waiting for Bitcoin'/)
})

test('browser UI exposes the independent verification path without adding a runtime dependency', () => {
  assert.match(index, /docs\/independent-verification\.md/)
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
