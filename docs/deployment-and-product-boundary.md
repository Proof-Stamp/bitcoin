# Deployment and product boundary

Status: product and deployment constraint for v0

This document defines the hosting and product boundary for the ProofStamp via Bitcoin application.

## Product identity

The browser application is **ProofStamp via Bitcoin**.

Production URL:

```text
https://ots.proofstamp.org/
```

This product is separate from ProofStamp via Email. Email is not part of the creation, handoff, storage, or verification workflow for this application.

## Hosting

The production application is deployed as a static site on Cloudflare Pages.

The preferred architecture is browser-first and static-first. Cloudflare serves application assets but is not a proof-processing backend.

Do not introduce Cloudflare Functions, Workers, server-side proof storage, or another application backend unless a later requirement cannot be met safely in the browser and the trust/privacy impact has been reviewed explicitly.

## Experimental release deployment settings

Use the repository's existing static build without adding another application layer:

```text
Production branch: main
Build command: npm run build
Build output directory: dist
Node.js: 22
Root directory: repository root
```

The current v0 application requires no application secret or runtime environment variable.

The first experimental deployment is not permission to add analytics, server-side proof processing, request logging of evidence data, Functions, Workers, or storage. Any such change requires a separate architecture and privacy review.

## Core product constraints

V0 must preserve all of the following:

- source files remain on the user's device;
- file hashing happens locally in the browser;
- ProofStamp Manifest construction happens locally;
- standard OpenTimestamps proof creation and parsing happen locally except for required protocol network requests;
- no ProofStamp account is required;
- no wallet, seed phrase, token, gas, or direct Bitcoin transaction is required;
- no ProofStamp proof database is required for the core flow;
- no `mailto:` flow is used;
- no email address is collected for the core flow;
- no email handoff is required;
- no analytics call is required by the v0 browser application;
- the user can save a portable ProofStamp receipt locally;
- the standard `.ots` representation remains exportable;
- a completed proof remains independently verifiable without ProofStamp infrastructure.

## Network boundary

The browser may make outbound requests only when required for OpenTimestamps or Bitcoin verification.

Production network destinations must be explicitly allowlisted and covered by tests. The allowlist may contain only:

- approved OpenTimestamps calendar endpoints;
- approved Bitcoin data sources used by the convenience verifier.

Do not use a generic `connect-src https:` CSP policy. Do not allow imported or attacker-controlled proof data to add new network destinations.

The production deployment must serve the repository's reviewed `_headers` policy. A deployment configuration that drops or weakens those headers fails the release gate.

## Data boundary

The source file must never be uploaded to ProofStamp, Cloudflare application code, an OpenTimestamps calendar, or a Bitcoin data provider.

Calendar submissions must use the normal OpenTimestamps opaque/blinded commitment path rather than sending the bare source-file SHA-256 or bare ProofStamp manifest commitment when the protocol's nonce/blinding step should apply.

The browser may expose normal web-request metadata to Cloudflare while loading the application. OpenTimestamps calendars and Bitcoin data providers may also observe ordinary network metadata for requests sent to them. Product copy must not claim anonymous use.

## Receipt and recovery

The portable receipt is the user's primary evidence artifact. A pending OpenTimestamps proof must be preserved in that artifact so it can later be upgraded.

ProofStamp server state must not be required to recover or verify a receipt the user has saved.

The independent verification path is documented in `docs/independent-verification.md`. It uses the portable receipt, the standard `.ots` proof, the canonical OpenTimestamps client, and optionally a locally controlled Bitcoin Core node rather than a ProofStamp backend.

## Deployment gate

A production deployment to `ots.proofstamp.org` is not a release gate for protocol work. Protocol interoperability and deterministic manifest behavior must be established first.

Those protocol gates and the Phase 5 hardening pass are implemented before the experimental deployment. The first browser implementation remains a static Cloudflare Pages application so deployment does not require an architecture rewrite.

Before tagging the experimental release, the deployed `main` commit must pass the production smoke test in `docs/experimental-release.md`. In particular:

- the local preparation path must not make a non-local request;
- timestamp creation may contact only approved calendar origins;
- saved-receipt checks must validate local bindings before network access;
- a proof waiting for Bitcoin must not be presented as Bitcoin-verified;
- the browser Bitcoin verifier must retain its `consensusValidation: false` boundary;
- no source-file upload or new network origin may appear in production.
