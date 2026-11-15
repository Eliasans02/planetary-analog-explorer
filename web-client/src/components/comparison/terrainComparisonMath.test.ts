import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EarthDiscovery } from '@shared/types/earth-discovery';
import {
  buildTerrainIndices,
  buildTerrainPositions,
  buildContourSegments,
  buildElevationColors,
  buildScientificAxes,
  contourLevels,
  elevationColor,
  comparisonCameraDistance,
  comparisonGrid,
  distanceContributions,
  profileLinePositions,
  terrainProfile,
} from './terrainComparisonMath';

describe('terrain comparison geometry', () => {
  it('places the 10 by 10 cell centers inside the 600 metre support', () => {
    const heights = Array.from({ length: 100 }, (_, index) => index);
    const positions = buildTerrainPositions(heights, 1);
    const xs = Array.from({ length: 100 }, (_, index) => positions[index * 3]);
    const zs = Array.from({ length: 100 }, (_, index) => positions[index * 3 + 2]);
    expect(Math.min(...xs)).toBe(-270);
    expect(Math.max(...xs)).toBe(270);
    expect(Math.min(...zs)).toBe(-270);
    expect(Math.max(...zs)).toBe(270);
    expect(positions[99 * 3 + 1]).toBe(99);
    expect(buildTerrainPositions(heights, 3)[99 * 3 + 1]).toBe(297);
    expect(comparisonGrid.cellCenterExtentM).toBe(540);
    expect(comparisonGrid.supportExtentM).toBe(600);
  });

  it('builds exactly two triangles for every grid quad', () => {
    const indices = buildTerrainIndices();
    expect(indices).toHaveLength(9 * 9 * 6);
    expect(Math.min(...indices)).toBe(0);
    expect(Math.max(...indices)).toBe(99);
    expect(Array.from(indices.slice(0, 6))).toEqual([0, 10, 1, 1, 10, 11]);
  });

  it('moves the camera back enough for a narrow split viewport', () => {
    expect(comparisonCameraDistance(160, 360)).toBeGreaterThan(3000);
    expect(comparisonCameraDistance(600, 420)).toBeLessThan(2000);
  });
});

describe('selected elevation profiles', () => {
  const heights = Array.from({ length: 100 }, (_, index) => index);

  it('extracts rows left to right and columns top to bottom in source-grid order', () => {
    expect(terrainProfile(heights, 'row', 2)).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
    expect(terrainProfile(heights, 'column', 2)).toEqual([2, 12, 22, 32, 42, 52, 62, 72, 82, 92]);
    expect(comparisonGrid.distancesM).toEqual([0, 60, 120, 180, 240, 300, 360, 420, 480, 540]);
  });

  it('places the highlighted line on the selected mesh samples', () => {
    const line = profileLinePositions(heights, 'column', 2, 1);
    expect(Array.from(line.slice(0, 6))).toEqual([-150, 5, -270, -150, 15, -210]);
    expect(Array.from(line.slice(-3))).toEqual([-150, 95, 270]);
  });
});

describe('scientific elevation rendering', () => {
  it('uses the same elevation colours for the same physical heights', () => {
    const heights = Array.from({ length: 100 }, (_, index) => index);
    const colors = buildElevationColors(heights, 100);
    expect(Array.from(colors.slice(150, 153))).toEqual(elevationColor(50, 100).map(Math.fround));
    expect(elevationColor(50, 100)).not.toEqual(elevationColor(50, 50));
    expect(elevationColor(-1, 100)).toEqual(elevationColor(0, 100));
    expect(elevationColor(200, 100)).toEqual(elevationColor(100, 100));
  });
  it('intersects the same mesh triangles for a known planar contour', () => {
    const plane = Array.from({ length: 100 }, (_, index) => index % 10 * 10);
    const contour = buildContourSegments(plane, [45], 3);
    expect(contour.length).toBe(18 * 6);
    const zs: number[] = [];
    for (let index = 0; index < contour.length; index += 3) {
      expect(contour[index]).toBe(0);
      expect(contour[index + 1]).toBeCloseTo(135.05, 4);
      zs.push(contour[index + 2]);
    }
    expect(Math.min(...zs)).toBe(-270);
    expect(Math.max(...zs)).toBe(270);
    expect(buildContourSegments(Array(100).fill(0), [0, 1], 1)).toHaveLength(0);
  });
  it('keeps physical contour values while exaggerating only their display height', () => {
    expect(contourLevels(60)).toEqual([10, 20, 30, 40, 50]);
    expect(contourLevels(0)).toEqual([]);
    const axes = buildScientificAxes(60, 3);
    expect(Array.from(axes.slice(-6))).toEqual([-270, 0, 270, -270, 180, 270]);
  });
});

describe('published distance contribution', () => {
  it('reproduces the known top Moon candidate without inventing confidence', () => {
    const discovery = readDiscovery();
    const target = discovery.targets.find(item => item.id === 'moon-shackleton-lola-600m')!;
    const candidate = discovery.candidates.find(item => item.id === 'ustyurt-r30-c20')!;
    const contribution = distanceContributions(candidate, target);
    const comparison = candidate.comparisons[target.id];
    expect(comparison.rank).toBe(1);
    expect(contribution.totalVariation).toBeCloseTo(0.15625, 12);
    expect(contribution.histogramContribution).toBeCloseTo(0.109375, 12);
    expect(contribution.reliefContribution).toBeCloseTo(0.02395182637478111, 12);
    expect(contribution.distance).toBeCloseTo(comparison.distance, 12);
    expect(contribution.distance).toBeCloseTo(0.1333268263747811, 12);
    expect(comparison.sensitivity_rank).toBe(1);
  });
});

function readDiscovery(): EarthDiscovery {
  return JSON.parse(readFileSync(new URL('../../../public/data/earth_discovery.json', import.meta.url), 'utf8')) as EarthDiscovery;
}
