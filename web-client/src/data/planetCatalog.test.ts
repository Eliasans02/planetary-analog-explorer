// TEST_ONLY metadata and image headers. Never shipped as planetary source data.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanetCatalog } from '@shared/types/planet-catalog';
import { loadPlanetCatalog, PLANET_CATALOG_LIMIT, planetImageDimensions, validatePlanetCatalog } from './planetCatalog';
function fixture(): PlanetCatalog { return { schema_version: '1.0.0', generated_at: 'TEST_ONLY', planets: [{ id: 'moon', name: 'TEST_ONLY', textures: [{ path: '/assets/planets/test_only.png', bytes: 40, sha256: '0'.repeat(64), label: '1K', width: 1024, height: 512 }], projection: 'equirectangular', longitude_center_deg: 0, source_url: 'https://example.org/test_only', source_credit: 'TEST_ONLY', source_sha256: '0'.repeat(64), provenance: { path: '/assets/planets/test_only.json', bytes: 2, sha256: '0'.repeat(64) }, limitations: ['TEST_ONLY'], displacement: null }] }; }
afterEach(() => vi.unstubAllGlobals());
describe('planet catalog trust boundary', () => {
  it('accepts the native Mars texture and rejects a false native resolution', () => {
    const c=fixture(); c.planets[0].id='mars';
    Object.assign(c.planets[0].textures[0],{label:'Native',width:1440,height:720});
    expect(validatePlanetCatalog(c).planets[0].textures[0].width).toBe(1440);
    c.planets[0].textures[0].width=4096; c.planets[0].textures[0].height=2048;
    expect(() => validatePlanetCatalog(c)).toThrow();
  });
  it('does not offer an upscaled Mars asset or reuse its native label on the Moon', () => {
    const c=fixture(); c.planets[0].id='mars';
    Object.assign(c.planets[0].textures[0],{label:'4K',width:4096,height:2048});
    expect(() => validatePlanetCatalog(c)).toThrow();
    c.planets[0].id='moon'; Object.assign(c.planets[0].textures[0],{label:'Native',width:1440,height:720});
    expect(() => validatePlanetCatalog(c)).toThrow();
  });
  it('accepts bounded, source-declared planetary metadata', () => expect(validatePlanetCatalog(fixture()).planets[0].id).toBe('moon'));
  it.each(['body', 'url', 'path', 'hash', 'dimensions', 'budget', 'duplicate', 'nonfinite'])('rejects corrupt %s', kind => { const c = fixture(), p = c.planets[0]; if (kind === 'body') (p as { id: string }).id = 'earth'; if (kind === 'url') p.source_url = 'http://example.org'; if (kind === 'path') p.textures[0].path = '/assets/planets/../x.png'; if (kind === 'hash') p.source_sha256 = 'invalid'; if (kind === 'dimensions') p.textures[0].height = 1024; if (kind === 'budget') p.textures[0].bytes = 25 * 1024 * 1024; if (kind === 'duplicate') c.planets.push(p); if (kind === 'nonfinite') p.textures[0].width = Infinity; expect(() => validatePlanetCatalog(c)).toThrow(); });
  it('rejects a streamed catalog exceeding the quota', async () => { vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(PLANET_CATALOG_LIMIT + 1)))); await expect(loadPlanetCatalog(new AbortController().signal)).rejects.toThrow('quota'); });
  it('reads RGB PNG dimensions and rejects grayscale or unknown payloads', () => { const a = new Uint8Array(33); a.set([137,80,78,71,13,10,26,10]); const v = new DataView(a.buffer); v.setUint32(16,1024); v.setUint32(20,512); a[24] = 8; a[25] = 2; expect(planetImageDimensions(a.buffer)).toEqual([1024,512]); a[25] = 0; expect(() => planetImageDimensions(a.buffer)).toThrow('RGB'); expect(() => planetImageDimensions(new ArrayBuffer(0))).toThrow(); });
});
