import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { read as readOpenTimestamps, write as writeOpenTimestamps } from '@opentimestamps/typescript-opentimestamps';
import { DetachedTimestampFile } from '@otskit/core';

const fixtureRoot = new URL('./fixtures/opentimestamps/', import.meta.url);

async function loadBytes(relativePath) {
  return Uint8Array.from(await readFile(new URL(relativePath, fixtureRoot)));
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const fixtureManifest = JSON.parse(
  await readFile(new URL('fixture-manifest.json', fixtureRoot), 'utf8'),
);

test('canonical fixture corpus matches pinned size and SHA-256 metadata', async () => {
  for (const fixture of fixtureManifest.fixtures) {
    const bytes = await loadBytes(fixture.path);
    assert.equal(bytes.byteLength, fixture.bytes, `${fixture.path}: byte length changed`);
    assert.equal(sha256Hex(bytes), fixture.sha256, `${fixture.path}: SHA-256 changed`);
  }
});

for (const fixture of fixtureManifest.fixtures.filter((item) => item.kind.startsWith('valid-'))) {
  test(`standard OTS fixture round-trips through both candidate implementations: ${fixture.path}`, async () => {
    const bytes = await loadBytes(fixture.path);

    const typedTimestamp = readOpenTimestamps(bytes);
    const typedRoundTrip = writeOpenTimestamps(typedTimestamp);
    assert.deepEqual(
      Buffer.from(typedRoundTrip),
      Buffer.from(bytes),
      'opentimestamps/typescript-opentimestamps changed canonical bytes on round-trip',
    );

    const otskitTimestamp = DetachedTimestampFile.deserialize(bytes);
    const otskitRoundTrip = otskitTimestamp.serializeToBytes();
    assert.deepEqual(
      Buffer.from(otskitRoundTrip),
      Buffer.from(bytes),
      'OTSkit changed canonical bytes on round-trip',
    );
  });

  test(`standard OTS file digest matches its canonical source file: ${fixture.path}`, async () => {
    const proofBytes = await loadBytes(fixture.path);
    const sourceBytes = await loadBytes(fixture.sourceFile);
    const sourceSha256 = createHash('sha256').update(sourceBytes).digest();

    const typedTimestamp = readOpenTimestamps(proofBytes);
    assert.equal(typedTimestamp.fileHash.algorithm, 'sha256');
    assert.deepEqual(Buffer.from(typedTimestamp.fileHash.value), sourceSha256);

    const otskitTimestamp = DetachedTimestampFile.deserialize(proofBytes);
    assert.deepEqual(Buffer.from(otskitTimestamp.fileDigest()), sourceSha256);
  });
}

for (const relativePath of [
  'invalid/bad-major-version.ots',
  'invalid/invalid-file-digest-type.ots',
]) {
  test(`structurally invalid canonical fixture fails closed: ${relativePath}`, async () => {
    const bytes = await loadBytes(relativePath);

    assert.throws(() => readOpenTimestamps(bytes));
    assert.throws(() => DetachedTimestampFile.deserialize(bytes));
  });
}

test('canonical semantic-limit fixture is preserved for canonical-client enforcement', async () => {
  const fixture = fixtureManifest.fixtures.find(
    (item) => item.path === 'invalid/exceeds-max-msg-length.ots',
  );
  assert.ok(fixture);
  assert.equal(fixture.kind, 'invalid-semantic');
  const bytes = await loadBytes(fixture.path);
  assert.equal(sha256Hex(bytes), fixture.sha256);
});
