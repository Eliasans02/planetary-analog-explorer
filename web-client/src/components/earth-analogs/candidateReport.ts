import type { DiscoveryCandidate, DiscoveryTarget, EarthDiscovery } from '@shared/types/earth-discovery';
import { formatCoordPair, formatNum } from './types';

function escape(value: unknown): string {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function sourceLink(url: string, title: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) {
      return `<a href="${escape(parsed.href)}" rel="noreferrer noopener">${escape(title)}</a>`;
    }
  } catch { /* Preserve the citation title without an unsafe link. */ }
  return escape(title);
}

function elevationProfile(candidate: DiscoveryCandidate, target: DiscoveryTarget, gridSize: number, spacing: number): string {
  const row = Math.floor((gridSize - 1) / 2);
  const earth = candidate.heights_m.slice(row * gridSize, (row + 1) * gridSize);
  const planet = target.heights_m.slice(row * gridSize, (row + 1) * gridSize);
  const maximum = Math.max(1, ...earth, ...planet);
  const path = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'}${(50 + index / (gridSize - 1) * 630).toFixed(2)},${(195 - value / maximum * 155).toFixed(2)}`).join(' ');
  return `<figure><svg viewBox="0 0 730 240" role="img" aria-label="Earth and planetary elevation profile on shared metre axes">
  <title>Measured row ${row + 1} profile</title>
  ${[0, 0.5, 1].map(fraction => `<line x1="50" y1="${195 - fraction * 155}" x2="680" y2="${195 - fraction * 155}" stroke="#d7e0e7"/><text x="42" y="${199 - fraction * 155}" text-anchor="end">${formatNum(maximum * fraction, 1)} m</text>`).join('')}
  ${[0, 0.5, 1].map(fraction => `<text x="${50 + fraction * 630}" y="220" text-anchor="middle">${formatNum((gridSize - 1) * spacing * fraction, 0)} m</text>`).join('')}
  <path d="${path(earth)}" fill="none" stroke="#087f8c" stroke-width="3"/>
  <path d="${path(planet)}" fill="none" stroke="#b55b12" stroke-width="3"/>
  </svg><figcaption><span class="earth">Earth</span> · <span class="planet">${escape(target.body === 'moon' ? 'Moon' : 'Mars')}</span> — row ${row + 1}, left to right in source-grid order. Heights are metres above each window’s own minimum. Lines connect aggregate samples; they add no finer measurements or common geographic bearing.</figcaption></figure>`;
}

export function buildCandidateReport(discovery: EarthDiscovery, candidate: DiscoveryCandidate, target: DiscoveryTarget): string {
  const comparison = candidate.comparisons[target.id];
  const size = discovery.method.grid_size;
  if (!comparison || !Number.isInteger(size) || size < 2 || size > 100
    || [candidate.heights_m, target.heights_m].some(grid => grid.length !== size * size || grid.some(value => !Number.isFinite(value)))) {
    throw new Error('A complete measured candidate comparison is required for the report.');
  }
  const metrics: [string, number, number, string][] = [
    ['Mean slope', candidate.metrics.mean_slope_deg, target.metrics.mean_slope_deg, '°'],
    ['95th percentile slope', candidate.metrics.p95_slope_deg, target.metrics.p95_slope_deg, '°'],
    ['Relief', candidate.metrics.relief_m, target.metrics.relief_m, 'm'],
    ['Roughness', candidate.metrics.roughness_m, target.metrics.roughness_m, 'm'],
    ['Valid coverage', candidate.metrics.valid_fraction * 100, target.metrics.valid_fraction * 100, '%'],
  ];
  const limits = [
    `This comparison searches ${discovery.domain.area_km2} km² in one Earth domain against ${discovery.targets.length} prepared targets. Rank is local to this bounded cohort, not a global best match.`,
    'Geology, climate, radiation, gravity, water ice and access were not measured. Terrain resemblance does not establish a full-environment analog, habitat suitability, landing safety or calibrated probability.',
    ...discovery.limitations,
    ...target.limitations,
  ];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escape(candidate.name)} — ${escape(target.name)} | ASTRAS research report</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#edf2f5;color:#172c3c;font:15px/1.55 system-ui,sans-serif}main{max-width:960px;margin:32px auto;padding:44px;background:white;border:1px solid #dbe4eb;border-radius:12px}header{border-bottom:2px solid #172c3c;padding-bottom:24px}.eyebrow{color:#087f8c;font-size:12px;letter-spacing:.15em;font-weight:700}h1{font-size:30px;line-height:1.15;margin:12px 0}h2{font-size:19px;margin:28px 0 12px}p{margin:8px 0}.muted,figcaption{color:#526675;font-size:13px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}.summary div{border:1px solid #cfdae2;border-radius:8px;padding:16px}.summary strong{display:block;font-size:27px}.summary span{font-size:12px;color:#526675}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:10px 12px;border-bottom:1px solid #dbe4eb;text-align:right}th:first-child,td:first-child{text-align:left}thead{background:#eff5f7}figure{margin:20px 0}svg{display:block;width:100%;height:auto}svg text{font:12px system-ui,sans-serif;fill:#526675}.earth{color:#087f8c;font-weight:700}.planet{color:#b55b12;font-weight:700}code,pre{font:12px/1.6 ui-monospace,monospace;overflow-wrap:anywhere;white-space:pre-wrap}pre{padding:14px;background:#f1f5f8;border:1px solid #dbe4eb}li{margin:8px 0}a{color:#086d9b;overflow-wrap:anywhere}.sources li{padding:10px 0;border-bottom:1px solid #dbe4eb}.sources p{font-size:12px}.notice{padding:16px;border-left:4px solid #ca8b20;background:#fff9ed}footer{margin-top:28px;padding-top:16px;border-top:1px solid #dbe4eb;font-size:12px;color:#526675}@media(max-width:600px){main{margin:0;padding:22px;border:0;border-radius:0}.summary{grid-template-columns:1fr}h1{font-size:25px}th,td{padding:8px 5px;font-size:12px}}@media print{@page{margin:15mm}body{background:white;font-size:11px}main{max-width:none;margin:0;padding:0;border:0}h2{break-after:avoid}figure,table,.summary,.sources li{break-inside:avoid}a{color:#172c3c;text-decoration:none}.print-note{display:none}}
</style></head><body><main>
<header><div class="eyebrow">ASTRAS · CHALLENGE 5 · RESEARCH REPORT</div><h1>${escape(candidate.name)}</h1><p>Terrain comparison with <strong>${escape(target.name)}</strong> (${escape(target.body)}).</p><p class="muted">Earth centre: ${escape(formatCoordPair(candidate.latitude, candidate.longitude, 5))} · ${escape(candidate.id)}<br>Target centre: ${escape(formatCoordPair(target.latitude, target.longitude, 5))} · ${escape(target.id)}</p><p class="muted print-note">Self-contained report. Use your browser’s Print command to save a PDF.</p></header>
<div class="summary"><div><span>Exploratory distance · lower is closer</span><strong>${formatNum(comparison.distance, 6)}</strong></div><div><span>Rank in searched area</span><strong>${comparison.rank} / ${discovery.domain.eligible_count}</strong></div><div><span>Sensitivity rank · 0.5 / 0.5 weights</span><strong>${comparison.sensitivity_rank}</strong></div></div>
<p class="notice">This is an exploratory topographic comparison, not a percentage similarity, calibrated probability or mission-suitability recommendation.</p>
<h2>Search and measurement support</h2><p>${escape(discovery.domain.name)} · ${formatNum(discovery.domain.area_km2, 0)} km² · ${discovery.domain.generated_count} generated windows · ${discovery.domain.eligible_count} eligible · ${discovery.domain.excluded_count} excluded.</p><p>${discovery.method.window_size_m} m support, ${size} × ${size} aggregate cells at ${discovery.method.grid_spacing_m} m spacing; ${(size - 1) * discovery.method.grid_spacing_m} m between outer cell centres. The output grid is not native sensor resolution. Survey CRS: ${escape(discovery.domain.crs)}.</p><p>${escape(discovery.method.description)}</p>
<h2>Measured terrain</h2><table><thead><tr><th>Metric</th><th>Earth candidate</th><th>${escape(target.body === 'moon' ? 'Moon' : 'Mars')} target</th></tr></thead><tbody>${metrics.map(([name, earth, planet, unit]) => `<tr><td>${escape(name)}</td><td>${formatNum(earth, 3)} ${unit}</td><td>${formatNum(planet, 3)} ${unit}</td></tr>`).join('')}</tbody></table>
${elevationProfile(candidate, target, size, discovery.method.grid_spacing_m)}
<h2>Ranking method</h2><p>Distance = 0.7 × total variation of slope distributions + 0.3 × normalized relief difference.</p><pre>${escape(discovery.method.distance_formula)}</pre><p>${escape(discovery.method.sensitivity)} ${escape(discovery.method.uncertainty)}</p><p>${comparison.shortlisted ? 'Included in' : 'Outside'} the spatially separated shortlist; required separation is ${formatNum(discovery.method.shortlist_separation_m, 0)} m. Baseline status: ${escape(candidate.novelty)}. Outside the reference baseline does not establish new-to-science status.</p>
<h2>Limits of the conclusion</h2><ul>${limits.map(limit => `<li>${escape(limit)}</li>`).join('')}</ul>
<h2>Source catalogue and exact data identities</h2><p class="muted">All sources from this discovery run are retained below. The role identifies Earth evidence, the selected target, or the other prepared target. Hash scopes must be read alongside each hash.</p><ol class="sources">${discovery.sources.map(source => `<li><strong>${sourceLink(source.url, source.title)}</strong><p>${escape(source.provider)} · ${escape(source.role)}${target.source_ids.includes(source.id) ? ' · selected target source' : ''}</p><p>${escape(source.license)}</p><code>SHA-256 ${escape(source.sha256)}<br>${source.bytes} bytes · ${escape(source.hash_scope)}</code><p>${sourceLink(source.url, source.url)}</p></li>`).join('')}</ol>
<h2>Reproducibility</h2><p>Run: <code>${escape(discovery.run_id)}</code><br>Dataset generated: ${escape(discovery.generated_at)}<br>Method profile SHA-256: <code>${escape(discovery.method.profile_sha256)}</code><br>Reference baseline SHA-256: <code>${escape(discovery.baseline.sha256)}</code></p><p>Earth window polygon (longitude, latitude; EPSG:4326):</p><pre>${escape(JSON.stringify(candidate.footprint, null, 2))}</pre>
<footer>Generated from the selected ASTRAS candidate and target. This report uses the supplied measured dataset without live requests, external fonts, scripts or inferred fine-scale terrain.</footer>
</main></body></html>`;
}
