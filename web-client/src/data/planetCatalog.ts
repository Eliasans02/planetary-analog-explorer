import Ajv2020Import from 'ajv/dist/2020';
import schema from '@shared/schemas/planet_catalog.schema.json';
import type { PlanetCatalog, PlanetTexture } from '@shared/types/planet-catalog';
import { safeSurfacePath } from './surfaceCatalog';
import { fetchVerifiedAsset } from '../terrain/heightfield';

type Validator = { (value: unknown): boolean; errors?: unknown };
type Constructor = new (options: object) => { compile(schema: object): Validator };
const Ajv2020 = ((Ajv2020Import as unknown as { default?: Constructor }).default ?? Ajv2020Import) as unknown as Constructor;
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
export const PLANET_CATALOG_LIMIT = 128 * 1024;
export const PLANET_TEXTURE_LIMIT = 24 * 1024 * 1024;
const fail = (message: string): never => { throw new Error(message); };
function https(link: string) { try { return new URL(link).protocol === 'https:'; } catch { return false; } }
export function validatePlanetCatalog(value: unknown): PlanetCatalog {
  if (!validate(value)) fail('Planet catalog does not match the source imagery contract.');
  const catalog = value as PlanetCatalog;
  if (new Set(catalog.planets.map(p => p.id)).size !== catalog.planets.length) fail('Duplicate planetary bodies.');
  for (const p of catalog.planets) {
    if (!['moon', 'mars'].includes(p.id) || !https(p.source_url)) fail('Invalid body or source URL.');
    const assets = [...p.textures, p.provenance, ...(p.displacement ? [p.displacement.asset] : [])];
    for (const a of assets) if (!safeSurfacePath(a.path) || !/^[a-f0-9]{64}$/.test(a.sha256) || !Number.isSafeInteger(a.bytes) || a.bytes < 1 || a.bytes > PLANET_TEXTURE_LIMIT) fail('Unsafe planetary asset.');
    if (new Set(p.textures.map(t => t.label)).size !== p.textures.length) fail('Duplicate texture resolution.');
    for (const t of p.textures) {
      const width = { '1K': 1024, '2K': 2048, '4K': 4096, 'Native': 1440 }[t.label];
      if (t.width !== width || t.height !== width / 2) fail('Texture dimensions and resolution label disagree.');
      if (t.label === 'Native' && p.id !== 'mars') fail('Native texture label is reserved for the supplied Mars source.');
    }
    if (p.displacement && (!https(p.displacement.source_url) || !Number.isFinite(p.displacement.radius_m) || p.displacement.radius_m <= 0 || p.displacement.width * p.displacement.height * 4 !== p.displacement.asset.bytes)) fail('Invalid global elevation metadata.');
  }
  return catalog;
}
export async function loadPlanetCatalog(signal: AbortSignal): Promise<PlanetCatalog> {
  const response = await fetch('/data/planet_catalog.json', { signal, redirect: 'error', cache: 'no-store' });
  if (!response.ok || response.redirected || !response.body) fail('Planet catalog unavailable.');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > PLANET_CATALOG_LIMIT)) { await response.body!.cancel(); fail('Planet catalog exceeds byte quota.'); }
  const reader = response.body!.getReader(); const chunks: Uint8Array[] = []; let count = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) { signal.throwIfAborted(); const result = await reader.read(); signal.throwIfAborted(); if (result.done) break; count += result.value.byteLength; if (count > PLANET_CATALOG_LIMIT) fail('Planet catalog exceeds byte quota.'); chunks.push(result.value); }
    const bytes = new Uint8Array(count); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return validatePlanetCatalog(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
/** Allow only bounded, eight-bit RGB/RGBA PNG or RGB JPEG texture payloads. */
export function planetImageDimensions(buffer: ArrayBuffer): [number, number] {
  const a = new Uint8Array(buffer); const v = new DataView(buffer);
  if (a.length >= 33 && [137,80,78,71,13,10,26,10].every((n, i) => a[i] === n)) {
    if (a[24] !== 8 || ![2, 6].includes(a[25])) fail('Expected eight-bit RGB planetary imagery.');
    return [v.getUint32(16), v.getUint32(20)];
  }
  if (a[0] === 255 && a[1] === 216) {
    let i = 2;
    while (i + 4 < a.length) {
      if (a[i++] !== 255) break; while (a[i] === 255) i++;
      const marker = a[i++]; if (marker === 217 || marker === 218) break;
      if (i + 2 > a.length) break; const length = v.getUint16(i);
      if (length < 2 || i + length > a.length) break;
      if ([192,193,194].includes(marker)) { if (length < 8 || a[i + 2] !== 8 || a[i + 7] !== 3) fail('Expected eight-bit RGB planetary imagery.'); return [v.getUint16(i + 5), v.getUint16(i + 3)]; }
      i += length;
    }
  }
  return fail('Unsupported or invalid planetary image.');
}
/** Decodes verified imagery and enforces declared dimensions before it reaches the GPU. */
export async function loadPlanetTexture(texture: PlanetTexture, signal: AbortSignal): Promise<ImageBitmap> {
  const bytes = await fetchVerifiedAsset(texture, signal, PLANET_TEXTURE_LIMIT);
  const [width, height] = planetImageDimensions(bytes);
  if (width !== texture.width || height !== texture.height) fail('Planet image dimensions do not match the catalog.');
  const bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'flipY' });
  if (bitmap.width !== texture.width || bitmap.height !== texture.height) { bitmap.close(); fail('Planet image dimensions do not match the catalog.'); }
  if (signal.aborted) { bitmap.close(); signal.throwIfAborted(); } return bitmap;
}
