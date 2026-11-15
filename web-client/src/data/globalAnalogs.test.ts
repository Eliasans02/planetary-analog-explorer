import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateGlobalAnalogs } from './globalAnalogs';
import { validateEarthDiscovery } from './earthDiscovery';

const catalog = JSON.parse(readFileSync(new URL('../../public/data/global_analogs.json', import.meta.url), 'utf8'));
const regions = validateGlobalAnalogs(catalog);
describe('worldwide research catalog', () => {
  it('provides published references, bounded paths and one evidence-supported answer per expedition', () => {
    expect(regions).toHaveLength(7);
    expect(new Set(regions.map(region => region.country)).size).toBe(6);
    expect(regions.filter(region => region.latitude < 0)).toHaveLength(3);
    expect(regions.filter(region => region.bodies.includes('moon')).map(region => region.id)).toEqual(['haughton', 'lanzarote']);
  });
  it.each(['unsafe link', 'duplicate ID', 'non-finite latitude', 'untrusted data path', 'ambiguous answer'])('rejects %s', kind => {
    const data = structuredClone(catalog);
    if (kind === 'unsafe link') data.regions[0].papers[0].url = 'javascript:alert(1)';
    if (kind === 'duplicate ID') data.regions[1].id = data.regions[0].id;
    if (kind === 'non-finite latitude') data.regions[0].latitude = NaN;
    if (kind === 'untrusted data path') data.regions[0].discovery_path = 'https://other.example/data.json';
    if (kind === 'ambiguous answer') data.regions[0].choices[1].correct = true;
    expect(() => validateGlobalAnalogs(data)).toThrow();
  });
  it.each(regions)('validates measured $id grids, local ranks and source identities', region => {
    const raw = JSON.parse(readFileSync(new URL(`../../public${region.discovery_path}`, import.meta.url), 'utf8'));
    const survey = validateEarthDiscovery(raw);
    expect(survey.domain.area_km2).toBe(36);
    expect(survey.domain.generated_count).toBe(100);
    expect(survey.domain.eligible_count).toBeGreaterThan(0);
    expect(survey.domain.crs.startsWith(region.latitude < 0 ? 'EPSG:327' : 'EPSG:326')).toBe(true);
    expect(survey.candidates.every(candidate => candidate.id.startsWith(region.id) && candidate.novelty === 'unresolved')).toBe(true);
    expect(survey.sources.some(source => source.role.startsWith('Earth'))).toBe(true);
  });
});
