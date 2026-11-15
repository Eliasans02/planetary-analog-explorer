// TEST_ONLY mathematical fixture. This catalog is never shipped as source terrain.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SurfaceCatalog } from '@shared/types/surface-catalog';
import { CATALOG_BYTE_LIMIT, getSurfaceCatalogSha256, loadSurface, loadSurfaceCatalog, parseSurfaceBuffers, safeSurfacePath, validateSurfaceCatalog } from './surfaceCatalog';
import { sha256Hex } from '../terrain/heightfield';

function fixture(): SurfaceCatalog {
  const asset = (path: string, bytes: number) => ({ path: `/assets/test_only/${path}`, bytes, sha256: '0'.repeat(64) });
  return { schema_version: '1.0.0', generated_at: 'test', sources: [{ id: 'test', provider: 'TEST_ONLY', product: 'TEST_ONLY', product_url: 'https://example.org/product', access_url: 'https://example.org/data', retrieved_at: 'test', sha256: '0'.repeat(64), license: 'TEST_ONLY', local_path: '/assets/test_only/source.json' }], surfaces: [{ id: 'test', name: 'TEST_ONLY', body: 'moon', description: 'TEST_ONLY', coordinates: { latitude_deg: 0, longitude_deg: 0, frame: 'MOON_ME_DE421', provenance: 'TEST_ONLY' }, source_ids: ['test'], grid: { width: 2, height: 2, spacing_m: [1, 1], display_frame: 'native_projected_relief', horizontal_method: 'TEST_ONLY', heights: asset('height.bin', 16), valid_mask: asset('mask.bin', 4), vertical_zero_m: 100, vertical_datum: null, vertical_datum_status: 'unverified', native_crs_wkt: 'TEST_ONLY', native_origin: [0, 0], native_spacing: [1, -1], native_units: 'm' }, stats: { min_source_height_m: 100, max_source_height_m: 103, relief_m: 3, valid_samples: 4, total_samples: 4, direct_return_samples: null }, roi: { label: 'TEST_ONLY', kind: 'project_selected_window', outline_grid: [[0, 0], [1, 0], [1, 1], [0, 1]], source_record: null }, limitations: ['TEST_ONLY'], provenance: asset('provenance.json', 2) }] };
}
function heights(values = [0, 1, 2, 3]) { const out = new ArrayBuffer(values.length * 4); const v = new DataView(out); values.forEach((n, i) => v.setFloat32(i * 4, n, true)); return out; }
afterEach(() => vi.unstubAllGlobals());
describe('source terrain contract', () => {
  it('accepts Mars only under the versioned product-specific native frame contract', () => {
    const c = fixture(); c.schema_version = '1.1.0'; c.surfaces[0].body = 'mars'; c.surfaces[0].coordinates.frame = 'MARS_HIRISE_PLANETOCENTRIC';
    expect(validateSurfaceCatalog(c).surfaces[0].body).toBe('mars');
    c.schema_version = '1.0.0'; expect(() => validateSurfaceCatalog(c)).toThrow();
    c.schema_version = '1.1.0'; c.surfaces[0].coordinates.frame = 'MOON_ME_DE421'; expect(() => validateSurfaceCatalog(c)).toThrow('frame');
  });
  it('accepts the strict test contract and decodes little-endian offsets', () => { const c = validateSurfaceCatalog(fixture()); expect(Array.from(parseSurfaceBuffers(c.surfaces[0], heights(), new Uint8Array([1, 1, 1, 1]).buffer).heights)).toEqual([0, 1, 2, 3]); });
  it.each(['unknown-field', 'frame', 'source', 'counts', 'spacing', 'roi', 'traversal', 'oversize'])('rejects corrupt metadata: %s', kind => {
    const c = fixture(); const s = c.surfaces[0];
    if (kind === 'unknown-field') Object.assign(c, { extra: true });
    if (kind === 'frame') s.coordinates.frame = 'NAD83';
    if (kind === 'source') s.source_ids = ['missing'];
    if (kind === 'counts') s.stats.total_samples = 99;
    if (kind === 'spacing') s.grid.spacing_m[0] = 0;
    if (kind === 'roi') s.roi.outline_grid[0] = [-1, 0];
    if (kind === 'traversal') s.grid.heights.path = '/assets/../secret.bin';
    if (kind === 'oversize') s.grid.width = 258;
    expect(() => validateSurfaceCatalog(c)).toThrow();
  });
  it('rejects encoded and literal path traversal', () => { for (const path of ['/assets/../x', '/assets/%2e%2e/x', '//assets/x', '/assets/a//x', '/assets/a/./x']) expect(safeSurfacePath(path)).toBe(false); expect(safeSurfacePath('/assets/surfaces/a.bin')).toBe(true); });
  it('rejects masks, nonfinite samples, truncation, and false statistics', () => {
    const s = fixture().surfaces[0]; expect(() => parseSurfaceBuffers(s, heights(), new Uint8Array([1, 2, 1, 1]).buffer)).toThrow();
    expect(() => parseSurfaceBuffers(s, heights([0, NaN, 2, 3]), new Uint8Array([1, 1, 1, 1]).buffer)).toThrow();
    expect(() => parseSurfaceBuffers(s, heights([0]), new Uint8Array([1]).buffer)).toThrow();
    expect(() => parseSurfaceBuffers(s, heights([0, 1, 2, 30]), new Uint8Array([1, 1, 1, 1]).buffer)).toThrow();
  });
  it('rejects an oversized streaming catalog without trusting content-length', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(CATALOG_BYTE_LIMIT + 1))));
    await expect(loadSurfaceCatalog(new AbortController().signal)).rejects.toThrow('quota');
  });
  it('binds loaded catalogs to exact response bytes, without granting an identity to unverified objects', async () => {
    const body = JSON.stringify(fixture(), null, 2) + '\n';
    const bytes = new TextEncoder().encode(body);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
    const loaded = await loadSurfaceCatalog(new AbortController().signal);
    expect(getSurfaceCatalogSha256(loaded)).toBe(await sha256Hex(bytes.buffer));
    expect(getSurfaceCatalogSha256(validateSurfaceCatalog(fixture()))).toBeUndefined();
    expect(getSurfaceCatalogSha256({ ...loaded })).toBeUndefined();
    expect(getSurfaceCatalogSha256(loaded)).not.toBe(await sha256Hex(new TextEncoder().encode(JSON.stringify(loaded)).buffer));
  });
  it('rejects nonzero padding at invalid samples', () => {
    const s = fixture().surfaces[0]; s.stats.valid_samples = 3;
    expect(() => parseSurfaceBuffers(s, heights([0, 7, 2, 3]), new Uint8Array([1, 0, 1, 1]).buffer)).toThrow('zero padding');
    expect(Array.from(parseSurfaceBuffers(s, heights([0, 0, 2, 3]), new Uint8Array([1, 0, 1, 1]).buffer).heights)).toEqual([0, 0, 2, 3]);
  });
  it('verifies asset hashes and rejects modified terrain bytes', async () => {
    const s = fixture().surfaces[0]; const h = heights(); const mask = new Uint8Array([1, 1, 1, 1]).buffer;
    s.grid.heights.sha256 = await sha256Hex(h); s.grid.valid_mask.sha256 = await sha256Hex(mask);
    vi.stubGlobal('window', { location: { href: 'https://example.org/' } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(url.includes('height') ? heights([0, 1, 2, 4]) : mask)));
    await expect(loadSurface(s, new AbortController().signal)).rejects.toThrow('checksum');
  });
});
