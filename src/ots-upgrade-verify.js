import {
  DetachedTimestampFile,
  OpSHA256,
  StreamDeserializationContext,
  Timestamp,
  bytesToHex,
  hexToBytes,
  verifyBitcoinAttestation,
} from '@otskit/core'
import { BLOCKSTREAM_ESPLORA_API, UPGRADE_CALENDARS } from './network-policy.js'

export const MAX_IMPORTED_OTS_BYTES = 128 * 1024
export const MAX_PROOF_ATTESTATIONS = 128
export const MAX_PROOF_TREE_DEPTH = 64
export const MAX_PROOF_OPERATIONS = 1024
export const MAX_PROOF_NODES = 2048
export const MAX_UPGRADE_QUERIES = 16
export const MAX_BITCOIN_ATTESTATIONS = 8
export const NETWORK_RESPONSE_LIMIT_BYTES = 10_000
export const NETWORK_TIMEOUT_MS = 8_000

const HEX64_RE = /^[0-9a-f]{64}$/i
const HEX160_RE = /^[0-9a-f]{160}$/i

function bytesEqual(a, b) {
  if (a.length !== b.length) return false
  let different = 0
  for (let i = 0; i < a.length; i += 1) different |= a[i] ^ b[i]
  return different === 0
}

function assertProofBytes(proofBytes) {
  if (!(proofBytes instanceof Uint8Array)) throw new TypeError('OpenTimestamps proof must be bytes')
  if (proofBytes.byteLength === 0) throw new Error('OpenTimestamps proof is empty')
  if (proofBytes.byteLength > MAX_IMPORTED_OTS_BYTES) {
    throw new Error(`OpenTimestamps proof exceeds ${MAX_IMPORTED_OTS_BYTES} bytes`)
  }
}

function assertProofComplexity(timestamp) {
  let nodes = 0
  let operations = 0
  let maximumDepth = 0
  const stack = [{ stamp: timestamp, depth: 0 }]

  while (stack.length > 0) {
    const { stamp, depth } = stack.pop()
    nodes += 1
    if (nodes > MAX_PROOF_NODES) {
      throw new Error(`OpenTimestamps proof exceeds the ${MAX_PROOF_NODES}-node limit`)
    }
    if (depth > MAX_PROOF_TREE_DEPTH) {
      throw new Error(`OpenTimestamps proof exceeds the ${MAX_PROOF_TREE_DEPTH}-level application depth limit`)
    }
    maximumDepth = Math.max(maximumDepth, depth)

    const branches = stamp.branches
    operations += branches.length
    if (operations > MAX_PROOF_OPERATIONS) {
      throw new Error(`OpenTimestamps proof exceeds the ${MAX_PROOF_OPERATIONS}-operation limit`)
    }
    for (const { stamp: child } of branches) stack.push({ stamp: child, depth: depth + 1 })
  }

  return Object.freeze({ nodes, operations, maximumDepth })
}

function parseProof(proofBytes) {
  assertProofBytes(proofBytes)
  let detached
  try {
    detached = DetachedTimestampFile.deserialize(proofBytes)
  } catch (cause) {
    throw new Error('Invalid OpenTimestamps proof', { cause })
  }
  if (!(detached.fileHashOp instanceof OpSHA256)) {
    throw new Error('ProofStamp verification supports SHA-256 detached proofs only')
  }

  const complexity = assertProofComplexity(detached.timestamp)
  const attestations = detached.timestamp.allAttestations()
  if (attestations.length > MAX_PROOF_ATTESTATIONS) {
    throw new Error(`OpenTimestamps proof exceeds the ${MAX_PROOF_ATTESTATIONS}-attestation limit`)
  }
  return { detached, attestations, complexity }
}

function approvedCalendarOrigin(uri) {
  let parsed
  try {
    parsed = new URL(uri)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return null
  if (parsed.pathname !== '/' && parsed.pathname !== '') return null
  const origin = parsed.origin
  return UPGRADE_CALENDARS.includes(origin) ? origin : null
}

async function readResponseLimited(response, limit = NETWORK_RESPONSE_LIMIT_BYTES) {
  const declared = response.headers?.get?.('content-length')
  if (declared !== null && declared !== undefined && /^\d+$/.test(declared) && Number(declared) > limit) {
    throw new Error(`Network response exceeds ${limit} bytes`)
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > limit) throw new Error(`Network response exceeds ${limit} bytes`)
    return bytes
  }
  const reader = response.body.getReader()
  const output = new Uint8Array(limit)
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return output.slice(0, received)
      const next = received + value.byteLength
      if (next > limit) {
        await reader.cancel()
        throw new Error(`Network response exceeds ${limit} bytes`)
      }
      output.set(value, received)
      received = next
    }
  } finally {
    reader.releaseLock()
  }
}

async function fetchWithTimeout(url, options, fetchImpl, timeoutMs, limit = NETWORK_RESPONSE_LIMIT_BYTES) {
  if (typeof fetchImpl !== 'function') throw new Error('Browser fetch is unavailable')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Network request timed out')), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    return { response, bytes: await readResponseLimited(response, limit) }
  } finally {
    clearTimeout(timeout)
  }
}

async function queryCalendar(origin, digest, fetchImpl, timeoutMs) {
  if (!UPGRADE_CALENDARS.includes(origin)) throw new Error('Calendar is not approved for upgrade')
  const { response, bytes } = await fetchWithTimeout(
    `${origin}/timestamp/${bytesToHex(digest)}`,
    { method: 'GET', headers: { Accept: 'application/vnd.opentimestamps.v1' } },
    fetchImpl,
    timeoutMs,
  )
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Calendar returned HTTP ${response.status}`)
  const context = new StreamDeserializationContext(bytes)
  const timestamp = Timestamp.deserialize(context, digest)
  context.assertEof()
  return timestamp
}

export function inspectOpenTimestampsProof(proofBytes) {
  const { detached, attestations, complexity } = parseProof(proofBytes)
  const bitcoinHeights = attestations
    .filter(({ attestation }) => attestation.kind === 'bitcoin')
    .map(({ attestation }) => attestation.height)
    .sort((a, b) => a - b)
  return Object.freeze({
    fileDigestSha256: bytesToHex(detached.fileDigest()),
    pendingCount: attestations.filter(({ attestation }) => attestation.kind === 'pending').length,
    bitcoinCount: bitcoinHeights.length,
    bitcoinHeights: Object.freeze(bitcoinHeights),
    unknownCount: attestations.filter(({ attestation }) => attestation.kind === 'unknown').length,
    operationCount: complexity.operations,
    treeDepth: complexity.maximumDepth,
    nodeCount: complexity.nodes,
    state: bitcoinHeights.length > 0 ? 'bitcoin-attested' : 'pending',
  })
}

export async function upgradeOpenTimestampsProof(
  proofBytes,
  { fetchImpl = globalThis.fetch, timeoutMs = NETWORK_TIMEOUT_MS } = {},
) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new RangeError('Invalid network timeout')
  const { detached } = parseProof(proofBytes)
  const before = detached.serializeToBytes()

  if (detached.timestamp.hasBitcoinAttestation()) {
    return Object.freeze({
      proofBytes: before,
      changed: false,
      state: 'bitcoin-attested',
      queriedCalendars: Object.freeze([]),
      skippedUnapprovedCalendars: Object.freeze([]),
      failedCalendars: Object.freeze([]),
    })
  }

  const skipped = []
  const candidates = []
  const seen = new Set()
  for (const stamp of detached.timestamp.directlyVerified()) {
    for (const attestation of stamp.attestations) {
      if (attestation.kind !== 'pending') continue
      const origin = approvedCalendarOrigin(attestation.uri)
      if (!origin) {
        skipped.push(attestation.uri)
        continue
      }
      const digest = stamp.getDigest()
      const key = `${origin}:${bytesToHex(digest)}`
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push({ stamp, origin, digest })
    }
  }

  if (candidates.length > MAX_UPGRADE_QUERIES) {
    throw new Error(`OpenTimestamps proof requires more than ${MAX_UPGRADE_QUERIES} calendar upgrade queries`)
  }

  const queried = []
  const failed = []
  for (const { stamp, origin, digest } of candidates) {
    queried.push(origin)
    try {
      const upgrade = await queryCalendar(origin, digest, fetchImpl, timeoutMs)
      if (upgrade) stamp.merge(upgrade)
    } catch (error) {
      failed.push(Object.freeze({ calendar: origin, error: error instanceof Error ? error.name : 'Error' }))
    }
  }

  const after = detached.serializeToBytes()
  return Object.freeze({
    proofBytes: after,
    changed: !bytesEqual(before, after),
    state: detached.timestamp.hasBitcoinAttestation() ? 'bitcoin-attested' : 'pending',
    queriedCalendars: Object.freeze([...new Set(queried)]),
    skippedUnapprovedCalendars: Object.freeze([...new Set(skipped)]),
    failedCalendars: Object.freeze(failed),
  })
}

async function sha256(bytes, subtle) {
  if (!subtle) throw new Error('Web Crypto SHA-256 is unavailable')
  return new Uint8Array(await subtle.digest('SHA-256', bytes))
}

async function sha256dDisplayHex(bytes, subtle) {
  const first = await sha256(bytes, subtle)
  const second = await sha256(first, subtle)
  return bytesToHex(Uint8Array.from(second).reverse())
}

function decodeAscii(bytes) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim()
}

async function fetchBlockHeader(height, fetchImpl, timeoutMs, subtle) {
  const heightResult = await fetchWithTimeout(
    `${BLOCKSTREAM_ESPLORA_API}/block-height/${height}`,
    { method: 'GET', headers: { Accept: 'text/plain' } },
    fetchImpl,
    timeoutMs,
    256,
  )
  if (!heightResult.response.ok) throw new Error(`Bitcoin explorer returned HTTP ${heightResult.response.status}`)
  const blockHash = decodeAscii(heightResult.bytes).toLowerCase()
  if (!HEX64_RE.test(blockHash)) throw new Error('Bitcoin explorer returned an invalid block hash')

  const headerResult = await fetchWithTimeout(
    `${BLOCKSTREAM_ESPLORA_API}/block/${blockHash}/header`,
    { method: 'GET', headers: { Accept: 'text/plain' } },
    fetchImpl,
    timeoutMs,
    512,
  )
  if (!headerResult.response.ok) throw new Error(`Bitcoin explorer returned HTTP ${headerResult.response.status}`)
  const headerHex = decodeAscii(headerResult.bytes)
  if (!HEX160_RE.test(headerHex)) throw new Error('Bitcoin explorer returned an invalid raw block header')
  const rawHeader = hexToBytes(headerHex)
  const authenticatedHash = await sha256dDisplayHex(rawHeader, subtle)
  if (authenticatedHash !== blockHash) throw new Error('Bitcoin block header hash does not match the explorer height response')
  return { blockHash, rawHeader }
}

export async function verifyBitcoinAttestations(
  proofBytes,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = NETWORK_TIMEOUT_MS,
    subtle = globalThis.crypto?.subtle,
  } = {},
) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new RangeError('Invalid network timeout')
  const { detached, attestations } = parseProof(proofBytes)
  const bitcoin = attestations.filter(({ attestation }) => attestation.kind === 'bitcoin')
  if (bitcoin.length === 0) throw new Error('No Bitcoin attestation is present yet')
  if (bitcoin.length > MAX_BITCOIN_ATTESTATIONS) {
    throw new Error(`OpenTimestamps proof exceeds the ${MAX_BITCOIN_ATTESTATIONS}-Bitcoin-attestation verification limit`)
  }

  const verified = []
  const failures = []
  for (const { msg, attestation } of bitcoin) {
    try {
      const { blockHash, rawHeader } = await fetchBlockHeader(attestation.height, fetchImpl, timeoutMs, subtle)
      const blockTime = verifyBitcoinAttestation(msg, attestation, rawHeader, attestation.height)
      verified.push(Object.freeze({
        height: attestation.height,
        blockHash,
        blockTime,
      }))
    } catch (error) {
      failures.push(Object.freeze({
        height: attestation.height,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  if (verified.length === 0) throw new Error('Bitcoin attestation verification failed')
  verified.sort((a, b) => a.blockTime - b.blockTime || a.height - b.height)
  return Object.freeze({
    valid: true,
    method: 'blockstream-esplora-raw-header',
    consensusValidation: false,
    earliest: verified[0],
    verifiedAttestations: Object.freeze(verified),
    failedAttestations: Object.freeze(failures),
  })
}
