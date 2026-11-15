import type { SurfaceCatalog } from '@shared/types/surface-catalog';
import type { SurfaceAnalysisCatalog } from '@shared/types/surface-analysis';
import { safeDataPath } from './surfaceCatalog';

export const ANALYSIS_BYTE_LIMIT = 1024 * 1024;
const fail = (reason: string): never => { throw new Error(`Prepared analysis unavailable: ${reason}`); };
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function object(value: unknown, keys: string[]): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail('invalid analysis structure.');
  return value as Record<string, any>;
}
const integer = (v: unknown, max = 257 * 257): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max;
const number = (v: unknown, max = Number.MAX_VALUE): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const https = (v: unknown) => { try { return typeof v === 'string' && new URL(v).protocol === 'https:'; } catch { return false; } };

/** Reject stale inputs and internally inconsistent summaries before any metric reaches the UI. */
export function validateSurfaceAnalysis(value: unknown, catalog: SurfaceCatalog, catalogSha256: string): SurfaceAnalysisCatalog {
  const a = object(value, ['schema_version', 'generated_at', 'catalog_sha256', 'method', 'surfaces']);
  if (a.schema_version !== '1.0.0' || typeof a.generated_at !== 'string' || !Number.isFinite(Date.parse(a.generated_at)) || !hash(a.catalog_sha256) || !hash(catalogSha256) || a.catalog_sha256 !== catalogSha256) fail('catalog checksum is stale or invalid.');
  const method = object(a.method, ['id', 'references']);
  if (method.id !== 'horn_3x3_v1' || !Array.isArray(method.references) || !method.references.length || method.references.length > 12 || !method.references.every(https)) fail('invalid method references.');
  if (!Array.isArray(a.surfaces) || a.surfaces.length > 128 || a.surfaces.length !== catalog.surfaces.length) fail('incomplete analysis catalog.');
  const ids = new Set<string>();
  for (const raw of a.surfaces) {
    const r = object(raw, ['surface_id', 'inputs', 'coverage', 'metrics', 'slope_histogram', 'limitations']);
    const s = catalog.surfaces.find(s => s.id === r.surface_id) ?? fail('unknown surface.');
    if (ids.has(r.surface_id)) fail('unknown or duplicate surface.'); ids.add(r.surface_id);
    const i = object(r.inputs, ['heights_sha256', 'valid_mask_sha256', 'width', 'height', 'spacing_m']);
    if (!hash(i.heights_sha256) || !hash(i.valid_mask_sha256) || i.heights_sha256 !== s.grid.heights.sha256 || i.valid_mask_sha256 !== s.grid.valid_mask.sha256 || i.width !== s.grid.width || i.height !== s.grid.height || !Array.isArray(i.spacing_m) || i.spacing_m.length !== 2 || i.spacing_m.some((n: unknown, x: number) => !number(n) || n === 0 || n !== s.grid.spacing_m[x])) fail('source inputs are stale.');
    const c = object(r.coverage, ['valid_height_samples', 'total_samples', 'analyzed_centers', 'possible_interior_centers']);
    const possible = Math.max(0, i.width - 2) * Math.max(0, i.height - 2);
    if (!Object.values(c).every(v => integer(v)) || c.total_samples !== i.width * i.height || c.valid_height_samples !== s.stats.valid_samples || c.possible_interior_centers !== possible || c.analyzed_centers > possible || c.analyzed_centers > c.valid_height_samples) fail('inconsistent coverage counts.');
    const m = object(r.metrics, ['relief_m', 'mean_slope_deg', 'p95_slope_deg', 'max_slope_deg', 'mean_roughness_m', 'max_roughness_m', 'mean_tri_m']);
    if (!number(m.relief_m) || Math.abs(m.relief_m - s.stats.relief_m) > .02) fail('inconsistent relief.');
    for (const key of ['mean_slope_deg', 'p95_slope_deg', 'max_slope_deg', 'mean_roughness_m', 'max_roughness_m', 'mean_tri_m']) {
      if (c.analyzed_centers === 0 ? m[key] !== null : !number(m[key], key.includes('slope') ? 90 : Number.MAX_VALUE)) fail('invalid or missing metric.');
    }
    if (c.analyzed_centers && (m.mean_slope_deg > m.max_slope_deg || m.p95_slope_deg > m.max_slope_deg || m.mean_roughness_m > m.max_roughness_m || m.max_roughness_m > m.relief_m + .02 || m.mean_tri_m > Math.sqrt(8) * m.relief_m + .02)) fail('inconsistent metric bounds.');
    if (!Array.isArray(r.slope_histogram) || r.slope_histogram.length !== 5 || r.slope_histogram.some((b: any, index: number) => b?.min_deg !== [0,5,10,20,30][index] || b?.max_deg !== [5,10,20,30,90][index])) fail('invalid slope bins.');
    let end = 0, samples = 0, fractions = 0;
    for (const rawBin of r.slope_histogram) {
      const b = object(rawBin, ['min_deg', 'max_deg', 'samples', 'fraction_pct']);
      if (!number(b.min_deg, 90) || !number(b.max_deg, 90) || b.min_deg !== end || b.max_deg <= b.min_deg || !integer(b.samples) || b.samples > c.analyzed_centers || (c.analyzed_centers === 0 ? b.fraction_pct !== null : !number(b.fraction_pct, 100) || Math.abs(b.fraction_pct - b.samples / c.analyzed_centers * 100) > .011)) fail('inconsistent slope bins.');
      end = b.max_deg; samples += b.samples; fractions += b.fraction_pct ?? 0;
    }
    if (end !== 90 || samples !== c.analyzed_centers || (c.analyzed_centers > 0 && Math.abs(fractions - 100) > .011 * r.slope_histogram.length)) fail('incomplete slope distribution.');
    if (c.analyzed_centers > 0) {
      const occupied = r.slope_histogram.filter((b: any) => b.samples > 0);
      const highest = occupied[occupied.length - 1];
      const lower = r.slope_histogram.reduce((sum: number, b: any) => sum + b.min_deg * b.samples, 0) / c.analyzed_centers;
      const upper = r.slope_histogram.reduce((sum: number, b: any) => sum + b.max_deg * b.samples, 0) / c.analyzed_centers;
      if (m.max_slope_deg < highest.min_deg - 1e-8 || m.max_slope_deg > highest.max_deg + 1e-8 || (highest.max_deg !== 90 && m.max_slope_deg >= highest.max_deg) || m.mean_slope_deg < lower - 1e-8 || m.mean_slope_deg > upper + 1e-8) fail('slope metrics disagree with distribution.');
    }
    if (!Array.isArray(r.limitations) || !r.limitations.length || r.limitations.length > 32 || r.limitations.some((v: unknown) => typeof v !== 'string' || !v.length || v.length > 2000)) fail('missing analysis limitations.');
  }
  return value as SurfaceAnalysisCatalog;
}

export async function loadSurfaceAnalysis(catalog: SurfaceCatalog, catalogSha256: string, signal: AbortSignal, path = '/data/surface_analysis.json'): Promise<SurfaceAnalysisCatalog> {
  if (!safeDataPath(path)) fail('unsafe analysis path.');
  const response = await fetch(path, { signal, redirect: 'error', cache: 'no-store' });
  if (!response.ok || response.redirected || !response.body) fail('local analysis file could not be opened.');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > ANALYSIS_BYTE_LIMIT)) { await response.body!.cancel(); fail('analysis exceeds its byte quota.'); }
  const reader = response.body!.getReader(), chunks: Uint8Array[] = []; let count = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) { signal.throwIfAborted(); const { done, value } = await reader.read(); signal.throwIfAborted(); if (done) break; count += value.byteLength; if (count > ANALYSIS_BYTE_LIMIT) fail('analysis exceeds its byte quota.'); chunks.push(value); }
    const bytes = new Uint8Array(count); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return validateSurfaceAnalysis(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), catalog, catalogSha256);
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
