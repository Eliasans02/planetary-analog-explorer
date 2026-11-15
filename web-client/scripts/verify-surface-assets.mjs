import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { resolveSharedRoot } from './shared-root.mjs';

const root = path.resolve(import.meta.dirname, '..');
const publicRoot = path.join(root, 'public');
const raw = fs.readFileSync(path.join(publicRoot, 'data/surface_catalog.json'));
if (raw.length > 512 * 1024) throw Error('Catalog exceeds byte quota');
const catalog = JSON.parse(raw);
const validate = new Ajv2020({ strict: false, allErrors: true }).compile(JSON.parse(fs.readFileSync(path.join(resolveSharedRoot(root), 'schemas/surface_catalog.schema.json'), 'utf8')));
if (!validate(catalog)) throw Error(JSON.stringify(validate.errors));
const sourceIds = new Set(catalog.sources.map(s => s.id));
if (sourceIds.size !== catalog.sources.length || new Set(catalog.surfaces.map(s => s.id)).size !== catalog.surfaces.length) throw Error('Duplicate IDs');
function asset(a) {
  if (!/^\/assets\/[a-zA-Z0-9_./-]+$/.test(a.path) || a.path.slice(1).split('/').some(v => ['', '.', '..'].includes(v))) throw Error('Unsafe asset path');
  const target = fs.realpathSync(path.join(publicRoot, a.path.slice(1)));
  if (!target.startsWith(fs.realpathSync(path.join(publicRoot, 'assets')) + path.sep)) throw Error('Asset escapes root');
  const data = fs.readFileSync(target);
  if (data.length !== a.bytes || crypto.createHash('sha256').update(data).digest('hex') !== a.sha256) throw Error(`Integrity failure: ${a.path}`);
  return data;
}
const report = [];
for (const s of catalog.surfaces) {
  const g = s.grid; const n = g.width * g.height;
  if (s.coordinates.frame !== (s.body === 'moon' ? 'MOON_ME_DE421' : s.body === 'mars' ? 'MARS_HIRISE_PLANETOCENTRIC' : 'NAD83') || s.source_ids.some(id => !sourceIds.has(id))) throw Error('Body/frame/source mismatch');
  if (g.heights.bytes !== n * 4 || g.valid_mask.bytes !== n || s.stats.total_samples !== n || g.spacing_m.some(v => !(v > 0)) || g.native_spacing.some(v => v === 0)) throw Error('Invalid grid metadata');
  if (s.roi.outline_grid.some(([x, y]) => x < 0 || y < 0 || x > g.width - 1 || y > g.height - 1)) throw Error('Invalid ROI');
  const h = asset(g.heights); const m = asset(g.valid_mask); const provenance = JSON.parse(asset(s.provenance));
  let count = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) { const v = h.readFloatLE(i * 4); if (!Number.isFinite(v) || ![0, 1].includes(m[i])) throw Error('Invalid sample'); if (m[i]) { count++; min = Math.min(min, v + g.vertical_zero_m); max = Math.max(max, v + g.vertical_zero_m); } }
  if (count !== s.stats.valid_samples || count < 3 || Math.abs(min - s.stats.min_source_height_m) > .1 || Math.abs(max - s.stats.max_source_height_m) > .1 || Math.abs(max - min - s.stats.relief_m) > .1) throw Error('False statistics');
  report.push({ id: s.id, body: s.body, frame: s.coordinates.frame, samples: count, relief_m: max - min, assets_sha256: 'verified', provenance: typeof provenance === 'object' ? 'parsed' : 'invalid' });
}
console.log(JSON.stringify({ status: 'passed', surfaces: report }, null, 2));

