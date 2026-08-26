# OpenTimestamps interoperability

This directory records the Phase 1 interoperability work that preceded the browser stamping implementation.

The purpose of the spike was to prove standard `.ots` compatibility before selecting a production wire-format implementation or adding browser network access.

## Upstream implementations pinned for the spike

- Canonical Python client: `opentimestamps/opentimestamps-client` at `cd71c7609421bed2a07b9642a3c02a58c9fd2cdf`
- Current OpenTimestamps TypeScript source: `opentimestamps/typescript-opentimestamps` at `12ba7b2c4f4cd1b8ce52d2c17be5efedca3bceab`
- Published TypeScript test oracle: `@lacrypta/typescript-opentimestamps` `0.1.0`
- OTSkit core: `OTSkit/OTSkit-core` at `f0065a640db8b2ddbd7cb459c7f0cd4370693bd0`, npm package `@otskit/core` `0.2.0`

The current OpenTimestamps TypeScript repository declares package name `@opentimestamps/typescript-opentimestamps`, but that package name was not available in the npm registry during the spike. The published `0.1.0` package remains under the project's earlier `@lacrypta/typescript-opentimestamps` namespace, so it remains a development-time interoperability oracle only.

## Production dependency decision after the spike

Phase 3 selects `@otskit/core` `0.2.0` as the production OpenTimestamps wire-format implementation used to construct and parse ProofStamp-created pending proofs.

This selection is intentionally limited to the core package. The browser calendar network adapter remains small and local to this repository so the ProofStamp allowlist, timeout, response-size, redirect, and partial-failure policies remain directly auditable.

Reasons for selecting OTSkit core:

- MIT license;
- zero runtime dependencies;
- fail-closed parser design and bounded deserialization;
- deterministic serialization;
- successful round-trip checks against the canonical fixture corpus;
- successful parsing by the canonical Python client of ProofStamp-generated pending `.ots` artifacts in CI.

The published La Crypta TypeScript package is not a production dependency.

## What the automated tests prove

The fixture corpus is copied byte-for-byte from the canonical Python client's example fixtures at the pinned commit.

The Node suite requires both JavaScript/TypeScript implementations to parse valid detached OpenTimestamps files and preserve the recorded file digest. OTSkit must serialize each supported valid fixture back to exactly the original bytes. The published La Crypta TypeScript implementation must do the same for the completed fixture.

The canonical pending fixture exposes a known serialization difference in the published TypeScript implementation. Its reader converts the calendar string to a JavaScript `URL`, while its writer serializes `URL.toString()`. JavaScript adds a trailing `/` to an origin-only URL, changing the detached `.ots` bytes without changing the file digest.

The suite records that behavior explicitly and separately checks that the normalized pending proof is accepted by the canonical Python client.

For structurally invalid fixtures, the suite requires both implementations to reject them.

A separate CI job installs the canonical Python client from the pinned source commit and requires `ots info` to accept the original valid corpus, reject the canonical invalid corpus, accept the TypeScript-normalized pending proof, and accept a ProofStamp-generated pending proof. These checks run without contacting calendars or Bitcoin providers.

Fixture provenance, upstream blob IDs, byte lengths, and SHA-256 checksums are recorded under `tests/fixtures/opentimestamps/fixture-manifest.json`.

## Remaining interoperability gates

The current tests still do not prove:

- live calendar submission interoperability from the production browser origin;
- upgrade interoperability after calendars publish Bitcoin attestations;
- Bitcoin verification interoperability;
- complete imported-proof resource hardening;
- parser fuzz/property coverage;
- malicious calendar URL handling in the future upgrade flow.

Those remain release gates.

## Dependency and license note

The published `@lacrypta/typescript-opentimestamps` `0.1.0` package declares AGPL-3.0-or-later. The transferred/current `opentimestamps/typescript-opentimestamps` repository declares LGPL-3.0-or-later. `@otskit/core` is MIT and is the only one of these implementations selected as a production runtime dependency.

The canonical fixtures originate from `opentimestamps/opentimestamps-client`, which is LGPL-3.0-or-later. Provenance is preserved in the fixture directory.
