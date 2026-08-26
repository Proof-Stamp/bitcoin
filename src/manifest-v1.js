const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export const MANIFEST_FORMAT = 'proofstamp-manifest';
export const MANIFEST_VERSION = 1;
export const EVIDENCE_HASH_ALGORITHM = 'sha256';
export const DOMAIN_SEPARATOR = 'PROOFSTAMP-MANIFEST-V1';

export const LIMITS = Object.freeze({
  evidenceItems: 1,
  nameUtf8Bytes: 255,
  mediaTypeUtf8Bytes: 127,
  descriptionUtf8Bytes: 4096,
  canonicalManifestBytes: 8192,
  maxSafeFileSize: Number.MAX_SAFE_INTEGER,
});

const TOP_LEVEL_KEYS = new Set(['description', 'evidence', 'format', 'hashAlgorithm', 'version']);
const EVIDENCE_KEYS = new Set(['mediaType', 'name', 'sha256', 'size']);
const SHA256_HEX = /^[0-9a-f]{64}$/;
const MEDIA_TYPE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;
const domainPrefix = encoder.encode(`${DOMAIN_SEPARATOR}\u0000`);

function fail(message) {
  throw new TypeError(`Invalid ProofStamp Manifest v1: ${message}`);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must be a plain object`);
  }
}

function assertNoUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail(`${label} contains unknown field ${JSON.stringify(key)}`);
    }
  }
}

function assertUnicodeScalarString(value, label) {
  if (typeof value !== 'string') fail(`${label} must be a string`);

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        fail(`${label} contains an unpaired UTF-16 surrogate`);
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail(`${label} contains an unpaired UTF-16 surrogate`);
    }
  }
}

function assertBoundedString(value, label, maxBytes, { rejectControls = false } = {}) {
  assertUnicodeScalarString(value, label);
  if (value.length === 0) fail(`${label} must not be empty`);
  const length = encoder.encode(value).byteLength;
  if (length > maxBytes) fail(`${label} exceeds ${maxBytes} UTF-8 bytes`);

  if (rejectControls) {
    for (const character of value) {
      const codePoint = character.codePointAt(0);
      if ((codePoint <= 0x1f && ![0x09, 0x0a, 0x0d].includes(codePoint)) || codePoint === 0x7f) {
        fail(`${label} contains a disallowed control character`);
      }
    }
  }
}

function validateEvidence(item) {
  assertPlainObject(item, 'evidence item');
  assertNoUnknownKeys(item, EVIDENCE_KEYS, 'evidence item');

  if (typeof item.sha256 !== 'string' || !SHA256_HEX.test(item.sha256)) {
    fail('evidence.sha256 must be exactly 64 lowercase hexadecimal characters');
  }
  if (!Number.isSafeInteger(item.size) || item.size < 0) {
    fail('evidence.size must be a non-negative safe integer');
  }

  if ('name' in item) {
    assertBoundedString(item.name, 'evidence.name', LIMITS.nameUtf8Bytes, { rejectControls: true });
  }

  if ('mediaType' in item) {
    assertBoundedString(item.mediaType, 'evidence.mediaType', LIMITS.mediaTypeUtf8Bytes);
    if (!MEDIA_TYPE.test(item.mediaType)) {
      fail('evidence.mediaType must be an ASCII type/subtype without parameters');
    }
  }
}

export function validateManifestV1(manifest) {
  assertPlainObject(manifest, 'manifest');
  assertNoUnknownKeys(manifest, TOP_LEVEL_KEYS, 'manifest');

  if (manifest.format !== MANIFEST_FORMAT) fail(`format must equal ${JSON.stringify(MANIFEST_FORMAT)}`);
  if (manifest.version !== MANIFEST_VERSION) fail(`version must equal ${MANIFEST_VERSION}`);
  if (manifest.hashAlgorithm !== EVIDENCE_HASH_ALGORITHM) {
    fail(`hashAlgorithm must equal ${JSON.stringify(EVIDENCE_HASH_ALGORITHM)}`);
  }
  if (!Array.isArray(manifest.evidence) || manifest.evidence.length !== LIMITS.evidenceItems) {
    fail(`evidence must contain exactly ${LIMITS.evidenceItems} item`);
  }

  validateEvidence(manifest.evidence[0]);

  if ('description' in manifest) {
    assertBoundedString(
      manifest.description,
      'description',
      LIMITS.descriptionUtf8Bytes,
      { rejectControls: true },
    );
  }

  return manifest;
}

function canonicalLogicalObject(manifest) {
  const item = manifest.evidence[0];
  const canonicalEvidence = {};
  if ('mediaType' in item) canonicalEvidence.mediaType = item.mediaType;
  if ('name' in item) canonicalEvidence.name = item.name;
  canonicalEvidence.sha256 = item.sha256;
  canonicalEvidence.size = item.size;

  const canonical = {};
  if ('description' in manifest) canonical.description = manifest.description;
  canonical.evidence = [canonicalEvidence];
  canonical.format = manifest.format;
  canonical.hashAlgorithm = manifest.hashAlgorithm;
  canonical.version = manifest.version;
  return canonical;
}

export function canonicalManifestBytes(manifest) {
  validateManifestV1(manifest);
  const bytes = encoder.encode(JSON.stringify(canonicalLogicalObject(manifest)));
  if (bytes.byteLength > LIMITS.canonicalManifestBytes) {
    fail(`canonical representation exceeds ${LIMITS.canonicalManifestBytes} bytes`);
  }
  return bytes;
}

export function canonicalManifestText(manifest) {
  return decoder.decode(canonicalManifestBytes(manifest));
}

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function parseCanonicalManifestBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength === 0 || bytes.byteLength > LIMITS.canonicalManifestBytes) {
    fail(`input must be between 1 and ${LIMITS.canonicalManifestBytes} bytes`);
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail('UTF-8 BOM is not permitted');
  }

  let text;
  try {
    text = decoder.decode(bytes);
  } catch {
    fail('input is not valid UTF-8');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('input is not valid JSON');
  }

  const canonical = canonicalManifestBytes(parsed);
  if (!bytesEqual(bytes, canonical)) {
    fail('input is not the exact canonical v1 representation');
  }
  return parsed;
}

export async function manifestCommitment(manifest, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('Web Crypto SubtleCrypto is required for manifest commitment hashing');
  const canonical = canonicalManifestBytes(manifest);
  const input = new Uint8Array(domainPrefix.byteLength + canonical.byteLength);
  input.set(domainPrefix, 0);
  input.set(canonical, domainPrefix.byteLength);
  return new Uint8Array(await subtle.digest('SHA-256', input));
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function manifestCommitmentHex(manifest, subtle) {
  return bytesToHex(await manifestCommitment(manifest, subtle));
}
