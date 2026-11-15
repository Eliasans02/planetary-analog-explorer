import { describe, expect, it } from 'vitest';
import { earthTileAt, earthTileBounds, earthTileLevel, earthTileUrl, tileGrid } from './earthTileGrid';

describe('NASA GIBS geographic tile grid', () => {
  it('matches the published 500 m matrix including its partial edge tiles', () => {
    expect(Array.from({ length: 8 }, (_, level) => {
      const { columns, rows } = tileGrid(level); return [columns, rows];
    })).toEqual([[2, 1], [3, 2], [5, 3], [10, 5], [20, 10], [40, 20], [80, 40], [160, 80]]);
    expect(earthTileBounds({ level: 0, row: 0, col: 1 })).toEqual({ west: 108, east: 180, north: 90, south: -90, span: 288 });
  });
  it('locates Ustyurt and handles the seam and poles without requesting nonexistent tiles', () => {
    const tile = earthTileAt(43, 54, 7);
    expect(tile).toEqual({ level: 7, row: 20, col: 104 });
    expect(earthTileBounds(tile)).toEqual({ west: 54, east: 56.25, north: 45, south: 42.75, span: 2.25 });
    expect(earthTileAt(-90, 180, 7)).toEqual({ level: 7, row: 79, col: 0 });
    expect(earthTileAt(90, -540, 7)).toEqual({ level: 7, row: 0, col: 0 });
    expect(earthTileUrl(tile)).toBe('https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/500m/7/20/104.jpeg');
  });
  it('increases real detail on approach and rejects invalid tile requests', () => {
    expect(earthTileLevel(1.15, 1800, 38)).toBe(7);
    expect(earthTileLevel(3.3, 1800, 38)).toBeLessThan(earthTileLevel(1.5, 1800, 38));
    expect(() => earthTileAt(NaN, 0, 7)).toThrow();
    expect(() => tileGrid(8)).toThrow();
    expect(() => earthTileUrl({ level: 7, row: 80, col: 1 })).toThrow();
  });
});
