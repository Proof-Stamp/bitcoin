import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [wasmPath] = process.argv.slice(2)
if (!wasmPath) throw new Error('Usage: node scripts/check-rust-wasm.mjs <input.wasm>')

const { instance } = await WebAssembly.instantiate(await readFile(wasmPath), {})
const wasm = instance.exports
const required = ['alloc', 'dealloc', 'sha256_new', 'sha256_update', 'sha256_finalize', 'sha256_free']
required.forEach((name) => assert.equal(typeof wasm[name], 'function', `Missing ${name}`))
assert.ok(wasm.memory instanceof WebAssembly.Memory)

const input = new TextEncoder().encode('abc')
const inputPointer = wasm.alloc(input.length)
const outputPointer = wasm.alloc(32)
let handle = wasm.sha256_new()

try {
  new Uint8Array(wasm.memory.buffer, inputPointer, input.length).set(input)
  assert.equal(wasm.sha256_update(handle, inputPointer, input.length), 1)
  const finalizedHandle = handle
  handle = 0
  assert.equal(wasm.sha256_finalize(finalizedHandle, outputPointer), 1)
  const digest = Array.from(new Uint8Array(wasm.memory.buffer, outputPointer, 32), (byte) => byte.toString(16).padStart(2, '0')).join('')
  assert.equal(digest, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  console.log('Rust SHA-256 WASM known-vector check passed')
} finally {
  if (handle) wasm.sha256_free(handle)
  wasm.dealloc(inputPointer, input.length)
  wasm.dealloc(outputPointer, 32)
}
