import { useMemo, useState } from 'react';
import type { DiscoveryCandidate, DiscoveryTarget, EarthDiscovery } from '@shared/types/earth-discovery';
import { TerrainPairViewport } from './TerrainPairViewport';
import {
  comparisonGrid,
  contourLevels,
  distanceContributions,
  terrainProfile,
  type ProfileDirection,
} from './terrainComparisonMath';
import './terrain-comparison.css';

export interface TerrainComparisonProps {
  discovery: EarthDiscovery;
  target: DiscoveryTarget;
  candidate: DiscoveryCandidate;
}

const number = (value: number, digits = 2) => value.toLocaleString('en-US', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});

function profilePath(values: number[], maximum: number, width: number, height: number, padding: number): string {
  return values.map((value, index) => {
    const x = padding + index / (values.length - 1) * (width - padding * 2);
    const y = height - padding - value / maximum * (height - padding * 2);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function ElevationProfile({ earth, target, direction, index, targetName }: {
  earth: number[];
  target: number[];
  direction: ProfileDirection;
  index: number;
  targetName: string;
}) {
  const width = 760;
  const height = 230;
  const padding = 38;
  const maximum = Math.max(1, ...earth, ...target);
  const earthPath = profilePath(earth, maximum, width, height, padding);
  const targetPath = profilePath(target, maximum, width, height, padding);
  const directionLabel = direction === 'row' ? 'left to right' : 'top to bottom';
  return (
    <div className="tc-chart-wrap">
      <svg className="tc-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Relative elevation profile ${directionLabel}, selected ${direction} ${index + 1}. Earth and ${targetName} share the same metre axis.`}>
        <title>Earth and {targetName} relative elevation profile</title>
        {[0, 0.5, 1].map(fraction => {
          const y = height - padding - fraction * (height - padding * 2);
          return <g key={fraction}><line x1={padding} y1={y} x2={width - padding} y2={y} className="tc-gridline" /><text x={padding - 8} y={y + 4} textAnchor="end">{number(maximum * fraction, 0)} m</text></g>;
        })}
        {[0, 180, 360, 540].map(distance => {
          const x = padding + distance / 540 * (width - padding * 2);
          return <g key={distance}><line x1={x} y1={padding} x2={x} y2={height - padding} className="tc-gridline" /><text x={x} y={height - 12} textAnchor="middle">{distance} m</text></g>;
        })}
        <path d={earthPath} className="tc-profile-earth" />
        <path d={targetPath} className="tc-profile-target" />
        {earth.map((value, sample) => {
          const x = padding + sample / 9 * (width - padding * 2);
          const y = height - padding - value / maximum * (height - padding * 2);
          return <circle key={`earth-${sample}`} cx={x} cy={y} r="2.4" className="tc-point-earth" />;
        })}
        {target.map((value, sample) => {
          const x = padding + sample / 9 * (width - padding * 2);
          const y = height - padding - value / maximum * (height - padding * 2);
          return <circle key={`target-${sample}`} cx={x} cy={y} r="2.4" className="tc-point-target" />;
        })}
      </svg>
      <div className="tc-legend"><span className="earth">Earth</span><span className="target">{targetName}</span><span>Shared axis · metres above each window minimum</span></div>
    </div>
  );
}

export function TerrainComparison({ discovery, target, candidate }: TerrainComparisonProps) {
  const [verticalExaggeration, setVerticalExaggeration] = useState<1 | 3>(1);
  const [direction, setDirection] = useState<ProfileDirection>('row');
  const [profileIndex, setProfileIndex] = useState(4);
  const [showContours, setShowContours] = useState(true);
  const [showMesh, setShowMesh] = useState(false);
  const elevationMaximum = Math.max(1, ...candidate.heights_m, ...target.heights_m);
  const comparison = candidate.comparisons[target.id];
  const contributions = useMemo(() => distanceContributions(candidate, target), [candidate, target]);
  const earthProfile = useMemo(
    () => terrainProfile(candidate.heights_m, direction, profileIndex),
    [candidate.heights_m, direction, profileIndex],
  );
  const targetProfile = useMemo(
    () => terrainProfile(target.heights_m, direction, profileIndex),
    [target.heights_m, direction, profileIndex],
  );
  const directionLabel = direction === 'row' ? 'LEFT → RIGHT' : 'TOP → BOTTOM';

  if (!comparison) {
    return <section className="tc-shell tc-unavailable" role="alert">This target comparison is absent from the verified discovery result.</section>;
  }

  return (
    <section className="tc-shell" aria-labelledby="terrain-comparison-title">
      <header className="tc-header">
        <div><span className="tc-kicker">MEASURED TERRAIN · EQUAL SCALE</span><h2 id="terrain-comparison-title">Earth / {target.body === 'moon' ? 'Moon' : 'Mars'}</h2><p>{candidate.name} compared with {target.name}</p></div>
        <div className="tc-rank"><span>PRIMARY RANK</span><strong>{comparison.rank}<small> / {discovery.domain.eligible_count}</small></strong><em>{comparison.shortlisted ? 'Separated shortlist' : 'Full bounded cohort'}</em></div>
      </header>

      <div className="tc-controls">
        <fieldset><legend>Vertical scale</legend>{([1, 3] as const).map(value => <button key={value} type="button" className={verticalExaggeration === value ? 'active' : ''} aria-pressed={verticalExaggeration === value} onClick={() => setVerticalExaggeration(value)}>{value}×</button>)}</fieldset>
        <div className="tc-overlays" role="group" aria-label="Terrain overlays"><button type="button" className={showContours ? 'active' : ''} aria-pressed={showContours} onClick={() => setShowContours(value => !value)}>Contours</button><button type="button" className={showMesh ? 'active' : ''} aria-pressed={showMesh} onClick={() => setShowMesh(value => !value)}>Mesh</button></div>
        <p>Drag to orbit · scroll to zoom · synchronized camera</p>
      </div>

      <TerrainPairViewport
        earthHeights={candidate.heights_m}
        targetHeights={target.heights_m}
        earthName={candidate.name}
        targetName={target.name}
        direction={direction}
        profileIndex={profileIndex}
        verticalExaggeration={verticalExaggeration}
        elevationMaximum={elevationMaximum}
        showContours={showContours}
        showMesh={showMesh}
      />

      <div className="tc-color-scale" aria-label="Shared elevation colour scale">
        <div><strong>Relative elevation · m</strong><span>Same colours and limits for both surfaces</span></div>
        <div className="tc-color-scale-key"><div className="tc-color-ramp" /><div className="tc-color-ticks">{[0, 0.25, 0.5, 0.75, 1].map(fraction => <span key={fraction}>{number(elevationMaximum * fraction, elevationMaximum < 10 ? 1 : 0)}</span>)}</div></div>
        <p>Contours: {contourLevels(elevationMaximum).map(value => number(value, 1)).join(', ')} m</p>
      </div>

      <div className="tc-scale-note"><span><i className="earth" /> Earth relief {number(candidate.metrics.relief_m, 1)} m</span><strong>{comparisonGrid.supportExtentM} m support · {comparisonGrid.spacingM} m aggregation · {comparisonGrid.cellCenterExtentM} m between outer cell centers</strong><span><i className="target" /> {target.body === 'moon' ? 'Moon' : 'Mars'} relief {number(target.metrics.relief_m, 1)} m</span></div>

      <div className="tc-analysis-grid">
        <article className="tc-profile-panel">
          <div className="tc-panel-title"><div><span>ELEVATION PROFILE</span><h3>{direction === 'row' ? 'Row' : 'Column'} {profileIndex + 1} · {directionLabel}</h3></div><div className="tc-direction" role="group" aria-label="Profile direction"><button type="button" className={direction === 'row' ? 'active' : ''} aria-pressed={direction === 'row'} onClick={() => setDirection('row')}>Row</button><button type="button" className={direction === 'column' ? 'active' : ''} aria-pressed={direction === 'column'} onClick={() => setDirection('column')}>Column</button></div></div>
          <label className="tc-slider"><span>Select {direction} <strong>{profileIndex + 1} / 10</strong></span><input type="range" min="1" max="10" step="1" value={profileIndex + 1} onChange={event => setProfileIndex(Number(event.target.value) - 1)} /></label>
          <ElevationProfile earth={earthProfile} target={targetProfile} direction={direction} index={profileIndex} targetName={target.body === 'moon' ? 'Moon' : 'Mars'} />
        </article>

        <aside className="tc-score-panel" aria-label="Exploratory distance explanation">
          <span className="tc-kicker">EXPLORATORY DISTANCE</span><strong className="tc-distance">{number(comparison.distance, 4)}</strong><p>Lower values are closer under the frozen terrain comparison. This is not a confidence, probability, or suitability score.</p>
          <div className="tc-contribution"><div><span>Slope-distribution difference</span><strong>{number(contributions.histogramContribution, 4)}</strong></div><small>0.7 × total variation {number(contributions.totalVariation, 4)}</small></div>
          <div className="tc-contribution"><div><span>Relative-relief difference</span><strong>{number(contributions.reliefContribution, 4)}</strong></div><small>0.3 × normalized difference {number(contributions.reliefDifference, 4)}</small></div>
          <div className="tc-equation"><span>Recomputed total</span><strong>{number(contributions.distance, 4)}</strong></div>
          <div className="tc-sensitivity"><span>SENSITIVITY RANK · 0.5 / 0.5 WEIGHTS</span><strong>{comparison.sensitivity_rank}<small> / {discovery.domain.eligible_count}</small></strong><p>Primary weighting rank: {comparison.rank}. Both ranks use the complete eligible cohort.</p></div>
        </aside>
      </div>

      <footer className="tc-footer"><p>Both surfaces use the same 600 m horizontal support, 60 m output grid, camera, and vertical scale. Heights are relative to each window’s own minimum. X follows grid columns; Y follows grid rows, not a shared geographic bearing.</p><p>The surface connects 10 × 10 measured aggregate cell centres. Colours and contours interpolate within those triangles; they do not add finer measurements or represent a walkable reconstruction.</p></footer>
    </section>
  );
}
