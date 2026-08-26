const CHUNK_SIZE_BYTES = 1024 * 1024
const DIGEST_SIZE_BYTES = 32
let wasmExportsPromise = null

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function decodeBase64(value) {
  if (typeof atob !== 'function') throw new Error('Base64 decoding is unavailable')
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function sha256Hex(bytes, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('Web Crypto is required to verify the embedded Rust module')
  const digest = await subtle.digest('SHA-256', bytes)
  return bytesToHex(new Uint8Array(digest))
}

function requireExport(exports, name, type) {
  if (typeof exports[name] !== type) throw new Error(`Invalid Rust SHA-256 export: ${name}`)
}

async function loadWasmExports() {
  if (!wasmExportsPromise) {
    wasmExportsPromise = (async () => {
      if (typeof WebAssembly !== 'object') throw new Error('WebAssembly is unavailable')
      const { RUST_SHA256_WASM_BASE64, RUST_SHA256_WASM_SHA256 } = await import('./rust-sha256-wasm.js')
      const wasmBytes = decodeBase64(RUST_SHA256_WASM_BASE64)
      const embeddedDigest = await sha256Hex(wasmBytes)
      if (embeddedDigest !== RUST_SHA256_WASM_SHA256) {
        throw new Error('Embedded Rust SHA-256 module integrity check failed')
      }

      const { instance } = await WebAssembly.instantiate(wasmBytes, {})
      const exports = instance.exports
      if (!(exports.memory instanceof WebAssembly.Memory)) throw new Error('Invalid Rust SHA-256 memory export')
      ;['alloc', 'dealloc', 'sha256_new', 'sha256_update', 'sha256_finalize', 'sha256_free']
        .forEach((name) => requireExport(exports, name, 'function'))
      return exports
    })()
  }
  return wasmExportsPromise
}

export async function rustSha256Bytes(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const wasm = await loadWasmExports()
  const chunkCapacity = Math.min(Math.max(input.byteLength, 1), CHUNK_SIZE_BYTES)
  let chunkPointer = 0
  let outputPointer = 0
  let handle = 0

  try {
    chunkPointer = wasm.alloc(chunkCapacity)
    outputPointer = wasm.alloc(DIGEST_SIZE_BYTES)
    handle = wasm.sha256_new()
    if (!chunkPointer || !outputPointer || !handle) throw new Error('Rust SHA-256 allocation failed')

    for (let offset = 0; offset < input.byteLength; offset += chunkCapacity) {
      const length = Math.min(chunkCapacity, input.byteLength - offset)
      new Uint8Array(wasm.memory.buffer, chunkPointer, length).set(input.subarray(offset, offset + length))
      if (wasm.sha256_update(handle, chunkPointer, length) !== 1) {
        throw new Error('Rust SHA-256 update failed')
      }
    }

    const finalizedHandle = handle
    handle = 0
    if (wasm.sha256_finalize(finalizedHandle, outputPointer) !== 1) {
      throw new Error('Rust SHA-256 finalization failed')
    }
    return bytesToHex(new Uint8Array(wasm.memory.buffer, outputPointer, DIGEST_SIZE_BYTES).slice())
  } finally {
    if (handle) wasm.sha256_free(handle)
    if (chunkPointer) wasm.dealloc(chunkPointer, chunkCapacity)
    if (outputPointer) wasm.dealloc(outputPointer, DIGEST_SIZE_BYTES)
  }
}
