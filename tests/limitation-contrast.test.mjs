import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const brandCss = await readFile(new URL('../app/brandkit.css', import.meta.url), 'utf8')

test('dark limitation callout keeps readable light text', () => {
  assert.match(brandCss, /\.limitation\s*\{[\s\S]*background:\s*var\(--ps-blue\);[\s\S]*color:\s*var\(--ps-white\);/)
  assert.match(brandCss, /\.limitation strong\s*\{[\s\S]*color:\s*var\(--ps-white\);/)
  assert.match(brandCss, /\.explanation \.limitation p\s*\{[\s\S]*color:\s*rgba\(255, 255, 255, \.82\);/)
})
