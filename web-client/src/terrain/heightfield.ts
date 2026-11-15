import type { Heightmap, Location } from '@shared/types/analog-location';
import { resolveSameOriginAssetUrl } from '../data/loadDataset';

export const MAX_TERRAIN_GRID_DIM = 257;
export const MAX_TERRAIN_GRID_NODES = MAX_TERRAIN_GRID_DIM * MAX_TERRAIN_GRID_DIM; // 66,049 nodes
export const MAX_TERRAIN_ASSET_BYTES = 64 * 1024 * 1024; // 64 MiB

/**
 * Local ENU heightfield sampled at grid nodes:
 *   row 0..height-1 runs north_to_south (+Z = South)
 *   col 0..width-1 runs west_to_east (+X = East)
 *   heights[i] is local y offset in metres from verticalOrigin_m (origin.elevation_m)
 *   valid[i] === 1 indicates measured valid node; 0 indicates NoData (float 0 is storage padding)
 */
export interface HeightfieldData {
  heights: Float32Array;
  valid: Uint8Array;
  width: number;
  height: number;
  originX_m: number;
  originZ_m: number;
  spacingX_m: number;
  spacingZ_m: number;
  verticalOrigin_m: number;
}

export interface HeightAndSlopeSample {
  y_m: number;
  slope_deg: number;
}

export interface TerrainGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
}

export class TerrainAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerrainAssetError';
  }
}

// Pure-JS SHA-256 fallback used only if WebCrypto subtle is unavailable in a non-secure context.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256FallbackHex(bytes: Uint8Array): string {
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  return Array.from(h, (v) => v.toString(16).padStart(8, '0')).join('');
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256FallbackHex(new Uint8Array(buffer));
}

export async function verifyAssetIntegrity(
  buffer: ArrayBuffer,
  expectedBytes: number,
  expectedSha256: string,
  label: string,
): Promise<void> {
  if (buffer.byteLength !== expectedBytes) {
    throw new TerrainAssetError(
      `${label} byte length mismatch: expected ${expectedBytes} bytes, received ${buffer.byteLength} bytes.`,
    );
  }
  const actualHash = await sha256Hex(buffer);
  if (actualHash !== expectedSha256.toLowerCase()) {
    throw new TerrainAssetError(
      `${label} SHA-256 checksum mismatch: expected ${expectedSha256}, received ${actualHash}.`,
    );
  }
}

export function checkHeightmapBudget(hm: Heightmap): void {
  if (!Number.isSafeInteger(hm.width) || !Number.isSafeInteger(hm.height) || hm.width < 2 || hm.height < 2) {
    throw new TerrainAssetError(`Heightmap dimensions (${hm.width}x${hm.height}) must be >= 2x2.`);
  }
  const nodes = hm.width * hm.height;
  if (hm.asset.bytes !== nodes * 4 || hm.valid_mask.bytes !== nodes) {
    throw new TerrainAssetError('Heightmap declared bytes must equal width*height*4 and width*height.');
  }
  if (hm.width > MAX_TERRAIN_GRID_DIM || hm.height > MAX_TERRAIN_GRID_DIM || nodes > MAX_TERRAIN_GRID_NODES) {
    throw new TerrainAssetError(
      `Heightmap grid (${hm.width}x${hm.height} = ${nodes.toLocaleString()} nodes) exceeds engineering budget (at most ${MAX_TERRAIN_GRID_DIM} per axis and ${MAX_TERRAIN_GRID_NODES.toLocaleString()} nodes). Run offline DEM downsampling before loading.`,
    );
  }
  const totalBytes = hm.asset.bytes + hm.valid_mask.bytes;
  if (totalBytes > MAX_TERRAIN_ASSET_BYTES) {
    throw new TerrainAssetError(
      `Heightmap assets (${(totalBytes / (1024 * 1024)).toFixed(1)} MiB) exceed 64 MiB budget.`,
    );
  }
}

/** Engineering quota is checked before allocation; redirects and overlong streams fail closed. */
export async function fetchVerifiedAsset(
  asset: { path: string; bytes: number; sha256: string },
  signal: AbortSignal,
  byteBudget: number,
): Promise<ArrayBuffer> {
  signal.throwIfAborted();
  if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > byteBudget) {
    throw new TerrainAssetError('Declared asset size exceeds its engineering byte quota.');
  }
  const response = await fetch(resolveSameOriginAssetUrl(asset.path), {
    signal, cache: 'no-store', redirect: 'error',
  });
  const length = response.headers.get('content-length');
  const encoding = (response.headers.get('content-encoding') ?? 'identity').trim().toLowerCase();
  // Fetch exposes decoded bytes, while Content-Length may describe compressed wire bytes.
  const wrongIdentityLength = encoding === 'identity' && length !== null && (!/^\d+$/.test(length) || Number(length) !== asset.bytes);
  if (!response.ok || response.redirected || wrongIdentityLength) {
    await response.body?.cancel();
    throw new TerrainAssetError(`Asset ${asset.path} failed HTTP/declared-length validation.`);
  }
  if (!response.body) throw new TerrainAssetError(`Asset ${asset.path} has no readable body.`);
  const reader = response.body.getReader();
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    signal.throwIfAborted();
    const bytes = new Uint8Array(asset.bytes);
    let offset = 0;
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (value.byteLength > bytes.length - offset) {
        throw new TerrainAssetError(`Asset ${asset.path} exceeds its declared byte quota.`);
      }
      bytes.set(value, offset);
      offset += value.byteLength;
    }
    if (offset !== bytes.length) throw new TerrainAssetError(`Asset ${asset.path} is truncated.`);
    await verifyAssetIntegrity(bytes.buffer, asset.bytes, asset.sha256, asset.path);
    signal.throwIfAborted();
    return bytes.buffer;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

export function parseHeightfieldBuffers(
  hm: Heightmap,
  heightBuffer: ArrayBuffer,
  maskBuffer: ArrayBuffer,
): HeightfieldData {
  checkHeightmapBudget(hm);

  const count = hm.width * hm.height;
  const expectedHeightBytes = count * 4;
  if (heightBuffer.byteLength !== expectedHeightBytes) {
    throw new TerrainAssetError(
      `Heightmap BIN length (${heightBuffer.byteLength}) != width*height*4 (${expectedHeightBytes}).`,
    );
  }
  if (maskBuffer.byteLength !== count) {
    throw new TerrainAssetError(
      `Valid mask BIN length (${maskBuffer.byteLength}) != width*height (${count}).`,
    );
  }

  const [xMin, zMin, xMax, zMax] = hm.extent_m;
  if (!(xMin < xMax) || !(zMin < zMax)) {
    throw new TerrainAssetError('Heightmap extent_m must satisfy x_min < x_max and z_min < z_max.');
  }

  const heights = new Float32Array(count);
  const view = new DataView(heightBuffer);
  const rawMask = new Uint8Array(maskBuffer);
  const valid = new Uint8Array(count);

  let validCount = 0;
  for (let i = 0; i < count; i += 1) {
    const maskVal = rawMask[i];
    if (maskVal !== 0 && maskVal !== 1) {
      throw new TerrainAssetError(
        `Invalid heightmap mask byte ${maskVal} at index ${i}; expected 0 or 1.`,
      );
    }
    const hVal = view.getFloat32(i * 4, true); // explicit little-endian float32_le
    if (!Number.isFinite(hVal)) {
      throw new TerrainAssetError(`Non-finite heightmap float32 sample at index ${i}.`);
    }
    valid[i] = maskVal;
    heights[i] = maskVal === 1 ? hVal : 0;
    if (maskVal === 1) validCount += 1;
  }

  if (validCount < 3) {
    throw new TerrainAssetError('Heightmap contains fewer than 3 valid sample nodes.');
  }

  return {
    heights,
    valid,
    width: hm.width,
    height: hm.height,
    originX_m: xMin,
    originZ_m: zMin,
    spacingX_m: (xMax - xMin) / (hm.width - 1),
    spacingZ_m: (zMax - zMin) / (hm.height - 1),
    verticalOrigin_m: hm.origin.elevation_m,
  };
}

export async function readHeightfield(
  location: Location,
  signal: AbortSignal,
): Promise<HeightfieldData | null> {
  const hm = location.assets.heightmap;
  if (hm === null) {
    return null;
  }

  checkHeightmapBudget(hm);

  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) onAbort();
  try {
    const [heightBuf, maskBuf] = await Promise.all([
      fetchVerifiedAsset(hm.asset, controller.signal, hm.asset.bytes),
      fetchVerifiedAsset(hm.valid_mask, controller.signal, hm.valid_mask.bytes),
    ]);
    return parseHeightfieldBuffers(hm, heightBuf, maskBuf);
  } finally {
    controller.abort();
    signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Samples local ENU elevation y (offset from origin.elevation_m) and derived DEM slope in degrees
 * using the exact same triangle diagonal split (u + v <= 1 vs u + v > 1) as buildTerrainGeometryData.
 * Returns null if (x_m, z_m) lies outside the grid extent or inside a triangle touching any NoData node.
 */
export function sampleHeightAndSlope(
  grid: HeightfieldData,
  x_m: number,
  z_m: number,
): HeightAndSlopeSample | null {
  if (!Number.isFinite(x_m) || !Number.isFinite(z_m)) {
    return null;
  }

  const maxX = grid.originX_m + (grid.width - 1) * grid.spacingX_m;
  const maxZ = grid.originZ_m + (grid.height - 1) * grid.spacingZ_m;
  if (x_m < grid.originX_m || x_m > maxX || z_m < grid.originZ_m || z_m > maxZ) {
    return null;
  }

  const fx = (x_m - grid.originX_m) / grid.spacingX_m;
  const fz = (z_m - grid.originZ_m) / grid.spacingZ_m;

  const col = Math.min(Math.max(Math.floor(fx), 0), grid.width - 2);
  const row = Math.min(Math.max(Math.floor(fz), 0), grid.height - 2);

  const u = fx - col;
  const v = fz - row;

  const i00 = row * grid.width + col;
  const i10 = i00 + 1;
  const i01 = i00 + grid.width;
  const i11 = i01 + 1;

  // Match terrain mesh diagonal: u + v <= 1 uses (i00, i01, i10); u + v > 1 uses (i10, i01, i11).
  if (u + v <= 1) {
    if (grid.valid[i00] !== 1 || grid.valid[i01] !== 1 || grid.valid[i10] !== 1) {
      return null;
    }
    const y00 = grid.heights[i00];
    const y01 = grid.heights[i01];
    const y10 = grid.heights[i10];
    if (!Number.isFinite(y00) || !Number.isFinite(y01) || !Number.isFinite(y10)) {
      return null;
    }
    const y_m = (1 - u - v) * y00 + u * y10 + v * y01;

    // Plane normal of triangle (p00, p01, p10)
    const dhdx = (y10 - y00) / grid.spacingX_m;
    const dhdz = (y01 - y00) / grid.spacingZ_m;
    const ny = 1 / Math.sqrt(dhdx * dhdx + dhdz * dhdz + 1);
    const slope_deg = Math.acos(Math.min(1, Math.max(0, ny))) * (180 / Math.PI);
    return { y_m, slope_deg };
  }

  if (grid.valid[i10] !== 1 || grid.valid[i01] !== 1 || grid.valid[i11] !== 1) {
    return null;
  }
  const y10 = grid.heights[i10];
  const y01 = grid.heights[i01];
  const y11 = grid.heights[i11];
  if (!Number.isFinite(y10) || !Number.isFinite(y01) || !Number.isFinite(y11)) {
    return null;
  }
  const w10 = 1 - v;
  const w01 = 1 - u;
  const w11 = u + v - 1;
  const y_m = w10 * y10 + w01 * y01 + w11 * y11;

  // Plane normal of triangle (p10, p01, p11)
  const dhdx = (y11 - y01) / grid.spacingX_m;
  const dhdz = (y11 - y10) / grid.spacingZ_m;
  const ny = 1 / Math.sqrt(dhdx * dhdx + dhdz * dhdz + 1);
  const slope_deg = Math.acos(Math.min(1, Math.max(0, ny))) * (180 / Math.PI);
  return { y_m, slope_deg };
}

/**
 * Returns local y in metres (offset from origin.elevation_m), or null if NoData / outside bounds.
 */
export function sampleHeight(grid: HeightfieldData, x_m: number, z_m: number): number | null {
  const sample = sampleHeightAndSlope(grid, x_m, z_m);
  return sample ? sample.y_m : null;
}

/**
 * Builds indexed BufferGeometry arrays for a HeightfieldData grid.
 * Shared single source of truth used by terrain.worker.ts and unit tests.
 * Any triangle touching a NoData vertex (valid[idx] === 0) is omitted completely.
 */
export function buildTerrainGeometryData(grid: HeightfieldData): TerrainGeometryData {
  const { width, height, heights, valid, originX_m, originZ_m, spacingX_m, spacingZ_m } = grid;
  const nodeCount = width * height;
  const positions = new Float32Array(nodeCount * 3);
  const normals = new Float32Array(nodeCount * 3);

  for (let row = 0; row < height; row += 1) {
    const z = originZ_m + row * spacingZ_m;
    for (let col = 0; col < width; col += 1) {
      const idx = row * width + col;
      const x = originX_m + col * spacingX_m;
      const y = valid[idx] === 1 ? heights[idx] : 0;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
    }
  }

  const maxTriangles = (width - 1) * (height - 1) * 2;
  const rawIndices = new Uint32Array(maxTriangles * 3);
  let indexCursor = 0;

  const accumulateFaceNormal = (ia: number, ib: number, ic: number) => {
    const ax = positions[ia * 3];
    const ay = positions[ia * 3 + 1];
    const az = positions[ia * 3 + 2];

    const e1x = positions[ib * 3] - ax;
    const e1y = positions[ib * 3 + 1] - ay;
    const e1z = positions[ib * 3 + 2] - az;

    const e2x = positions[ic * 3] - ax;
    const e2y = positions[ic * 3 + 1] - ay;
    const e2z = positions[ic * 3 + 2] - az;

    // Cross product e1 x e2 yields +Y upward normal for (i00, i01, i10) and (i10, i01, i11)
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    normals[ia * 3] += nx;
    normals[ia * 3 + 1] += ny;
    normals[ia * 3 + 2] += nz;

    normals[ib * 3] += nx;
    normals[ib * 3 + 1] += ny;
    normals[ib * 3 + 2] += nz;

    normals[ic * 3] += nx;
    normals[ic * 3 + 1] += ny;
    normals[ic * 3 + 2] += nz;
  };

  for (let row = 0; row < height - 1; row += 1) {
    for (let col = 0; col < width - 1; col += 1) {
      const i00 = row * width + col;
      const i10 = i00 + 1;
      const i01 = i00 + width;
      const i11 = i01 + 1;

      if (valid[i00] === 1 && valid[i01] === 1 && valid[i10] === 1) {
        rawIndices[indexCursor++] = i00;
        rawIndices[indexCursor++] = i01;
        rawIndices[indexCursor++] = i10;
        accumulateFaceNormal(i00, i01, i10);
      }

      if (valid[i10] === 1 && valid[i01] === 1 && valid[i11] === 1) {
        rawIndices[indexCursor++] = i10;
        rawIndices[indexCursor++] = i01;
        rawIndices[indexCursor++] = i11;
        accumulateFaceNormal(i10, i01, i11);
      }
    }
  }

  for (let i = 0; i < nodeCount; i += 1) {
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) {
      normals[i * 3] = nx / len;
      normals[i * 3 + 1] = ny / len;
      normals[i * 3 + 2] = nz / len;
    } else {
      normals[i * 3] = 0;
      normals[i * 3 + 1] = 1;
      normals[i * 3 + 2] = 0;
    }
  }

  const indices = rawIndices.slice(0, indexCursor);
  return {
    positions,
    normals,
    indices,
    triangleCount: indexCursor / 3,
  };
}
