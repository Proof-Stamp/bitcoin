# ProofStamp via Bitcoin / OpenTimestamps v0 plan

Status: architecture proposal

This document defines the implementation plan for adding a Bitcoin-backed timestamp rail to ProofStamp using the OpenTimestamps protocol.

The goal is not to create a new timestamp protocol. ProofStamp provides the evidence format, local-first UX, portable receipt, and verification experience. OpenTimestamps provides the interoperable timestamp proof format. Bitcoin provides the public anchor.

## Product principles

The v0 must preserve these properties:

- Source files stay on the user's device.
- Files are hashed locally.
- No ProofStamp account is required.
- No wallet, seed phrase, token, or gas interaction is required.
- No ProofStamp proof database is required for creating or verifying a completed proof.
- The timestamp proof remains portable and independently verifiable outside ProofStamp.
- Product copy must distinguish proof of existence/integrity from proof of truth, authorship, source, location, or original creation time.
- A pending OpenTimestamps proof must never be presented as already anchored in Bitcoin.

## Proposed architecture

```text
original file
    |
    v
local SHA-256
Web Crypto == Rust/WASM
    |
    v
ProofStamp Manifest v1
canonical serialization
    |
    v
SHA-256(manifest domain || canonical manifest)
    |
    v
OpenTimestamps commitment
nonce/blinding + calendar submission
    |
    v
pending portable proof
    |
    v
calendar upgrade
    |
    v
Bitcoin attestation
    |
    v
ProofStamp verification + standard OTS interoperability
```

OpenTimestamps calendars are aggregation and availability infrastructure. Multiple calendars improve liveness and recovery options. They are not independent timestamp authorities and must not be presented as such.

## V0 scope

### Create

1. Select one file.
2. Calculate SHA-256 locally with Web Crypto and an independent Rust/WASM path.
3. Fail closed if the two calculations disagree.
4. Build a ProofStamp Manifest v1 for the selected file.
5. Canonically serialize the manifest.
6. Hash the domain-separated manifest bytes.
7. Create a standard OpenTimestamps proof for that manifest commitment.
8. Submit to a small fixed set of approved public calendars.
9. Produce one portable ProofStamp receipt containing enough information to preserve the pending proof.
10. Offer the standard `.ots` representation from an advanced/technical view.

### Upgrade

1. Open an existing ProofStamp receipt or `.ots` proof.
2. Parse it using strict size and complexity limits.
3. Contact only locally allowlisted calendars.
4. Merge valid upgrade information.
5. Preserve the upgraded proof in the portable receipt.
6. Never silently discard the original pending proof if upgrade fails.

### Verify

Verification is layered and must not collapse different claims into one result.

1. Verify selected file bytes against the SHA-256 recorded in the manifest.
2. Verify the ProofStamp manifest commitment.
3. Verify the OpenTimestamps operation path.
4. Verify the Bitcoin attestation using the configured Bitcoin data source.
5. Expose the verification method in technical details.

A browser convenience verifier may use public Bitcoin data sources. Documentation must state that the strongest independent verification is against a locally controlled Bitcoin Core node or another verifier that validates the relevant chain independently.

## State model

### `local_ready`

The file hash and manifest are complete locally. No remote timestamp submission has succeeded yet.

### `pending`

At least one valid calendar response has been preserved. The proof is not yet anchored to a Bitcoin block.

User-facing copy should use language such as `Waiting for Bitcoin` rather than `Bitcoin timestamped`.

### `anchored`

A valid Bitcoin attestation is present and verifies against a Bitcoin block.

### `confirmed`

The anchoring block has reached the product's configured confirmation threshold. This is a confidence policy, not deterministic finality.

The exact confirmation threshold is product policy and must not be encoded into the proof format itself.

## Calendar policy

Initial production calendar endpoints must be explicitly configured and allowlisted.

- Submit to several independently operated public calendars for resilience.
- Treat one valid response as sufficient to preserve a pending proof.
- Prefer multiple successful responses when available.
- Do not claim that N-of-M calendar responses create consensus or stronger timestamp truth.
- Do not fetch arbitrary calendar URLs supplied by untrusted proof files.
- Calendar request failures must not corrupt other valid proof branches.
- Network and timing metadata leakage must be documented.

A ProofStamp-operated calendar can be considered later for availability and operational visibility, but ProofStamp must not become the timestamp trust anchor.

## Browser network policy

Production networking must be narrowly scoped. Do not use a generic `connect-src https:` policy.

Allow only:

- configured OpenTimestamps calendar hosts;
- configured Bitcoin data providers used by the convenience verifier;
- no arbitrary hosts read from user-controlled proof data.

The approved endpoint list must live in one auditable configuration source and be covered by tests.

## Library strategy

Do not ship the legacy JavaScript OpenTimestamps client as a direct production dependency.

Before selecting a protocol library, complete an interoperability spike against:

- the canonical Python `opentimestamps-client`;
- `opentimestamps/typescript-opentimestamps`;
- at least one additional independent implementation such as OTSkit.

The final implementation may use a maintained library or a small audited protocol adapter. The acceptance criterion is standard OpenTimestamps interoperability, not library-specific compatibility.

## Security requirements

Treat ProofStamp receipts and `.ots` files as attacker-controlled input.

The parser/verifier must fail closed on:

- oversized proof files;
- excessive tree depth or operation count;
- malformed serialization;
- unsupported hash operations;
- invalid Bitcoin attestations;
- calendar URL abuse;
- non-HTTPS or unapproved network destinations;
- truncated proof data;
- trailing garbage where the format does not permit it;
- resource-exhaustion inputs.

All parser and network limits must be explicit constants with tests.

## Interoperability release gate

V0 is not releasable until all of the following pass:

- ProofStamp-created proof verifies with the canonical Python `ots` client after upgrade.
- Canonical `ots` proof can be parsed and verified by ProofStamp.
- Proofs from a second implementation can be parsed by ProofStamp.
- ProofStamp-created `.ots` output is accepted by at least two independent implementations.
- Known OpenTimestamps fixtures pass.
- Corrupted fixtures fail closed.
- Parser fuzz/property tests cover malformed binary inputs.
- Calendar partial failure tests pass.
- Malicious/unsupported calendar URL tests pass.
- Bitcoin attestation tampering tests fail.
- Dual local SHA-256 disagreement prevents stamping.

## Implementation phases

### Phase 0 — clean repository foundation

- Establish the architecture, manifest, threat model, license, and project boundaries.
- Keep the repository independent from the existing Email ProofStamp implementation.
- Do not add browser networking or production OpenTimestamps dependencies yet.

### Phase 1 — protocol interoperability spike

- Add a pinned OpenTimestamps fixture corpus.
- Implement or integrate read/write for standard `.ots` proofs behind tests.
- Verify cross-implementation serialization and parsing.
- No UI work yet.

Exit criterion: reproducible round-trip compatibility with canonical OTS fixtures and external clients.

### Phase 2 — ProofStamp Manifest v1

- Finalize canonical fields and versioning.
- Implement deterministic serialization.
- Add domain separation.
- Add golden vectors for canonical bytes and manifest SHA-256.
- Bind one file in v0 while keeping the format extensible for multiple evidence items later.

Exit criterion: identical manifest bytes and hashes across test implementations.

### Phase 3 — local hashing and create/stamp flow

- Add the browser file picker and local hashing UX.
- Run dual SHA-256 on creation.
- Create the manifest commitment.
- Submit to allowlisted calendars.
- Preserve a portable pending receipt and raw `.ots` export.
- Add pending-state UX.

Exit criterion: browser-created pending proof verifies and upgrades with canonical OTS tooling.

### Phase 4 — upgrade and Bitcoin verification

- Add a strict proof parser.
- Add allowlisted calendar upgrade flow.
- Add convenience Bitcoin verification.
- Expose verification method and block details in the technical view.
- Keep strongest-verification guidance for Bitcoin Core in documentation.

Exit criterion: known completed proofs verify, tampered proofs fail, and pending proofs upgrade safely.

### Phase 5 — hardening

- Fuzz/property test proof parsing.
- Add CSP/network allowlist tests.
- Add browser tests for all state transitions.
- Add failure injection for calendar and Bitcoin provider outages.
- Review dependency and license posture.
- Perform threat-model review before release.

### Phase 6 — experimental release

- Finalize normal-user copy.
- Add independent verification instructions.
- Publish protocol/format documentation.
- Tag an initial experimental release before calling it production-ready.

## Explicit non-goals for v0

- ProofStamp accounts.
- Custodial proof storage.
- Direct user Bitcoin transactions.
- Wallets.
- Payments.
- ProofStamp-hosted proof database.
- Multi-chain anchoring.
- Proprietary timestamp format replacing `.ots`.
- Claims of truth, authorship, location, or exact creation time.
- Automatic trust in arbitrary calendar or explorer endpoints from proof files.

## Decision gates

Before coding each phase, confirm:

1. Does this preserve standard OpenTimestamps interoperability?
2. Can a completed proof survive ProofStamp.org going offline?
3. Does the source file remain private?
4. Are we adding ProofStamp as a new trusted intermediary unnecessarily?
5. Are the user-facing claims narrower than or equal to what the cryptography actually proves?

If any answer is wrong, stop and redesign before implementation.
