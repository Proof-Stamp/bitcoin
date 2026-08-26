# Pending OpenTimestamps submission

This document defines the first networked ProofStamp via Bitcoin flow.

The browser starts from a Manifest v1 commitment that has already passed the dual local SHA-256 gate. It then creates a standard pending OpenTimestamps proof and saves it locally. This phase does not verify a Bitcoin attestation yet.

## Network boundary

The browser may contact only these calendar origins:

- `https://a.pool.opentimestamps.org`
- `https://b.pool.opentimestamps.org`
- `https://a.pool.eternitywall.com`

The same list is used by the stamping code, CSP, receipt schema, and tests. No user-controlled or proof-provided URL can expand the creation-time network allowlist.

Each request is a `POST` to `/digest`. Redirects are rejected, credentials are omitted, referrer information is suppressed, and calendar responses are capped at 10,000 bytes.

## What leaves the device

The source file does not leave the device.

The canonical Manifest v1 does not leave the device.

The raw Manifest v1 commitment is also not submitted directly. The browser follows the OpenTimestamps privacy pattern:

```text
manifest commitment
  -> append 16 random bytes
  -> SHA-256
  -> calendar submission digest
```

The 16-byte nonce comes from `crypto.getRandomValues`. There is no `Math.random` fallback.

This blinding makes the calendar submission opaque to the calendar while preserving a proof path from the Manifest commitment to the returned timestamp tree.

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
```

`pending` means the OpenTimestamps submission was accepted by at least one approved calendar. It does not mean the commitment is already anchored in a verified Bitcoin block.

The UI must not say `Bitcoin anchored`, `Bitcoin verified`, or an equivalent claim until a later upgrade and Bitcoin verification step succeeds.

## Portable artifacts

The user can save two artifacts:

1. `*.proofstamp-receipt.json`
2. `*.proofstamp.ots`

The receipt embeds:

- exact canonical Manifest v1 bytes as base64;
- the Manifest v1 commitment;
- both local SHA-256 results;
- the exact pending `.ots` bytes as base64;
- SHA-256 of the `.ots` bytes;
- attempted, accepted, and failed approved calendars;
- redundancy state.

The raw `.ots` export is also provided so standard OpenTimestamps tooling can parse and later upgrade it independently of ProofStamp.

The receipt deliberately does not record a browser clock value as proof time. The authoritative time claim comes only after a Bitcoin attestation is upgraded and verified.

## Protocol implementation choice

Creation uses `@otskit/core` 0.2.0 as the production OpenTimestamps wire-format implementation.

Reasons for this narrow selection:

- MIT licensed;
- zero runtime dependencies;
- fail-closed parsing and explicit bounds;
- already exercised against the canonical Python OpenTimestamps fixture corpus in this repository;
- deterministic `.ots` serialization;
- browser-compatible cryptographic and serialization primitives.

ProofStamp does not use OTSkit's network client as a production dependency in this phase. The browser network adapter is intentionally small and keeps the ProofStamp calendar allowlist, timeout, response-size, and partial-failure policy directly auditable in this repository.

The adapter follows the standard calendar protocol behavior also implemented by OTSkit Client: submit the blinded digest to `/digest`, parse the returned Timestamp against that exact digest, reject trailing bytes, and merge successful trees.

## Interoperability gate

CI generates a ProofStamp pending `.ots` without external network access and requires the pinned canonical Python `ots` client to parse it successfully.

This is not the final release gate. Before public release, ProofStamp still needs networked stamping/upgrade interoperability, strict imported-proof limits, malicious calendar URL tests for upgrade, completed Bitcoin verification, and parser fuzz/property coverage.
