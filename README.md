# ProofStamp via Bitcoin

Work in progress.

This repository contains the Bitcoin-backed ProofStamp implementation.

The production browser application is intended to live at:

```text
https://ots.proofstamp.org/
```

It is designed as a static, browser-first Cloudflare Pages application.

The architecture boundary is:

**ProofStamp evidence format and UX → OpenTimestamps proof → Bitcoin**

ProofStamp is not a proprietary timestamp authority. The design target is local-first evidence creation with portable proofs that remain independently verifiable outside ProofStamp.

## Current implementation

The browser flow now supports:

1. one-file local preparation;
2. independent Web Crypto and RustCrypto/WASM SHA-256 agreement;
3. deterministic ProofStamp Manifest v1 creation;
4. domain-separated Manifest commitment;
5. blinded submission to a fixed allowlist of OpenTimestamps calendars;
6. preservation of a pending `.ots` proof and portable ProofStamp receipt.

A newly submitted proof is **pending**, not yet Bitcoin-verified. Upgrade and Bitcoin verification are the next implementation phase.

## Core properties

- Source files remain on the user's device.
- Files are hashed locally.
- The source file and canonical manifest are not sent to calendars.
- Calendar submission uses an OpenTimestamps-style randomised commitment derived from the Manifest commitment.
- No ProofStamp account is required for the core flow.
- No wallet, seed phrase, token, or gas interaction is required.
- No ProofStamp proof database is required to verify a completed portable proof.
- No `mailto:` or email handoff is part of this application.
- Standard OpenTimestamps interoperability is preserved.
- Pending proofs are never presented as already anchored in Bitcoin.
- Product claims are limited to what the cryptographic evidence actually supports.

## Architecture documents

- [Implementation plan](docs/plan.md)
- [ProofStamp Manifest v1](docs/proofstamp-manifest-v1.md)
- [Local browser foundation](docs/local-browser-foundation.md)
- [Pending OpenTimestamps submission](docs/pending-timestamp.md)
- [Threat model](docs/threat-model.md)
- [Deployment and product boundary](docs/deployment-and-product-boundary.md)

## Development sequence

1. Protocol interoperability and fixture corpus.
2. ProofStamp Manifest v1 canonicalization and golden vectors.
3. Dual local hashing and pending OpenTimestamps creation.
4. Pending-proof upgrade and Bitcoin verification.
5. Parser, network, privacy, and failure hardening.
6. Static Cloudflare Pages deployment and experimental release.

## Important claim boundary

A valid completed ProofStamp can support a claim that the committed digital state existed no later than its verified Bitcoin anchoring block.

It does not by itself prove truth, authorship, location, original creation time, or whether editing occurred before stamping.

Bitcoin block time must not be presented as an exact trusted file-creation clock.

## License

Source code in this repository is licensed under the MIT License unless a file or incorporated dependency states otherwise. ProofStamp names and branding are not licensed under MIT.
