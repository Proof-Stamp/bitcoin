import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'

const dist = new URL('../dist/', import.meta.url)
const app = new URL('../app/', import.meta.url)
const src = new URL('../src/', import.meta.url)
const coreBundle = new URL('../node_modules/@otskit/core/dist/index.js', import.meta.url)

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await mkdir(new URL('vendor/', dist), { recursive: true })

for (const name of [
  'index.html',
  'brand-tokens.css',
  'styles.css',
  'brandkit.css',
  'app.js',
  'verify-ux.js',
  'proofstamp-logo.svg',
  'proofstamp-icon.svg',
  'proof-point-card-marker.svg',
  '_headers',
]) {
  await cp(new URL(name, app), new URL(name, dist))
}
for (const name of [
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
]) {
  await cp(new URL(name, src), new URL(name, dist))
}

await cp(coreBundle, new URL('vendor/otskit-core.js', dist))

for (const name of ['ots-stamp.js', 'ots-upgrade-verify.js']) {
  const source = await readFile(new URL(name, src), 'utf8')
  const browserSource = source.replace("from '@otskit/core'", "from './vendor/otskit-core.js'")
  if (browserSource === source || browserSource.includes("'@otskit/core'")) {
    throw new Error(`Failed to rewrite @otskit/core import for ${name}`)
  }
  await writeFile(new URL(name, dist), browserSource)
}

console.log('Built static browser app in dist/')
