import { readFile, writeFile } from 'node:fs/promises';

import { read as readOpenTimestamps, write as writeOpenTimestamps } from '@lacrypta/typescript-opentimestamps';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/generate-typescript-normalized-pending.mjs <input.ots> <output.ots>');
}

const original = Uint8Array.from(await readFile(inputPath));
const normalized = writeOpenTimestamps(readOpenTimestamps(original));

await writeFile(outputPath, normalized);

console.log(`Wrote ${normalized.byteLength} normalized bytes to ${outputPath}`);
