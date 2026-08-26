# ProofStamp via Bitcoin

Work in progress.

This repository contains the Bitcoin-backed ProofStamp implementation.

The architecture boundary is:

**ProofStamp evidence format and UX → OpenTimestamps proof → Bitcoin**

ProofStamp is not a proprietary timestamp authority. The design target is local-first evidence creation with portable proofs that remain independently verifiable outside ProofStamp.

## Core properties

- Source files remain on the user's device.
- Files are hashed locally.
- No ProofStamp account is required for the core flow.
- No wallet, seed phrase, token, or gas interaction is required.
- No ProofStamp proof database is required to verify a completed portable proof.
- Standard OpenTimestamps interoperability is preserved.
- Pending proofs are never presented as already anchored in Bitcoin.
- Product claims are limited to what the cryptographic evidence actually supports.

## Architecture documents

- [Implementation plan](docs/plan.md)
- [ProofStamp Manifest v1](docs/proofstamp-manifest-v1.md)
- [Threat model](docs/threat-model.md)

## Development sequence

1. Protocol interoperability and fixture corpus.
2. ProofStamp Manifest v1 canonicalization and golden vectors.
3. Local hashing and stamping flow.
4. Pending-proof upgrade and Bitcoin verification.
5. Parser, network, privacy, and failure hardening.
6. Experimental release.

No user-facing stamping flow should be added until standard `.ots` interoperability is demonstrated with canonical and independent implementations.

## Important claim boundary

A valid completed ProofStamp can support a claim that the committed digital state existed no later than its verified Bitcoin anchoring block.

It does not by itself prove truth, authorship, location, original creation time, or whether editing occurred before stamping.

Bitcoin block time must not be presented as an exact trusted file-creation clock.

## License

Source code in this repository is licensed under the MIT License unless a file or incorporated dependency states otherwise. ProofStamp names and branding are not licensed under MIT.
