// TEST_ONLY mathematical fixture, not Earth/Moon/Mars data
import { describe, expect, it } from 'vitest';
import type { Heightmap } from '@shared/types/analog-location';
import { latLonToUnitSphere, normalizeLongitudeDeg } from './coordinates';
import {
  buildTerrainGeometryData,
  MAX_TERRAIN_GRID_DIM,
  parseHeightfieldBuffers,
  sampleHeight,
  sampleHeightAndSlope,
  sha256Hex,
  TerrainAssetError,
  verifyAssetIntegrity,
} from './heightfield';
import { validateAndDecomposeSplatMatrix } from './splatUtils';

function makeFloat32Buffer(values: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(values.length * 4);
  const view = new DataView(buf);
  for (let i = 0; i < values.length; i += 1) {
    view.setFloat32(i * 4, values[i], true); // little-endian
  }
  return buf;
}

function makeMaskBuffer(values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

function makeTestHeightmapMeta(width: number, height: number): Heightmap {
  return {
    asset: {
      path: '/assets/test_only/heights.bin',
      sha256: '0'.repeat(64),
      bytes: width * height * 4,
      source_ids: ['src_test_only'],
    },
    valid_mask: {
      path: '/assets/test_only/mask.bin',
      sha256: '1'.repeat(64),
      bytes: width * height,
      source_ids: ['src_test_only'],
    },
    width,
    height,
    encoding: 'float32_le',
    nodata: null,
    row_order: 'north_to_south',
    col_order: 'west_to_east',
    samples: 'grid_nodes',
    height_reference: 'offset_from_origin_elevation_m',
    extent_m: [0, 0, (width - 1) * 10, (height - 1) * 10],
    origin: { latitude_deg: 0, longitude_deg: 0, elevation_m: 1200 },
    frame: 'local_enu_x_east_y_up_z_south',
    vertical_datum: 'TEST_DATUM',
    meters_per_unit: 1,
  };
}

describe('heightfield mathematical invariants (TEST_ONLY fixtures)', () => {
  it('parses little-endian float32 offsets and preserves valid zero heights', () => {
    // 2x2 mathematical plane with exact 0 at node 0 and valid=1
    const hm = makeTestHeightmapMeta(2, 2);
    const hBuf = makeFloat32Buffer([0, 10, 20, 30]);
    const mBuf = makeMaskBuffer([1, 1, 1, 1]);

    const grid = parseHeightfieldBuffers(hm, hBuf, mBuf);
    expect(grid.width).toBe(2);
    expect(grid.height).toBe(2);
    expect(grid.spacingX_m).toBe(10);
    expect(grid.spacingZ_m).toBe(10);
    expect(grid.verticalOrigin_m).toBe(1200);

    // sampleHeight returns local y offset (not +1200 datum)
    expect(sampleHeight(grid, 0, 0)).toBeCloseTo(0, 6);
    expect(sampleHeight(grid, 10, 0)).toBeCloseTo(10, 6);
    expect(sampleHeight(grid, 0, 10)).toBeCloseTo(20, 6);
    expect(sampleHeight(grid, 10, 10)).toBeCloseTo(30, 6);
  });

  it('uses (width - 1) spacing without off-by-one and matches triangle diagonal split', () => {
    const hm = makeTestHeightmapMeta(3, 3);
    // extent_m is [0, 0, 20, 20] -> spacing is 20 / (3 - 1) = 10 m
    // Bilinear-unlike non-planar corner at (10, 10) vs (0, 0), (10, 0), (0, 10)
    // Cell (0,0): y00=0, y10=10, y01=0, y11=20
    const heights = [
      0, 10, 10,
      0, 20, 20,
      0, 20, 20,
    ];
    const mask = [1, 1, 1, 1, 1, 1, 1, 1, 1];
    const grid = parseHeightfieldBuffers(hm, makeFloat32Buffer(heights), makeMaskBuffer(mask));

    // Inside upper-left triangle (u+v <= 1): (x=2, z=2) -> u=0.2, v=0.2 -> y = 0.6*0 + 0.2*10 + 0.2*0 = 2
    expect(sampleHeight(grid, 2, 2)).toBeCloseTo(2, 5);

    // Inside lower-right triangle (u+v > 1): (x=8, z=8) -> u=0.8, v=0.8 -> w10=0.2, w01=0.2, w11=0.6 -> y = 0.2*10 + 0.2*0 + 0.6*20 = 14
    expect(sampleHeight(grid, 8, 8)).toBeCloseTo(14, 5);

    // Exact last grid node boundary at (20, 20)
    expect(sampleHeight(grid, 20, 20)).toBeCloseTo(20, 5);

    // Outside extent returns null
    expect(sampleHeight(grid, -0.01, 5)).toBeNull();
    expect(sampleHeight(grid, 20.01, 5)).toBeNull();
    expect(sampleHeight(grid, 5, -0.01)).toBeNull();
    expect(sampleHeight(grid, 5, 20.01)).toBeNull();
  });

  it('excludes triangles touching NoData nodes in both geometry builder and sampler', () => {
    const hm = makeTestHeightmapMeta(2, 2);
    // Node i11 (SE corner) is NoData (valid=0, padding=0)
    const grid = parseHeightfieldBuffers(
      hm,
      makeFloat32Buffer([5, 5, 5, 0]),
      makeMaskBuffer([1, 1, 1, 0]),
    );

    const geom = buildTerrainGeometryData(grid);
    // Only triangle (i00, i01, i10) has all 3 valid vertices; (i10, i01, i11) must be excluded
    expect(geom.triangleCount).toBe(1);
    expect(Array.from(geom.indices)).toEqual([0, 2, 1]);
    // Upward +Y normal for flat valid triangle
    expect(geom.normals[1]).toBeCloseTo(1, 6);

    // Sampling inside valid triangle (u+v <= 1) returns 5
    expect(sampleHeight(grid, 2, 2)).toBeCloseTo(5, 5);
    // Sampling inside NoData-adjacent triangle (u+v > 1) returns null
    expect(sampleHeight(grid, 8, 8)).toBeNull();
  });

  it('computes exact DEM slope in degrees from triangle plane', () => {
    const hm = makeTestHeightmapMeta(2, 2);
    // Rise of 10 m over 10 m East (x), flat in South (z) -> 45 degree slope
    const grid = parseHeightfieldBuffers(
      hm,
      makeFloat32Buffer([0, 10, 0, 10]),
      makeMaskBuffer([1, 1, 1, 1]),
    );
    const sample = sampleHeightAndSlope(grid, 2, 2);
    expect(sample).not.toBeNull();
    expect(sample!.y_m).toBeCloseTo(2, 5);
    expect(sample!.slope_deg).toBeCloseTo(45, 4);
  });

  it('rejects oversized grids exceeding MAX_TERRAIN_GRID_DIM budget before allocation', () => {
    const oversized = makeTestHeightmapMeta(MAX_TERRAIN_GRID_DIM + 1, 2);
    expect(() =>
      parseHeightfieldBuffers(
        oversized,
        new ArrayBuffer(oversized.asset.bytes),
        new ArrayBuffer(oversized.valid_mask.bytes),
      ),
    ).toThrow(TerrainAssetError);
  });

  it('rejects byte length or SHA-256 checksum mismatches', async () => {
    const buf = makeFloat32Buffer([1, 2, 3, 4]);
    const validHash = await sha256Hex(buf);
    await expect(verifyAssetIntegrity(buf, 16, validHash, 'test-bin')).resolves.toBeUndefined();
    await expect(verifyAssetIntegrity(buf, 12, validHash, 'test-bin')).rejects.toThrow(
      TerrainAssetError,
    );
    await expect(
      verifyAssetIntegrity(buf, 16, 'f'.repeat(64), 'test-bin'),
    ).rejects.toThrow(TerrainAssetError);
  });

  it('maps antimeridian (+/-180) and polar (+/-90) coordinates consistently on unit sphere', () => {
    const posPlus180 = latLonToUnitSphere(15, 180, 1);
    const posMinus180 = latLonToUnitSphere(15, -180, 1);
    expect(posPlus180[0]).toBeCloseTo(posMinus180[0], 6);
    expect(posPlus180[1]).toBeCloseTo(posMinus180[1], 6);
    expect(posPlus180[2]).toBeCloseTo(posMinus180[2], 6);

    const northPole = latLonToUnitSphere(90, 42, 1);
    expect(northPole[0]).toBeCloseTo(0, 6);
    expect(northPole[1]).toBeCloseTo(1, 6);
    expect(northPole[2]).toBeCloseTo(0, 6);

    const southPole = latLonToUnitSphere(-90, -135, 1);
    expect(southPole[0]).toBeCloseTo(0, 6);
    expect(southPole[1]).toBeCloseTo(-1, 6);
    expect(southPole[2]).toBeCloseTo(0, 6);

    expect(normalizeLongitudeDeg(270)).toBe(-90);
  });

  it('validates column-major splat world_from_asset and rejects shear or reflection', () => {
    // Valid rigid transform + uniform scale 2, translation (10, -5, 3)
    const validMat: [
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
    ] = [
      2, 0, 0, 0,
      0, 2, 0, 0,
      0, 0, 2, 0,
      10, -5, 3, 1,
    ];
    const okRes = validateAndDecomposeSplatMatrix(validMat);
    expect(okRes.ok).toBe(true);
    if (okRes.ok) {
      expect(okRes.transform.position).toEqual([10, -5, 3]);
      expect(okRes.transform.scale).toEqual([2, 2, 2]);
    }

    // Reflection (negative X scale) must be rejected
    const reflectedMat: typeof validMat = [
      -1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    expect(validateAndDecomposeSplatMatrix(reflectedMat).ok).toBe(false);

    // Shear matrix must be rejected
    const shearedMat: typeof validMat = [
      1, 0, 0, 0,
      0.5, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    expect(validateAndDecomposeSplatMatrix(shearedMat).ok).toBe(false);
  });
});
