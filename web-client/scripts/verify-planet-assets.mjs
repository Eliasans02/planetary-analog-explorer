import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { resolveSharedRoot } from './shared-root.mjs';
const root = path.resolve(import.meta.dirname, '..');
const publicRoot = path.join(root, 'public');
const bytes = fs.readFileSync(path.join(publicRoot, 'data/planet_catalog.json'));
if (bytes.length > 128 * 1024) throw Error('Planet catalog exceeds quota');
const catalog = JSON.parse(bytes);
const validate = new Ajv2020({ strict: false, allErrors: true }).compile(JSON.parse(fs.readFileSync(path.join(resolveSharedRoot(root), 'schemas/planet_catalog.schema.json'), 'utf8')));
if (!validate(catalog)) throw Error(JSON.stringify(validate.errors));
if (new Set(catalog.planets.map(p => p.id)).size !== catalog.planets.length) throw Error('Duplicate bodies');
const https = value => { if (new URL(value).protocol !== 'https:') throw Error('Non-HTTPS source'); };
function asset(a) {
  if (!/^\/assets\/planets\/[a-zA-Z0-9_./-]+$/.test(a.path) || a.path.slice(1).split('/').some(v => ['', '.', '..'].includes(v))) throw Error('Unsafe planet asset path');
  const target = fs.realpathSync(path.join(publicRoot, a.path.slice(1)));
  if (!target.startsWith(fs.realpathSync(path.join(publicRoot, 'assets/planets')) + path.sep)) throw Error('Asset escapes root');
  const data = fs.readFileSync(target);
  if (data.length > 24 * 1024 * 1024 || data.length !== a.bytes || crypto.createHash('sha256').update(data).digest('hex') !== a.sha256) throw Error(`Integrity failure ${a.path}`);
  return data;
}
function dimensions(data) {
  if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    if (data[24] !== 8 || ![2, 6].includes(data[25])) throw Error('Expected 8-bit RGB/RGBA PNG');
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
  }
  if (data[0] === 255 && data[1] === 216) {
    let i = 2;
    while (i < data.length) { if (data[i++] !== 255) throw Error('Invalid JPEG'); while (data[i] === 255) i++; const marker = data[i++]; if (marker === 217 || marker === 218) break; const n = data.readUInt16BE(i); if ([192,193,194].includes(marker)) { if (data[i + 2] !== 8 || data[i + 7] !== 3) throw Error('Expected 8-bit RGB JPEG'); return [data.readUInt16BE(i + 5), data.readUInt16BE(i + 3)]; } i += n; }
  }
  throw Error('Unsupported or invalid texture encoding');
}
const report = [];
for (const p of catalog.planets) {
  https(p.source_url); JSON.parse(asset(p.provenance));
  if (new Set(p.textures.map(t => t.label)).size !== p.textures.length) throw Error('Duplicate resolution');
  for (const t of p.textures) { const [w, h] = dimensions(asset(t)); if (w !== t.width || h !== t.height || w !== { '1K':1024, '2K':2048, '4K':4096, 'Native':1440 }[t.label] || h !== w / 2 || (t.label === 'Native' && p.id !== 'mars')) throw Error('False texture dimensions'); }
  if (p.displacement) { const d = p.displacement; https(d.source_url); const a = asset(d.asset); if (a.length !== d.width * d.height * 4) throw Error('Invalid elevation buffer'); for (let i = 0; i < a.length; i += 4) if (!Number.isFinite(a.readFloatLE(i))) throw Error('Nonfinite global elevation'); }
  report.push({ body: p.id, textures: p.textures.map(t => `${t.label} ${t.width}×${t.height}`), displacement: !!p.displacement, sha256: 'verified' });
}
console.log(JSON.stringify({ status: 'passed', planets: report }, null, 2));
