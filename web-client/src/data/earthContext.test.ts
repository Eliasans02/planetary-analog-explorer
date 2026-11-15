import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import manifest from '../../public/assets/earth-context/manifest.json';
import { loadEarthContext, validateEarthContextManifest } from './earthContext';
import { planetImageDimensions } from './planetCatalog';

const imageBytes = readFileSync(new URL('../../public/assets/earth-context/blue-marble-2048.jpg', import.meta.url));
const detailBytes = readFileSync(new URL('../../public/assets/earth-context/blue-marble-5400.jpg', import.meta.url));
afterEach(() => vi.unstubAllGlobals());

describe('NASA Earth context imagery', () => {
  it('binds the shipped image to its dimensions and exact source identity', () => {
    const source = validateEarthContextManifest(manifest);
    expect(imageBytes.length).toBe(source.texture.bytes);
    expect(createHash('sha256').update(imageBytes).digest('hex')).toBe(source.texture.sha256);
    expect(planetImageDimensions(new Uint8Array(imageBytes).buffer)).toEqual([2048, 1024]);
    expect(detailBytes.length).toBe(source.detail_texture.bytes);
    expect(createHash('sha256').update(detailBytes).digest('hex')).toBe(source.detail_texture.sha256);
    expect(source.detail_texture.sha256).toBe(source.source_sha256);
    expect(source.detail_texture.bytes).toBe(source.source_bytes);
    expect(planetImageDimensions(new Uint8Array(detailBytes).buffer)).toEqual([5400, 2700]);
    expect(source.title).toContain('August 2004');
  });
  it('rejects unexpected paths, source origins, dimensions, and excessive allocation', () => {
    for (const change of [
      { texture: { ...manifest.texture, url: 'https://example.org/image.jpg' } },
      { texture: { ...manifest.texture, width: 8192 } },
      { texture: { ...manifest.texture, bytes: 3 * 1024 * 1024 } },
      { detail_texture: { ...manifest.detail_texture, url: '/assets/earth-context/other.jpg' } },
      { detail_texture: { ...manifest.detail_texture, width: 4096 } },
      { detail_texture: { ...manifest.detail_texture, bytes: 4 * 1024 * 1024 + 1 } },
      { detail_texture: { ...manifest.detail_texture, sha256: 'd'.repeat(64) } },
      { source_page: 'https://nasa.gov.example.org/' },
      { source_sha256: 'invalid' },
    ]) expect(() => validateEarthContextManifest({ ...manifest, ...change })).toThrow('metadata');
  });
  it('verifies the image before decoding with the globe texture orientation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(imageBytes))));
    const bitmap = { width: 2048, height: 1024, close: vi.fn() };
    const decode = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal('createImageBitmap', decode);
    const result = await loadEarthContext(new AbortController().signal);
    expect(result.bitmap).toBe(bitmap);
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'flipY' });
    const corrupted = new Uint8Array(imageBytes); corrupted[100] ^= 1;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(corrupted)));
    await expect(loadEarthContext(new AbortController().signal)).rejects.toThrow(/SHA|integrity/i);
    expect(decode).toHaveBeenCalledTimes(1);
  });
  it('loads the allowlisted original-resolution detail image on request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(detailBytes))));
    const bitmap = { width: 5400, height: 2700, close: vi.fn() };
    const decode = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal('createImageBitmap', decode);
    const result = await loadEarthContext(new AbortController().signal, 'detail');
    expect(result.bitmap).toBe(bitmap);
    expect(result.manifest.detail_texture.url).toBe('/assets/earth-context/blue-marble-5400.jpg');
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'flipY' });
  });
});
