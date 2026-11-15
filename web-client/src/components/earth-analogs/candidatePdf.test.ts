import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { EarthDiscovery } from '@shared/types/earth-discovery';
import { buildCandidatePdf } from './candidatePdf';

const discovery = JSON.parse(readFileSync(new URL('../../../public/data/earth_discovery.json', import.meta.url), 'utf8')) as EarthDiscovery;

describe('candidate scientific PDF', () => {
  it('creates a real five-page PDF from the published measured comparison', async () => {
    const target = discovery.targets[0];
    const candidate = discovery.candidates.find(item => item.comparisons[target.id].rank === 1)!;
    const blob = await buildCandidatePdf(discovery, candidate, target);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const raw = Buffer.from(bytes).toString('latin1');

    expect(blob.type).toBe('application/pdf');
    expect(bytes.byteLength).toBeGreaterThan(30_000);
    expect(raw.slice(0, 8)).toMatch(/^%PDF-1\./);
    expect(raw).toContain('/Count 5');
    expect(raw).toContain(discovery.run_id);
    expect(raw).toContain('MEASURED ROW 5');

    const output = fileURLToPath(new URL('../../../outputs/candidate-report.pdf', import.meta.url));
    mkdirSync(fileURLToPath(new URL('../../../outputs/', import.meta.url)), { recursive: true });
    writeFileSync(output, bytes);
  });

  it('rejects an incomplete terrain grid', async () => {
    const target = structuredClone(discovery.targets[0]);
    target.heights_m.pop();
    await expect(buildCandidatePdf(discovery, discovery.candidates[0], target)).rejects.toThrow('complete measured candidate comparison');
  });
});
