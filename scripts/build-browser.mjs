import { cp, mkdir, rm } from 'node:fs/promises'

const dist = new URL('../dist/', import.meta.url)
const app = new URL('../app/', import.meta.url)
const src = new URL('../src/', import.meta.url)

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })

for (const name of ['index.html', 'styles.css', 'app.js', '_headers']) {
  await cp(new URL(name, app), new URL(name, dist))
}
for (const name of ['manifest-v1.js', 'local-hash.js', 'rust-sha256.js', 'rust-sha256-wasm.js', 'local-draft-v1.js']) {
  await cp(new URL(name, src), new URL(name, dist))
}
console.log('Built static browser app in dist/')
