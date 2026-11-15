import { describe, expect, it } from 'vitest';
import type { PlanetRecord } from '@shared/types/planet-catalog';
import { planetResolution } from './planetResolution';

// Selection-only metadata. Never exported as scientific data.
const planet = (textures: Array<{label: '1K'|'2K'|'4K'|'Native';width:number}>) => ({textures}) as PlanetRecord;
describe('available source resolution', () => {
  it('caps unavailable large requests at the actual native Mars source', () => {
    const mars=planet([{label:'1K',width:1024},{label:'Native',width:1440}]);
    expect(planetResolution(mars,'4K')).toBe('Native');
    expect(planetResolution(mars,'1K')).toBe('1K');
    expect(planetResolution(mars,'Native')).toBe('Native');
  });
  it('uses only existing assets for another planet and rejects absent imagery', () => {
    const moon=planet([{label:'4K',width:4096},{label:'1K',width:1024},{label:'2K',width:2048}]);
    expect(planetResolution(moon,'Native')).toBe('4K');
    expect(planetResolution(moon,'2K')).toBe('2K');
    expect(() => planetResolution(planet([]),'1K')).toThrow('No verified texture');
  });
});
