import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
const app = await readFile(new URL('../app/app.js', import.meta.url), 'utf8')
const headers = await readFile(new URL('../app/_headers', import.meta.url), 'utf8')

test('browser UI accepts exactly one file, has no email handoff, and keeps pending semantics explicit', () => {
  assert.match(index, /type="file"/)
  assert.doesNotMatch(index, /\bmultiple\b/)
  assert.doesNotMatch(index, /mailto:/i)
  assert.match(index, /Not submitted yet/)
  assert.match(index, /Pending is not Bitcoin confirmation/)
})

test('application coordinator contains no direct outbound request primitive', () => {
  assert.doesNotMatch(app, /\bfetch\s*\(/)
  assert.doesNotMatch(app, /XMLHttpRequest/)
  assert.doesNotMatch(app, /WebSocket/)
  assert.doesNotMatch(app, /sendBeacon/)
})

test('static CSP allows only the reviewed OpenTimestamps calendar origins', () => {
  assert.match(
    headers,
    /connect-src https:\/\/a\.pool\.opentimestamps\.org https:\/\/b\.pool\.opentimestamps\.org https:\/\/a\.pool\.eternitywall\.com;/,
  )
  assert.doesNotMatch(headers, /connect-src https:;/)
  assert.doesNotMatch(headers, /connect-src \*;/)
  assert.match(headers, /form-action 'none'/)
  assert.match(headers, /frame-ancestors 'none'/)
  assert.match(headers, /'wasm-unsafe-eval'/)
})
