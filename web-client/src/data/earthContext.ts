import earthManifest from '../../public/assets/earth-context/manifest.json';
import { loadPlanetTexture } from './planetCatalog';

export interface EarthContextManifest {
  schema_version: '1.0.0';
  title: string;
  credit: string;
  source_url: string;
  source_page: string;
  source_sha256: string;
  source_bytes: number;
  source_width: number;
  source_height: number;
  texture: { url: string; sha256: string; bytes: number; width: number; height: number };
  detail_texture: { url: string; sha256: string; bytes: number; width: number; height: number };
  disclaimer: string;
}

export type EarthContextQuality = 'overview' | 'detail';

export function validateEarthContextManifest(value: unknown): EarthContextManifest {
  const manifest = value as EarthContextManifest;
  const invalid = (): never => { throw new Error('Earth context source metadata is invalid.'); };
  if (!manifest || typeof manifest !== 'object' || manifest.schema_version !== '1.0.0') invalid();
  for (const field of ['title', 'credit', 'disclaimer'] as const) {
    if (typeof manifest[field] !== 'string' || !manifest[field].trim() || manifest[field].length > 2000) invalid();
  }
  for (const link of [manifest.source_url, manifest.source_page]) {
    try {
      const url = new URL(link);
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.nasa.gov') || url.username || url.password) invalid();
    } catch { invalid(); }
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.source_sha256) || !Number.isSafeInteger(manifest.source_bytes)
      || manifest.source_bytes < 1 || manifest.source_width !== 5400 || manifest.source_height !== 2700) invalid();
  const texture = manifest.texture;
  if (!texture || texture.url !== '/assets/earth-context/blue-marble-2048.jpg'
      || !/^[a-f0-9]{64}$/.test(texture.sha256) || !Number.isSafeInteger(texture.bytes)
      || texture.bytes < 1 || texture.bytes > 2 * 1024 * 1024
      || texture.width !== 2048 || texture.height !== 1024) invalid();
  const detail = manifest.detail_texture;
  if (!detail || Object.keys(detail).sort().join(',') !== 'bytes,height,sha256,url,width'
      || detail.url !== '/assets/earth-context/blue-marble-5400.jpg'
      || !/^[a-f0-9]{64}$/.test(detail.sha256) || !Number.isSafeInteger(detail.bytes)
      || detail.bytes < 1 || detail.bytes > 4 * 1024 * 1024
      || detail.width !== 5400 || detail.height !== 2700
      || detail.sha256 !== manifest.source_sha256 || detail.bytes !== manifest.source_bytes) invalid();
  return manifest;
}

export async function loadEarthContext(signal: AbortSignal, quality: EarthContextQuality = 'overview') {
  const manifest = validateEarthContextManifest(earthManifest);
  const texture = quality === 'detail' ? manifest.detail_texture : manifest.texture;
  const bitmap = await loadPlanetTexture({
    path: texture.url,
    sha256: texture.sha256,
    bytes: texture.bytes,
    width: texture.width,
    height: texture.height,
    label: quality === 'detail' ? 'Native' : '2K',
  }, signal);
  return { manifest, bitmap };
}
