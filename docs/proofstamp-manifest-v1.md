# ProofStamp Manifest v1

Status: draft for interoperability and security review

This document defines the candidate manifest that ProofStamp will commit to before creating an OpenTimestamps proof.

The manifest is the ProofStamp-owned evidence layer. OpenTimestamps remains the timestamp proof layer.

## Goals

The manifest must:

- bind the exact file fingerprint to the human-readable ProofStamp context;
- be deterministic to serialize and hash;
- avoid reliance on the user's device clock;
- contain no source file bytes;
- be portable independently of any ProofStamp database;
- be extensible without changing the meaning of v1 commitments;
- be safe to verify years later with a small independent implementation.

## Non-goals

Manifest v1 does not prove:

- who created the file;
- where the file was created;
- when the file was originally created;
- whether the file was edited before stamping;
- whether the contents are true;
- whether a filename, media type, or description supplied by the user is truthful.

It binds those declared values to the committed file fingerprint. It does not authenticate the declarations by itself.

## Canonical representation

Manifest v1 uses JSON Canonicalization Scheme (RFC 8785 / JCS) for deterministic serialization.

Requirements:

- UTF-8 encoding;
- no byte-order mark;
- one JSON object as the top-level value;
- field names and value types are defined below;
- implementations must hash the canonical JCS bytes, not pretty-printed or source JSON text;
- parsers must reject duplicate JSON object keys before or during canonicalization;
- numeric values used by this format must be non-negative integers within the interoperable safe integer range;
- no local timestamp field is permitted in v1.

## Domain separation

The OpenTimestamps commitment is not the SHA-256 of bare JSON bytes.

The exact input to the manifest hash is:

```text
PROOFSTAMP-MANIFEST-V1\0 || canonical_manifest_bytes
```

where `\0` is one zero byte (`0x00`) and `||` means byte concatenation.

The manifest commitment is:

```text
SHA256(domain_separator || canonical_manifest_bytes)
```

The resulting 32-byte value is passed into the OpenTimestamps stamping layer.

## Top-level schema

Candidate v1 object:

```json
{
  "format": "proofstamp-manifest",
  "version": 1,
  "hashAlgorithm": "sha256",
  "evidence": [
    {
      "sha256": "<64 lowercase hexadecimal characters>",
      "size": 12345,
      "name": "contract.pdf",
      "mediaType": "application/pdf"
    }
  ],
  "description": "Contract version sent for review"
}
```

## Fields

### `format`

Required string with exact value `proofstamp-manifest`.

### `version`

Required integer with exact value `1` for this specification.

### `hashAlgorithm`

Required string with exact value `sha256` for v1.

This describes the fingerprints recorded for evidence items. It does not change the OpenTimestamps protocol's internal operation tree.

### `evidence`

Required array.

V0 product behavior creates exactly one evidence entry. The array shape is reserved so a future product version can bind multiple evidence items without inventing a second manifest shape.

A v1 verifier must reject an empty evidence array.

Each evidence entry contains the fields below.

#### `sha256`

Required string containing exactly 64 lowercase hexadecimal characters.

The value is SHA-256 of the exact source file bytes.

#### `size`

Required non-negative integer representing the exact source file size in bytes.

#### `name`

Optional non-empty string.

If present, the value is the filename exposed by the local file picker at stamping time. It is committed as user/device-provided metadata and is not independently authenticated.

A verifier must not use the filename to locate or identify the file cryptographically.

#### `mediaType`

Optional non-empty string.

If present, the value is the media type exposed by the local file picker at stamping time. It is committed as metadata and is not independently authenticated.

### `description`

Optional non-empty string containing user-supplied context.

If present, it becomes part of the immutable committed manifest. The description is not a statement independently verified by ProofStamp.

## Absent versus empty optional fields

Optional string fields must be omitted when they have no value. Do not serialize them as empty strings or `null`.

## File hash calculation

For the browser product, the source file SHA-256 should be calculated through two implementation paths before the manifest is committed:

1. Web Crypto SHA-256;
2. an independent Rust/RustCrypto SHA-256 path compiled to WebAssembly.

The two results must agree byte-for-byte. If either path fails or they disagree, ProofStamp must fail closed and must not submit a timestamp commitment.

## Manifest commitment procedure

1. Read the exact file bytes locally.
2. Calculate and compare the two SHA-256 results.
3. Build the v1 manifest object.
4. Reject invalid or ambiguous values.
5. Serialize with JCS.
6. Encode the literal ASCII/UTF-8 domain separator `PROOFSTAMP-MANIFEST-V1` followed by one zero byte.
7. Append the canonical manifest bytes.
8. SHA-256 the resulting byte sequence.
9. Pass that 32-byte digest to the OpenTimestamps layer.
10. Preserve both the manifest and the standard OTS proof in the portable ProofStamp receipt.

## Receipt requirement

A portable ProofStamp must preserve the canonical logical manifest, the exact manifest commitment, and the OpenTimestamps proof.

The product must not require a ProofStamp server database to recover those values.

The standard `.ots` representation must remain exportable so the timestamp proof can be checked with software unrelated to ProofStamp.

## Versioning

A verifier must not silently reinterpret an unknown manifest version.

If a future manifest changes field meaning, canonicalization rules, or domain separation, it must use a new version and a new domain separator.

## Open questions before implementation

- whether v1 should permit more than one evidence entry at the format level even though the v0 UI supports one file;
- maximum lengths for `name`, `mediaType`, and `description`;
- maximum evidence array length accepted by the parser;
- whether filename should be included by default or only when the user chooses to preserve it;
- whether the receipt should embed canonical JSON bytes directly or store the logical manifest and require deterministic recanonicalization;
- whether a detached binary receipt format is warranted later.

Golden test vectors must be added before this specification is treated as stable.
