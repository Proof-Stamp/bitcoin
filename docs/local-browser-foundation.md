# Local browser foundation

Status: local preparation gate implemented

This document defines the local preparation step for ProofStamp via Bitcoin. The local gate still runs before any OpenTimestamps calendar submission. Networked pending-proof creation is defined separately in [Pending OpenTimestamps submission](pending-timestamp.md).

## Security boundary

The selected source file is read once into browser memory and is never uploaded by this application. The same byte sequence is hashed through two independent implementation paths:

1. Web Crypto `SHA-256`;
2. RustCrypto `sha2` compiled to WebAssembly.

Timestamp submission is forbidden unless both 32-byte digests agree exactly. Failure of either implementation, the embedded WebAssembly packaging check, or digest agreement fails closed.

The Rust implementation is adapted from the separately deployed ProofStamp via Email verifier, but is compiled from source in this repository and tested against a standard SHA-256 known vector. The crate pins `sha2` to `0.11.0` and keeps a committed Cargo lockfile.

CI also exercises the actual browser wrapper against empty input, `abc`, a block-boundary vector, and an input larger than the 1 MiB WASM copy chunk. Each result must match Web Crypto exactly.

The browser checks the embedded WASM bytes against the digest recorded by the build step before instantiation. This detects packaging corruption or mismatch. It is not a separate trust root: compromise of the application JavaScript could also change the expected digest.

## File-size boundary

The first browser implementation accepts one file up to 50 MiB. This is a product/runtime limit, not a Manifest v1 protocol limit.

The reason is explicit: Web Crypto `subtle.digest()` requires the complete input buffer. Holding a very large source file in browser memory is avoidable risk. Raising this limit requires a separate memory/performance review or a different independent hashing path.

## Manifest construction

After dual hashing succeeds, the browser creates the frozen ProofStamp Manifest v1:

- exactly one evidence entry;
- agreed local SHA-256 and exact file size;
- description only when supplied;
- filename and browser-provided media type only when the user opts in.

Filename preservation is off by default.

The browser then calculates the domain-separated Manifest v1 commitment already defined by the protocol specification.

## Local draft

The user may save a `proofstamp-local-draft` JSON object. It preserves:

- the exact canonical manifest UTF-8 bytes as base64;
- the Manifest v1 commitment;
- both local SHA-256 results.

Its status is always `local-only-not-timestamped`. It contains no OpenTimestamps proof and must never be presented as timestamp evidence.

## Network transition

The local preparation code itself performs no network request. After the local gate succeeds, the user may explicitly start the separate OpenTimestamps submission step.

That step is constrained to the exact reviewed calendar allowlist and CSP documented in [Pending OpenTimestamps submission](pending-timestamp.md). No source-file bytes or canonical manifest bytes are sent during that transition.
