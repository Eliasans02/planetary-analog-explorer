import type { DiscoveryCandidate, DiscoveryTarget } from '@shared/types/earth-discovery';

export type ProfileDirection = 'row' | 'column';

export interface DistanceContributions {
  totalVariation: number;
  reliefDifference: number;
  histogramContribution: number;
  reliefContribution: number;
  distance: number;
}

const GRID_SIZE = 10;
const CELL_SPACING_M = 60;
const CELL_CENTER_HALF_EXTENT_M = 270;
const COLOR_STOPS = [
  [0.2081, 0.1663, 0.5292],
  [0.0592, 0.3598, 0.8683],
  [0.078, 0.654, 0.714],
  [0.4775, 0.8214, 0.3188],
  [0.9932, 0.9062, 0.1439],
] as const;

function assertGrid(heights: number[]): void {
  if (heights.length !== GRID_SIZE * GRID_SIZE || heights.some(value => !Number.isFinite(value))) {
    throw new Error('Terrain comparison requires 100 finite height samples.');
  }
}

export function buildTerrainPositions(heights: number[], verticalExaggeration: number): Float32Array {
  assertGrid(heights);
  if (verticalExaggeration !== 1 && verticalExaggeration !== 3) {
    throw new Error('Vertical exaggeration must be 1× or 3×.');
  }
  const positions = new Float32Array(heights.length * 3);
  heights.forEach((height, index) => {
    const row = Math.floor(index / GRID_SIZE);
    const column = index % GRID_SIZE;
    positions[index * 3] = column * CELL_SPACING_M - CELL_CENTER_HALF_EXTENT_M;
    positions[index * 3 + 1] = height * verticalExaggeration;
    positions[index * 3 + 2] = row * CELL_SPACING_M - CELL_CENTER_HALF_EXTENT_M;
  });
  return positions;
}

export function buildTerrainIndices(): Uint16Array {
  const indices: number[] = [];
  for (let row = 0; row < GRID_SIZE - 1; row += 1) {
    for (let column = 0; column < GRID_SIZE - 1; column += 1) {
      const topLeft = row * GRID_SIZE + column;
      const bottomLeft = topLeft + GRID_SIZE;
      indices.push(topLeft, bottomLeft, topLeft + 1, topLeft + 1, bottomLeft, bottomLeft + 1);
    }
  }
  return Uint16Array.from(indices);
}

export function elevationColor(value: number, maximum: number): [number, number, number] {
  const normalized = maximum > 0 ? Math.min(1, Math.max(0, value / maximum)) : 0;
  const scaled = normalized * (COLOR_STOPS.length - 1);
  const left = Math.min(COLOR_STOPS.length - 2, Math.floor(scaled));
  const fraction = scaled - left;
  const first = COLOR_STOPS[left];
  const second = COLOR_STOPS[left + 1];
  return [0, 1, 2].map(channel => first[channel] + (second[channel] - first[channel]) * fraction) as [number, number, number];
}

export function buildElevationColors(heights: number[], maximum: number): Float32Array {
  assertGrid(heights);
  const colors = new Float32Array(heights.length * 3);
  heights.forEach((height, index) => colors.set(elevationColor(height, maximum), index * 3));
  return colors;
}

export function contourLevels(maximum: number, count = 5): number[] {
  if (!Number.isFinite(maximum) || maximum <= 0 || !Number.isInteger(count) || count < 1) return [];
  return Array.from({ length: count }, (_, index) => maximum * (index + 1) / (count + 1));
}

export function buildContourSegments(heights: number[], levels: number[], verticalExaggeration: number): Float32Array {
  assertGrid(heights);
  const segments: number[] = [];
  const point = (index: number) => ({
    x: index % GRID_SIZE * CELL_SPACING_M - CELL_CENTER_HALF_EXTENT_M,
    z: Math.floor(index / GRID_SIZE) * CELL_SPACING_M - CELL_CENTER_HALF_EXTENT_M,
    h: heights[index],
  });
  const addTriangle = (indices: [number, number, number], level: number) => {
    const vertices = indices.map(point);
    const intersections: { x: number; z: number }[] = [];
    for (const [start, end] of [[0, 1], [1, 2], [2, 0]] as const) {
      const a = vertices[start];
      const b = vertices[end];
      if (!((a.h < level && b.h >= level) || (b.h < level && a.h >= level))) continue;
      const fraction = (level - a.h) / (b.h - a.h);
      intersections.push({ x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction });
    }
    if (intersections.length === 2) {
      const y = level * verticalExaggeration + 0.05;
      segments.push(intersections[0].x, y, intersections[0].z, intersections[1].x, y, intersections[1].z);
    }
  };
  for (const level of levels) {
    for (let row = 0; row < GRID_SIZE - 1; row += 1) {
      for (let column = 0; column < GRID_SIZE - 1; column += 1) {
        const topLeft = row * GRID_SIZE + column;
        const bottomLeft = topLeft + GRID_SIZE;
        addTriangle([topLeft, bottomLeft, topLeft + 1], level);
        addTriangle([topLeft + 1, bottomLeft, bottomLeft + 1], level);
      }
    }
  }
  return Float32Array.from(segments);
}

export function buildScientificAxes(maximumElevation: number, verticalExaggeration: number): Float32Array {
  const lines: number[] = [];
  const ticks = [-270, -90, 90, 270];
  for (const tick of ticks) {
    lines.push(tick, -2, -270, tick, -2, 270);
    lines.push(-270, -2, tick, 270, -2, tick);
  }
  lines.push(-270, 0, 270, 270, 0, 270);
  lines.push(-270, 0, -270, -270, 0, 270);
  lines.push(-270, 0, 270, -270, Math.max(1, maximumElevation * verticalExaggeration), 270);
  return Float32Array.from(lines);
}

export function terrainProfile(heights: number[], direction: ProfileDirection, index: number): number[] {
  assertGrid(heights);
  if (!Number.isInteger(index) || index < 0 || index >= GRID_SIZE) {
    throw new Error('Profile index must be between 0 and 9.');
  }
  return Array.from({ length: GRID_SIZE }, (_, sample) => (
    direction === 'row' ? heights[index * GRID_SIZE + sample] : heights[sample * GRID_SIZE + index]
  ));
}

export function profileLinePositions(
  heights: number[],
  direction: ProfileDirection,
  index: number,
  verticalExaggeration: number,
): Float32Array {
  const profile = terrainProfile(heights, direction, index);
  const positions = new Float32Array(GRID_SIZE * 3);
  profile.forEach((height, sample) => {
    const row = direction === 'row' ? index : sample;
    const column = direction === 'row' ? sample : index;
    positions[sample * 3] = column * CELL_SPACING_M - CELL_CENTER_HALF_EXTENT_M;
    positions[sample * 3 + 1] = height * verticalExaggeration + 3;
    positions[sample * 3 + 2] = row * CELL_SPACING_M - CELL_CENTER_HALF_EXTENT_M;
  });
  return positions;
}

export function distanceContributions(candidate: DiscoveryCandidate, target: DiscoveryTarget): DistanceContributions {
  const totalVariation = candidate.metrics.slope_histogram.reduce(
    (sum, value, index) => sum + Math.abs(value - target.metrics.slope_histogram[index]),
    0,
  ) / 2;
  const reliefDifference = Math.abs(candidate.metrics.relief_m - target.metrics.relief_m)
    / Math.max(candidate.metrics.relief_m, target.metrics.relief_m, 1);
  const histogramContribution = 0.7 * totalVariation;
  const reliefContribution = 0.3 * reliefDifference;
  return {
    totalVariation,
    reliefDifference,
    histogramContribution,
    reliefContribution,
    distance: histogramContribution + reliefContribution,
  };
}

export function comparisonCameraDistance(viewportWidth: number, viewportHeight: number): number {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const verticalTangent = Math.tan(36 * Math.PI / 360);
  const horizontalTangent = verticalTangent * safeWidth / safeHeight;
  const terrainRadius = 520;
  return terrainRadius / Math.min(verticalTangent, horizontalTangent) * 1.08;
}

export const comparisonGrid = {
  size: GRID_SIZE,
  spacingM: CELL_SPACING_M,
  cellCenterExtentM: CELL_CENTER_HALF_EXTENT_M * 2,
  supportExtentM: 600,
  distancesM: Array.from({ length: GRID_SIZE }, (_, index) => index * CELL_SPACING_M),
  maximumContourFloats: (GRID_SIZE - 1) * (GRID_SIZE - 1) * 2 * 5 * 6,
} as const;
