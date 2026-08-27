# Independent verification

Status: experimental v0 verification guide

New ProofStamps timestamp the source file's SHA-256 directly with standard OpenTimestamps. The exported `.ots` file can therefore be verified against the original file without any ProofStamp-specific Manifest step.

The browser verifier is convenient, but it is not the strongest Bitcoin verification path. It uses Blockstream to identify the best-chain block at an attested height and records `consensusValidation: false`. The strongest supported independent path is the canonical OpenTimestamps client with a locally controlled Bitcoin Core node.

## What you need

For a new ProofStamp, keep:

- the original source file;
- `*.proofstamp-receipt.json`;
- optionally, the exported `*.ots` proof.

The receipt already embeds the `.ots` proof. The separate `.ots` file is useful when verifying with standard OpenTimestamps tools.

## 1. Check the source-file fingerprint

Calculate SHA-256 of the exact source file with a tool independent of ProofStamp.

Linux:

```bash
sha256sum FILE
```

macOS:

```bash
shasum -a 256 FILE
```

For a v2 receipt, the result must equal:

- `fileSha256`;
- `localHashAgreement.fileSha256`;
- `localHashAgreement.webCryptoSha256`;
- `localHashAgreement.rustSha256`.

A matching hash proves that the file bytes being checked are the bytes identified by the receipt. It does not prove authorship, truth, location, or original creation time.

## 2. Verify the standard OpenTimestamps proof against the file

Install the canonical OpenTimestamps client.

Inspect the exported proof:

```bash
ots info FILE.ots
```

The detached SHA-256 digest reported by the `.ots` file must equal the original file's SHA-256 and the receipt's `fileSha256`.

A pending proof can be upgraded independently of ProofStamp:

```bash
ots upgrade FILE.ots
```

Then verify it directly against the original file:

```bash
ots verify FILE.ots -f FILE
```

The exact CLI spelling can vary by OpenTimestamps client version; `ots verify --help` is authoritative for the installed client. The important invariant is that the v2 `.ots` digest is the source-file SHA-256 itself.

You can also use the official browser verifier at OpenTimestamps.org by supplying the original file together with its `.ots` proof.

## 3. Verify against your own Bitcoin Core node

With Bitcoin Core running and RPC credentials available, use the canonical OpenTimestamps client with your node when independent Bitcoin consensus selection matters.

A detached-digest verification can use the receipt's exact file SHA-256:

```bash
ots --bitcoin-node http://USER:PASS@127.0.0.1:8332/ verify \
  -d FILE_SHA256 \
  FILE.ots
```

Use the exact `fileSha256` value from the receipt.

This path asks your own Bitcoin Core node for the relevant Bitcoin block data. It therefore does not depend on ProofStamp's browser Bitcoin provider for consensus selection.

## Legacy Manifest-v1 receipts

Receipt version 1 used a different proof target. Its `.ots` file timestamps a domain-separated ProofStamp Manifest commitment, not the raw source-file SHA-256.

For a v1 receipt:

1. independently hash the source file and compare it with `localHashAgreement.fileSha256`;
2. decode `canonicalManifestUtf8Base64` and confirm its evidence hash matches the source-file SHA-256;
3. recompute:

```text
SHA256(UTF8("PROOFSTAMP-MANIFEST-V1") || 0x00 || canonical_manifest_bytes)
```

4. confirm the result equals `manifestCommitmentSha256`;
5. verify the legacy `.ots` against that Manifest commitment, not directly against the original file.

Existing v1 receipts remain supported by the ProofStamp browser. They must never be reinterpreted as v2 direct-file proofs.

## What a successful end-to-end check supports

For a v2 receipt, if these agree:

1. the independently calculated source-file SHA-256;
2. the receipt's `fileSha256`;
3. the detached digest in the standard `.ots` proof;
4. the Bitcoin attestation verified by the canonical OpenTimestamps client against your Bitcoin Core node;

then the evidence supports the claim that a commitment to those exact file bytes existed no later than the verified Bitcoin anchoring block.

It does not by itself prove truth, authorship, location, original creation time, or whether the file was edited before it was stamped.

## Browser verification is deliberately narrower

The ProofStamp browser verifier remains useful for a quick check. It authenticates the fetched raw 80-byte Bitcoin block header, verifies the OpenTimestamps Merkle-root commitment, and exposes the verification method. It does not independently validate proof of work, chain history, difficulty transitions, or Bitcoin consensus.

For that reason, a browser-verified receipt records:

```text
consensusValidation: false
```

Use the Bitcoin Core path above when independent Bitcoin consensus verification matters.
