import Ajv2020Import from 'ajv/dist/2020';
import type { DiscoveryCandidate, DiscoveryMetrics, EarthDiscovery } from '@shared/types/earth-discovery';

type Schema = Record<string, unknown>;
const text = { type: 'string', minLength: 1, maxLength: 4000 };
const id = { type: 'string', pattern: '^[a-zA-Z0-9_-]+$', maxLength: 100 };
const positive = { type: 'number', minimum: 0 };
const integer = { type: 'integer', minimum: 0 };
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const list = (items: Schema, maxItems = 100) => ({ type: 'array', items, maxItems });
const object = (properties: Record<string, Schema>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const latitude = { type: 'number', minimum: -90, maximum: 90 };
const longitude = { type: 'number', minimum: -180, maximum: 180 };
const footprint = { ...list({ type: 'array', prefixItems: [longitude, latitude], minItems: 2, maxItems: 2 }, 20), minItems: 5 };
const metrics = object({
  mean_slope_deg: { ...positive, maximum: 90 }, p95_slope_deg: { ...positive, maximum: 90 },
  relief_m: positive, roughness_m: positive,
  slope_histogram: { ...list({ ...positive, maximum: 1 }, 5), minItems: 5 },
  valid_fraction: { type: 'number', minimum: 0, maximum: 1 },
});
const comparison = object({ distance: { ...positive, maximum: 1 }, rank: { ...integer, minimum: 1 }, sensitivity_rank: { ...integer, minimum: 1 }, shortlisted: { type: 'boolean' } });
const schema = object({
  schema_version: { const: '1.0.0' }, run_id: id, generated_at: text,
  method: object({ name: text, description: text, grid_spacing_m: { const: 60 }, window_size_m: { const: 600 }, grid_size: { const: 10 },
    slope_bins_deg: { const: [0, 5, 10, 20, 30, 90] }, distance_formula: text, sensitivity: text,
    shortlist_separation_m: positive, profile_sha256: hash, uncertainty: text }),
  domain: object({ name: text, description: text, footprint, crs: text, area_km2: positive,
    generated_count: integer, eligible_count: integer, excluded_count: integer,
    exclusion_reasons: { type: 'object', additionalProperties: integer } }),
  baseline: object({ description: text, sha256: hash, sites: list(object({ name: text, latitude, longitude, radius_km: positive, url: text })) }),
  sources: { ...list(object({ id, title: text, provider: text, url: text, role: text, sha256: hash, bytes: { ...integer, minimum: 1 }, license: text, hash_scope: text })), minItems: 1 },
  targets: { ...list(object({ id, name: text, body: { enum: ['moon', 'mars'] }, surface_id: id, latitude, longitude,
    source_ids: { ...list(id), minItems: 1 }, metrics, heights_m: { ...list(positive, 100), minItems: 100 }, limitations: list(text) }), 10), minItems: 2 },
  candidates: { ...list(object({ id, name: text, latitude, longitude, footprint, metrics,
    heights_m: { ...list(positive, 100), minItems: 100 }, comparisons: { type: 'object', additionalProperties: comparison },
    novelty: { enum: ['outside_reference_baseline', 'unresolved'] } }), 5000), minItems: 1 },
  limitations: { ...list(text), minItems: 1 },
});
type Validator = { (value: unknown): boolean };
type Constructor = new (options: object) => { compile(schema: object): Validator };
const Ajv2020 = ((Ajv2020Import as unknown as { default?: Constructor }).default ?? Ajv2020Import) as unknown as Constructor;
const validate = new Ajv2020({ strict: false }).compile(schema);

export function terrainDistance(a: DiscoveryMetrics, b: DiscoveryMetrics, histogramWeight = 0.7): number {
  const distribution = a.slope_histogram.reduce((total, value, index) => total + Math.abs(value - b.slope_histogram[index]), 0) / 2;
  const relief = Math.abs(a.relief_m - b.relief_m) / Math.max(a.relief_m, b.relief_m, 1);
  return histogramWeight * distribution + (1 - histogramWeight) * relief;
}

function ensure(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Earth search data: ${message}`);
}
function safeLink(value: string) {
  const url = new URL(value);
  ensure(url.protocol === 'https:' && !url.username && !url.password, 'source link must use HTTPS.');
}
function checkGrid(record: { metrics: DiscoveryMetrics; heights_m: number[] }) {
  ensure(record.heights_m.every(Number.isFinite), 'non-finite terrain value.');
  ensure(record.metrics.valid_fraction === 1, 'incomplete terrain window.');
  ensure(Math.abs(record.metrics.slope_histogram.reduce((sum, value) => sum + value, 0) - 1) < 1e-6, 'slope distribution must sum to one.');
  ensure(Math.abs(Math.min(...record.heights_m)) < 1e-4 && Math.abs(Math.max(...record.heights_m) - record.metrics.relief_m) < 0.02, 'relative terrain and relief disagree.');
}
function checkRing(points: [number, number][]) {
  ensure(points[0][0] === points.at(-1)![0] && points[0][1] === points.at(-1)![1], 'map footprint is not closed.');
}
const byDistance = (targetId: string, sensitivity: boolean, targets: EarthDiscovery['targets']) => {
  const target = targets.find(item => item.id === targetId)!;
  return (a: DiscoveryCandidate, b: DiscoveryCandidate) => {
    const delta = sensitivity
      ? terrainDistance(a.metrics, target.metrics, 0.5) - terrainDistance(b.metrics, target.metrics, 0.5)
      : a.comparisons[targetId].distance - b.comparisons[targetId].distance;
    return delta || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
};

export function validateEarthDiscovery(value: unknown): EarthDiscovery {
  ensure(validate(value), 'catalog structure is invalid.');
  const data = value as EarthDiscovery;
  ensure(Number.isFinite(Date.parse(data.generated_at)), 'generation date is invalid.');
  for (const records of [data.sources, data.targets, data.candidates]) {
    ensure(new Set(records.map(item => item.id)).size === records.length, 'duplicate record IDs.');
  }
  const sourceIds = new Set(data.sources.map(source => source.id));
  const targetIds = new Set(data.targets.map(target => target.id));
  ensure(data.targets.some(target => target.body === 'moon') && data.targets.some(target => target.body === 'mars'), 'both Moon and Mars targets are required.');
  for (const source of data.sources) safeLink(source.url);
  for (const site of data.baseline.sites) safeLink(site.url);
  checkRing(data.domain.footprint);
  ensure(data.domain.eligible_count === data.candidates.length, 'candidate count disagrees.');
  ensure(data.domain.generated_count === data.domain.eligible_count + data.domain.excluded_count, 'search accounting disagrees.');
  ensure(Object.values(data.domain.exclusion_reasons).reduce((sum, count) => sum + count, 0) === data.domain.excluded_count, 'exclusion accounting disagrees.');
  for (const target of data.targets) {
    ensure(target.source_ids.every(source => sourceIds.has(source)), 'unknown target source.');
    checkGrid(target);
  }
  const xs = data.domain.footprint.map(point => point[0]);
  const ys = data.domain.footprint.map(point => point[1]);
  for (const candidate of data.candidates) {
    checkGrid(candidate);
    checkRing(candidate.footprint);
    ensure(candidate.footprint.every(([x, y]) => x >= Math.min(...xs) - 1e-6 && x <= Math.max(...xs) + 1e-6 && y >= Math.min(...ys) - 1e-6 && y <= Math.max(...ys) + 1e-6), 'candidate lies outside search bounds.');
    ensure(Object.keys(candidate.comparisons).length === targetIds.size && Object.keys(candidate.comparisons).every(id => targetIds.has(id)), 'target comparison is missing or unknown.');
    for (const target of data.targets) {
      ensure(Math.abs(candidate.comparisons[target.id].distance - terrainDistance(candidate.metrics, target.metrics)) < 1e-6, 'distance does not match measured features.');
    }
  }
  for (const target of data.targets) {
    for (const sensitivity of [false, true]) {
      const ordered = [...data.candidates].sort(byDistance(target.id, sensitivity, data.targets));
      ordered.forEach((candidate, index) => ensure(candidate.comparisons[target.id][sensitivity ? 'sensitivity_rank' : 'rank'] === index + 1, 'rank does not match the full candidate cohort.'));
    }
  }
  return data;
}

export async function loadEarthDiscovery(signal?: AbortSignal, path = '/data/earth_discovery.json'): Promise<EarthDiscovery> {
  ensure(path === '/data/earth_discovery.json' || /^\/data\/earth-regions\/[a-z][a-z0-9-]{1,50}\.json$/.test(path), 'unknown survey path.');
  const response = await fetch(path, { signal, redirect: 'error', cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error('Earth search results could not be loaded. Please retry.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > 8 * 1024 * 1024) throw new Error('Earth search data exceeds the loading limit.');
      chunks.push(value);
    }
    signal?.throwIfAborted();
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return validateEarthDiscovery(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
