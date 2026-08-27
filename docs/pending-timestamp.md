# Pending OpenTimestamps submission

This document defines the networked ProofStamp via Bitcoin creation flow for new receipt v2 proofs.

The browser starts from the exact source-file SHA-256 after the Web Crypto and Rust/WASM implementations agree. It creates a standard pending OpenTimestamps detached proof for that file digest and saves it inside a portable receipt. This stage does not claim a verified Bitcoin attestation yet.

## Network boundary

The browser may contact only these calendar origins:

- `https://a.pool.opentimestamps.org`
- `https://b.pool.opentimestamps.org`
- `https://a.pool.eternitywall.com`

The same list is used by the stamping code, CSP, receipt validation, and tests. No user-controlled or proof-provided URL can expand the creation-time network allowlist.

Each request is a `POST` to `/digest`. Redirects are rejected, credentials are omitted, referrer information is suppressed, and calendar responses are capped at 10,000 bytes.

## What leaves the device

The source file does not leave the device.

The bare source-file SHA-256 is not submitted directly to a calendar. The browser follows the standard OpenTimestamps privacy pattern:

```text
file SHA-256
  -> append 16 random bytes
  -> SHA-256
  -> calendar submission digest
```

The 16-byte nonce comes from `crypto.getRandomValues`. There is no `Math.random` fallback.

This blinding makes the calendar submission opaque to the calendar while preserving the standard proof path from the file digest to the returned timestamp tree.

## Calendar multiplicity

Calendar multiplicity is a liveness and recovery mechanism. It is not consensus and it does not increase the cryptographic trust level of a Bitcoin attestation.

ProofStamp attempts all three approved calendars in parallel and merges every valid response.

- 2 or 3 accepted calendars: pending proof with normal redundancy.
- 1 accepted calendar: pending proof with reduced redundancy. The successful response is preserved rather than discarded.
- 0 accepted calendars: creation fails closed and no pending receipt is produced.

Malformed, oversized, non-success HTTP responses, timeouts, or merge failures are isolated to the affected calendar.

## Proof state

A newly created receipt has:

```text
status: pending
proofTarget: file-sha256
```

`pending` means the OpenTimestamps submission was accepted by at least one approved calendar. It does not mean the file hash is already anchored in a verified Bitcoin block.

The UI must not say `Bitcoin anchored`, `Bitcoin verified`, or an equivalent claim until a later upgrade and Bitcoin verification step succeeds.

## Portable artifacts

The user can save:

1. `*.proofstamp-receipt.json`
2. optionally, the standard detached `*.ots` proof.

Receipt v2 embeds:

- the exact file SHA-256;
- both local SHA-256 results;
- the exact pending `.ots` bytes as base64;
- SHA-256 of the `.ots` bytes;
- attempted, accepted, and failed approved calendars;
- redundancy state.

The detached digest inside the `.ots` proof MUST equal the receipt's `fileSha256`.

The separate `.ots` export is standard OpenTimestamps data for the original file. A recipient can pair it directly with the original file using OpenTimestamps.org or standard CLI tooling. The receipt is not required for that independent path.

The receipt deliberately does not record a browser clock value as proof time. The authoritative time claim comes only after a Bitcoin attestation is upgraded and verified.

## Legacy receipt v1

Earlier experimental ProofStamps timestamped a Manifest v1 commitment. Those v1 receipts remain verifiable, but they are not used for new creation. Their `.ots` detached digest is the Manifest commitment rather than the raw file SHA-256.

The browser distinguishes the two receipt versions explicitly.

## Protocol implementation choice

Creation uses `@otskit/core` 0.2.0 as the production OpenTimestamps wire-format implementation.

Reasons for this narrow selection:

- MIT licensed;
- zero runtime dependencies;
- fail-closed parsing and explicit bounds;
- exercised against the canonical Python OpenTimestamps fixture corpus in this repository;
- deterministic `.ots` serialization;
- browser-compatible cryptographic and serialization primitives.

ProofStamp does not use OTSkit's network client as a production dependency. The browser network adapter is intentionally small and keeps the ProofStamp calendar allowlist, timeout, response-size, and partial-failure policy directly auditable in this repository.

The adapter follows the standard calendar behavior: blind the detached digest, submit the resulting digest to `/digest`, parse the returned Timestamp against that exact submission digest, reject trailing bytes, and merge successful trees.

## Interoperability gate

CI requires standard `.ots` interoperability with the canonical Python `ots` client.

Before release, the direct-file path must additionally be smoke-tested end to end:

- create a new ProofStamp from a known file;
- confirm the exported `.ots` detached digest equals that file's SHA-256;
- confirm the original file + `.ots` is accepted by standard OpenTimestamps tooling;
- confirm the same file + receipt verifies in ProofStamp;
- confirm a modified file fails locally before any calendar or Bitcoin request.
