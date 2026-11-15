import { useEffect, useState } from 'react';
import type { SurfaceCatalog, SurfaceRecord } from '@shared/types/surface-catalog';
import type { SurfaceAnalysisCatalog } from '@shared/types/surface-analysis';
import { getSurfaceCatalogSha256 } from '../data/surfaceCatalog';
import { loadSurfaceAnalysis } from '../data/surfaceAnalysis';
import './surface-analysis.css';

const format = (v: number | null, unit: string) => v === null ? 'Unavailable' : `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`;
const referenceTitle = (url: string) => ({
  'https://gdal.org/en/stable/programs/gdaldem.html': 'GDAL terrain methods',
  'https://github.com/OSGeo/gdal/blob/v3.11.0/apps/gdaldem_lib.cpp': 'GDAL terrain implementation',
  'https://pgda.gsfc.nasa.gov/products/78': 'NASA LOLA accuracy and coverage',
  'https://pubs.usgs.gov/publication/tm11B9': 'USGS DEM quality methods',
  'https://www.uahirise.org/dtm/howto.php': 'HiRISE DTM guide',
}[url] ?? `${new URL(url).hostname} · method reference`);
export function SurfaceAnalysisPanel({ surface, catalog }: { surface: SurfaceRecord; catalog: SurfaceCatalog }) {
  const [data, setData] = useState<SurfaceAnalysisCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const c = new AbortController(); setData(null); setError(null);
    const hash = getSurfaceCatalogSha256(catalog);
    if (!hash) { setError('Prepared analysis unavailable: source catalog identity has not been verified.'); return; }
    loadSurfaceAnalysis(catalog, hash, c.signal).then(setData).catch(e => { if (!c.signal.aborted) setError(String(e.message ?? e)); });
    return () => c.abort();
  }, [catalog]);
  const record = data?.surfaces.find(r => r.surface_id === surface.id);
  return <section className="sa-panel" aria-labelledby="sa-title"><div className="sa-heading"><div><span className="px-eyebrow">DERIVED FROM SOURCE ELEVATION</span><h3 id="sa-title">Terrain analysis</h3></div><span>Native-grid estimates · no ranking</span></div>
    {error ? <p role="status">{error}</p> : !record ? <p role="status">Verifying prepared terrain analysis…</p> : <>
      <p className="sa-context">{surface.name} · {surface.grid.spacing_m.map(v => format(v, 'm')).join(' × ')} source grid spacing</p>
      <p className="sa-context">Metrics depend on grid spacing and window extent. Source projection distances are approximate.</p><dl className="sa-metrics">{[
        ['Mean slope', record.metrics.mean_slope_deg, '°'], ['95th percentile slope', record.metrics.p95_slope_deg, '°'], ['Maximum slope', record.metrics.max_slope_deg, '°'], ['Elevation relief', record.metrics.relief_m, 'm'], ['Mean 3 × 3 roughness', record.metrics.mean_roughness_m, 'm'], ['Mean terrain ruggedness (TRI)', record.metrics.mean_tri_m, 'm'],
      ].map(([label, value, unit]) => <div key={String(label)}><dt>{label}</dt><dd>{format(value as number | null, String(unit))}</dd></div>)}</dl>
      <div className="sa-distribution"><h4>Slope distribution</h4><p>Percent of analyzed cells; boundary and incomplete 3 × 3 neighborhoods excluded.</p><ul>{record.slope_histogram.map((b, i) => <li key={b.min_deg}><span>{b.min_deg}–{b.max_deg}°{i === record.slope_histogram.length - 1 ? ' inclusive' : ''}</span><span className="sa-track" aria-hidden="true"><i style={{ width: `${b.fraction_pct ?? 0}%` }} /></span><strong>{format(b.fraction_pct, '%')}</strong><span className="sa-bin-count">{b.samples.toLocaleString('en-US')} cells</span></li>)}</ul></div>
      <p className="sa-coverage">Valid elevations: {record.coverage.valid_height_samples.toLocaleString('en-US')} / {record.coverage.total_samples.toLocaleString('en-US')} samples. Analyzed centers: {record.coverage.analyzed_centers.toLocaleString('en-US')} / {record.coverage.possible_interior_centers.toLocaleString('en-US')} interior cells.</p>
      <details><summary>Method, source binding & limitations</summary><p>Horn 3 × 3 slope uses elevation differences in both grid directions and the source spacing, reported in degrees. Spacing is in projected meters or a center-of-window meter approximation; it is not an exact geodetic ground distance. Roughness is the maximum minus minimum elevation in each complete 3 × 3 neighborhood. Roughness and TRI include the local gradient; they do not measure rockiness. TRI is the square root of the sum of squared elevation differences between the center and its eight neighbors, in meters. Relief spans all valid elevations in this window.</p><p>Maximum 3 × 3 roughness: {format(record.metrics.max_roughness_m, 'm')}. Analysis generated {data?.generated_at}. Elevation and mask checksums, grid dimensions, spacing, and source catalog identity verified.</p><ul>{record.limitations.map(l => <li key={l}>{l}</li>)}</ul><p>These grid-scale measurements do not establish traversability or landing suitability.</p><ul>{data?.method.references.map((url) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{referenceTitle(url)}</a></li>)}</ul></details>
    </>}
  </section>;
}
