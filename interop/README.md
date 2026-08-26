# OpenTimestamps interoperability spike

This directory contains Phase 1 interoperability work for ProofStamp via Bitcoin.

The purpose is to prove standard `.ots` compatibility before any browser stamping UI or production network access is added.

## Upstream implementations pinned for the spike

- Canonical Python client: `opentimestamps/opentimestamps-client` at `cd71c7609421bed2a07b9642a3c02a58c9fd2cdf`
- Current OpenTimestamps TypeScript source: `opentimestamps/typescript-opentimestamps` at `12ba7b2c4f4cd1b8ce52d2c17be5efedca3bceab`
- Published TypeScript test oracle: `@lacrypta/typescript-opentimestamps` `0.1.0`
- OTSkit core: `OTSkit/OTSkit-core` at `f0065a640db8b2ddbd7cb459c7f0cd4370693bd0`, npm package `@otskit/core` `0.2.0`

The current OpenTimestamps TypeScript repository declares package name `@opentimestamps/typescript-opentimestamps`, but that package name is not published in the npm registry. The published `0.1.0` package remains under the project's earlier `@lacrypta/typescript-opentimestamps` namespace, so this spike uses that package only as a development-time interoperability oracle.

The TypeScript package and OTSkit are test oracles in this phase. Neither is selected as the production ProofStamp protocol dependency by this spike.

## What the automated tests prove

The fixture corpus is copied byte-for-byte from the canonical Python client's example fixtures at the pinned commit.

The Node suite requires both JavaScript/TypeScript implementations to parse valid detached OpenTimestamps files and preserve the recorded file digest. OTSkit must serialize each supported valid fixture back to exactly the original bytes. The published La Crypta TypeScript implementation must do the same for the completed fixture.

The canonical pending fixture exposes a known serialization difference in the published TypeScript implementation. Its reader converts the calendar string to a JavaScript `URL`, while its writer serializes `URL.toString()`. JavaScript adds a trailing `/` to an origin-only URL, so `https://alice.btc.calendar.opentimestamps.org` becomes `https://alice.btc.calendar.opentimestamps.org/`. That changes the detached `.ots` bytes but does not change the file digest.

For that pending fixture, the suite therefore requires the TypeScript-normalized serialization to be stable on a second round trip, parse successfully in OTSkit, be preserved exactly by OTSkit, and retain the same detached file digest. This behavior is recorded as an interoperability finding rather than silently weakening the completed-proof byte-preservation check.

For structurally invalid fixtures, the suite requires both implementations to reject them.

A separate CI job installs the canonical Python client from the pinned source commit and requires `ots info` to accept the original valid corpus and reject the canonical invalid corpus without contacting calendars or Bitcoin providers.

Fixture provenance, upstream blob IDs, byte lengths, and SHA-256 checksums are recorded under `tests/fixtures/opentimestamps/fixture-manifest.json`.

## What this does not prove yet

This spike does not yet prove:

- a TypeScript-normalized pending proof is accepted by the canonical Python client;
- ProofStamp-generated commitments can be stamped and accepted by the canonical Python client;
- calendar submission interoperability;
- upgrade interoperability;
- Bitcoin verification interoperability;
- production parser resource limits;
- production dependency or license suitability;
- production browser networking or CSP changes.

Those remain explicit gates. No user-facing stamping flow should be added merely because the fixture interoperability tests pass.

## Dependency and license note

The published `@lacrypta/typescript-opentimestamps` `0.1.0` package declares AGPL-3.0-or-later. The transferred/current `opentimestamps/typescript-opentimestamps` repository declares LGPL-3.0-or-later. `@otskit/core` is MIT. These are development-only test dependencies or references here, not a production dependency choice.

The canonical fixtures originate from `opentimestamps/opentimestamps-client`, which is LGPL-3.0-or-later. Provenance is preserved in the fixture directory. A complete third-party license review remains a release gate before this repository is made production-ready.
