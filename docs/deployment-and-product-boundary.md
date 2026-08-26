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
- the user can save a portable ProofStamp receipt locally;
- the standard `.ots` representation remains exportable;
- a completed proof remains independently verifiable without ProofStamp infrastructure.

## Network boundary

The browser may make outbound requests only when required for OpenTimestamps or Bitcoin verification.

Production network destinations must be explicitly allowlisted and covered by tests. The allowlist may contain only:

- approved OpenTimestamps calendar endpoints;
- approved Bitcoin data sources used by the convenience verifier.

Do not use a generic `connect-src https:` CSP policy. Do not allow imported or attacker-controlled proof data to add new network destinations.

## Data boundary

The source file must never be uploaded to ProofStamp, Cloudflare application code, an OpenTimestamps calendar, or a Bitcoin data provider.

Calendar submissions must use the normal OpenTimestamps opaque/blinded commitment path rather than sending the bare source-file SHA-256 or bare ProofStamp manifest commitment when the protocol's nonce/blinding step should apply.

The browser may expose normal web-request metadata to Cloudflare while loading the application. OpenTimestamps calendars and Bitcoin data providers may also observe ordinary network metadata for requests sent to them. Product copy must not claim anonymous use.

## Receipt and recovery

The portable receipt is the user's primary evidence artifact. A pending OpenTimestamps proof must be preserved in that artifact so it can later be upgraded.

ProofStamp server state must not be required to recover or verify a receipt the user has saved.

## Deployment gate

A production deployment to `ots.proofstamp.org` is not a release gate for protocol work. Protocol interoperability and deterministic manifest behavior must be established first.

The first browser implementation should nevertheless be structured from day one as a static Cloudflare Pages application so deployment does not require a later architecture rewrite.
