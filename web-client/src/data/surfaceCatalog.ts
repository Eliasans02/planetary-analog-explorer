import Ajv2020Import from 'ajv/dist/2020';
import schema from '@shared/schemas/surface_catalog.schema.json';
import type { SurfaceCatalog, SurfaceRecord } from '@shared/types/surface-catalog';
import { fetchVerifiedAsset, sha256Hex } from '../terrain/heightfield';

type Validator = { (value: unknown): boolean; errors?: unknown };
type Constructor = new (options: object) => { compile(schema: object): Validator };
const Ajv2020 = ((Ajv2020Import as unknown as { default?: Constructor }).default ?? Ajv2020Import) as unknown as Constructor;
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
export const CATALOG_BYTE_LIMIT = 512 * 1024;
// Bind derived analysis to the exact catalog response, including provenance metadata.
const catalogIdentities = new WeakMap<SurfaceCatalog, string>();
export function getSurfaceCatalogSha256(catalog: SurfaceCatalog): string | undefined {
  return catalogIdentities.get(catalog);
}
const fail = (message: string): never => { throw new Error(message); };

export function safeSurfacePath(path: string): boolean {
  return /^\/assets\/[a-zA-Z0-9_./-]+$/.test(path) && path.slice(1).split('/').every(part => part !== '.' && part !== '..' && part !== '');
}
// The leading slash is the only permitted empty path component.
function assetPath(path: string): boolean { return safeSurfacePath(path); }
export function validateSurfaceCatalog(value: unknown): SurfaceCatalog {
  if (!validate(value)) fail('Surface catalog does not match the source terrain contract.');
  const catalog = value as SurfaceCatalog;
  const sources = new Set(catalog.sources.map(s => s.id));
  if (sources.size !== catalog.sources.length || new Set(catalog.surfaces.map(s => s.id)).size !== catalog.surfaces.length) fail('Duplicate catalog IDs.');
  for (const source of catalog.sources) {
    for (const link of [source.product_url, source.access_url]) {
      let url: URL; try { url = new URL(link); } catch { fail('Invalid source URL.'); }
      if (url!.protocol !== 'https:') fail('Source links must use HTTPS.');
    }
  }
  for (const s of catalog.surfaces) {
    const g = s.grid; const n = g.width * g.height;
    if (s.coordinates.frame !== (s.body === 'moon' ? 'MOON_ME_DE421' : s.body === 'mars' ? 'MARS_HIRISE_PLANETOCENTRIC' : 'NAD83')) fail('Body and coordinate frame disagree.');
    if (s.source_ids.some(id => !sources.has(id))) fail('Unknown source ID.');
    if (g.heights.bytes !== n * 4 || g.valid_mask.bytes !== n || s.stats.total_samples !== n || s.stats.valid_samples < 3 || s.stats.valid_samples > n || (s.stats.direct_return_samples !== null && s.stats.direct_return_samples > n)) fail('Inconsistent grid sample counts.');
    if (g.native_spacing.some(x => x === 0) || ![...g.spacing_m, ...g.native_origin, ...g.native_spacing, g.vertical_zero_m, s.stats.min_source_height_m, s.stats.max_source_height_m, s.stats.relief_m].every(Number.isFinite)) fail('Invalid finite grid metadata.');
    if (s.stats.max_source_height_m < s.stats.min_source_height_m || Math.abs(s.stats.relief_m - (s.stats.max_source_height_m - s.stats.min_source_height_m)) > 0.02) fail('Inconsistent relief statistics.');
    if (s.roi.outline_grid.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > g.width - 1 || y > g.height - 1)) fail('ROI lies outside the grid.');
    for (const a of [g.heights, g.valid_mask, s.provenance]) if (!assetPath(a.path)) fail('Unsafe surface asset path.');
  }
  return catalog;
}

export async function loadSurfaceCatalog(signal: AbortSignal): Promise<SurfaceCatalog> {
  const response = await fetch('/data/surface_catalog.json', { signal, redirect: 'error', cache: 'no-store' });
  if (!response.ok || response.redirected || !response.body) fail('Source terrain catalog is unavailable.');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > CATALOG_BYTE_LIMIT)) { await response.body!.cancel(); fail('Catalog exceeds its byte quota.'); }
  const reader = response.body!.getReader(); const chunks: Uint8Array[] = []; let count = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted(); const { done, value } = await reader.read(); signal.throwIfAborted(); if (done) break;
      count += value.byteLength; if (count > CATALOG_BYTE_LIMIT) fail('Catalog exceeds its byte quota.'); chunks.push(value);
    }
    const bytes = new Uint8Array(count); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const catalog = validateSurfaceCatalog(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    const digest = await sha256Hex(bytes.buffer);
    signal.throwIfAborted();
    catalogIdentities.set(catalog, digest);
    return catalog;
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

export function parseSurfaceBuffers(surface: SurfaceRecord, heightBuffer: ArrayBuffer, maskBuffer: ArrayBuffer): { heights: Float32Array; validMask: Uint8Array } {
  const n = surface.grid.width * surface.grid.height;
  if (heightBuffer.byteLength !== n * 4 || maskBuffer.byteLength !== n) fail('Surface buffers have incorrect lengths.');
  const heights = new Float32Array(n); const validMask = new Uint8Array(maskBuffer); const view = new DataView(heightBuffer); let count = 0; let min = Infinity; let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const h = view.getFloat32(i * 4, true); if (!Number.isFinite(h) || (validMask[i] !== 0 && validMask[i] !== 1)) fail('Surface contains an invalid sample or mask byte.');
    if (validMask[i] === 0 && h !== 0) fail('Invalid surface samples must have zero padding.');
    heights[i] = h; if (validMask[i]) { count++; min = Math.min(min, h + surface.grid.vertical_zero_m); max = Math.max(max, h + surface.grid.vertical_zero_m); }
  }
  if (count !== surface.stats.valid_samples || Math.abs(min - surface.stats.min_source_height_m) > 0.1 || Math.abs(max - surface.stats.max_source_height_m) > 0.1) fail('Measured terrain statistics disagree with catalog.');
  return { heights, validMask };
}

export async function loadSurface(surface: SurfaceRecord, signal: AbortSignal) {
  const controller = new AbortController(); const cancel = () => controller.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
  try {
    const [heights, mask] = await Promise.all([fetchVerifiedAsset(surface.grid.heights, controller.signal, 257 * 257 * 4), fetchVerifiedAsset(surface.grid.valid_mask, controller.signal, 257 * 257)]);
    return parseSurfaceBuffers(surface, heights, mask);
  } finally { controller.abort(); signal.removeEventListener('abort', cancel); }
}

