# OpenTimestamps / Bitcoin ProofStamp threat model

Status: draft for architecture review

The design goal is not to make ProofStamp a trusted timestamp authority. A completed proof should remain independently verifiable through standard OpenTimestamps tooling and Bitcoin.

## Assets to protect

- Exact source file bytes on the user's device.
- Correct SHA-256 fingerprint of those bytes.
- Integrity of the ProofStamp Manifest.
- Integrity and portability of the pending/completed OpenTimestamps proof.
- Accuracy of the verification result shown to the user.
- User privacy, especially file contents, fingerprints, descriptions, and network metadata.
- Long-term ability to verify completed proofs without ProofStamp infrastructure.

## Trust boundaries

### Browser application

The browser app is trusted to present the correct code and result to the user.

Dual hashing provides implementation diversity, not two independent trust authorities. A fully compromised ProofStamp deployment can modify both hashing paths or the displayed result.

Mitigations include auditable builds where practical, strict CSP, pinned dependencies/toolchains, tests, source availability, and independent verification instructions.

### Source file picker

The application receives file bytes and metadata from the browser/device.

The bytes can be cryptographically fingerprinted. Filename, media type, device timestamps, and other picker metadata are not trusted provenance signals.

### OpenTimestamps calendars

Calendars receive blinded/opaque commitments, not source files.

Calendars are not trusted timestamp authorities. They can fail to respond, censor requests, return malformed data, disappear before an upgrade is obtained, observe network/timing metadata, or attempt to direct a client toward attacker-controlled network destinations through malicious proof data.

They cannot create a valid historical Bitcoin attestation for arbitrary data without satisfying the Bitcoin proof path.

### Bitcoin data provider

A browser convenience verifier may use one or more public providers to retrieve Bitcoin block/header data.

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
- tests proving stamping requests contain only protocol commitments, never source bytes;
- no analytics or logging of file bytes or local manifest content.

### T2 — raw file hash leaked to calendars

Mitigations:

- use standard OpenTimestamps nonce/blinding behavior before calendar submission;
- interoperability tests confirming the transmitted commitment is not the bare ProofStamp manifest or bare file digest;
- never add a custom shortcut that directly posts the file digest.

### T3 — incorrect local hash becomes permanently committed

Mitigations:

- calculate the creation hash through Web Crypto and the independent Rust/WASM path;
- require exact agreement before stamping;
- known SHA-256 vectors in every build;
- fail closed on calculation error or disagreement.

### T4 — ambiguous manifest serialization

Mitigations:

- fixed canonical serialization;
- reject duplicate JSON keys;
- fixed field types;
- omit rather than null/empty optional values;
- explicit domain separation;
- golden test vectors across independent implementations.

### T5 — pending proof loss

Mitigations:

- make the pending OTS proof part of the primary portable ProofStamp receipt;
- do not treat raw `.ots` as an optional afterthought;
- prompt the user to save/export the receipt before leaving where UX permits;
- never require ProofStamp server storage for recovery of a proof the user has preserved;
- preserve original proof branches when an upgrade partially fails.

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
- depth, operation-count, branch-count, URI-length, and allocation limits;
- reject unsupported operations/attestations where appropriate;
- reject trailing garbage and malformed serialization;
- fuzz/property tests;
- process failures as invalid proof, never as successful timestamping.

### T8 — network exfiltration through embedded calendar URL

Mitigations:

- never fetch arbitrary URLs embedded in untrusted proof files;
- intersect proof calendar URLs with a local production allowlist;
- require HTTPS for production calendars unless a deliberate localhost/development exception exists;
- CSP must allow only configured hosts;
- reject IP literals, localhost, private network targets, and other non-approved destinations in production.

### T9 — malicious Bitcoin provider

Mitigations:

- cryptographically validate the OpenTimestamps path against returned block data;
- optionally compare more than one provider for operational sanity;
- do not describe multi-provider agreement as independent Bitcoin consensus verification;
- expose verification method in technical details;
- document Bitcoin Core/local-node verification as the strongest supported independent path.

### T10 — Bitcoin reorganization

Mitigations:

- distinguish `anchored` from `confirmed` in the internal state model;
- show confirmation information in technical details;
- use a configurable product confidence threshold;
- never describe Bitcoin finality as deterministic.

### T11 — inaccurate time claim

Mitigations:

- no device-generated time used as timestamp evidence;
- state that the commitment existed no later than its inclusion in the verified Bitcoin block;
- treat block time as Bitcoin metadata with limited wall-clock precision;
- explicitly disclaim authorship, location, truth, and original creation time.

### T12 — proof downgrade or partial verification shown as full verification

Mitigations:

- explicit verification stages;
- no success state unless every required stage for that status passes;
- fail closed on internal disagreement;
- technical details expose which stages were actually completed.

### T13 — compromised ProofStamp deployment

Mitigations:

- public source and auditable release process;
- restrictive CSP and minimal dependencies;
- locked hashing verifier source/toolchain;
- standard `.ots` export;
- independent verification instructions;
- a completed proof must not require ProofStamp.org to remain online.

This threat cannot be fully removed by dual hashing when both implementations are delivered by the same web origin.

### T14 — dependency or protocol implementation vulnerability

Mitigations:

- avoid the legacy JavaScript OpenTimestamps client as a direct production dependency;
- minimize runtime dependencies;
- pin versions and lockfiles;
- maintain fixture interoperability with canonical clients;
- add dependency review and license review to release gates;
- use fail-closed parsing and independent golden vectors.

## Security invariants

1. No source file bytes are sent over the network.
2. No bare file SHA-256 or bare manifest SHA-256 is sent to a calendar when standard OTS blinding should apply.
3. Stamping cannot proceed after local hash disagreement.
4. A pending proof is never labeled Bitcoin-anchored.
5. Unsupported or malformed proof data cannot produce a successful verification result.
6. Untrusted proof data cannot expand the network allowlist.
7. A completed proof can be exported as standard interoperable OTS data.
8. ProofStamp server state is not required to verify a completed portable proof.

## Privacy statement for product documentation

A precise privacy description should distinguish content privacy from network privacy:

- source files stay local;
- only opaque timestamp commitments are submitted to calendars;
- calendars can observe that a request occurred and can observe ordinary network metadata such as source IP unless the user's network setup hides it;
- Bitcoin reveals the aggregate timestamp anchor, not the underlying source file;
- public verification providers can observe verification requests.

Do not market this as anonymous timestamping.

## Release blockers

Do not ship production stamping until:

- the threat model has been reviewed against the implementation;
- parser limits are defined and tested;
- calendar/network allowlists are enforced in application code and CSP;
- standard OTS interoperability tests pass;
- corrupted/malicious fixtures fail closed;
- browser verification language accurately describes its trust level;
- pending proof preservation has a tested user flow.
