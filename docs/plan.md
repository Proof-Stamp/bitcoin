# ProofStamp via Bitcoin / OpenTimestamps v0 plan

Status: Phase 6 experimental release candidate

This document records the implementation roadmap and the current architecture for the Bitcoin-backed ProofStamp browser application.

The goal is not to create a new timestamp protocol. ProofStamp provides local-first UX, dual local hashing, a portable receipt, and a verification experience. OpenTimestamps provides the interoperable detached timestamp proof. Bitcoin provides the public anchor.

## Product principles

The v0 preserves these properties:

- Source files stay on the user's device.
- Files are hashed locally with two independent SHA-256 implementations.
- No ProofStamp account is required.
- No wallet, seed phrase, token, or gas interaction is required.
- No ProofStamp proof database is required for creating or verifying a completed proof.
- The timestamp proof remains portable and independently verifiable outside ProofStamp.
- Product copy distinguishes proof of existence/integrity from proof of truth, authorship, source, location, or original creation time.
- A pending OpenTimestamps proof is never presented as already Bitcoin-verified.

## Current architecture

For new ProofStamps:

```text
original file
    |
    v
local SHA-256
Web Crypto == Rust/WASM
    |
    v
file SHA-256
    |
    v
standard OpenTimestamps detached proof
nonce/blinding + allowlisted calendar submission
    |
    v
pending portable receipt v2 + optional .ots export
    |
    v
calendar upgrade
    |
    v
Bitcoin attestation
    |
    v
ProofStamp verification or independent OTS verification
```

The exported receipt-v2 `.ots` proof is bound directly to the file SHA-256. This is intentional: the original file + `.ots` can be checked with standard OpenTimestamps tools without a ProofStamp-specific intermediate commitment.

OpenTimestamps calendars are aggregation and availability infrastructure. Multiple calendars improve liveness and recovery options. They are not independent timestamp authorities and must not be presented as such.

## Legacy Manifest v1

Manifest v1 was implemented earlier in the roadmap and used by experimental receipt v1 proofs.

Before the first experimental release, the product proof target was simplified to direct file SHA-256 because direct standard OpenTimestamps interoperability is more valuable to the normal user than cryptographically binding optional metadata.

Manifest v1 remains frozen for backward verification compatibility. New creation does not produce it.

## V0 scope

### Create

1. Select one file.
2. Calculate SHA-256 locally with Web Crypto and an independent Rust/WASM path.
3. Fail closed if the two calculations disagree.
4. Create a standard OpenTimestamps detached proof whose file digest is that exact SHA-256.
5. Apply standard OTS blinding and submit only the blinded digest to the fixed approved calendars.
6. Produce a portable receipt v2 embedding the standard pending `.ots` proof.
7. Offer the detached `.ots` representation for independent verification.

### Upgrade

1. Open an existing ProofStamp receipt.
2. Dispatch by explicit receipt version.
3. Parse receipt/proof with strict size and complexity limits.
4. Contact only locally allowlisted calendars.
5. Merge valid upgrade information.
6. Preserve the upgraded proof in the portable receipt.
7. Never silently discard the original pending proof if upgrade fails.

### Verify

For receipt v2:

1. Validate the receipt locally.
2. If the user supplied the original/candidate file, calculate its dual local SHA-256.
3. Require the candidate SHA-256 to equal the receipt `fileSha256` before any network request.
4. Require the embedded `.ots` detached digest to equal the same `fileSha256`.
5. Upgrade the proof only through approved calendars.
6. Verify any Bitcoin attestation with the configured browser data source.
7. Expose block details and verification method in technical details.

For receipt v1, keep the frozen Manifest-v1 binding checks and never reinterpret the legacy `.ots` digest as the source-file hash.

A browser convenience verifier may use a public Bitcoin data source. Documentation must state that the strongest independent Bitcoin verification is against a locally controlled Bitcoin Core node or another verifier that validates the relevant chain independently.

## State model

### local ready

The file SHA-256 has passed the dual local hash gate. No timestamp submission has succeeded yet.

### pending

At least one valid calendar response has been preserved. The proof is not yet verified against a Bitcoin block.

User-facing copy uses `Waiting for Bitcoin` rather than `Bitcoin timestamped`.

### Bitcoin attestation verified

A Bitcoin attestation is present and the browser has verified the OpenTimestamps path against an authenticated raw block header.

This browser state records `consensusValidation: false`; it does not mean the browser independently validated Bitcoin consensus.

## Calendar policy

Initial production calendar endpoints are explicitly allowlisted.

- Submit to several public calendars for resilience.
- Treat one valid response as sufficient to preserve a pending proof.
- Prefer multiple successful responses when available.
- Do not claim that N-of-M calendar responses create consensus.
- Do not fetch arbitrary calendar URLs supplied by untrusted proof files.
- Calendar request failures must not corrupt other valid proof branches.
- Network/timing metadata leakage is documented.

A ProofStamp-operated calendar may be considered later for availability, but ProofStamp must not become the timestamp trust anchor.

## Browser network policy

Production networking is narrowly scoped. Do not use a generic `connect-src https:` policy.

Allow only:

- configured OpenTimestamps calendar hosts;
- configured Bitcoin data providers used by the convenience verifier;
- no arbitrary hosts read from user-controlled proof data.

The approved endpoint list lives in one auditable configuration source and is covered by tests.

## Security requirements

Treat ProofStamp receipts and `.ots` files as attacker-controlled input.

The parser/verifier fails closed on:

- oversized proof/receipt files;
- excessive tree depth, operation count, node count, or attestation count;
- malformed serialization;
- invalid proof/file digest binding;
- invalid Bitcoin attestations;
- calendar URL abuse;
- non-approved network destinations;
- truncated proof data;
- trailing garbage where the format does not permit it;
- resource-exhaustion inputs.

All parser and network limits are explicit constants with tests.

## Interoperability release gate

V0 is not releasable until:

- ProofStamp-created `.ots` output is accepted by the canonical OpenTimestamps implementation.
- A new receipt-v2 `.ots` detached digest equals the exact source-file SHA-256.
- Original file + exported v2 `.ots` is recognized as a matching pair by independent OpenTimestamps tooling.
- Canonical OTS fixtures parse correctly in ProofStamp.
- Corrupted fixtures fail closed.
- Parser fuzz/property tests cover malformed binary inputs.
- Calendar partial-failure and malicious URL tests pass.
- Bitcoin attestation tampering tests fail.
- Dual local SHA-256 disagreement prevents stamping.
- Modified file + v2 receipt fails before any calendar/Bitcoin request.
- Legacy receipt-v1 verification remains covered.

## Implementation phases

### Phase 0 — clean repository foundation

Established architecture, threat model, license, and project boundaries.

### Phase 1 — protocol interoperability spike

Added pinned OpenTimestamps fixtures and cross-implementation parsing/serialization tests.

### Phase 2 — Manifest v1

Implemented and froze Manifest v1, deterministic serialization, domain separation, and golden vectors.

**Current status:** retained as a legacy receipt-v1 verification format, not used for new creation.

### Phase 3 — local hashing and create/stamp flow

Implemented browser file selection, dual SHA-256, allowlisted calendar submission, portable pending receipts, and raw `.ots` export.

**Pre-release simplification:** new creation now stamps the file SHA-256 directly and emits receipt v2.

### Phase 4 — upgrade and Bitcoin verification

Implemented strict proof parsing, allowlisted calendar upgrade, browser Bitcoin convenience verification, and technical verification details.

### Phase 5 — hardening

Implemented parser limits/fuzz smoke, exact CSP/network checks, stale-state protections, failure injection, mobile/basic accessibility checks, and real-browser local hashing smoke tests.

### Phase 6 — experimental release

Current phase:

- finalize normal-user Create / Verify UX;
- verify direct file + `.ots` interoperability in the Cloudflare preview;
- preserve legacy v1 verification;
- complete production smoke on `ots.proofstamp.org`;
- tag an initial experimental/pre-release only after the exact deployed commit passes.

## Explicit non-goals for v0

- ProofStamp accounts.
- Custodial proof storage.
- Direct user Bitcoin transactions.
- Wallets.
- Payments.
- ProofStamp-hosted proof database.
- Multi-chain anchoring in this application.
- Proprietary timestamp format replacing `.ots`.
- Claims of truth, authorship, location, or exact creation time.
- Automatic trust in arbitrary calendar or explorer endpoints from proof files.

## Decision gates

Before changing the architecture, confirm:

1. Does this preserve standard OpenTimestamps interoperability?
2. Can a completed proof survive ProofStamp.org going offline?
3. Does the source file remain private?
4. Are we adding ProofStamp as a trusted intermediary unnecessarily?
5. Are user-facing claims no broader than the cryptographic evidence?
6. Can a normal recipient verify the original file without understanding a ProofStamp-only commitment layer?

If any answer is wrong, stop and redesign before release.
