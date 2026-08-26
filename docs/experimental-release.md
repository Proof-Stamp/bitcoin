# Experimental release checklist

Status: Phase 6 release preparation

This document continues the Phase 6 roadmap in `docs/plan.md`. It does not change the ProofStamp architecture or add another timestamp rail.

The release remains **experimental**. Do not describe it as production-ready until the deployment smoke tests and the post-deployment review are complete.

## Release boundary

The experimental release preserves the existing v0 boundary:

- source files stay on the user's device;
- local Web Crypto and Rust/WASM SHA-256 must agree before stamping;
- ProofStamp Manifest v1 is the committed evidence layer;
- OpenTimestamps remains the interoperable timestamp proof format;
- Bitcoin remains the public anchor;
- no account, wallet, payment, analytics, email flow, or ProofStamp proof database is added;
- production networking remains limited to the approved OpenTimestamps and Bitcoin-provider origins;
- browser Bitcoin verification remains a convenience check with `consensusValidation: false`;
- a completed proof remains independently verifiable outside ProofStamp.

## Phase 5 hardening review

The merged hardening work through PR #9 addresses the release blockers already documented in the plan and threat model:

- imported `.ots` proofs have explicit byte, tree-depth, operation-count, and node-count limits;
- receipt JSON has duplicate-key rejection, unknown-field rejection, bounded nesting, and binding-consistency checks;
- stale browser state cannot silently reuse an earlier file, timestamp submission, or verification result;
- malformed, timeout, and 404 calendar-upgrade responses are covered by tests;
- the built `dist/` surface and CSP/network allowlist are checked exactly;
- mobile-width/basic accessibility checks are present;
- the real Chrome/Chromium smoke test exercises the actual Web Crypto + Rust/WASM local hashing path;
- canonical Python OpenTimestamps interoperability remains a protected CI check.

This review does not widen the trust claim. In particular, the browser still does not independently validate Bitcoin consensus.

## Documentation required for the experimental release

The release must publish and link these documents:

- `docs/proofstamp-manifest-v1.md` — committed evidence format;
- `docs/pending-timestamp.md` — creation and pending-proof semantics;
- `docs/upgrade-and-bitcoin-verification.md` — upgrade and browser verification boundary;
- `docs/threat-model.md` — trust boundaries and security invariants;
- `docs/deployment-and-product-boundary.md` — hosting and product constraints;
- `docs/independent-verification.md` — verification without relying on the ProofStamp browser verifier.

## Cloudflare Pages deployment settings

The documented production target is:

```text
https://ots.proofstamp.org/
```

Deploy the repository as a static Cloudflare Pages application with:

```text
Production branch: main
Build command: npm run build
Build output directory: dist
Node.js: 22
Root directory: repository root
```

No application secret or runtime environment variable is required by the current v0 browser application.

Do not add Cloudflare Functions, Workers, server-side proof storage, analytics, or another backend as part of this release.

## Pre-merge gate for the release-preparation PR

Before merging the Phase 6 preparation PR:

1. `node-interop` is green;
2. `canonical-python` is green;
3. the static build still contains only the reviewed application surface;
4. the browser copy keeps `Waiting for Bitcoin` distinct from Bitcoin verification;
5. independent verification instructions remain consistent with Manifest v1 and the canonical OpenTimestamps client.

## Post-merge deployment smoke test

After the release-preparation PR is merged and `main` CI is green:

1. deploy the static `dist/` build to Cloudflare Pages;
2. confirm `https://ots.proofstamp.org/` serves the expected static application and security headers;
3. run the local file-preparation flow in a real browser and confirm the file stays local;
4. confirm local preparation makes no non-local resource request;
5. create a pending proof and confirm only approved calendar origins are contacted;
6. save the receipt and `.ots` proof;
7. reopen the saved receipt and confirm the local binding checks run before network access;
8. confirm a still-pending result says `Waiting for Bitcoin` rather than implying Bitcoin confirmation;
9. when a Bitcoin attestation is available, confirm the UI still states that browser verification is not independent consensus validation;
10. repeat the independent-verification path from `docs/independent-verification.md` on a preserved proof.

Any unexpected network destination, source-file upload, weakened parser limit, or broader Bitcoin-verification claim blocks the release.

## Initial experimental tag

After the deployed commit passes the production smoke test, create the repository's first GitHub release tag from that exact `main` commit and mark the release as experimental/pre-release.

The release notes must state:

- this is an experimental v0 release;
- source files remain local;
- completed proofs use standard OpenTimestamps and Bitcoin;
- pending proofs may require later upgrade;
- browser Bitcoin verification records `consensusValidation: false`;
- the strongest supported independent verification path uses the canonical OpenTimestamps client with a locally controlled Bitcoin Core node.

Do not call the release production-ready merely because the static deployment is live.
