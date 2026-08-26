import assert from 'node:assert/strict'
import test from 'node:test'
import { DetachedTimestampFile, OpSHA256, makePending } from '@otskit/core'
import {
  inspectOpenTimestampsProof,
  MAX_PROOF_ATTESTATIONS,
} from '../src/ots-upgrade-verify.js'
import { UPGRADE_CALENDARS } from '../src/network-policy.js'

test('imported proof with excessive attestations fails before any network use', () => {
  const detached = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(9))
  for (let index = 0; index < MAX_PROOF_ATTESTATIONS + 1; index += 1) {
    detached.timestamp.addAttestation(makePending(UPGRADE_CALENDARS[0]))
  }
  const proof = detached.serializeToBytes()
  assert.throws(() => inspectOpenTimestampsProof(proof), /attestation limit/)
})
