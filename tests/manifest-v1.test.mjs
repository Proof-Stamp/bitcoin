import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  LIMITS,
  canonicalManifestBytes,
  canonicalManifestText,
  manifestCommitmentHex,
  parseCanonicalManifestBytes,
  validateManifestV1,
} from '../src/manifest-v1.js';

const vectors = JSON.parse(
  await readFile(new URL('./fixtures/manifest-v1/golden-vectors.json', import.meta.url), 'utf8'),
);

for (const vector of vectors) {
  test(`Manifest v1 golden vector: ${vector.id}`, async () => {
    const bytes = canonicalManifestBytes(vector.manifest);
    assert.equal(new TextDecoder().decode(bytes), vector.canonical);
    assert.equal(bytes.byteLength, vector.canonicalUtf8Bytes);
    assert.equal(await manifestCommitmentHex(vector.manifest), vector.commitmentSha256);

    const parsed = parseCanonicalManifestBytes(bytes);
    assert.deepEqual(parsed, vector.manifest);
  });
}

test('canonical representation follows the frozen v1 JCS field order', () => {
  const input = {
    version: 1,
    hashAlgorithm: 'sha256',
    format: 'proofstamp-manifest',
    evidence: [{ size: 7, sha256: 'ab'.repeat(32), name: 'a.txt', mediaType: 'text/plain' }],
    description: 'example',
  };

  assert.equal(
    canonicalManifestText(input),
    '{"description":"example","evidence":[{"mediaType":"text/plain","name":"a.txt","sha256":"abababababababababababababababababababababababababababababababab","size":7}],"format":"proofstamp-manifest","hashAlgorithm":"sha256","version":1}',
  );
});

test('filename and media type are optional metadata', () => {
  const manifest = {
    format: 'proofstamp-manifest',
    version: 1,
    hashAlgorithm: 'sha256',
    evidence: [{ sha256: '11'.repeat(32), size: 1 }],
  };

  assert.doesNotThrow(() => validateManifestV1(manifest));
  assert.equal(canonicalManifestText(manifest).includes('name'), false);
  assert.equal(canonicalManifestText(manifest).includes('mediaType'), false);
});

test('v1 accepts exactly one evidence item', () => {
  const base = {
    format: 'proofstamp-manifest',
    version: 1,
    hashAlgorithm: 'sha256',
  };

  assert.throws(() => validateManifestV1({ ...base, evidence: [] }), /exactly 1 item/);
  assert.throws(
    () => validateManifestV1({
      ...base,
      evidence: [
        { sha256: '00'.repeat(32), size: 0 },
        { sha256: '11'.repeat(32), size: 1 },
      ],
    }),
    /exactly 1 item/,
  );
});

test('v1 rejects unknown fields and ambiguous numeric values', () => {
  const manifest = {
    format: 'proofstamp-manifest',
    version: 1,
    hashAlgorithm: 'sha256',
    evidence: [{ sha256: '22'.repeat(32), size: 2 }],
  };

  assert.throws(() => validateManifestV1({ ...manifest, timestamp: 123 }), /unknown field/);
  assert.throws(
    () => validateManifestV1({ ...manifest, evidence: [{ ...manifest.evidence[0], extra: true }] }),
    /unknown field/,
  );
  assert.throws(
    () => validateManifestV1({ ...manifest, evidence: [{ sha256: '22'.repeat(32), size: Number.MAX_SAFE_INTEGER + 1 }] }),
    /safe integer/,
  );
});

test('v1 rejects malformed hashes, invalid media types, control characters and oversized strings', () => {
  const make = (item, description) => ({
    format: 'proofstamp-manifest',
    version: 1,
    hashAlgorithm: 'sha256',
    evidence: [item],
    ...(description === undefined ? {} : { description }),
  });

  assert.throws(() => validateManifestV1(make({ sha256: 'AA'.repeat(32), size: 0 })), /lowercase/);
  assert.throws(() => validateManifestV1(make({ sha256: '00'.repeat(32), size: 0, mediaType: 'text/plain; charset=utf-8' })), /type\/subtype/);
  assert.throws(() => validateManifestV1(make({ sha256: '00'.repeat(32), size: 0, name: 'bad\u0000name' })), /control character/);
  assert.throws(() => validateManifestV1(make({ sha256: '00'.repeat(32), size: 0 }, 'a'.repeat(LIMITS.descriptionUtf8Bytes + 1))), /exceeds/);
  assert.throws(() => validateManifestV1(make({ sha256: '00'.repeat(32), size: 0, name: '\ud800' })), /unpaired/);
});

test('imported manifest bytes must already be the exact canonical representation', () => {
  const canonical = vectors[0].canonical;
  const enc = new TextEncoder();

  assert.throws(() => parseCanonicalManifestBytes(enc.encode(` ${canonical}`)), /exact canonical/);

  const duplicate = canonical.replace(
    '"format":"proofstamp-manifest"',
    '"format":"proofstamp-manifest","format":"proofstamp-manifest"',
  );
  assert.throws(() => parseCanonicalManifestBytes(enc.encode(duplicate)), /exact canonical/);

  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode(canonical)]);
  assert.throws(() => parseCanonicalManifestBytes(withBom), /BOM/);
});

test('Unicode is preserved as supplied and is not normalized', async () => {
  const base = {
    format: 'proofstamp-manifest',
    version: 1,
    hashAlgorithm: 'sha256',
    evidence: [{ sha256: '33'.repeat(32), size: 3 }],
  };
  const composed = { ...base, description: 'Café' };
  const decomposed = { ...base, description: 'Cafe\u0301' };

  assert.notEqual(canonicalManifestText(composed), canonicalManifestText(decomposed));
  assert.notEqual(await manifestCommitmentHex(composed), await manifestCommitmentHex(decomposed));
});
