import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8')
const app = await readFile(new URL('../app/app.js', import.meta.url), 'utf8')
const headers = await readFile(new URL('../app/_headers', import.meta.url), 'utf8')

test('local preparation UI accepts exactly one file and has no email handoff', () => {
  assert.match(index, /type="file"/)
  assert.doesNotMatch(index, /\bmultiple\b/)
  assert.doesNotMatch(index, /mailto:/i)
  assert.match(index, /Not timestamped yet/)
})

test('local preparation application contains no outbound request primitive', () => {
  assert.doesNotMatch(app, /\bfetch\s*\(/)
  assert.doesNotMatch(app, /XMLHttpRequest/)
  assert.doesNotMatch(app, /WebSocket/)
  assert.doesNotMatch(app, /sendBeacon/)
})

test('static CSP blocks application network access', () => {
  assert.match(headers, /connect-src 'none'/)
  assert.match(headers, /form-action 'none'/)
  assert.match(headers, /frame-ancestors 'none'/)
  assert.match(headers, /'wasm-unsafe-eval'/)
})
