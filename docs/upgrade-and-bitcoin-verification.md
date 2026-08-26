# Pending proof upgrade and Bitcoin verification

Status: Phase 4 browser implementation

This phase lets a user reopen a saved ProofStamp receipt, validate its internal bindings locally, ask approved OpenTimestamps calendars for a more complete proof, and verify a Bitcoin attestation when one is present.

## Imported receipt validation

The browser treats every saved receipt and embedded `.ots` proof as untrusted input.

Before network access, the receipt must pass all of these checks:

- receipt size is bounded;
- supported ProofStamp receipt format/version/status only;
- exact canonical Manifest v1 bytes parse successfully;
- the domain-separated Manifest commitment recomputes to the receipt value;
- the locally recorded file SHA-256 matches the committed Manifest evidence item;
- the embedded `.ots` proof is bounded and parses fail-closed;
- the embedded proof SHA-256 matches the receipt;
- the detached `.ots` file digest equals the Manifest commitment;
- SHA-256 is the detached proof hash algorithm.

A receipt that fails any binding check is not upgraded or verified.

## Upgrade network policy

Imported proof data cannot introduce a network destination.

Pending calendar attestations are queried only when their URI resolves to one of the exact approved origins in `src/network-policy.js`:

- `https://alice.btc.calendar.opentimestamps.org`
- `https://bob.btc.calendar.opentimestamps.org`
- `https://finney.calendar.eternitywall.com`
- `https://btc.calendar.catallaxy.com`

Other pending calendar URIs remain in the portable proof but are ignored by the browser. No request is made to them.

Calendar upgrade responses are bounded, parsed against the exact commitment being queried, and require end-of-input after the timestamp tree. Merge failures are isolated and do not rewrite unrelated proof branches.

A proof can remain pending after an upgrade check. That is normal and must not be presented as failure or Bitcoin confirmation.

## Browser Bitcoin verification

When the `.ots` tree contains a Bitcoin attestation, the browser performs a convenience verification using the public Blockstream Esplora API.

For the attested block height it retrieves:

1. the current best-chain block hash at that height;
2. the raw 80-byte Bitcoin block header for that hash.

The returned header is self-authenticated in the browser by computing Bitcoin's double-SHA-256 header hash and requiring it to equal the block hash returned for the height. The OpenTimestamps attestation is then checked against the raw header's internal-order Merkle root and declared block height.

A successful result therefore establishes that the OpenTimestamps commitment matches the raw header supplied for the explorer's best-chain block at that height.

## Important trust boundary

This browser check is not independent Bitcoin consensus validation.

Blockstream supplies the best-chain block hash for the requested height. ProofStamp authenticates the raw header against that hash and verifies the OpenTimestamps Merkle-root commitment, but the browser does not independently validate proof of work, chain history, difficulty transitions, or network consensus.

The UI and receipt therefore record:

- verification method: `blockstream-esplora-raw-header`;
- `consensusValidation: false`.

The strongest independent verification path remains standard OpenTimestamps tooling backed by a locally controlled Bitcoin Core node.

## Receipt update

After an upgrade check, the user can save an updated receipt and `.ots` proof.

A still-pending receipt remains `pending`.

After successful browser Bitcoin-attestation verification, the receipt status becomes `bitcoin-attestation-verified` and records the verified block height, block hash, block time, verification method, and `consensusValidation: false`.

Bitcoin block time is evidence about the anchoring block, not an exact file creation timestamp.

## Network and privacy properties

- source files are never uploaded;
- canonical Manifest bytes are never uploaded;
- saved receipts are read locally;
- only exact origins in `src/network-policy.js` can receive browser requests;
- redirects are rejected;
- credentials are omitted;
- referrers are suppressed;
- response sizes and request timeouts are bounded;
- no ProofStamp account, wallet, backend, proof database, analytics call, or email handoff is introduced by this phase.
