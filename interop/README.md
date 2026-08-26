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

For supported valid fixtures, the Node test suite requires both JavaScript/TypeScript implementations to:

1. parse the standard detached OpenTimestamps file;
2. preserve the recorded file digest;
3. serialize the parsed proof back to exactly the same bytes.

For structurally invalid fixtures, the suite requires both implementations to reject them.

A separate CI job installs the canonical Python client from the pinned source commit and requires `ots info` to accept the valid corpus and reject the canonical invalid corpus without contacting calendars or Bitcoin providers.

Fixture provenance, upstream blob IDs, byte lengths, and SHA-256 checksums are recorded under `tests/fixtures/opentimestamps/fixture-manifest.json`.

## What this does not prove yet

This spike does not yet prove:

- ProofStamp-generated commitments can be stamped and accepted by the canonical Python client;
- calendar submission interoperability;
- upgrade interoperability;
- Bitcoin verification interoperability;
- production parser resource limits;
- production dependency or license suitability;
- production browser networking or CSP changes.

Those remain explicit gates. No user-facing stamping flow should be added merely because the fixture round-trip tests pass.

## Dependency and license note

The published `@lacrypta/typescript-opentimestamps` `0.1.0` package declares AGPL-3.0-or-later. The transferred/current `opentimestamps/typescript-opentimestamps` repository declares LGPL-3.0-or-later. `@otskit/core` is MIT. These are development-only test dependencies or references here, not a production dependency choice.

The canonical fixtures originate from `opentimestamps/opentimestamps-client`, which is LGPL-3.0-or-later. Provenance is preserved in the fixture directory. A complete third-party license review remains a release gate before this repository is made production-ready.
