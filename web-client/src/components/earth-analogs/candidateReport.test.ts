import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EarthDiscovery } from '@shared/types/earth-discovery';
import { buildCandidateReport } from './candidateReport';
const discovery: EarthDiscovery = JSON.parse(readFileSync(new URL('../../../public/data/earth_discovery.json', import.meta.url), 'utf8'));

describe('self-contained candidate report', () => {
  it('binds the report to the selected target and measured candidate', () => {
    for (const target of discovery.targets) {
      const candidate = discovery.candidates.find(item => item.comparisons[target.id].rank === 1)!;
      const report = buildCandidateReport(discovery, candidate, target);
      expect(report).toContain(candidate.id);
      expect(report).toContain(target.id);
      expect(report).toContain(discovery.run_id);
      expect(report).toContain('540 m between outer cell centres');
      expect(report).toContain('<svg');
    }
  });
  it('escapes report text and excludes unsafe citation links', () => {
    const data = structuredClone(discovery), target = data.targets[0], candidate = data.candidates[0];
    candidate.name = '<script>alert("test")</script>';
    data.sources[0].url = 'javascript:alert(1)';
    const report = buildCandidateReport(data, candidate, target);
    expect(report).not.toContain('<script>');
    expect(report).toContain('&lt;script&gt;');
    expect(report).not.toContain('href="javascript:');
  });
});
