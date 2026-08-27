# Local browser foundation

Status: local preparation gate implemented

This document defines the local preparation step for ProofStamp via Bitcoin. The local gate runs before any OpenTimestamps calendar submission. Networked pending-proof creation is defined separately in [Pending OpenTimestamps submission](pending-timestamp.md).

## Security boundary

The selected source file is read once into browser memory and is never uploaded by this application. The same byte sequence is hashed through two independent implementation paths:

1. Web Crypto `SHA-256`;
2. RustCrypto `sha2` compiled to WebAssembly.

Timestamp submission is forbidden unless both 32-byte digests agree exactly. Failure of either implementation, the embedded WebAssembly packaging check, or digest agreement fails closed.

The Rust implementation is adapted from the separately deployed ProofStamp via Email verifier, but is compiled from source in this repository and tested against a standard SHA-256 known vector. The crate pins `sha2` to `0.11.0` and keeps a committed Cargo lockfile.

CI also exercises the actual browser wrapper against empty input, `abc`, a block-boundary vector, and an input larger than the 1 MiB WASM copy chunk. Each result must match Web Crypto exactly.

The browser checks the embedded WASM bytes against the digest recorded by the build step before instantiation. This detects packaging corruption or mismatch. It is not a separate trust root: compromise of the application JavaScript could also change the expected digest.

## File-size boundary

The first browser implementation accepts one file up to 50 MiB.

The reason is explicit: Web Crypto `subtle.digest()` requires the complete input buffer. Holding a very large source file in browser memory is avoidable risk. Raising this limit requires a separate memory/performance review or a different independent hashing path.

## Direct file proof target

For new ProofStamps, the agreed file SHA-256 is the OpenTimestamps detached digest.

```text
exact file bytes
    |
    v
Web Crypto SHA-256 == Rust/WASM SHA-256
    |
    v
file SHA-256
    |
    v
OpenTimestamps
```

There is no Manifest construction step in new creation.

This keeps the exported `.ots` proof standard and directly interoperable with the original file in OpenTimestamps tools.

## Receipt v2

After a calendar accepts the timestamp request, ProofStamp creates a portable receipt v2. The receipt records:

- `proofTarget: file-sha256`;
- the exact file SHA-256;
- both local SHA-256 results;
- the embedded standard `.ots` proof;
- proof SHA-256 and bounded calendar metadata;
- optional browser Bitcoin verification metadata after later verification.

The receipt is a convenience wrapper around the proof. It is not an additional cryptographic commitment layer.

## Legacy Manifest v1

Manifest v1 remains in the repository solely to verify earlier experimental receipt v1 files. Existing v1 receipts must remain fail-closed and must not be reinterpreted as direct-file proofs.

New browser creation does not produce a Manifest, description binding, metadata binding, or local Manifest draft.

## Network transition

The local preparation code itself performs no network request. After the local gate succeeds, the user may explicitly start the OpenTimestamps submission step.

That step is constrained to the exact reviewed calendar allowlist and CSP documented in [Pending OpenTimestamps submission](pending-timestamp.md). No source-file bytes are sent during that transition. Standard OpenTimestamps blinding prevents the bare file SHA-256 from being submitted directly to a calendar.
