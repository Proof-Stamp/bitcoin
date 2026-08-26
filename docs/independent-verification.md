# Independent verification

Status: experimental v0 verification guide

A completed ProofStamp is designed to remain verifiable without the ProofStamp website. The portable receipt binds the source-file fingerprint to the exact canonical ProofStamp Manifest v1 bytes, and the exported `.ots` file binds that Manifest commitment to a standard OpenTimestamps proof.

The browser verifier is convenient, but it is not the strongest verification path. It uses Blockstream to identify the best-chain block at an attested height and records `consensusValidation: false`. The strongest supported independent path is the canonical OpenTimestamps client with a locally controlled Bitcoin Core node.

## What you need

Keep these artifacts together when possible:

- the original source file;
- `*.proofstamp-receipt.json`;
- `*.proofstamp.ots`.

The receipt is the primary ProofStamp evidence artifact. The `.ots` file is the standard OpenTimestamps representation.

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

The result must equal both:

- `localHashAgreement.fileSha256` in the receipt;
- `evidence[0].sha256` in the canonical Manifest v1 stored by the receipt.

A matching hash proves that the file bytes being checked are the bytes committed by the receipt. It does not prove authorship, truth, location, or original creation time.

## 2. Recompute the Manifest commitment

The receipt stores the exact canonical Manifest v1 bytes as base64 in `canonicalManifestUtf8Base64`.

The commitment rule is:

```text
SHA256(UTF8("PROOFSTAMP-MANIFEST-V1") || 0x00 || canonical_manifest_bytes)
```

This Python example recomputes the commitment directly from a saved receipt:

```bash
python3 - RECEIPT.proofstamp-receipt.json <<'PY'
import base64
import hashlib
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    receipt = json.load(handle)

manifest = base64.b64decode(receipt["canonicalManifestUtf8Base64"], validate=True)
commitment = hashlib.sha256(b"PROOFSTAMP-MANIFEST-V1\x00" + manifest).hexdigest()
print(commitment)

if commitment != receipt["manifestCommitmentSha256"]:
    raise SystemExit("Manifest commitment mismatch")
PY
```

The printed value must equal `manifestCommitmentSha256` in the receipt.

This small example checks the cryptographic commitment. The ProofStamp application additionally applies the strict receipt schema, duplicate-key rejection, canonical Manifest checks, size limits, and OpenTimestamps parser limits documented in this repository.

## 3. Check the standard OpenTimestamps proof

Install the canonical OpenTimestamps client, then inspect the exported proof:

```bash
ots info FILE.proofstamp.ots
```

The first line reports the detached SHA-256 digest recorded by the `.ots` file. That digest must equal the receipt's `manifestCommitmentSha256`.

A pending proof can be upgraded independently of ProofStamp:

```bash
ots upgrade FILE.proofstamp.ots
```

Upgrading may contact OpenTimestamps calendars to obtain the path from a pending calendar attestation to Bitcoin. Keep the upgraded `.ots` file.

## 4. Verify against your own Bitcoin Core node

The canonical OpenTimestamps client accepts the Manifest commitment directly as a hex digest, so no ProofStamp-specific target file is required for this step.

With Bitcoin Core running and RPC credentials available:

```bash
ots --bitcoin-node http://USER:PASS@127.0.0.1:8332/ verify \
  -d MANIFEST_COMMITMENT_SHA256 \
  FILE.proofstamp.ots
```

Use the exact `manifestCommitmentSha256` value from the receipt.

This verification path asks your own Bitcoin Core node for the relevant Bitcoin block data. It therefore does not depend on ProofStamp's browser Bitcoin provider for consensus selection.

## What a successful end-to-end check supports

If all of these agree:

1. the independently calculated source-file SHA-256;
2. the canonical Manifest bytes and recomputed Manifest commitment;
3. the detached digest in the standard `.ots` proof;
4. the Bitcoin attestation verified by the canonical OpenTimestamps client against your Bitcoin Core node;

then the evidence supports the claim that the committed digital state existed no later than the verified Bitcoin anchoring block.

It does not by itself prove truth, authorship, location, original creation time, or whether the file was edited before it was stamped.

## Browser verification is deliberately narrower

The ProofStamp browser verifier remains useful for a quick check. It authenticates the fetched raw 80-byte Bitcoin block header, verifies the OpenTimestamps Merkle-root commitment, and exposes the verification method. It does not independently validate proof of work, chain history, difficulty transitions, or Bitcoin consensus.

For that reason, a browser-verified receipt records:

```text
consensusValidation: false
```

Use the Bitcoin Core path above when independent Bitcoin consensus verification matters.
