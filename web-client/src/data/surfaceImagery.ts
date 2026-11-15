import Ajv2020Import from 'ajv/dist/2020';
import schema from '@shared/schemas/surface_imagery.schema.json';
import type { SurfaceCatalog } from '@shared/types/surface-catalog';
import type { SurfaceImageryCatalog, SurfaceImageryLayer } from '@shared/types/surface-imagery';
import { safeSurfacePath } from './surfaceCatalog';
import { fetchVerifiedAsset } from '../terrain/heightfield';

type Validator = { (value: unknown): boolean; errors?: unknown };
type Constructor = new (options: object) => { compile(schema: object): Validator };
const Ajv2020 = ((Ajv2020Import as unknown as { default?: Constructor }).default ?? Ajv2020Import) as unknown as Constructor;
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
export const SURFACE_IMAGERY_JSON_LIMIT = 1024 * 1024;
export const SURFACE_IMAGERY_IMAGE_LIMIT = 4 * 1024 * 1024;
export const SURFACE_IMAGERY_PROVENANCE_LIMIT = 1024 * 1024;
const fail = (message: string): never => { throw new Error(message); };
function https(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
function validLayer(layer: SurfaceImageryLayer): void {
  if (!https(layer.source_url)) fail('Imagery source URL must use HTTPS.');
  for (const [asset, limit] of [[layer.image, SURFACE_IMAGERY_IMAGE_LIMIT], [layer.provenance, SURFACE_IMAGERY_PROVENANCE_LIMIT]] as const) {
    if (!safeSurfacePath(asset.path) || !/^[a-f0-9]{64}$/.test(asset.sha256)
        || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > limit) fail('Unsafe or oversized imagery asset.');
  }
  if (!layer.image.path.endsWith('.png') || !layer.provenance.path.endsWith('.json')) fail('Expected PNG imagery and JSON provenance.');
  if (![layer.image.width, layer.image.height].every(v => Number.isSafeInteger(v) && v >= 1 && v <= 257)) fail('Imagery dimensions exceed the native grid.');
  if ((layer.id === 'orbital-color' && (layer.registration !== 'approximate_global_mosaic' || layer.color_mode !== 'global_display_mosaic'))
      || (layer.id === 'local-ortho' && (layer.registration !== 'projected_ortho' || layer.color_mode === 'global_display_mosaic'))) fail('Imagery layer mode and registration disagree.');
}

export function validateSurfaceImageryCatalog(value: unknown, catalog: SurfaceCatalog, catalogSha256: string): SurfaceImageryCatalog {
  if (!validate(value)) fail('Surface imagery does not match its source contract.');
  const imagery = value as SurfaceImageryCatalog;
  if (!/^[a-f0-9]{64}$/.test(catalogSha256) || imagery.catalog_sha256 !== catalogSha256) fail('Surface imagery is bound to a different catalog.');
  const surfaces = new Map(catalog.surfaces.map(s => [s.id, s]));
  const expected = catalog.surfaces.filter(s => s.body === 'moon' || s.body === 'mars');
  if (imagery.records.length !== expected.length || new Set(imagery.records.map(r => r.surface_id)).size !== imagery.records.length) fail('Missing or duplicate surface imagery records.');
  for (const record of imagery.records) {
    const surface = surfaces.get(record.surface_id);
    if (!surface || !['moon', 'mars'].includes(surface.body)) fail('Unknown imagery surface or unsupported body.');
    const grid = surface!.grid, input = record.inputs;
    if (input.heights_sha256 !== grid.heights.sha256 || input.valid_mask_sha256 !== grid.valid_mask.sha256
        || input.width !== grid.width || input.height !== grid.height || input.native_crs_wkt !== grid.native_crs_wkt
        || input.native_origin.some((v, i) => !Number.isFinite(v) || v !== grid.native_origin[i])
        || input.native_spacing.some((v, i) => !Number.isFinite(v) || v === 0 || v !== grid.native_spacing[i])) fail('Stale imagery grid inputs.');
    if (record.layers[0].id !== 'orbital-color' || new Set(record.layers.map(l => l.id)).size !== record.layers.length) fail('Missing orbital imagery or duplicate imagery layer IDs.');
    for (const layer of record.layers) {
      validLayer(layer);
      if (layer.image.width !== grid.width || layer.image.height !== grid.height) fail('Imagery dimensions disagree with the native grid.');
    }
  }
  return imagery;
}

export async function loadSurfaceImageryCatalog(catalog: SurfaceCatalog, catalogSha256: string, signal: AbortSignal): Promise<SurfaceImageryCatalog> {
  signal.throwIfAborted();
  const response = await fetch('/data/surface_imagery.json', { signal, redirect: 'error', cache: 'no-store' });
  if (!response.ok || response.redirected || !response.body) fail('Surface imagery catalog is unavailable.');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > SURFACE_IMAGERY_JSON_LIMIT)) {
    await response.body!.cancel(); fail('Surface imagery catalog exceeds its byte quota.');
  }
  const reader = response.body!.getReader(), chunks: Uint8Array[] = []; let count = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted(); const result = await reader.read(); signal.throwIfAborted(); if (result.done) break;
      count += result.value.byteLength; if (count > SURFACE_IMAGERY_JSON_LIMIT) fail('Surface imagery catalog exceeds its byte quota.');
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(count); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return validateSurfaceImageryCatalog(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), catalog, catalogSha256);
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

/** RGB8 PNG only; check IHDR before allocating a decoded image. */
function pngDimensions(bytes: ArrayBuffer): [number, number] {
  const data = new Uint8Array(bytes), view = new DataView(bytes);
  if (data.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => data[i] === v)
      || view.getUint32(8) !== 13 || String.fromCharCode(...data.slice(12, 16)) !== 'IHDR'
      || data[24] !== 8 || data[25] !== 2 || data[26] !== 0 || data[27] !== 0 || ![0, 1].includes(data[28])) fail('Expected valid eight-bit RGB PNG surface imagery.');
  return [view.getUint32(16), view.getUint32(20)];
}

/** Caller owns and must close the returned bitmap. Raster row zero remains image row zero. */
export async function loadSurfaceImageryLayer(layer: SurfaceImageryLayer, signal: AbortSignal): Promise<ImageBitmap> {
  signal.throwIfAborted();
  validLayer(layer);
  const bytes = await fetchVerifiedAsset(layer.image, signal, SURFACE_IMAGERY_IMAGE_LIMIT);
  signal.throwIfAborted();
  const [width, height] = pngDimensions(bytes);
  if (width !== layer.image.width || height !== layer.image.height) fail('PNG dimensions disagree with the imagery catalog.');
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
    imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
  });
  if (signal.aborted) { bitmap.close(); signal.throwIfAborted(); }
  if (bitmap.width !== width || bitmap.height !== height) { bitmap.close(); fail('Decoded imagery dimensions disagree with the native grid.'); }
  return bitmap;
}
