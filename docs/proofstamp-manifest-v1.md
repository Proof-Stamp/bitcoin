# ProofStamp Manifest v1

Status: frozen candidate for implementation and interoperability testing

This document defines the manifest ProofStamp commits to before creating an OpenTimestamps proof. The manifest is the ProofStamp-owned evidence layer. OpenTimestamps remains the timestamp proof layer.

A production release still requires the remaining parser, stamping, upgrade, Bitcoin-verification, browser and security gates in the implementation plan. Changes to the meaning or canonical encoding of this format after release require a new manifest version and domain separator.

## Goals

Manifest v1 must:

- bind the exact file fingerprint to explicitly preserved human-readable context;
- serialize and hash deterministically;
- avoid reliance on the user's device clock;
- contain no source file bytes;
- be portable independently of any ProofStamp database;
- be safe to verify years later with a small independent implementation;
- fail closed on ambiguous, non-canonical or unsupported input.

## Non-goals

Manifest v1 does not prove who created a file, where it was created, when it was originally created, whether it was edited before stamping, whether its contents are true, or whether user/device-supplied metadata is truthful.

It binds declared metadata to the committed file fingerprint. It does not authenticate those declarations by itself.

## Frozen v1 decisions

- A v1 manifest contains exactly one evidence item. Multi-item manifests require a future version rather than silently widening v1 semantics.
- `name`, `mediaType` and `description` are optional metadata.
- The ProofStamp product must not include `name` merely because the browser exposes a filename. Preserving a filename is an explicit user choice.
- Optional metadata with no value is omitted. Empty strings and `null` are invalid.
- Exact canonical manifest bytes are preserved in the portable receipt. Verification must not depend only on re-canonicalizing a logical object years later.
- Imported manifest bytes must already be the exact canonical v1 representation. Whitespace variants, duplicate-key JSON, BOM-prefixed JSON and other non-canonical encodings fail closed.
- Unicode is preserved exactly as supplied. ProofStamp performs no NFC/NFD or other Unicode normalization.

## Canonical representation

Manifest v1 uses JSON Canonicalization Scheme (RFC 8785 / JCS) within the closed schema defined here.

Requirements:

- UTF-8 encoding;
- no byte-order mark;
- one JSON object as the top-level value;
- no unknown fields;
- duplicate object keys are not accepted as canonical input;
- numeric values are non-negative integers no larger than `9007199254740991` (`Number.MAX_SAFE_INTEGER`);
- no local timestamp field is permitted;
- the canonical UTF-8 representation must not exceed 8192 bytes.

The reference implementation builds the closed v1 object in JCS member order and uses ECMAScript JSON string/number serialization. Because v1 allows only safe integers and validates Unicode scalar strings, this produces the required JCS representation without a general-purpose canonicalization dependency.

For imported bytes, ProofStamp decodes strict UTF-8, parses JSON, validates the closed schema, re-serializes the logical value canonically, and requires byte-for-byte equality with the supplied bytes. This causes duplicate keys and alternate textual encodings to fail closed even though ordinary `JSON.parse` would otherwise collapse duplicate keys.

## Domain separation

The OpenTimestamps commitment is not SHA-256 of bare JSON bytes.

The exact hash input is:

```text
UTF8("PROOFSTAMP-MANIFEST-V1") || 0x00 || canonical_manifest_bytes
```

The manifest commitment is:

```text
SHA256(domain_separator || canonical_manifest_bytes)
```

The resulting 32-byte value is passed into the OpenTimestamps stamping layer.

## Schema

The machine-readable structural schema is in [`schemas/proofstamp-manifest-v1.schema.json`](../schemas/proofstamp-manifest-v1.schema.json). Canonicalization, exact-byte checks, UTF-8 byte limits and domain-separated hashing remain protocol rules in this document because JSON Schema cannot fully express them.

A valid example is:

```json
{
  "format": "proofstamp-manifest",
  "version": 1,
  "hashAlgorithm": "sha256",
  "evidence": [
    {
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "size": 12345,
      "name": "contract.pdf",
      "mediaType": "application/pdf"
    }
  ],
  "description": "Contract version sent for review"
}
```

The logical example above is shown for readability. Its canonical bytes have a different member order, as required by JCS.

## Top-level fields

### `format`

Required string with exact value `proofstamp-manifest`.

### `version`

Required integer with exact value `1`.

### `hashAlgorithm`

Required string with exact value `sha256`. It describes the evidence fingerprint recorded by the manifest. It does not change OpenTimestamps' internal operation tree.

### `evidence`

Required array containing exactly one item in v1.

The evidence object accepts only `sha256`, `size`, optional `name`, and optional `mediaType`.

#### `sha256`

Required string containing exactly 64 lowercase hexadecimal characters. It is SHA-256 of the exact source-file bytes.

#### `size`

Required non-negative integer representing the exact source-file size in bytes. Maximum value: `9007199254740991`.

#### `name`

Optional non-empty Unicode string, maximum 255 UTF-8 bytes. Unpaired UTF-16 surrogates and control characters other than tab, line feed and carriage return are rejected.

The value is metadata only. A verifier must never use it to locate or identify the source file cryptographically. The browser product omits it by default unless the user explicitly chooses to preserve it.

#### `mediaType`

Optional ASCII media type in `type/subtype` form without parameters, maximum 127 bytes. It is metadata only and is not independently authenticated.

### `description`

Optional non-empty Unicode string containing user-supplied context, maximum 4096 UTF-8 bytes. Unpaired UTF-16 surrogates and control characters other than tab, line feed and carriage return are rejected.

The description is committed evidence context, not a statement independently verified by ProofStamp.

## String handling

Optional strings are omitted when absent. Empty strings and `null` are invalid.

No Unicode normalization is applied. For example, a composed `é` and an `e` followed by a combining acute accent produce different canonical bytes and different commitments. This is intentional because normalization would modify user-supplied evidence context.

## File hash calculation

For the browser product, source-file SHA-256 is calculated through two implementation paths before the manifest is committed:

1. Web Crypto SHA-256;
2. an independent Rust/RustCrypto SHA-256 implementation compiled to WebAssembly.

The results must agree byte-for-byte. If either path fails or the results disagree, ProofStamp fails closed and does not submit a timestamp commitment.

## Manifest commitment procedure

1. Read the exact source-file bytes locally.
2. Calculate and compare the two SHA-256 results.
3. Build the v1 logical manifest with exactly one evidence item.
4. Include optional metadata only when the user explicitly preserves it.
5. Reject unknown, invalid, oversized or ambiguous values.
6. Serialize to canonical JCS UTF-8 bytes.
7. Enforce the 8192-byte canonical manifest limit.
8. Prefix `PROOFSTAMP-MANIFEST-V1` and one zero byte.
9. SHA-256 the resulting byte sequence.
10. Pass that 32-byte digest to the OpenTimestamps layer.
11. Preserve the exact canonical manifest bytes, manifest commitment and standard OTS proof in the portable ProofStamp receipt.

## Receipt requirement

The portable receipt must preserve the exact canonical manifest bytes rather than only a parsed logical object. A parsed view may also be stored for convenience, but it is not a substitute for the committed bytes.

The product must not require a ProofStamp server database to recover the manifest commitment or standard OTS proof. A standard `.ots` representation remains exportable so timestamp verification can be performed with software unrelated to ProofStamp.

## Parser and resource limits

A v1 verifier must fail closed when any of these conditions is violated:

- input is empty or larger than 8192 bytes;
- input is not strict UTF-8;
- a UTF-8 BOM is present;
- top-level or evidence objects contain unknown fields;
- evidence count is not exactly one;
- strings violate their UTF-8 byte or control-character limits;
- file size is not a non-negative safe integer;
- hash is not exactly 64 lowercase hexadecimal characters;
- media type is outside the allowed v1 form;
- re-canonicalized bytes differ from imported bytes;
- version, format or hash algorithm is unknown.

## Golden vectors

Normative implementation vectors are stored in [`tests/fixtures/manifest-v1/golden-vectors.json`](../tests/fixtures/manifest-v1/golden-vectors.json).

They cover a minimal manifest, contextual ASCII metadata, and Unicode metadata. Each vector fixes:

- the logical manifest;
- exact canonical UTF-8 text;
- canonical byte length;
- domain-separated SHA-256 commitment.

The reference implementation and CI must reproduce those values exactly.

## Versioning

A verifier must never silently reinterpret an unknown manifest version.

If a future format changes field meaning, evidence cardinality, canonicalization rules, string normalization, limits or domain separation, it must use a new manifest version and a new domain separator.
