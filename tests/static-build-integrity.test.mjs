import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { BROWSER_CONNECT_ORIGINS } from '../src/network-policy.js'

const appFiles = ['index.html', 'styles.css', 'app.js', 'verify-ux.js', 'proofstamp-logo.svg', '_headers']
const copiedSourceFiles = [
  'manifest-v1.js',
  'local-hash.js',
  'rust-sha256.js',
  'rust-sha256-wasm.js',
  'local-draft-v1.js',
  'pending-receipt-v1.js',
  'receipt-verify-v1.js',
  'receipt-v2.js',
  'receipt-verify.js',
  'network-policy.js',
]
const rewrittenSourceFiles = ['ots-stamp.js', 'ots-upgrade-verify.js']
const expectedRoot = [...appFiles, ...copiedSourceFiles, ...rewrittenSourceFiles, 'vendor'].sort()

async function text(url) {
  return readFile(url, 'utf8')
}

test('dist contains only the reviewed static application surface', async () => {
  const root = (await readdir(new URL('../dist/', import.meta.url))).sort()
  assert.deepEqual(root, expectedRoot)
  const vendor = (await readdir(new URL('../dist/vendor/', import.meta.url))).sort()
  assert.deepEqual(vendor, ['otskit-core.js'])
  assert.equal(root.some((name) => name.endsWith('.map')), false)
})

test('copied application and source files are byte-for-byte identical in dist', async () => {
  for (const name of appFiles) {
    assert.deepEqual(
      await readFile(new URL(`../app/${name}`, import.meta.url)),
      await readFile(new URL(`../dist/${name}`, import.meta.url)),
      name,
    )
  }
  for (const name of copiedSourceFiles) {
    assert.deepEqual(
      await readFile(new URL(`../src/${name}`, import.meta.url)),
      await readFile(new URL(`../dist/${name}`, import.meta.url)),
      name,
    )
  }
})

test('rewritten OTS modules replace only the package import with the vendored local module', async () => {
  for (const name of rewrittenSourceFiles) {
    const source = await text(new URL(`../src/${name}`, import.meta.url))
    const built = await text(new URL(`../dist/${name}`, import.meta.url))
    const expected = source.replace("from '@otskit/core'", "from './vendor/otskit-core.js'")
    assert.equal(built, expected, name)
    assert.doesNotMatch(built, /from ['"]@otskit\//)
  }
})

test('CSP connect-src is the exact browser network policy and contains no wildcard', async () => {
  const headers = await text(new URL('../dist/_headers', import.meta.url))
  const connect = headers.match(/connect-src ([^;]+);/)?.[1]
  assert.equal(connect, BROWSER_CONNECT_ORIGINS.join(' '))
  assert.doesNotMatch(connect, /(^|\s)https:(\s|$)/)
  assert.doesNotMatch(connect, /\*/)
  assert.doesNotMatch(connect, /'self'/)
})

test('static HTML keeps mobile viewport, live status regions, explicit labels, and no third-party assets', async () => {
  const html = await text(new URL('../dist/index.html', import.meta.url))
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /<label[^>]*class="field/)
  assert.match(html, /id="saved-receipt"/)
  assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//i)
  assert.doesNotMatch(html, /<link[^>]+href="https?:\/\//i)
})

test('header brand uses the local official ProofStamp logo asset', async () => {
  const css = await text(new URL('../dist/styles.css', import.meta.url))
  const logo = await text(new URL('../dist/proofstamp-logo.svg', import.meta.url))
  assert.match(css, /proofstamp-logo\.svg/)
  assert.match(logo, /viewBox="0 0 740 740"/)
  assert.match(logo, /fill="#162d52"/)
})
