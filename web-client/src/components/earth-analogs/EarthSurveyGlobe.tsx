import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Crosshair,
  Globe,
  Loader2,
  Map as MapIcon,
  Minus,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type { EarthDiscovery } from '@shared/types/earth-discovery';
import type { EarthContextManifest } from '../../data/earthContext';
import type { PlanetView } from '../PlanetViewport';
import { mountEarthGlobe, type GlobeActions } from './mountEarthGlobe';
import type { EarthImageryStatus } from './earthGlobeTiles';
import './earth-survey-globe.css';

export interface EarthSurveyGlobeProps {
  discovery: EarthDiscovery;
  selectedCandidateId: string;
  onShowMap: () => void;
  immersive?: boolean;
  initialView?: PlanetView;
  onViewChange?: (view: PlanetView) => void;
}

const ZOOM_STEP_FACTOR = 0.82;

export function EarthSurveyGlobe({
  discovery,
  selectedCandidateId,
  onShowMap,
  immersive = false,
  initialView,
  onViewChange,
}: EarthSurveyGlobeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manifest, setManifest] = useState<EarthContextManifest | null>(null);
  const [resolution, setResolution] = useState(2048);
  const [imageryStatus, setImageryStatus] = useState<EarthImageryStatus>('overview');

  const selectedCandidate = useMemo(
    () =>
      discovery.candidates.find((c) => c.id === selectedCandidateId) ??
      discovery.candidates[0] ??
      null,
    [discovery.candidates, selectedCandidateId],
  );
  const actionsRef = useRef<GlobeActions | null>(null);
  const callbacks = useRef({ initialView, onViewChange, onShowMap });
  callbacks.current = { initialView, onViewChange, onShowMap };

  const latestCandidateIdRef = useRef(selectedCandidateId);
  latestCandidateIdRef.current = selectedCandidateId;

  useEffect(() => {
    actionsRef.current?.updateCandidate(selectedCandidateId);
  }, [selectedCandidateId]);

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    return mountEarthGlobe(container, discovery, {
      getCandidateId: () => latestCandidateIdRef.current,
      initialView: callbacks.current.initialView,
      onViewChange: view => callbacks.current.onViewChange?.(view),
      onShowMap: () => callbacks.current.onShowMap(),
      onState: setLoadState, onError: setErrorMsg, onManifest: setManifest,
      onResolution: setResolution, onImageryStatus: setImageryStatus,
      setActions: actions => { actionsRef.current = actions; },
    });
  }, [discovery, retryNonce]);

  return (
    <section className={`esg-card ${immersive ? 'esg-immersive' : ''}`} aria-label="3D Earth geographic context globe">
      {!immersive && <div className="esg-header">
        <div>
          <h2 className="esg-title">{discovery.domain.name} — Geographic context</h2>
          <p className="esg-sub">
            Spherical Earth locator · {discovery.domain.area_km2.toLocaleString('en-US')} km² survey ·{' '}
            {discovery.domain.eligible_count.toLocaleString('en-US')} eligible 600 m windows
          </p>
        </div>

        <div className="esg-header-actions">
          <button type="button" className="esg-btn-subtle" onClick={onShowMap}>
            <MapIcon size={13} aria-hidden="true" />
            <span>Back to 2D map</span>
          </button>
        </div>
      </div>}

      <div className="esg-stage">
        <div ref={hostRef} className="esg-canvas-host" />

        {loadState === 'ready' && (
          <>
            <div className="esg-toolbar">
              <div className="esg-toolbar-group" role="group" aria-label="Globe camera presets">
                <button
                  type="button"
                  className="esg-tool-btn"
                  onClick={() => actionsRef.current?.centerOnSearch()}
                  aria-label="Center on search"
                >
                  <Crosshair size={13} aria-hidden="true" />
                  <span>Center on search</span>
                </button>
                <button
                  type="button"
                  className="esg-tool-btn"
                  onClick={() => actionsRef.current?.globalView()}
                  aria-label="Global view"
                >
                  <Globe size={13} aria-hidden="true" />
                  <span>Global view</span>
                </button>
              </div>

              <div className="esg-toolbar-group" role="group" aria-label="Globe zoom controls">
                <button
                  type="button"
                  className="esg-tool-btn"
                  onClick={() => actionsRef.current?.zoomBy(ZOOM_STEP_FACTOR)}
                  aria-label="Zoom in"
                  title="Zoom in (+)"
                >
                  <Plus size={13} aria-hidden="true" />
                  <span className="esg-label-desktop">Zoom in</span>
                </button>
                <button
                  type="button"
                  className="esg-tool-btn"
                  onClick={() => actionsRef.current?.zoomBy(1 / ZOOM_STEP_FACTOR)}
                  aria-label="Zoom out"
                  title="Zoom out (-)"
                >
                  <Minus size={13} aria-hidden="true" />
                  <span className="esg-label-desktop">Zoom out</span>
                </button>
              </div>
            </div>

            <div className="esg-hud-bottom">
              <div className="esg-status-pill" role="status">
                <span className="esg-status-verified">Global image verified</span>
                <span className="esg-imagery-status" data-status={imageryStatus}>
                  {' · '}{imageryStatus === 'loading' ? 'Loading regional detail…'
                    : imageryStatus === 'detail' ? 'NASA regional imagery'
                    : imageryStatus === 'fallback' ? 'Some detail unavailable · global image retained'
                    : resolution > 2048 ? '5.4K global imagery' : 'Global overview'}
                </span>
                {imageryStatus !== 'overview' && <>
                  {' · '}<a className="esg-source-link" href="https://worldview.earthdata.nasa.gov/?l=BlueMarble_NextGeneration&lg=false" target="_blank" rel="noreferrer">NASA GIBS · up to 500 m/pixel</a>
                </>}
                {imageryStatus === 'fallback' && <button className="esg-tool-btn" type="button" onClick={() => actionsRef.current?.retryImagery()}>Retry imagery</button>}
                {manifest && (
                  <>
                    {' · '}
                    <span>{manifest.title}</span>
                    {' · '}
                    <a
                      href={manifest.source_page || manifest.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="esg-source-link"
                    >
                      {manifest.credit} <ArrowUpRight size={11} aria-hidden="true" />
                    </a>
                  </>
                )}
              </div>

              <div className="esg-key-hint" aria-hidden="true">
                Drag · Scroll · Arrows · +/-
              </div>
            </div>
          </>
        )}

        {loadState === 'loading' && (
          <div className="esg-overlay-state" role="status">
            <div className="esg-overlay-box">
              <h3>
                <Loader2 size={15} className="esg-spinner" aria-hidden="true" />
                <span>Loading verified Earth context globe</span>
              </h3>
              <p>Loading NASA Blue Marble imagery…</p>
            </div>
          </div>
        )}

        {loadState === 'error' && (
          <div className="esg-overlay-state" role="alert">
            <div className="esg-overlay-box">
              <h3>
                <AlertCircle size={15} color="#f59e0b" aria-hidden="true" />
                <span>3D Earth globe unavailable</span>
              </h3>
              <p>{errorMsg ?? 'Unable to display the 3D Earth context globe.'}</p>
              <div className="esg-overlay-actions">
                <button type="button" className="esg-btn-primary" onClick={onShowMap}>
                  <MapIcon size={13} aria-hidden="true" />
                  <span>Back to 2D map</span>
                </button>
                <button
                  type="button"
                  className="esg-btn-subtle"
                  onClick={() => setRetryNonce((n) => n + 1)}
                >
                  <RefreshCw size={13} aria-hidden="true" />
                  <span>Retry</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!immersive && <div className="esg-legend">
        <div className="esg-legend-items">
          <span className="esg-legend-entry">
            <span className="esg-marker-dot" aria-hidden="true" />
            <span>
              Locator ring ({selectedCandidate?.id ?? 'selected'}) · not to scale
            </span>
          </span>
          <span className="esg-legend-entry">
            <span className="esg-domain-line" aria-hidden="true" />
            <span>True {discovery.domain.area_km2.toLocaleString('en-US')} km² survey boundary</span>
          </span>
          <span className="esg-legend-entry">
            <span className="esg-candidate-line" aria-hidden="true" />
            <span>True {discovery.method.window_size_m} m candidate boundary</span>
          </span>
        </div>

        <span className="esg-disclaimer">
          {manifest?.disclaimer ??
            'Historical global imagery for geographic context. Use the survey map to inspect 600 m windows.'}
        </span>
      </div>}
    </section>
  );
}

export default EarthSurveyGlobe;
