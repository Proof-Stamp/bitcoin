# ProofStamp via Bitcoin

Experimental release candidate.

This repository contains the Bitcoin-backed ProofStamp browser application. The production target is:

```text
https://ots.proofstamp.org/
```

The application is designed as a static, browser-first Cloudflare Pages site.

The primary architecture is deliberately simple:

**file bytes → SHA-256 → OpenTimestamps proof → Bitcoin**

ProofStamp is not a proprietary timestamp authority. The browser creates and verifies standard portable timestamp evidence while keeping source files local.

## What the browser flow does

1. Select one file.
2. Check the exact local bytes with Web Crypto SHA-256 and an independent RustCrypto/WASM SHA-256 implementation.
3. Fail closed if the two hashes disagree.
4. Timestamp that exact file SHA-256 through a fixed allowlist of OpenTimestamps calendars.
5. Save a portable ProofStamp receipt and a standard detached `.ots` proof.
6. Reopen a saved receipt later and validate it locally.
7. Optionally select the original file and confirm its SHA-256 matches the receipt before any network request.
8. Ask only approved calendars for a proof upgrade.
9. Verify any Bitcoin attestation with the browser convenience verifier.

A newly submitted proof is **Waiting for Bitcoin**. It is not yet Bitcoin-verified. The user keeps the receipt and can check again later.

For new receipt v2 ProofStamps, the exported `.ots` file is bound directly to the original file SHA-256. It can be paired with the original file in standard OpenTimestamps tools, including OpenTimestamps.org.

Browser Bitcoin verification is a convenience check, not independent Bitcoin consensus validation. It records `consensusValidation: false`. The strongest supported independent path uses the canonical OpenTimestamps client with a locally controlled Bitcoin Core node.

## Core properties

- Source files remain on the user's device.
- Files are hashed locally with two independent SHA-256 implementations.
- New proofs timestamp the source-file SHA-256 directly.
- Calendar submission uses OpenTimestamps blinding before the calendar request.
- Saved receipts are read locally before any network request.
- A mismatched candidate file fails locally before calendar or Bitcoin requests.
- Imported proof data cannot introduce arbitrary network destinations.
- No ProofStamp account is required for the core flow.
- No wallet, seed phrase, token, gas, or direct Bitcoin transaction is required.
- No ProofStamp proof database is required to verify a completed portable proof.
- No `mailto:` or email handoff is part of this application.
- No analytics call is part of the v0 application.
- Standard OpenTimestamps interoperability is preserved.
- A proof waiting for Bitcoin is never presented as already Bitcoin-verified.
- Product claims are limited to what the cryptographic evidence supports.

## Receipt versions

### v2: direct file proof

New ProofStamps use receipt v2 with:

```text
proofTarget: file-sha256
```

The embedded `.ots` digest is exactly the file SHA-256.

See [Direct file ProofStamp receipt v2](docs/direct-file-receipt-v2.md).

### v1: legacy Manifest proof

Earlier experimental receipts used ProofStamp Manifest v1 as an additional commitment layer. Existing v1 receipts remain verifiable, but their `.ots` proof is bound to the Manifest commitment rather than directly to the source-file SHA-256.

The v1 format is retained for backward verification compatibility and is not the proof target for new creation.

## Independent verification

A completed proof is intended to survive ProofStamp.org going offline.

The [independent verification guide](docs/independent-verification.md) covers:

- independent SHA-256 checking of the original source file;
- direct file + `.ots` verification for receipt v2;
- independent proof upgrade;
- verification with the canonical OpenTimestamps client against a locally controlled Bitcoin Core node;
- the separate legacy process for Manifest-v1 receipts.

The standard `.ots` representation is not a ProofStamp-only format.

## Architecture and protocol documents

- [Implementation plan](docs/plan.md)
- [Direct file ProofStamp receipt v2](docs/direct-file-receipt-v2.md)
- [ProofStamp Manifest v1 — legacy](docs/proofstamp-manifest-v1.md)
- [Local browser foundation](docs/local-browser-foundation.md)
- [Pending OpenTimestamps submission](docs/pending-timestamp.md)
- [Upgrade and Bitcoin verification](docs/upgrade-and-bitcoin-verification.md)
- [Threat model](docs/threat-model.md)
- [Deployment and product boundary](docs/deployment-and-product-boundary.md)
- [Independent verification](docs/independent-verification.md)
- [Experimental release checklist](docs/experimental-release.md)

## Roadmap status

The original six-phase roadmap established interoperability, local hashing, OpenTimestamps creation, upgrade/Bitcoin verification, hardening, and static deployment.

Before the first experimental release, the product proof target was simplified from Manifest v1 to direct file SHA-256 while preserving v1 verification compatibility.

The current phase remains **Phase 6: static Cloudflare Pages deployment and experimental release**.

The release checklist requires both protected CI checks to remain green before merge, followed by a production-domain smoke test before the first experimental GitHub release is tagged.

## Important claim boundary

A valid completed ProofStamp can support a claim that a commitment to the exact file bytes existed no later than its verified Bitcoin anchoring block.

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
