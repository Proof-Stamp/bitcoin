# Direct file ProofStamp receipt v2

## Decision

New ProofStamps timestamp the source file's SHA-256 directly.

The core path is:

```text
file bytes -> SHA-256 -> OpenTimestamps -> Bitcoin
```

The ProofStamp receipt is a portable convenience wrapper around that standard detached OpenTimestamps proof. It is not an additional commitment layer.

## Why v2 exists

Receipt v1 timestamped a domain-separated ProofStamp Manifest commitment. That allowed metadata such as a description, file name, and media type to be cryptographically bound into the timestamp, but it also meant the exported `.ots` file did not directly match the original source file in standard OpenTimestamps tools.

For the browser product, direct file interoperability is more important than binding optional metadata. Receipt v2 therefore removes the Manifest from new ProofStamp creation.

## New proof target

A v2 receipt contains:

```json
{
  "format": "proofstamp-receipt",
  "version": 2,
  "proofTarget": "file-sha256",
  "fileSha256": "..."
}
```

The embedded OpenTimestamps proof MUST have the same SHA-256 digest as `fileSha256`.

The browser still computes the file SHA-256 twice, using Web Crypto and the independent Rust/WASM implementation. Creation fails closed if the two digests disagree.

## Independent verification

For a new v2 ProofStamp, the exported `.ots` file is a normal detached OpenTimestamps proof for the original file.

A recipient can therefore verify using either:

```text
original file + ProofStamp receipt -> ProofStamp browser
```

or:

```text
original file + .ots -> standard OpenTimestamps tooling
```

No ProofStamp Manifest recomputation is required for v2.

## Receipt metadata

The receipt keeps only data needed to make the ProofStamp portable and auditable:

- exact file SHA-256;
- evidence that the two local SHA-256 implementations agreed at creation time;
- embedded `.ots` proof and its SHA-256;
- bounded calendar submission metadata;
- optional browser Bitcoin verification metadata after a successful upgrade/check.

Description, filename, media type, and other convenience metadata are not part of the new cryptographic proof target.

## Legacy v1 compatibility

Existing receipt v1 files remain verifiable.

A v1 receipt is still checked using its canonical Manifest bytes and Manifest commitment. Its `.ots` proof remains bound to the Manifest commitment, not directly to the source-file SHA-256.

The browser must distinguish v1 and v2 explicitly and must never reinterpret a v1 receipt as a direct-file proof.

## Trust boundary

Unchanged:

- source files remain local;
- no account or backend is required;
- the two local SHA-256 implementations must agree before stamping;
- browser calendar/network destinations remain allowlisted;
- imported proofs remain bounded;
- browser Bitcoin verification remains a convenience check with `consensusValidation: false`;
- strongest Bitcoin verification remains standard OpenTimestamps tooling with a locally controlled Bitcoin Core node.
