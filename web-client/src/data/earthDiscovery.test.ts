import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EarthDiscovery } from '@shared/types/earth-discovery';
import { loadEarthDiscovery, terrainDistance, validateEarthDiscovery } from './earthDiscovery';

function fixture(): EarthDiscovery {
  const metrics = { mean_slope_deg: 0, p95_slope_deg: 0, relief_m: 0, roughness_m: 0, slope_histogram: [1, 0, 0, 0, 0], valid_fraction: 1 };
  const grid = Array(100).fill(0);
  const ring: [number, number][] = [[54, 43], [55, 43], [55, 44], [54, 44], [54, 43]];
  return {
    schema_version: '1.0.0', run_id: 'TEST_ONLY', generated_at: '2026-11-15T00:00:00Z',
    method: { name: 'TEST_ONLY', description: 'Synthetic validation fixture, never production data.', grid_spacing_m: 60, window_size_m: 600, grid_size: 10,
      slope_bins_deg: [0, 5, 10, 20, 30, 90], distance_formula: '0.7 TV + 0.3 relative relief', sensitivity: '0.5 TV + 0.5 relative relief', shortlist_separation_m: 1800, profile_sha256: 'a'.repeat(64), uncertainty: 'Not quantified' },
    domain: { name: 'TEST_ONLY', description: 'Fixture', footprint: ring, crs: 'EPSG:32640', area_km2: 0.72, generated_count: 2, eligible_count: 2, excluded_count: 0, exclusion_reasons: {} },
    baseline: { description: 'TEST_ONLY', sha256: 'b'.repeat(64), sites: [] },
    sources: [{ id: 'test-source', title: 'Fixture', provider: 'Test', url: 'https://example.org/test', role: 'test', sha256: 'c'.repeat(64), bytes: 100, license: 'TEST_ONLY', hash_scope: 'Fixture only' }],
    targets: ['moon', 'mars'].map(body => ({ id: body, name: body, body: body as 'moon' | 'mars', surface_id: `test-${body}`, latitude: 0, longitude: 0, source_ids: ['test-source'], metrics: structuredClone(metrics), heights_m: [...grid], limitations: ['TEST_ONLY'] })),
    candidates: ['a', 'b'].map((id, index) => ({ id, name: `TEST_ONLY ${id}`, latitude: 43.5, longitude: 54.5, footprint: structuredClone(ring), metrics: structuredClone(metrics), heights_m: [...grid],
      comparisons: Object.fromEntries(['moon', 'mars'].map(body => [body, { distance: 0, rank: index + 1, sensitivity_rank: index + 1, shortlisted: index === 0 }])), novelty: 'unresolved' })),
    limitations: ['TEST_ONLY'],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Earth candidate evidence validation', () => {
  it('validates the published real-data cohort for Moon and Mars', () => {
    const data = validateEarthDiscovery(readActualDiscovery());
    expect(data.domain.generated_count).toBe(1600);
    expect(data.domain.area_km2).toBe(576);
    expect(data.candidates.length).toBeGreaterThan(1000);
    for (const target of data.targets) {
      expect(data.candidates.filter(candidate => candidate.comparisons[target.id].shortlisted)).toHaveLength(12);
    }
  });
  it('validates a complete cohort and stable ties', () => {
    expect(validateEarthDiscovery(fixture()).candidates).toHaveLength(2);
  });
  it('rejects missing source identities, targets, and cohort accounting', () => {
    const missing = fixture(); missing.targets[0].source_ids = ['absent'];
    expect(() => validateEarthDiscovery(missing)).toThrow('unknown target source');
    const target = fixture(); delete target.candidates[0].comparisons.mars;
    expect(() => validateEarthDiscovery(target)).toThrow('target comparison');
    const count = fixture(); count.domain.generated_count = 3;
    expect(() => validateEarthDiscovery(count)).toThrow('accounting');
  });
  it('rejects unsupported scores and reordered ranks', () => {
    const score = fixture(); score.candidates[0].comparisons.moon.distance = 0.95;
    expect(() => validateEarthDiscovery(score)).toThrow('distance does not match');
    const rank = fixture(); rank.candidates[0].comparisons.moon.rank = 2;
    expect(() => validateEarthDiscovery(rank)).toThrow('rank does not match');
    const sensitivity = fixture(); sensitivity.candidates[0].comparisons.moon.sensitivity_rank = 2;
    expect(() => validateEarthDiscovery(sensitivity)).toThrow('rank does not match');
  });
  it('rejects invalid geography, source links, and incomplete grids', () => {
    const location = fixture(); location.candidates[0].footprint[0] = [20, 10];
    expect(() => validateEarthDiscovery(location)).toThrow();
    const source = fixture(); source.sources[0].url = 'javascript:alert(1)';
    expect(() => validateEarthDiscovery(source)).toThrow('HTTPS');
    const grid = fixture(); grid.candidates[0].heights_m[1] = NaN;
    expect(() => validateEarthDiscovery(grid)).toThrow();
    const missing = fixture(); missing.candidates[0].metrics.valid_fraction = 0.9;
    expect(() => validateEarthDiscovery(missing)).toThrow('incomplete terrain');
  });
  it('computes finite symmetric distances including flat terrain', () => {
    const a = fixture().targets[0].metrics;
    const b = { ...a, relief_m: 10, slope_histogram: [0, 1, 0, 0, 0] };
    expect(terrainDistance(a, a)).toBe(0);
    expect(terrainDistance(a, b)).toBe(1);
    expect(terrainDistance(a, b)).toBe(terrainDistance(b, a));
    expect(terrainDistance(a, { ...a, relief_m: 0.5 })).toBeCloseTo(0.15);
  });
  it('bounds streamed responses and reports unavailable data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(8 * 1024 * 1024 + 1))));
    await expect(loadEarthDiscovery()).rejects.toThrow('loading limit');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(loadEarthDiscovery()).rejects.toThrow('could not be loaded');
  });
});

function readActualDiscovery() {
  return JSON.parse(readFileSync(new URL('../../public/data/earth_discovery.json', import.meta.url), 'utf8'));
}
