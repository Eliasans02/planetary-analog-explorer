import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
} from 'lucide-react';
import type { Body, Comparison, LocationsDataset } from '@shared/types/analog-location';
import { TelemetryHUD } from './components/TelemetryHUD';
import { Viewport3D, type ViewportMode, type ViewportTelemetry } from './components/Viewport3D';
import { DatasetValidationError, loadDataset } from './data/loadDataset';
import { listSelectionOptions, findLocationOption, reconcileSelection, selectionKey, type ComparisonSelection } from './data/selection';

const EMPTY_DATASET: LocationsDataset = {
  schema_version: '1.0.0',
  generated_at: '1970-01-01T00:00:00Z',
  sources: [],
  profiles: [],
  comparisons: [],
};

const INITIAL_TELEMETRY: ViewportTelemetry = {
  mode: 'orbit',
  fps: null,
  frameTimeMs: null,
  dpr: 1,
  isSoftwareGl: false,
  localPosition_m: null,
  absoluteElevation_m: null,
  demSlopeDeg: null,
  demTriangleCount: null,
  verticalDatum: null,
  verticalOrigin_m: null,
  groundLoading: false,
  groundError: null,
  splatStatus: { status: 'none', message: '3D reconstruction not prepared' },
  pointerLocked: false,
  memoryUsedMiB: null,
};

export function SimilarityWorkspace(): React.JSX.Element {
  const [dataset, setDataset] = useState<LocationsDataset>(EMPTY_DATASET);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorInfo, setErrorInfo] = useState<{
    kind: string;
    message: string;
    details: string[];
  } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [activeBody, setActiveBody] = useState<Body>('moon');
  const [selection, setSelection] = useState<ComparisonSelection | null>(null);
  const selectedId = selection ? selectionKey(selection) : null;
  const [mode, setMode] = useState<ViewportMode>('orbit');
  const [walkSpeedMps, setWalkSpeedMps] = useState(3.5);
  const [eyeHeightM, setEyeHeightM] = useState(1.6);
  const [hudOpen, setHudOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [telemetry, setTelemetry] = useState<ViewportTelemetry>(INITIAL_TELEMETRY);
  const [devBundleMeta, setDevBundleMeta] = useState<{
    available: boolean;
    file_count: number;
    bytes: number;
    sha256: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const handleViewportChange = (ev: MediaQueryListEvent) => {
      setHudOpen(!ev.matches);
    };
    mq.addEventListener('change', handleViewportChange);
    return () => mq.removeEventListener('change', handleViewportChange);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const controller = new AbortController();
    fetch('/__dev/source-bundle-meta.json', { cache: 'no-store', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as {
          available: boolean;
          file_count: number;
          bytes: number;
          sha256: string;
        };
        if (!controller.signal.aborted) {
          setDevBundleMeta(json);
        }
      })
      .catch(() => {
        // Optional dev metadata unavailable outside dev middleware
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState('loading');
    setErrorInfo(null);

    loadDataset(controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setDataset(loaded);
        setLoadState('ready');
        setSelection((prev) => reconcileSelection(loaded, prev));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setDataset(EMPTY_DATASET);
        setSelection(null);
        setLoadState('error');
        if (err instanceof DatasetValidationError) {
          setErrorInfo({
            kind: err.kind,
            message: err.message,
            details: err.details.slice(0, 6),
          });
        } else {
          setErrorInfo({
            kind: 'unknown',
            message: err instanceof Error ? err.message : String(err),
            details: [],
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [reloadNonce]);

  const locationOptions = useMemo(() => listSelectionOptions(dataset), [dataset]);

  const selectedEntry = useMemo(
    () => locationOptions.find((opt) => opt.key === selectedId) ?? null,
    [locationOptions, selectedId],
  );

  useEffect(() => {
    if (selectedEntry) setActiveBody(selectedEntry.location.body);
  }, [selectedEntry]);

  const handleTargetSelected = useCallback(
    (id: string, comparison?: Comparison) => {
      const match = findLocationOption(locationOptions, id, comparison ?? selectedEntry?.comparison)
        ?? (comparison ? null : findLocationOption(locationOptions, id));
      if (match) {
        setSelection({targetId: match.comparison.target.id, profileId: match.comparison.profile_id, locationId: match.location.id});
        setActiveBody(match.location.body);
      }
    },
    [locationOptions, selectedEntry],
  );

  const passportErrorMessage = useMemo(() => {
    if (!errorInfo) return null;
    const detailSuffix =
      errorInfo.details.length > 0 ? ` (${errorInfo.details.join('; ')})` : '';
    return `${errorInfo.kind}: ${errorInfo.message}${detailSuffix}`;
  }, [errorInfo]);

  const isPartialDataset =
    loadState === 'ready' &&
    (dataset.comparisons.length === 0 ||
      dataset.comparisons.every((c) => c.analogs.length === 0));

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#07090E] text-slate-100">
      {/* Top Mission Control Header */}
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-slate-800 bg-[#0B1018] px-3 py-1.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-sm font-semibold tracking-tight text-slate-100">
            Planetary Analog Explorer
          </h1>
          <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
            {loadState === 'ready'
              ? `Dataset ${dataset.generated_at.slice(0, 10)} · ${dataset.comparisons.length} comparison${dataset.comparisons.length === 1 ? '' : 's'} · ${dataset.sources.length} source${dataset.sources.length === 1 ? '' : 's'}`
              : loadState === 'loading'
                ? 'Loading local dataset…'
                : 'No active dataset'}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="target-selector">
            Select target or analog site
          </label>
          <select
            id="target-selector"
            data-testid="target-selector"
            value={selectedId ?? ''}
            disabled={locationOptions.length === 0}
            onChange={(e) => {
              const option = locationOptions.find(entry => entry.key === e.target.value);
              if (option) setSelection(option.selection);
            }}
            className="h-8 min-w-0 max-w-[165px] border border-slate-700 bg-[#0F141E] px-2.5 text-xs text-slate-200 sm:max-w-[260px] disabled:cursor-not-allowed disabled:text-slate-500 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {locationOptions.length === 0 ? (
              <option value="">No prepared targets</option>
            ) : (
              locationOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))
            )}
          </select>

          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            data-testid="reload-dataset-btn"
            className="inline-flex h-8 items-center gap-1.5 border border-slate-700 bg-[#0F141E] px-2.5 text-xs font-medium text-slate-200 hover:border-slate-600 hover:text-white whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reload</span>
          </button>

          {import.meta.env.DEV && (
            <div
              data-testid="dev-source-bundle-bar"
              className="flex flex-wrap items-center gap-2 border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200"
            >
              <a
                href="/__dev/source-bundle.json"
                download="source-bundle.json"
                data-testid="download-source-bundle-link"
                className="inline-flex items-center gap-1 font-medium text-cyan-200 underline decoration-cyan-400/60 underline-offset-2 hover:text-white whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <Download className="h-3 w-3" />
                <span>Download source bundle</span>
              </a>
              <span aria-hidden="true" className="text-cyan-500/60">·</span>
              <a
                href="/__dev/source-bundle.json?view=1"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="view-source-bundle-link"
                className="font-medium text-cyan-200 underline decoration-cyan-400/60 underline-offset-2 hover:text-white whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                View JSON
              </a>
              {devBundleMeta?.available && (
                <>
                  <span aria-hidden="true" className="text-cyan-500/60">·</span>
                  <span className="font-mono text-cyan-100 tabular-nums">
                    {devBundleMeta.file_count} files
                  </span>
                  <span aria-hidden="true" className="text-cyan-500/60">·</span>
                  <code
                    data-testid="dev-source-bundle-hash"
                    title={devBundleMeta.sha256}
                    className="font-mono text-[10px] text-cyan-100"
                  >
                    sha256:{devBundleMeta.sha256}
                  </code>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setHudOpen((v) => !v)}
            data-testid="toggle-telemetry-btn"
            aria-expanded={hudOpen}
            aria-controls="telemetry-hud-panel"
            aria-label={hudOpen ? 'Collapse telemetry panel' : 'Expand telemetry panel'}
            className="inline-flex h-8 items-center gap-1.5 border border-slate-700 bg-[#0F141E] px-2.5 text-xs font-medium text-slate-200 hover:border-slate-600 hover:text-white whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {hudOpen ? (
              <PanelRightClose className="h-3.5 w-3.5" />
            ) : (
              <PanelRightOpen className="h-3.5 w-3.5" />
            )}
            <span>Telemetry</span>
          </button>
        </div>
      </header>

      {/* Honest Empty / Validation Error / Partial Dataset Banner */}
      {loadState === 'error' && errorInfo && (
        <div
          role="alert"
          data-testid="dataset-error-banner"
          className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-amber-500/40 bg-[#15120C] px-3 py-2.5 text-xs text-amber-200 sm:px-4"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-amber-100">
                {errorInfo.kind === 'missing'
                  ? 'Prepared Data Unavailable'
                  : 'Dataset Validation Failed'}
              </div>
              <p className="mt-0.5 text-amber-200/90">
                {errorInfo.kind === 'missing'
                  ? 'No prepared planetary or Earth analog site data is currently loaded in this viewer. Use Retry once prepared data is available.'
                  : 'The dataset could not be loaded because it did not pass schema or scientific invariant checks.'}
              </p>

              <details
                data-testid="technical-details-disclosure"
                className="mt-1.5 text-amber-200/80"
              >
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-amber-300 underline decoration-amber-500/50 underline-offset-2 hover:text-amber-100 focus-visible:outline-2 focus-visible:outline-amber-400">
                  Technical details
                </summary>
                <div className="mt-1.5 border border-amber-500/25 bg-[#0B0E14] px-2.5 py-2 font-mono text-[11px] text-amber-200/90">
                  <div>Error kind: {errorInfo.kind}</div>
                  <div className="mt-0.5 break-words">{errorInfo.message}</div>
                  {errorInfo.details.length > 0 && (
                    <ul className="mt-1 list-disc pl-4">
                      {errorInfo.details.map((d, idx) => (
                        <li key={idx} className="break-words">
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            data-testid="retry-dataset-btn"
            className="inline-flex shrink-0 items-center gap-1.5 border border-amber-400/50 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {isPartialDataset && (
        <div
          role="status"
          data-testid="dataset-partial-banner"
          className="shrink-0 border-b border-slate-800 bg-[#0F141E] px-4 py-2 text-xs text-slate-300"
        >
          Dataset loaded with partial coverage: no ranked Earth analogs are present yet; showing
          available prepared locations only.
        </div>
      )}

      {/* Main Split Workspace: Viewport3D + Collapsible TelemetryHUD */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="relative min-h-[240px] min-w-0 flex-1">
          <Viewport3D
            selected={selectedEntry?.location ?? null}
            dataset={dataset}
            onTargetSelected={handleTargetSelected}
            activeBody={activeBody}
            onBodyChange={setActiveBody}
            mode={mode}
            onModeChange={setMode}
            walkSpeedMps={walkSpeedMps}
            eyeHeightM={eyeHeightM}
            onTelemetryUpdate={setTelemetry}
          />
        </div>

        {hudOpen && (
          <div
            id="telemetry-hud-panel"
            data-testid="telemetry-hud-panel"
            className="h-[46vh] max-h-[420px] w-full shrink-0 border-t border-slate-800 lg:h-full lg:max-h-none lg:w-[400px] lg:border-t-0 lg:border-l"
          >
            <TelemetryHUD
              dataset={dataset}
              selected={selectedEntry?.location ?? null}
              comparison={selectedEntry?.comparison ?? null}
              telemetry={telemetry}
              walkSpeedMps={walkSpeedMps}
              eyeHeightM={eyeHeightM}
              onWalkSpeedChange={setWalkSpeedMps}
              onEyeHeightChange={setEyeHeightM}
              onSelectLocation={handleTargetSelected}
              loading={loadState === 'loading'}
              errorMessage={passportErrorMessage}
            />
          </div>
        )}
      </main>
    </div>
  );
}
