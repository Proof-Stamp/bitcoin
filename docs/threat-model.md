# OpenTimestamps / Bitcoin ProofStamp threat model

Status: draft for architecture review

The design goal is not to make ProofStamp a trusted timestamp authority. A completed proof should remain independently verifiable through standard OpenTimestamps tooling and Bitcoin.

New receipt v2 ProofStamps timestamp the source-file SHA-256 directly. Manifest v1 remains only for verification of earlier experimental receipt v1 files.

## Assets to protect

- Exact source file bytes on the user's device.
- Correct SHA-256 fingerprint of those bytes.
- Integrity and portability of the pending/completed OpenTimestamps proof.
- Integrity of the portable ProofStamp receipt.
- Accuracy of the verification result shown to the user.
- User privacy, especially file contents, fingerprints, and network metadata.
- Long-term ability to verify completed proofs without ProofStamp infrastructure.

## Trust boundaries

### Browser application

The browser app is trusted to present the correct code and result to the user.

Dual hashing provides implementation diversity, not two independent trust authorities. A fully compromised ProofStamp deployment can modify both hashing paths or the displayed result.

Mitigations include strict CSP, pinned dependencies/toolchains, tests, public source, portable standard `.ots` output, and independent verification instructions.

### Source file picker

The application receives file bytes and metadata from the browser/device.

The bytes can be cryptographically fingerprinted. Filename, media type, device timestamps, and other picker metadata are not trusted provenance signals and are not part of the v2 proof target.

### OpenTimestamps calendars

Calendars receive blinded/opaque commitments, not source files or the bare source-file SHA-256.

Calendars are not trusted timestamp authorities. They can fail to respond, censor requests, return malformed data, disappear before an upgrade is obtained, observe network/timing metadata, or attempt to direct a client toward attacker-controlled network destinations through malicious proof data.

They cannot create a valid historical Bitcoin attestation for arbitrary data without satisfying the Bitcoin proof path.

### Bitcoin data provider

A browser convenience verifier may use a public provider to retrieve Bitcoin block/header data.

Such a provider can lie, omit data, or present a non-canonical fork unless the client independently validates sufficient chain work.

Therefore a browser provider-backed result is convenient verification, not equivalent to independently validating Bitcoin consensus with a locally controlled node.

### Bitcoin network

Bitcoin is the public timestamp anchor.

Security relies on normal Bitcoin consensus and cryptographic assumptions. Bitcoin has probabilistic, not deterministic, finality. Reorganizations are possible, especially for recent blocks.

Historical block timestamps are not precise trusted wall-clock timestamps and must not be presented as exact file creation times.

## Threats and mitigations

### T1 — source file leaves the device

Mitigations:

- no file upload API;
- local-only file reading and hashing;
- strict CSP/network allowlist;
- tests proving local preparation makes no non-local request;
- no analytics or logging of file bytes.

### T2 — bare file hash leaked to calendars

Mitigations:

- use standard OpenTimestamps nonce/blinding behavior before calendar submission;
- interoperability tests confirming the transmitted submission digest is not the bare file digest;
- never add a shortcut that posts the file SHA-256 directly.

### T3 — incorrect local hash becomes permanently timestamped

Mitigations:

- calculate the creation hash through Web Crypto and the independent Rust/WASM path;
- require exact agreement before stamping;
- known SHA-256 vectors in every build;
- fail closed on calculation error or disagreement.

### T4 — receipt claims a different file than the `.ots` proof

Mitigations:

- receipt v2 stores one `fileSha256` proof target;
- the embedded `.ots` detached digest must equal the receipt `fileSha256`;
- local hash-agreement fields must all equal that same value;
- import fails closed on any mismatch;
- receipt JSON rejects unknown fields and duplicate object keys.

### T5 — pending proof loss

Mitigations:

- embed the pending OTS proof in the primary portable ProofStamp receipt;
- prompt the user to save the receipt before leaving;
- also allow standard `.ots` export for independent use;
- never require ProofStamp server storage for recovery of a proof the user has preserved;
- preserve valid proof branches when an upgrade partially fails.

### T6 — calendar outage or censorship

Mitigations:

- submit to several independently operated allowlisted calendars;
- isolate failures per calendar;
- preserve every valid response;
- do not require all calendars to succeed;
- document that calendar multiplicity improves liveness, not timestamp consensus.

### T7 — malicious calendar response or proof input

Mitigations:

- strict parser with bounded input size;
- depth, operation-count, node-count, attestation-count, URI-length, and allocation limits;
- reject malformed serialization and trailing garbage;
- fuzz/property tests;
- process failures as invalid proof, never as successful timestamping.

### T8 — network exfiltration through embedded calendar URL

Mitigations:

- never fetch arbitrary URLs embedded in untrusted proof files;
- intersect proof calendar URLs with a local production allowlist;
- require exact approved HTTPS origins;
- CSP allows only configured hosts.

### T9 — malicious Bitcoin provider

Mitigations:

- authenticate the raw Bitcoin block header and verify the OpenTimestamps Merkle-root commitment against it;
- do not present provider-backed verification as independent Bitcoin consensus validation;
- expose verification method in technical details;
- document Bitcoin Core/local-node verification as the strongest supported independent path.

### T10 — Bitcoin reorganization

Mitigations:

- do not describe Bitcoin finality as deterministic;
- treat recent anchoring evidence with normal Bitcoin reorganization risk;
- do not encode a proprietary confirmation threshold into the proof format.

### T11 — inaccurate time claim

Mitigations:

- no device-generated time used as timestamp evidence;
- state that the file commitment existed no later than its inclusion in the verified Bitcoin block;
- treat block time as Bitcoin metadata with limited wall-clock precision;
- explicitly disclaim authorship, location, truth, and original creation time.

### T12 — proof downgrade or partial verification shown as full verification

Mitigations:

- explicit file-match and Bitcoin-timestamp stages;
- no success state unless every required stage for that status passes;
- fail closed on internal disagreement;
- technical details expose which stages were completed.

### T13 — compromised ProofStamp deployment

Mitigations:

- public source and auditable release process;
- restrictive CSP and minimal dependencies;
- locked hashing verifier source/toolchain;
- standard direct-file `.ots` export;
- independent verification instructions;
- a completed proof must not require ProofStamp.org to remain online.

This threat cannot be fully removed by dual hashing when both implementations are delivered by the same web origin.

### T14 — dependency or protocol implementation vulnerability

Mitigations:

- avoid the legacy JavaScript OpenTimestamps client as a direct production dependency;
- minimize runtime dependencies;
- pin versions and lockfiles;
- maintain fixture interoperability with canonical clients;
- add dependency and license review to release gates;
- use fail-closed parsing and independent fixtures.

### T15 — legacy receipt confusion

Mitigations:

- dispatch receipt parsing by explicit version;
- v1 receipts retain Manifest-v1 validation rules;
- v2 receipts require `proofTarget: file-sha256`;
- never reinterpret a v1 `.ots` proof as being directly bound to the source-file hash;
- label legacy Manifest details only when a v1 receipt is actually being checked.

## Security invariants

1. No source file bytes are sent over the network.
2. No bare file SHA-256 is sent to a calendar; standard OTS blinding is applied first.
3. Stamping cannot proceed after local hash disagreement.
4. For receipt v2, the receipt file SHA-256, local hash agreement, and `.ots` detached digest are identical.
5. A pending proof is never labeled Bitcoin-verified.
6. Unsupported or malformed proof data cannot produce a successful verification result.
7. Untrusted proof data cannot expand the network allowlist.
8. A new completed proof can be exported as a standard `.ots` proof directly verifiable with the original file.
9. ProofStamp server state is not required to verify a completed portable proof.
10. Legacy v1 receipts remain distinct from v2 direct-file receipts.

## Privacy statement for product documentation

A precise privacy description should distinguish content privacy from network privacy:

- source files stay local;
- only blinded timestamp commitments are submitted to calendars;
- calendars can observe that a request occurred and ordinary network metadata such as source IP unless the user's network setup hides it;
- Bitcoin reveals the aggregate timestamp anchor, not the underlying source file;
- public verification providers can observe verification requests.

Do not market this as anonymous timestamping.

## Release blockers

Do not ship production stamping until:

- parser limits are defined and tested;
- calendar/network allowlists are enforced in application code and CSP;
- standard OTS interoperability tests pass;
- a new direct-file `.ots` is manually verified against its original file with an independent OpenTimestamps tool;
- corrupted/malicious fixtures fail closed;
- browser verification language accurately describes its trust level;
- pending proof preservation has a tested user flow;
- legacy v1 verification remains fail-closed.
