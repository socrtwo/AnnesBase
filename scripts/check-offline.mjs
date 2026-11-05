import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(process.argv[2] ?? 'dist');
const sw = await readFile(resolve(directory, 'sw.js'), 'utf8');
const assets = JSON.parse(sw.match(/^const ASSETS = (.+);$/m)?.[1] ?? 'null');
assert(Array.isArray(assets) && assets.length > 4, 'Missing offline asset list');
assert(assets.some(asset => asset.url.endsWith('.wasm')), 'SQLite must be cached before offline readiness');
assert(assets.some(asset => asset.url === 'index.html'));
assert(!assets.some(asset => asset.url === 'sw.js'));
for (const asset of assets) {
  assert(!asset.url.startsWith('/') && !asset.url.includes('..') && !asset.url.includes(':'), 'Offline URLs must stay inside the app scope');
  const actual = 'sha256-' + createHash('sha256').update(await readFile(resolve(directory, asset.url))).digest('base64');
  assert.equal(actual, asset.integrity, `Integrity mismatch for ${asset.url}`);
}
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.name, "Anne's Base"); assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './'); assert.equal(manifest.display, 'standalone');
for (const size of [192, 512]) {
  const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}`); assert(icon);
  const png = await readFile(resolve(directory, icon.src));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
  assert(assets.some(asset => asset.url === icon.src));
}
const provenance = JSON.parse(await readFile('resources/install-icons.json', 'utf8'));
assert.equal(createHash('sha256').update(await readFile(provenance.source)).digest('hex'), provenance.sourceSha256, 'Regenerate installation icons after changing the source artwork');
console.log(`Offline bundle verified: ${assets.length} integrity-checked files, SQLite WASM, manifest and installation icons.`);
