# ProofStamp via Bitcoin

Experimental release candidate.

This repository contains the Bitcoin-backed ProofStamp browser application. The production target is:

```text
https://ots.proofstamp.org/
```

The application is designed as a static, browser-first Cloudflare Pages site.

The architecture boundary is:

**ProofStamp evidence format and UX → OpenTimestamps proof → Bitcoin**

ProofStamp is not a proprietary timestamp authority. The design target is local-first evidence creation with portable proofs that remain independently verifiable outside ProofStamp.

## What the browser flow does

1. Select one file.
2. Check the exact local bytes with Web Crypto SHA-256 and an independent RustCrypto/WASM SHA-256 implementation.
3. Fail closed if the two hashes disagree.
4. Create deterministic ProofStamp Manifest v1 bytes locally.
5. Submit only a blinded Manifest commitment to a fixed allowlist of OpenTimestamps calendars.
6. Save a portable ProofStamp receipt and standard `.ots` proof.
7. Reopen a saved receipt later and validate its bindings locally.
8. Ask only approved calendars for a proof upgrade.
9. Verify any Bitcoin attestation with the browser convenience verifier.

A newly submitted proof is **Waiting for Bitcoin**. It is not yet Bitcoin-verified. The user keeps the receipt and `.ots` proof and can check again later.

Browser Bitcoin verification is a convenience check, not independent Bitcoin consensus validation. It records `consensusValidation: false`. The strongest supported independent path uses the canonical OpenTimestamps client with a locally controlled Bitcoin Core node.

## Core properties

- Source files remain on the user's device.
- Files are hashed locally.
- The source file and canonical Manifest are not sent to calendars.
- Calendar submission uses an OpenTimestamps-style randomised commitment derived from the Manifest commitment.
- Saved receipts are read locally before any network request.
- Imported proof data cannot introduce arbitrary network destinations.
- No ProofStamp account is required for the core flow.
- No wallet, seed phrase, token, gas, or direct Bitcoin transaction is required.
- No ProofStamp proof database is required to verify a completed portable proof.
- No `mailto:` or email handoff is part of this application.
- No analytics call is part of the v0 application.
- Standard OpenTimestamps interoperability is preserved.
- A proof waiting for Bitcoin is never presented as already Bitcoin-verified.
- Product claims are limited to what the cryptographic evidence supports.

## Independent verification

A completed proof is intended to survive ProofStamp.org going offline.

The repository includes an [independent verification guide](docs/independent-verification.md) covering:

- independent SHA-256 checking of the original source file;
- recomputation of the domain-separated ProofStamp Manifest v1 commitment;
- inspection and upgrade of the standard `.ots` proof;
- verification with the canonical OpenTimestamps client against a locally controlled Bitcoin Core node.

The standard `.ots` representation is not a ProofStamp-only format.

## Architecture and protocol documents

- [Implementation plan](docs/plan.md)
- [ProofStamp Manifest v1](docs/proofstamp-manifest-v1.md)
- [Local browser foundation](docs/local-browser-foundation.md)
- [Pending OpenTimestamps submission](docs/pending-timestamp.md)
- [Upgrade and Bitcoin verification](docs/upgrade-and-bitcoin-verification.md)
- [Threat model](docs/threat-model.md)
- [Deployment and product boundary](docs/deployment-and-product-boundary.md)
- [Independent verification](docs/independent-verification.md)
- [Experimental release checklist](docs/experimental-release.md)

## Roadmap status

The repository plan defines six implementation phases. Protocol interoperability, Manifest v1, local hashing, OpenTimestamps creation, upgrade/Bitcoin verification, and pre-deployment hardening are implemented through merged PR #9.

The current phase is **Phase 6: static Cloudflare Pages deployment and experimental release**.

The release checklist requires both protected CI checks to remain green before merge, followed by a production-domain smoke test before the first experimental GitHub release is tagged.

## Important claim boundary

A valid completed ProofStamp can support a claim that the committed digital state existed no later than its verified Bitcoin anchoring block.

It does not by itself prove truth, authorship, location, original creation time, or whether editing occurred before stamping.

Bitcoin block time must not be presented as an exact trusted file-creation clock.

## Local development

The repository uses Node.js 22.

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run check
```

The static browser build is written to `dist/`.

## License

Source code in this repository is licensed under the MIT License unless a file or incorporated dependency states otherwise. ProofStamp names and branding are not licensed under MIT.
