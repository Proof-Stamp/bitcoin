# Canonical OpenTimestamps fixtures

These fixtures are copied byte-for-byte from `opentimestamps/opentimestamps-client` at commit `cd71c7609421bed2a07b9642a3c02a58c9fd2cdf`.

The upstream `examples/README.md` states that its normal example `.ots` files are syntactically valid and that outright invalid proof files live under `examples/invalid/`.

## Valid fixtures

- `hello-world.txt` and `hello-world.txt.ots`: completed canonical example with a Bitcoin attestation.
- `incomplete.txt` and `incomplete.txt.ots`: canonical pending/incomplete example that can later be upgraded.

## Invalid fixtures

- `invalid/bad-major-version.ots`: unsupported detached timestamp version.
- `invalid/invalid-file-digest-type.ots`: unsupported file digest algorithm tag.
- `invalid/exceeds-max-msg-length.ots`: canonical invalid proof exercising the OpenTimestamps maximum message-length rule.

`fixture-manifest.json` records provenance, upstream Git blob IDs, sizes, and SHA-256 checksums so accidental fixture changes fail loudly.

Do not replace these with generated fixtures without preserving upstream provenance. ProofStamp-generated fixtures belong in a separate directory so canonical inputs and implementation outputs remain distinguishable.

## Upstream license

The fixture source repository, `opentimestamps/opentimestamps-client`, is distributed under LGPL-3.0-or-later. These fixtures are retained solely as interoperability test vectors with their upstream provenance intact. Before public production release, third-party notices and licensing must receive an explicit review.
