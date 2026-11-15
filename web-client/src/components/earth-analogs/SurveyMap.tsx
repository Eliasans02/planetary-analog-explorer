import { useMemo, useState } from 'react';
import { useSurveyNavigation } from './SurveyNavigation';
import type {
  DiscoveryCandidate,
  DiscoveryTarget,
  EarthDiscovery,
} from '@shared/types/earth-discovery';
import {
  distanceFillColor,
  formatCoord,
  formatNum,
} from './types';

export interface SurveyMapProps {
  discovery: EarthDiscovery;
  target: DiscoveryTarget;
  selectedCandidateId: string;
  onSelectCandidate: (candidateId: string) => void;
}

const VIEW_W = 600;
const VIEW_H = 450;
const PAD_LEFT = 58;
const PAD_RIGHT = 18;
const PAD_TOP = 26;
const PAD_BOTTOM = 38;

function niceTickStep(span: number): number {
  const rough = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function niceScaleKm(domainKm: number): number {
  const target = domainKm * 0.22;
  const options = [1, 2, 5, 10, 20, 25, 50];
  let best = options[0];
  for (const opt of options) {
    if (Math.abs(opt - target) < Math.abs(best - target)) best = opt;
  }
  return best;
}

export function SurveyMap({
  discovery,
  target,
  selectedCandidateId,
  onSelectCandidate,
}: SurveyMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const geometry = useMemo(() => {
    const domainRing = discovery.domain.footprint;

    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    for (const [lon, lat] of domainRing) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    const candidateRings = discovery.candidates.map((cand) => {
      const ring = cand.footprint;
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      return { cand, ring };
    });

    const rawLonSpan = Math.max(1e-4, maxLon - minLon);
    const rawLatSpan = Math.max(1e-4, maxLat - minLat);
    const padLon = rawLonSpan * 0.06;
    const padLat = rawLatSpan * 0.06;
    minLon -= padLon;
    maxLon += padLon;
    minLat -= padLat;
    maxLat += padLat;

    const midLat = (minLat + maxLat) * 0.5;
    const cosLat = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
    const plotW = VIEW_W - PAD_LEFT - PAD_RIGHT;
    const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;

    const lonSpanM = (maxLon - minLon) * cosLat;
    const latSpanM = maxLat - minLat;
    const scale = Math.min(plotW / lonSpanM, plotH / latSpanM);
    const drawW = lonSpanM * scale;
    const drawH = latSpanM * scale;
    const offsetX = PAD_LEFT + (plotW - drawW) * 0.5;
    const offsetY = PAD_TOP + (plotH - drawH) * 0.5;

    const project = (lon: number, lat: number): [number, number] => [
      offsetX + (lon - minLon) * cosLat * scale,
      offsetY + (maxLat - lat) * scale,
    ];

    const toPoints = (ring: [number, number][]) =>
      ring.map(([lon, lat]) => {
        const [x, y] = project(lon, lat);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');

    // Graticule ticks computed from real domain bounds
    const lonStep = niceTickStep(maxLon - minLon);
    const latStep = niceTickStep(maxLat - minLat);
    const lonTicks: { value: number; x: number }[] = [];
    for (
      let v = Math.ceil(minLon / lonStep) * lonStep;
      v <= maxLon + 1e-9;
      v += lonStep
    ) {
      const [x] = project(v, midLat);
      lonTicks.push({ value: v, x });
    }
    const latTicks: { value: number; y: number }[] = [];
    for (
      let v = Math.ceil(minLat / latStep) * latStep;
      v <= maxLat + 1e-9;
      v += latStep
    ) {
      const [, y] = project(minLon, v);
      latTicks.push({ value: v, y });
    }

    // Longitude is already corrected by cosLat in project().
    const pxPerKm = scale / 111.32;
    const widthKm = drawW / Math.max(1e-6, pxPerKm);
    const scaleKm = niceScaleKm(widthKm);
    const scalePx = scaleKm * pxPerKm;

    return {
      minLon,
      maxLon,
      minLat,
      maxLat,
      drawX: offsetX,
      drawY: offsetY,
      drawW,
      drawH,
      lonTicks,
      latTicks,
      scaleKm,
      scalePx,
      domainPoints: toPoints(domainRing),
      project,
      cells: candidateRings.map(({ cand, ring }) => {
        const [cx, cy] = project(cand.longitude, cand.latitude);
        return {
          cand,
          points: toPoints(ring),
          cx,
          cy,
        };
      }),
    };
  }, [discovery]);

  const { minDist, maxDist, selectedCell, shortlistCells } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let selected: (typeof geometry.cells)[number] | null = null;
    const shortlisted: (typeof geometry.cells)[number][] = [];

    for (const cell of geometry.cells) {
      const comp = cell.cand.comparisons[target.id];
      if (comp && Number.isFinite(comp.distance)) {
        if (comp.distance < min) min = comp.distance;
        if (comp.distance > max) max = comp.distance;
      }
      if (comp?.shortlisted) shortlisted.push(cell);
      if (cell.cand.id === selectedCandidateId) selected = cell;
    }

    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 1;
    return {
      minDist: min,
      maxDist: max,
      selectedCell: selected,
      shortlistCells: shortlisted,
    };
  }, [geometry, target.id, selectedCandidateId]);

  const hoveredCandidate: DiscoveryCandidate | null = useMemo(
    () => (hoveredId ? discovery.candidates.find((c) => c.id === hoveredId) ?? null : null),
    [discovery.candidates, hoveredId],
  );
  const hoveredComp = hoveredCandidate?.comparisons[target.id];
  const navigation = useSurveyNavigation(selectedCell);

  return (
    <section className="eaf-section" aria-label="Survey footprint map">
      <div className="eaf-map-top">
        <div>
          <h2 className="eaf-map-title">{discovery.domain.name}</h2>
          <p className="eaf-map-sub eaf-mono">
            {discovery.domain.eligible_count.toLocaleString('en-US')} ×{' '}
            {discovery.method.window_size_m} m survey windows · {formatNum(discovery.domain.area_km2, 0)} km² ·{' '}
            {discovery.domain.crs}
          </p>
        </div>
        <span className="eaf-section-note">
          Select a survey window to compare its terrain.
        </span>
      </div>

      <div className="eaf-map-frame">
        {navigation.controls}
        {hoveredCandidate && (
          <div className="eaf-map-hover-hud eaf-mono" role="status">
            {hoveredCandidate.name} ({hoveredCandidate.id}) · dist{' '}
            {hoveredComp ? formatNum(hoveredComp.distance, 3) : '—'} · rank #
            {hoveredComp?.rank ?? '—'}
            {hoveredComp?.shortlisted ? ' · shortlisted' : ''}
          </div>
        )}

        <svg
          className="eaf-map-svg"
          viewBox={navigation.viewBox}
          tabIndex={0}
          onKeyDown={navigation.onKeyDown}
          role="img"
          aria-label={`Coordinate grid map of ${discovery.domain.name} showing ${discovery.candidates.length} ${discovery.method.window_size_m} meter survey windows colored by exploratory topographic distance to ${target.name}`}
        >
          <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="#06070a" />

          {/* Plot frame */}
          <rect
            x={geometry.drawX}
            y={geometry.drawY}
            width={geometry.drawW}
            height={geometry.drawH}
            fill="#090c12"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1}
          />

          {/* Geographic graticule grid */}
          <g aria-hidden="true">
            {geometry.lonTicks.map((t) => (
              <g key={`lon-${t.value.toFixed(4)}`}>
                <line
                  x1={t.x}
                  y1={geometry.drawY}
                  x2={t.x}
                  y2={geometry.drawY + geometry.drawH}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="2 3"
                />
                <text
                  x={t.x}
                  y={geometry.drawY + geometry.drawH + 15}
                  textAnchor="middle"
                  fill="#76808f"
                  fontSize="9.5"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {formatCoord(t.value, 'E', 'W', 2)}
                </text>
              </g>
            ))}

            {geometry.latTicks.map((t) => (
              <g key={`lat-${t.value.toFixed(4)}`}>
                <line
                  x1={geometry.drawX}
                  y1={t.y}
                  x2={geometry.drawX + geometry.drawW}
                  y2={t.y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="2 3"
                />
                <text
                  x={geometry.drawX - 6}
                  y={t.y + 3}
                  textAnchor="end"
                  fill="#76808f"
                  fontSize="9.5"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {formatCoord(t.value, 'N', 'S', 2)}
                </text>
              </g>
            ))}
          </g>

          {/* Candidate footprints at the configured analysis-window extent */}
          <g>
            {geometry.cells.map(({ cand, points }) => {
              const comp = cand.comparisons[target.id];
              const fill = comp
                ? distanceFillColor(comp.distance, minDist, maxDist)
                : '#141821';
              return (
                <polygon
                  key={cand.id}
                  points={points}
                  fill={fill}
                  stroke="rgba(8, 9, 12, 0.55)"
                  strokeWidth={0.45}
                  className="eaf-map-cell"
                  onMouseEnter={() => setHoveredId(cand.id)}
                  onMouseLeave={() => setHoveredId((prev) => (prev === cand.id ? null : prev))}
                  onClick={() => onSelectCandidate(cand.id)}
                />
              );
            })}
          </g>

          {/* Domain survey boundary */}
          {geometry.domainPoints && (
            <polygon
              points={geometry.domainPoints}
              fill="none"
              stroke="rgba(255,255,255,0.28)"
              strokeWidth={1}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}

          {/* 12 Spatially separated shortlist highlights (focusable markers) */}
          <g>
            {shortlistCells.map(({ cand, points, cx, cy }) => {
              const isSelected = cand.id === selectedCandidateId;
              const rank = cand.comparisons[target.id]?.rank;
              return (
                <g key={`sl-${cand.id}`}>
                  <polygon
                    points={points}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={isSelected ? 2 : 1.35}
                    pointerEvents="none"
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={4.2}
                    fill="#fbbf24"
                    stroke="#08090c"
                    strokeWidth={1}
                    tabIndex={0}
                    role="button"
                    aria-label={`Select shortlisted ${cand.name}, rank ${rank ?? 'unranked'}`}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredId(cand.id)}
                    onMouseLeave={() => setHoveredId((prev) => (prev === cand.id ? null : prev))}
                    onClick={() => onSelectCandidate(cand.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectCandidate(cand.id);
                      }
                    }}
                  />
                </g>
              );
            })}
          </g>

          {/* Selected candidate crisp highlight & reticle */}
          {selectedCell && (
            <g pointerEvents="none">
              <polygon
                points={selectedCell.points}
                fill="none"
                stroke="#08090c"
                strokeWidth={3.2}
              />
              <polygon
                points={selectedCell.points}
                fill="none"
                stroke="#ffffff"
                strokeWidth={1.8}
              />
              <circle
                cx={selectedCell.cx}
                cy={selectedCell.cy}
                r={9}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={1.3}
              />
            </g>
          )}

          {/* Domain identifier, North arrow, and real km scale bar */}
          <g pointerEvents="none" aria-hidden="true">
            <text
              x={geometry.drawX + 8}
              y={geometry.drawY + 15}
              fill="rgba(243,245,248,0.82)"
              fontSize="10"
              fontWeight="600"
            >
              {discovery.domain.name}
            </text>

            {/* North mark */}
            <g transform={`translate(${geometry.drawX + geometry.drawW - 16}, ${geometry.drawY + 16})`}>
              <line x1={0} y1={8} x2={0} y2={-6} stroke="#a1aab8" strokeWidth={1.2} />
              <polygon points="0,-9 -3,-3 3,-3" fill="#a1aab8" />
              <text
                x={0}
                y={18}
                textAnchor="middle"
                fill="#a1aab8"
                fontSize="8.5"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                N
              </text>
            </g>

            {/* Scale bar */}
            <g className="eaf-map-scale" transform={`translate(${geometry.drawX + 10}, ${geometry.drawY + geometry.drawH - 12})`}>
              <line
                x1={0}
                y1={0}
                x2={geometry.scalePx}
                y2={0}
                stroke="#f3f5f8"
                strokeWidth={1.6}
              />
              <line x1={0} y1={-3} x2={0} y2={3} stroke="#f3f5f8" strokeWidth={1.4} />
              <line
                x1={geometry.scalePx}
                y1={-3}
                x2={geometry.scalePx}
                y2={3}
                stroke="#f3f5f8"
                strokeWidth={1.4}
              />
              <text
                x={geometry.scalePx + 6}
                y={3}
                fill="#a1aab8"
                fontSize="9.5"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {geometry.scaleKm} km
              </text>
            </g>
          </g>
        </svg>
      </div>

      <div className="eaf-map-legend">
        <div className="eaf-legend-ramp">
          <span className="eaf-mono">{formatNum(minDist, 3)} (closer)</span>
          <span className="eaf-ramp-bar" aria-hidden="true" />
          <span className="eaf-mono">{formatNum(maxDist, 3)} (farther)</span>
        </div>

        <div className="eaf-legend-keys">
          <span className="eaf-legend-item">
            <span className="eaf-swatch eaf-swatch-shortlist" aria-hidden="true" />
            <span>
              Shortlist ({shortlistCells.length} · ≥
              {formatNum(discovery.method.shortlist_separation_m / 1000, 1)} km spacing)
            </span>
          </span>
          <span className="eaf-legend-item">
            <span className="eaf-swatch eaf-swatch-selected" aria-hidden="true" />
            <span>Selected window</span>
          </span>
        </div>
      </div>
    </section>
  );
}
