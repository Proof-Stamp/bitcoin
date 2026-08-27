# Experimental release checklist

Status: Phase 6 release preparation

This document continues the Phase 6 roadmap in `docs/plan.md`.

The release remains **experimental**. Do not describe it as production-ready until the deployment smoke tests and post-deployment review are complete.

## Release boundary

The experimental release uses the simplified direct-file architecture for new ProofStamps:

```text
file bytes -> SHA-256 -> OpenTimestamps -> Bitcoin
```

The release preserves these boundaries:

- source files stay on the user's device;
- local Web Crypto and Rust/WASM SHA-256 must agree before stamping;
- new receipt v2 proofs timestamp the exact file SHA-256 directly;
- exported v2 `.ots` proofs are standard detached proofs for the original file;
- existing Manifest-v1 receipt v1 files remain verifiable as legacy proofs;
- OpenTimestamps remains the interoperable timestamp proof format;
- Bitcoin remains the public anchor;
- no account, wallet, payment, analytics, email flow, or ProofStamp proof database is added;
- production networking remains limited to approved OpenTimestamps and Bitcoin-provider origins;
- browser Bitcoin verification remains a convenience check with `consensusValidation: false`;
- a completed proof remains independently verifiable outside ProofStamp.

## Phase 5 hardening review

The merged hardening work through PR #9 remains applicable:

- imported `.ots` proofs have explicit byte, tree-depth, operation-count, node-count, and attestation limits;
- receipt JSON has duplicate-key rejection, unknown-field rejection, bounded nesting, and binding-consistency checks;
- stale browser state cannot silently reuse an earlier file, timestamp submission, or verification result;
- malformed, timeout, and 404 calendar-upgrade responses are covered by tests;
- the built `dist/` surface and CSP/network allowlist are checked exactly;
- mobile-width/basic accessibility checks are present;
- the real Chrome/Chromium smoke test exercises the actual Web Crypto + Rust/WASM local hashing path;
- canonical Python OpenTimestamps interoperability remains a protected CI check.

Receipt v2 adds an explicit invariant: `fileSha256`, both local hash results, and the embedded `.ots` detached digest must be identical.

This review does not widen the Bitcoin trust claim. The browser still does not independently validate Bitcoin consensus.

## Documentation required for the experimental release

The release must publish and link:

- `docs/direct-file-receipt-v2.md` — primary direct-file receipt format and decision;
- `docs/pending-timestamp.md` — creation and pending-proof semantics;
- `docs/upgrade-and-bitcoin-verification.md` — upgrade and browser verification boundary;
- `docs/threat-model.md` — trust boundaries and security invariants;
- `docs/deployment-and-product-boundary.md` — hosting and product constraints;
- `docs/independent-verification.md` — verification without relying on the ProofStamp browser verifier;
- `docs/proofstamp-manifest-v1.md` — legacy receipt v1 evidence format.

## Cloudflare Pages deployment settings

The production target is:

```text
https://ots.proofstamp.org/
```

Deploy as a static Cloudflare Pages application with:

```text
Production branch: main
Build command: npm run build
Build output directory: dist
Node.js: 22
Root directory: repository root
```

No application secret or runtime environment variable is required by the current browser application.

Do not add Cloudflare Functions, Workers, server-side proof storage, analytics, or another backend as part of this release.

## Pre-merge gate

Before merging the direct-file release candidate:

1. `node-interop` is green;
2. `canonical-python` is green;
3. Cloudflare Pages preview for the exact PR head succeeds;
4. the static build contains only the reviewed application surface;
5. browser copy keeps `Waiting for Bitcoin` distinct from Bitcoin verification;
6. receipt v2 tests confirm the embedded `.ots` digest equals `fileSha256`;
7. legacy receipt v1 verification remains covered.

## Preview smoke test

Before merge, use the exact Cloudflare preview to confirm:

1. Create a new ProofStamp for a known file.
2. Save the receipt and `.ots` proof.
3. Confirm the `.ots` detached digest equals the file SHA-256.
4. Open OpenTimestamps.org and supply the **original file + downloaded `.ots` proof**. It must recognize them as a matching pair. A still-pending Bitcoin attestation is acceptable at this stage.
5. In ProofStamp Verify, use the original file + v2 receipt. It must report that the file matches.
6. Modify one byte of the file and use the same receipt. It must fail locally before any calendar or Bitcoin request.
7. Check at least one preserved legacy receipt v1 and confirm it still validates using the Manifest-v1 path.
8. Check mobile layout for horizontal overflow and confusing duplicate result states.

Any failure blocks merge.

## Post-merge production smoke test

After the PR is merged and `main` CI is green:

1. confirm Cloudflare deploys the exact `main` merge commit;
2. confirm `https://ots.proofstamp.org/` serves the expected static application and reviewed security headers;
3. repeat the local file-preparation flow and confirm the file stays local;
4. confirm local preparation makes no non-local resource request;
5. create a pending v2 proof and confirm only approved calendar origins are contacted;
6. repeat the original-file + `.ots` independent OpenTimestamps check;
7. reopen the v2 receipt and confirm local bindings are checked before network access;
8. confirm a pending result says `Waiting for Bitcoin` rather than implying Bitcoin verification;
9. when a Bitcoin attestation is available, confirm block evidence is shown and the browser still states that it is not independent consensus validation;
10. repeat the Bitcoin Core path from `docs/independent-verification.md` when feasible.

Any unexpected network destination, source-file upload, weakened parser limit, direct bare-hash calendar submission, or broader Bitcoin-verification claim blocks the release.

## Initial experimental tag

After the exact deployed `main` commit passes the production smoke test, create the repository's first GitHub release tag from that commit and mark the release experimental/pre-release.

Release notes must state:

- this is an experimental v0 release;
- source files remain local;
- new proofs timestamp the file SHA-256 directly with standard OpenTimestamps;
- original file + `.ots` can be independently verified outside ProofStamp;
- pending proofs may require later upgrade;
- legacy Manifest-v1 receipts remain supported;
- browser Bitcoin verification records `consensusValidation: false`;
- the strongest supported independent Bitcoin verification path uses the canonical OpenTimestamps client with a locally controlled Bitcoin Core node.

Do not call the release production-ready merely because the static deployment is live.
