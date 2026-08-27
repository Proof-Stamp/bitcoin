import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const readme = await read('../README.md')
const independent = await read('../docs/independent-verification.md')
const deployment = await read('../docs/deployment-and-product-boundary.md')
const release = await read('../docs/experimental-release.md')
const rustBuild = await read('../scripts/build-rust-hasher.sh')
const browserSmokeRunner = await read('../scripts/run-browser-smoke.sh')
const browserSmoke = await read('../scripts/browser-smoke.mjs')

test('README identifies the current roadmap phase and independent verification guide', () => {
  assert.match(readme, /Phase 6: static Cloudflare Pages deployment and experimental release/)
  assert.match(readme, /docs\/independent-verification\.md/)
  assert.match(readme, /consensusValidation: false/)
})

test('independent verification guide preserves the Manifest v1 and Bitcoin Core boundaries', () => {
  assert.match(independent, /PROOFSTAMP-MANIFEST-V1\\x00/)
  assert.match(independent, /ots info FILE\.proofstamp\.ots/)
  assert.match(independent, /ots upgrade FILE\.proofstamp\.ots/)
  assert.match(independent, /ots --bitcoin-node http:\/\/USER:PASS@127\.0\.0\.1:8332\/ verify/)
  assert.match(independent, /-d MANIFEST_COMMITMENT_SHA256/)
  assert.match(independent, /consensusValidation: false/)
})

test('deployment documentation keeps the static-only Cloudflare boundary', () => {
  assert.match(deployment, /Build command: npm run build/)
  assert.match(deployment, /Build output directory: dist/)
  assert.match(deployment, /Node\.js: 22/)
  assert.match(deployment, /Do not introduce Cloudflare Functions, Workers, server-side proof storage/)
})

test('Cloudflare Rust bootstrap is narrow, pinned, and checksum-verified', () => {
  assert.match(rustBuild, /CF_PAGES/)
  assert.match(rustBuild, /rustup_version="1\.29\.0"/)
  assert.match(rustBuild, /static\.rust-lang\.org\/rustup\/archive/)
  assert.match(rustBuild, /rust-toolchain\.toml/)
  assert.match(rustBuild, /sha256sum --check --status/)
  assert.match(rustBuild, /if ! command -v rustup/)
})

test('real-browser smoke lets Chrome choose an unused DevTools port', () => {
  assert.match(browserSmokeRunner, /--remote-debugging-port=0/)
  assert.match(browserSmokeRunner, /DevToolsActivePort/)
  assert.match(browserSmokeRunner, /env -u DBUS_SESSION_BUS_ADDRESS/)
  assert.doesNotMatch(browserSmokeRunner, /--remote-debugging-port=9222/)
  assert.doesNotMatch(browserSmoke, /127\.0\.0\.1:9222/)
  assert.match(browserSmoke, /devtoolsBaseUrl/)
})

test('experimental release checklist requires green protected checks and a production smoke test', () => {
  assert.match(release, /node-interop/)
  assert.match(release, /canonical-python/)
  assert.match(release, /production smoke test/)
  assert.match(release, /Waiting for Bitcoin/)
  assert.match(release, /experimental\/pre-release/)
})
