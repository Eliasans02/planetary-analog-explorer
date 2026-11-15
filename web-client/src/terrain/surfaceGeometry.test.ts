import { describe, expect, it } from 'vitest';
import { buildSurfaceGeometryData, gridToSurface, surfaceHeightAt } from './surfaceGeometry';

const grid = { width: 3, height: 3, spacing_m: [10, 20] as [number, number] };
describe('native relief geometry', () => {
  it('centres raster axes and preserves metre height and row orientation', () => {
    const heights = Float32Array.from([1,2,3,4,5,6,7,8,9]);
    const data = buildSurfaceGeometryData(grid, heights, new Uint8Array(9).fill(1));
    expect(gridToSurface(grid, 0, 0)).toEqual([-10, -20]);
    expect(gridToSurface(grid, 2, 2)).toEqual([10, 20]);
    expect(Array.from(data.positions.slice(12, 15))).toEqual([0, 5, 0]);
    expect([data.extentX, data.extentZ]).toEqual([20, 40]);
    expect(Array.from(data.indices.slice(0, 3))).toEqual([0, 3, 1]);
  });
  it('does not triangulate through a masked or nonfinite sample', () => {
    const heights = new Float32Array(9), mask = new Uint8Array(9).fill(1);
    mask[4] = 0; heights[0] = NaN;
    const data = buildSurfaceGeometryData(grid, heights, mask);
    expect(Array.from(data.indices)).not.toContain(4);
    expect(Array.from(data.indices)).not.toContain(0);
    expect(Array.from(data.indices)).toEqual([5, 7, 8]);
  });
  it('keeps the exact grid boundary and refuses hole interpolation', () => {
    const heights = Float32Array.from([1,2,3,4,5,6,7,8,9]), mask = new Uint8Array(9).fill(1);
    expect(surfaceHeightAt(grid, heights, mask, 2, 2)).toBe(9);
    expect(surfaceHeightAt(grid, heights, mask, 0.5, 0.5)).toBe(3);
    mask[4] = 0;
    expect(surfaceHeightAt(grid, heights, mask, 0.5, 0.5)).toBeNull();
  });
});
