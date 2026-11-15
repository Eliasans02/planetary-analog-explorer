// TEST_ONLY headers and metadata exercise the loader boundary; no fixture is published as source imagery.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { SurfaceCatalog } from '@shared/types/surface-catalog';
import type { SurfaceImageryCatalog, SurfaceImageryLayer } from '@shared/types/surface-imagery';
import { sha256Hex } from '../terrain/heightfield';
import { loadSurfaceImageryCatalog, loadSurfaceImageryLayer, SURFACE_IMAGERY_JSON_LIMIT, validateSurfaceImageryCatalog } from './surfaceImagery';

function fixture() {
  const catalog = JSON.parse(readFileSync(new URL('../../public/data/surface_catalog.json', import.meta.url), 'utf8')) as SurfaceCatalog;
  catalog.surfaces = [catalog.surfaces[0]];
  const s = catalog.surfaces[0], g = s.grid, hash = 'a'.repeat(64);
  const layer: SurfaceImageryLayer = {
    id: 'orbital-color', label: 'TEST_ONLY mosaic', color_mode: 'global_display_mosaic', registration: 'approximate_global_mosaic',
    source_url: 'https://example.org/test-only', image: { path: '/assets/test_only/image.png', sha256: '0'.repeat(64), bytes: 33, width: g.width, height: g.height },
    provenance: { path: '/assets/test_only/source.json', sha256: '0'.repeat(64), bytes: 2 }, limitations: ['TEST_ONLY approximate mosaic'],
  };
  const imagery: SurfaceImageryCatalog = { schema_version: '1.0.0', generated_at: '2026-11-14T00:00:00Z', catalog_sha256: hash,
    records: [{ surface_id: s.id, inputs: { heights_sha256: g.heights.sha256, valid_mask_sha256: g.valid_mask.sha256,
      width: g.width, height: g.height, native_origin: [...g.native_origin], native_spacing: [...g.native_spacing], native_crs_wkt: g.native_crs_wkt }, layers: [layer] }] };
  return { catalog, imagery, hash, layer };
}
function pngHeader(width = 129, height = 129): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer); view.setUint32(8, 13); bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width); view.setUint32(20, height); bytes[24] = 8; bytes[25] = 2;
  return bytes;
}
async function imageFixture() {
  const f = fixture(), bytes = pngHeader(); f.layer.image.sha256 = await sha256Hex(bytes.buffer);
  vi.stubGlobal('window', { location: { href: 'https://example.org/' } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)));
  return { ...f, bytes };
}
afterEach(() => vi.unstubAllGlobals());

describe('surface imagery source binding', () => {
  it('accepts the shipped manifest and verifies all shipped PNG/provenance bytes against their declarations', () => {
    const publicRoot = new URL('../../public/', import.meta.url);
    const catalogBytes = readFileSync(new URL('data/surface_catalog.json', publicRoot));
    const catalog = JSON.parse(catalogBytes.toString('utf8')) as SurfaceCatalog;
    const hash = createHash('sha256').update(catalogBytes).digest('hex');
    const value = JSON.parse(readFileSync(new URL('data/surface_imagery.json', publicRoot), 'utf8'));
    const imagery = validateSurfaceImageryCatalog(value, catalog, hash);
    expect(imagery.records.length).toBe(catalog.surfaces.filter(s => s.body !== 'earth').length);
    for (const record of imagery.records) for (const layer of record.layers) {
      for (const asset of [layer.image, layer.provenance]) {
        const bytes = readFileSync(new URL(asset.path.slice(1), publicRoot));
        expect(bytes.byteLength).toBe(asset.bytes);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      }
      const png = readFileSync(new URL(layer.image.path.slice(1), publicRoot));
      expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(png.readUInt32BE(8)).toBe(13); expect(png.toString('ascii', 12, 16)).toBe('IHDR');
      expect([png[24], png[25]]).toEqual([8, 2]);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([layer.image.width, layer.image.height]);
      expect(() => JSON.parse(readFileSync(new URL(layer.provenance.path.slice(1), publicRoot), 'utf8'))).not.toThrow();
    }
  });
  it('accepts exact native grid inputs and optional projected false color', () => {
    const f = fixture(); expect(validateSurfaceImageryCatalog(f.imagery, f.catalog, f.hash)).toBe(f.imagery);
    f.imagery.records[0].layers.push({ ...structuredClone(f.layer), id: 'local-ortho', color_mode: 'published_false_color', registration: 'projected_ortho' });
    expect(validateSurfaceImageryCatalog(f.imagery, f.catalog, f.hash).records[0].layers).toHaveLength(2);
  });
  it.each(['catalog-hash', 'height-hash', 'mask-hash', 'width', 'origin', 'spacing', 'crs', 'missing', 'duplicate-record', 'unknown', 'earth', 'duplicate-layer', 'mode', 'url', 'path', 'provenance', 'dimensions', 'budget', 'nan', 'field'])('rejects invalid binding or metadata: %s', kind => {
    const f = fixture(), r = f.imagery.records[0];
    if (kind === 'catalog-hash') f.imagery.catalog_sha256 = 'b'.repeat(64);
    if (kind === 'height-hash') r.inputs.heights_sha256 = 'b'.repeat(64);
    if (kind === 'mask-hash') r.inputs.valid_mask_sha256 = 'b'.repeat(64);
    if (kind === 'width') r.inputs.width++;
    if (kind === 'origin') r.inputs.native_origin[0]++;
    if (kind === 'spacing') r.inputs.native_spacing[1] *= -1;
    if (kind === 'crs') r.inputs.native_crs_wkt += 'changed';
    if (kind === 'missing') f.imagery.records = [];
    if (kind === 'duplicate-record') f.imagery.records.push(structuredClone(r));
    if (kind === 'unknown') r.surface_id = 'unknown';
    if (kind === 'earth') f.catalog.surfaces[0].body = 'earth';
    if (kind === 'duplicate-layer') r.layers.push(structuredClone(f.layer));
    if (kind === 'mode') f.layer.registration = 'projected_ortho';
    if (kind === 'url') f.layer.source_url = 'http://example.org/data';
    if (kind === 'path') f.layer.image.path = '/assets/../image.png';
    if (kind === 'provenance') f.layer.provenance.path = '/assets/%2e%2e/p.json';
    if (kind === 'dimensions') f.layer.image.width = 258;
    if (kind === 'budget') f.layer.image.bytes = 4 * 1024 * 1024 + 1;
    if (kind === 'nan') r.inputs.native_origin[0] = NaN;
    if (kind === 'field') Object.assign(f.layer, { fabricated: true });
    expect(() => validateSurfaceImageryCatalog(f.imagery, f.catalog, f.hash)).toThrow();
  });
  it('loads valid JSON and bounds streamed bytes without trusting content-length', async () => {
    const f = fixture(); vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(f.imagery))));
    expect((await loadSurfaceImageryCatalog(f.catalog, f.hash, new AbortController().signal)).records).toHaveLength(1);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(SURFACE_IMAGERY_JSON_LIMIT + 1))));
    await expect(loadSurfaceImageryCatalog(f.catalog, f.hash, new AbortController().signal)).rejects.toThrow('quota');
  });
  it('rejects invalid UTF8 and malformed JSON', async () => {
    const f = fixture();
    for (const body of [new Uint8Array([255]), '{bad']) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
      await expect(loadSurfaceImageryCatalog(f.catalog, f.hash, new AbortController().signal)).rejects.toThrow();
    }
  });
});

describe('verified surface image lifecycle', () => {
  it('preserves row orientation and RGB decode options; caller retains the bitmap', async () => {
    const f = await imageFixture(), close = vi.fn(), bitmap = { width: 129, height: 129, close };
    const decode = vi.fn(async () => bitmap); vi.stubGlobal('createImageBitmap', decode);
    expect(await loadSurfaceImageryLayer(f.layer, new AbortController().signal)).toBe(bitmap);
    expect(decode.mock.calls[0]).toHaveLength(2);
    expect(decode).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    expect(close).not.toHaveBeenCalled();
  });
  it('rejects altered payload hashes before decoding', async () => {
    const f = await imageFixture(), decode = vi.fn(); vi.stubGlobal('createImageBitmap', decode);
    f.layer.image.sha256 = 'f'.repeat(64);
    await expect(loadSurfaceImageryLayer(f.layer, new AbortController().signal)).rejects.toThrow('checksum');
    expect(decode).not.toHaveBeenCalled();
  });
  it.each(['dimensions', 'grayscale', 'rgba', 'ihdr', 'signature'])('rejects corrupt or unsupported PNG metadata before decode: %s', async kind => {
    const f = await imageFixture(), bytes = pngHeader(), decode = vi.fn(); vi.stubGlobal('createImageBitmap', decode);
    if (kind === 'dimensions') new DataView(bytes.buffer).setUint32(16, 100000);
    if (kind === 'grayscale') bytes[25] = 0;
    if (kind === 'rgba') bytes[25] = 6;
    if (kind === 'ihdr') bytes[12] = 0;
    if (kind === 'signature') bytes[0] = 0;
    f.layer.image.sha256 = await sha256Hex(bytes.buffer);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)));
    await expect(loadSurfaceImageryLayer(f.layer, new AbortController().signal)).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });
  it('closes a bitmap whose decoded dimensions differ', async () => {
    const f = await imageFixture(), close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 128, height: 129, close })));
    await expect(loadSurfaceImageryLayer(f.layer, new AbortController().signal)).rejects.toThrow('Decoded');
    expect(close).toHaveBeenCalledOnce();
  });
  it('closes a bitmap when cancellation happens during asynchronous decode', async () => {
    const f = await imageFixture(), controller = new AbortController(), close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { controller.abort(); return { width: 129, height: 129, close }; }));
    await expect(loadSurfaceImageryLayer(f.layer, controller.signal)).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });
  it('avoids fetch when already cancelled and propagates decoder failure', async () => {
    const f = await imageFixture(), controller = new AbortController(); controller.abort();
    await expect(loadSurfaceImageryLayer(f.layer, controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('TEST_ONLY corrupt PNG'); }));
    await expect(loadSurfaceImageryLayer(f.layer, new AbortController().signal)).rejects.toThrow('corrupt');
  });
});
