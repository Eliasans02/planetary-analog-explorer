// TEST_ONLY hostile transport and mathematical binary fixtures; no scientific observations.
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../data/loadDataset', () => ({ resolveSameOriginAssetUrl: (path: string) => path }));
import { fetchVerifiedAsset } from './heightfield';
import { splatSdkFormat, validateSplatPayload } from './splatPayload';

afterEach(() => vi.unstubAllGlobals());
const abc = { path: '/assets/test_only/abc.bin', bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' };

describe('bounded verified downloads', () => {
  it('accepts exact streamed bytes and requests redirect rejection with the caller signal', async () => {
    const fetchMock = vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([97])); controller.enqueue(new Uint8Array([98, 99])); controller.close(); },
    })));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    expect(new TextDecoder().decode(await fetchVerifiedAsset(abc, signal, 3))).toBe('abc');
    expect(fetchMock).toHaveBeenCalledWith(abc.path, { signal, cache: 'no-store', redirect: 'error' });
  });

  it('rejects an over-budget declaration before any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchVerifiedAsset(abc, new AbortController().signal, 2)).rejects.toThrow('quota');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks decoded size/hash when Content-Length describes compressed wire bytes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('abc', {
      headers: { 'content-length': '23', 'content-encoding': 'gzip' },
    })));
    expect(new TextDecoder().decode(await fetchVerifiedAsset(abc, new AbortController().signal, 3))).toBe('abc');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('abcd', {
      headers: { 'content-length': '24', 'content-encoding': 'gzip' },
    })));
    await expect(fetchVerifiedAsset(abc, new AbortController().signal, 3)).rejects.toThrow('quota');
  });

  it('rejects oversized Content-Length without reading the payload', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { headers: { 'content-length': '4000000000' } })));
    await expect(fetchVerifiedAsset(abc, new AbortController().signal, 3)).rejects.toThrow('declared-length');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels a chunked body as soon as it exceeds declared bytes', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([97, 98, 99, 100])); }, cancel,
    }))));
    await expect(fetchVerifiedAsset(abc, new AbortController().signal, 3)).rejects.toThrow('quota');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects truncation and checksum mismatch independently', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ab')));
    await expect(fetchVerifiedAsset(abc, new AbortController().signal, 3)).rejects.toThrow('truncated');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('abd')));
    await expect(fetchVerifiedAsset(abc, new AbortController().signal, 3)).rejects.toThrow('SHA-256');
  });

  it('cancels an in-flight reader when aborted', async () => {
    const cancel = vi.fn();
    let started!: () => void;
    const reading = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ pull() { started(); }, cancel }))));
    const controller = new AbortController();
    const pending = fetchVerifiedAsset(abc, controller.signal, 3);
    await reading;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalledOnce();
  });
});

function gaussianPly(count = 1): ArrayBuffer {
  const properties = ['x', 'y', 'z', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3', 'opacity', 'f_dc_0', 'f_dc_1', 'f_dc_2'];
  const header = new TextEncoder().encode(`ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n${properties.map((name) => `property float ${name}\n`).join('')}end_header\n`);
  const bytes = new Uint8Array(header.length + count * properties.length * 4);
  bytes.set(header);
  const view = new DataView(bytes.buffer);
  for (let row = 0; row < count; row += 1) view.setFloat32(header.length + row * properties.length * 4 + 6 * 4, 1, true);
  return bytes.buffer;
}

function rawSplat(): ArrayBuffer {
  const buffer = new ArrayBuffer(32);
  const view = new DataView(buffer);
  for (let axis = 0; axis < 3; axis += 1) view.setFloat32(12 + axis * 4, 1, true);
  new Uint8Array(buffer).set([255, 128, 128, 128], 28);
  return buffer;
}

function setPlyProperty(buffer: ArrayBuffer, index: number, value: number): void {
  // One TEST_ONLY vertex with fourteen scalar float properties.
  new DataView(buffer).setFloat32(buffer.byteLength - 14 * 4 + index * 4, value, true);
}

describe('bounded Gaussian payload validation', () => {
  it('checks splat 32-byte record count and finite positions/scales', () => {
    expect(() => validateSplatPayload(rawSplat(), 'splat', 1)).not.toThrow();
    expect(() => validateSplatPayload(new ArrayBuffer(64), 'splat', 1)).toThrow('32-byte');
    const invalid = new ArrayBuffer(32);
    new DataView(invalid).setFloat32(0, NaN, true);
    expect(() => validateSplatPayload(invalid, 'splat', 1)).toThrow('non-finite');
    expect(splatSdkFormat('splat')).toBe(0);
    expect(splatSdkFormat('ply')).toBe(2);
  });

  it('accepts Gaussian PLY but rejects count mismatch, truncation, non-finite records and plain PLY', () => {
    const ply = gaussianPly();
    expect(() => validateSplatPayload(ply, 'ply', 1)).not.toThrow();
    expect(() => validateSplatPayload(ply, 'ply', 2)).toThrow('count');
    expect(() => validateSplatPayload(ply.slice(0, -1), 'ply', 1)).toThrow('length');
    new DataView(ply).setFloat32(ply.byteLength - 4, Infinity, true);
    expect(() => validateSplatPayload(ply, 'ply', 1)).toThrow('non-finite');
    const plain = new TextEncoder().encode('ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n');
    expect(() => validateSplatPayload(plain.buffer, 'ply', 1)).toThrow('Gaussian');
  });

  it('rejects excessive counts and unbounded/unsupported headers', () => {
    expect(() => validateSplatPayload(new ArrayBuffer(0), 'splat', 250001)).toThrow('count');
    expect(() => validateSplatPayload(new ArrayBuffer(70000), 'ply', 1)).toThrow('header');
    const ascii = new TextEncoder().encode('ply\nformat ascii 1.0\nend_header\n');
    expect(() => validateSplatPayload(ascii.buffer, 'ply', 1)).toThrow('little-endian');
  });

  it('rejects finite PLY log-scales that overflow exp or Float32 covariance, and underflow', () => {
    for (const logScale of [1000, 50, -1000, -60]) {
      const ply = gaussianPly();
      setPlyProperty(ply, 3, logScale);
      expect(() => validateSplatPayload(ply, 'ply', 1)).toThrow(/converted|representable/);
    }
    const supported = gaussianPly();
    setPlyProperty(supported, 3, 10);
    expect(() => validateSplatPayload(supported, 'ply', 1)).not.toThrow();
  });

  it('rejects finite raw scales with invalid sign or unrepresentable covariance', () => {
    for (const scale of [0, -1, 3e38, 1e-30]) {
      const splat = rawSplat();
      new DataView(splat).setFloat32(12, scale, true);
      expect(() => validateSplatPayload(splat, 'splat', 1)).toThrow('representable');
    }
  });

  it('rejects zero rotations in PLY and encoded splat rather than fabricating orientation', () => {
    const ply = gaussianPly();
    setPlyProperty(ply, 6, 0);
    expect(() => validateSplatPayload(ply, 'ply', 1)).toThrow('nonzero quaternion');
    const splat = rawSplat();
    new Uint8Array(splat).fill(128, 28, 32);
    expect(() => validateSplatPayload(splat, 'splat', 1)).toThrow('nonzero quaternion');
  });

  it('rejects transform-induced covariance and position overflow before SDK conversion', () => {
    const transform: import('@shared/types/analog-location').Mat4 = [1e20, 0, 0, 0, 0, 1e20, 0, 0, 0, 0, 1e20, 0, 0, 0, 0, 1];
    expect(() => validateSplatPayload(rawSplat(), 'splat', 1, transform)).toThrow('covariance');
    const largePosition = rawSplat();
    new DataView(largePosition).setFloat32(0, 3e38, true);
    const doubled: typeof transform = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
    expect(() => validateSplatPayload(largePosition, 'splat', 1, doubled)).toThrow('position');
    expect(() => validateSplatPayload(rawSplat(), 'splat', 1, doubled)).not.toThrow();
  });
});
