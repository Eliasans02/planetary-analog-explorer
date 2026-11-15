import type { ResearchRegion } from '../../data/globalAnalogs';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Compass, Download, Info } from 'lucide-react';
import { buildCandidateReport } from './candidateReport';
import { RelativeElevationGrid } from './RelativeElevationGrid';
import type {
  DiscoveryCandidate,
  DiscoveryTarget,
  EarthDiscovery,
} from '@shared/types/earth-discovery';
import {
  buildCandidateEvidenceJson,
  buildCandidateGeoJson,
  formatCoordPair,
  formatDelta,
  formatNum,
  haversineKm,
  triggerBlobDownload,
} from './types';

export interface CandidateDetailProps {
  researchRegion?: ResearchRegion;
  discovery: EarthDiscovery;
  target: DiscoveryTarget;
  candidate: DiscoveryCandidate;
  onExploreTarget?: (surfaceId: string) => void;
  onOpenProvenance: (trigger: HTMLElement) => void;
}

export function CandidateDetail({
  discovery,
  researchRegion,
  target,
  candidate,
  onExploreTarget,
  onOpenProvenance,
}: CandidateDetailProps) {
  const comparison = candidate.comparisons[target.id] ?? null;
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const downloadPdf = async () => {
    setPdfBusy(true); setPdfError('');
    try {
      const { buildCandidatePdf } = await import('./candidatePdf');
      const blob = await buildCandidatePdf(discovery, candidate, target, researchRegion);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${candidate.id}_${target.id}_report.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setPdfError('The PDF could not be generated. Please retry or download the evidence JSON.');
    } finally { setPdfBusy(false); }
  };

  const nearestBaseline = useMemo(() => {
    if (!discovery.baseline.sites.length) return null;
    let best = { site: discovery.baseline.sites[0], km: Infinity };
    for (const site of discovery.baseline.sites) {
      const km = haversineKm(candidate.latitude, candidate.longitude, site.latitude, site.longitude);
      if (km < best.km) best = { site, km };
    }
    return best;
  }, [discovery.baseline.sites, candidate.latitude, candidate.longitude]);

  const binRows = useMemo(() => {
    const bins = discovery.method.slope_bins_deg;
    const tHist = target.metrics.slope_histogram;
    const cHist = candidate.metrics.slope_histogram;
    const tTotal = tHist.reduce((a, b) => a + b, 0);
    const cTotal = cHist.reduce((a, b) => a + b, 0);
    const tScale = tTotal > 0 && tTotal <= 1.5 ? 100 : 1;
    const cScale = cTotal > 0 && cTotal <= 1.5 ? 100 : 1;
    const len = Math.max(tHist.length, cHist.length);

    return Array.from({ length: len }, (_, i) => {
      let label = `Bin ${i + 1}`;
      if (bins.length === len + 1) {
        label = `${bins[i]}–${bins[i + 1]}°`;
      } else if (bins.length === len) {
        label = i < bins.length - 1 ? `${bins[i]}–${bins[i + 1]}°` : `≥${bins[i]}°`;
      }
      const tPct = (tHist[i] ?? 0) * tScale;
      const cPct = (cHist[i] ?? 0) * cScale;
      return { label, tPct, cPct };
    });
  }, [discovery.method.slope_bins_deg, target.metrics.slope_histogram, candidate.metrics.slope_histogram]);

  const metricRows: [string, number, number, string, number][] = [
    [
      'Mean slope',
      target.metrics.mean_slope_deg,
      candidate.metrics.mean_slope_deg,
      '°',
      2,
    ],
    [
      '95th pct slope',
      target.metrics.p95_slope_deg,
      candidate.metrics.p95_slope_deg,
      '°',
      2,
    ],
    ['Relief', target.metrics.relief_m, candidate.metrics.relief_m, 'm', 1],
    ['Roughness', target.metrics.roughness_m, candidate.metrics.roughness_m, 'm', 2],
    [
      'Valid cells',
      target.metrics.valid_fraction * 100,
      candidate.metrics.valid_fraction * 100,
      '%',
      1,
    ],
  ];

  const handleDownloadGeoJson = () => {
    const content = buildCandidateGeoJson(discovery, candidate, target);
    triggerBlobDownload(
      `${candidate.id}_${target.id}.geojson`,
      content,
      'application/geo+json;charset=utf-8',
    );
  };

  const handleDownloadEvidence = () => {
    const content = buildCandidateEvidenceJson(discovery, candidate, target);
    triggerBlobDownload(
      `${candidate.id}_${target.id}_evidence.json`,
      content,
      'application/json;charset=utf-8',
    );
  };

  const gridSize = discovery.method.grid_size || 10;

  return (
    <section className="eaf-pane-detail" aria-label="Selected candidate comparison">
      <div className="eaf-detail-header">
        <div className="eaf-detail-title-row">
          <div>
            <h2>{candidate.name}</h2>
            <div className="eaf-detail-coords eaf-mono">
              {candidate.id} · {formatCoordPair(candidate.latitude, candidate.longitude, 5)}
            </div>
          </div>

          <div className="eaf-detail-actions">
            <button type="button" className="eaf-btn-primary" disabled={pdfBusy} onClick={() => void downloadPdf()}>
              <Download size={13} aria-hidden="true" /><span>{pdfBusy ? 'Preparing PDF…' : 'Download PDF report'}</span>
            </button>
            {pdfError && <p role="alert">{pdfError}</p>}
            <button
              type="button"
              className="eaf-btn-primary"
              disabled={!onExploreTarget || !target.surface_id}
              onClick={() => onExploreTarget?.(target.surface_id)}
              title={
                onExploreTarget
                  ? `Open the 3D context view for ${target.name}. It is separate from this ${discovery.method.window_size_m} m comparison window.`
                  : 'Target terrain navigation unavailable in standalone view'
              }
            >
              <Compass size={14} aria-hidden="true" />
              <span>View 3D target context</span>
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="eaf-btn-subtle"
              onClick={handleDownloadGeoJson}
            >
              <Download size={13} aria-hidden="true" />
              <span>GeoJSON</span>
            </button>
            <button
              type="button"
              className="eaf-btn-subtle"
              onClick={handleDownloadEvidence}
            >
              <Download size={13} aria-hidden="true" />
              <span>Evidence JSON</span>
            </button>
            <button type="button" className="eaf-btn-subtle" onClick={() => triggerBlobDownload(
              `${candidate.id}_${target.id}_report.html`,
              buildCandidateReport(discovery, candidate, target),
              'text/html;charset=utf-8',
            )}>
              <Download size={13} aria-hidden="true" />
              <span>Download research report</span>
            </button>
          </div>
        </div>
      </div>

      {/* Exploratory ranking & distance summary */}
      <div className="eaf-kpi-grid">
        <div className="eaf-kpi-cell">
          <span className="eaf-kpi-label">Exploratory topographic distance</span>
          <span className="eaf-kpi-val eaf-kpi-val-accent eaf-mono">
            {comparison ? formatNum(comparison.distance, 4) : '—'}
          </span>
          <span className="eaf-kpi-note">
            Lower is closer (0 = equal slope histogram and relief, not a % similarity or habitat score)
          </span>
        </div>

        <div className="eaf-kpi-cell">
          <span className="eaf-kpi-label">Rank in searched area</span>
          <span className="eaf-kpi-val eaf-mono">
            #{comparison?.rank ?? '—'}
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--eaf-text-muted)', marginLeft: 4 }}>
              / {discovery.domain.eligible_count.toLocaleString('en-US')}
            </span>
          </span>
          <span className="eaf-kpi-note">
            {discovery.method.window_size_m} m windows · {discovery.method.grid_spacing_m} m analysis grid
          </span>
        </div>

        <div className="eaf-kpi-cell">
          <span className="eaf-kpi-label">Sensitivity rank</span>
          <span className="eaf-kpi-val eaf-mono">#{comparison?.sensitivity_rank ?? '—'}</span>
          <span className="eaf-kpi-note">
            {comparison?.shortlisted
              ? `Shortlisted (≥${formatNum(discovery.method.shortlist_separation_m / 1000, 1)} km separation)`
              : `Not in spatially separated top shortlist`}
          </span>
        </div>

        <div className="eaf-kpi-cell">
          <span className="eaf-kpi-label">Reference baseline status</span>
          <span className="eaf-kpi-val" style={{ fontSize: 14, lineHeight: 1.35 }}>
            {candidate.novelty === 'outside_reference_baseline'
              ? 'Outside loaded baseline'
              : 'Unresolved vs baseline'}
          </span>
          <span className="eaf-kpi-note">
            {nearestBaseline
              ? `Nearest loaded reference: ${nearestBaseline.site.name} (~${Math.round(nearestBaseline.km).toLocaleString('en-US')} km)`
              : 'Compared against loaded NASA reference sites'}
          </span>
        </div>
      </div>

      {candidate.novelty === 'outside_reference_baseline' && (
        <div className="eaf-baseline-notice" role="note">
          <strong>Baseline check:</strong> Outside the loaded NASA-known Earth analog reference
          circles ({discovery.baseline.sites.length} reference sites). Being outside this reference
          baseline only shows it is not in the reference list — it is <strong>not</strong> proof
          that this site has never been studied or published elsewhere.
        </div>
      )}

      {/* Side-by-side metrics table */}
      <div className="eaf-section">
        <div className="eaf-section-head">
          <h3>Topographic metrics vs target</h3>
          <span className="eaf-section-note eaf-mono">
            {target.body.toUpperCase()} · {target.name}
          </span>
        </div>

        <table className="eaf-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Target</th>
              <th>Candidate</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody className="eaf-mono">
            {metricRows.map(([label, tVal, cVal, unit, digits]) => (
              <tr key={label}>
                <td style={{ fontFamily: 'inherit' }}>{label}</td>
                <td>
                  {formatNum(tVal, digits)} {unit}
                </td>
                <td>
                  {formatNum(cVal, digits)} {unit}
                </td>
                <td>{formatDelta(cVal - tVal, unit, digits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Slope distribution comparison */}
      <div className="eaf-section">
        <div className="eaf-section-head">
          <h3>Slope distribution comparison</h3>
          <span className="eaf-section-note">% of valid interior slope samples</span>
        </div>

        <div className="eaf-bins">
          <div className="eaf-bin-legend">
            <span className="eaf-legend-item">
              <span className="eaf-swatch" style={{ background: '#f59e0b' }} aria-hidden="true" />
              <span>Target ({target.name})</span>
            </span>
            <span className="eaf-legend-item">
              <span className="eaf-swatch" style={{ background: '#38bdf8' }} aria-hidden="true" />
              <span>Candidate ({candidate.id})</span>
            </span>
          </div>

          {binRows.map((row) => (
            <div key={row.label} className="eaf-bin-row">
              <span className="eaf-mono">{row.label}</span>
              <div className="eaf-bin-bars" aria-hidden="true">
                <span className="eaf-bin-track">
                  <span
                    className="eaf-bin-fill-target"
                    style={{ width: `${Math.min(100, Math.max(0, row.tPct))}%` }}
                  />
                </span>
                <span className="eaf-bin-track">
                  <span
                    className="eaf-bin-fill-cand"
                    style={{ width: `${Math.min(100, Math.max(0, row.cPct))}%` }}
                  />
                </span>
              </div>
              <span className="eaf-mono" style={{ textAlign: 'right', color: 'var(--eaf-text-secondary)' }}>
                {formatNum(row.tPct, 1)}% / {formatNum(row.cPct, 1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Side-by-side 10x10 relative elevation heatmaps */}
      <div className="eaf-section">
        <div className="eaf-section-head">
          <h3>Relative elevation · {discovery.method.grid_spacing_m} m analysis grid</h3>
          <span className="eaf-section-note">
            {gridSize} × {gridSize} common-grid values · not native sensor resolution or photography
          </span>
        </div>

        <div className="eaf-heatmaps">
          <RelativeElevationGrid
            title={`Target: ${target.name}`}
            subtitle={`Planetary target · ${discovery.method.grid_spacing_m} m aggregated cells`}
            heights={target.heights_m}
            gridSize={gridSize}
          />
          <RelativeElevationGrid
            title={`Earth: ${candidate.name}`}
            subtitle={`Earth candidate · ${discovery.method.grid_spacing_m} m aggregated cells`}
            heights={candidate.heights_m}
            gridSize={gridSize}
          />
        </div>
      </div>

      {/* Supported vs Not Measured + Provenance entry point */}
      <div className="eaf-section">
        <div className="eaf-section-head">
          <h3>Scope &amp; scientific boundaries</h3>
          <button
            type="button"
            className="eaf-btn-subtle"
            onClick={(event) => onOpenProvenance(event.currentTarget)}
          >
            <Info size={13} aria-hidden="true" />
            <span>Method, exclusions &amp; hashes</span>
          </button>
        </div>

        <div className="eaf-scope-grid">
          <div className="eaf-scope-box">
            <h4>Measured in this comparison</h4>
            <ul>
              <li>{discovery.method.window_size_m} m window extent</li>
              <li>
                {discovery.method.grid_spacing_m} m common-grid height cells (not source resolution)
              </li>
              <li>Mean &amp; p95 slope, slope bins</li>
              <li>Window relief &amp; 3×3 roughness</li>
            </ul>
          </div>
          <div className="eaf-scope-box">
            <h4>Not measured (no full-environment analog)</h4>
            <ul>
              <li>Climate, temperature &amp; atmosphere</li>
              <li>Geology, mineralogy &amp; regolith</li>
              <li>Radiation, gravity &amp; water ice</li>
              <li>Ground access &amp; landing logistics</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
