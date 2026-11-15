import React, { useMemo } from 'react';
import {
  Activity,
  FlaskConical,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  Analog,
  Comparison,
  Location,
  LocationsDataset,
} from '@shared/types/analog-location';
import { formatBodyName, formatCoordinateFrame } from '../terrain/coordinates';
import { AnalogPassport } from './AnalogPassport';
import type { ViewportTelemetry } from './Viewport3D';

export interface TelemetryHUDProps {
  dataset: LocationsDataset;
  selected: Location | null;
  comparison: Comparison | null;
  telemetry: ViewportTelemetry;
  walkSpeedMps: number;
  eyeHeightM: number;
  onWalkSpeedChange: (speed: number) => void;
  onEyeHeightChange: (height: number) => void;
  onSelectLocation: (id: string, comparison: Comparison) => void;
  loading?: boolean;
  errorMessage?: string | null;
}

export function TelemetryHUD({
  dataset,
  selected,
  comparison,
  telemetry,
  walkSpeedMps,
  eyeHeightM,
  onWalkSpeedChange,
  onEyeHeightChange,
  onSelectLocation,
  loading = false,
  errorMessage = null,
}: TelemetryHUDProps): React.JSX.Element {
  const profile = useMemo(
    () =>
      comparison
        ? dataset.profiles.find((p) => p.id === comparison.profile_id) ?? null
        : null,
    [comparison, dataset.profiles],
  );

  const activeAnalogEntry: Analog | null = useMemo(
    () =>
      selected && comparison
        ? comparison.analogs.find((a) => a.location.id === selected.id) ?? null
        : null,
    [selected, comparison],
  );

  return (
    <aside
      aria-label="Diagnostics, navigation preferences, and scientific provenance"
      className="mission-scroll flex h-full w-full flex-col divide-y divide-slate-800/90 overflow-y-auto bg-[#0B1018] text-slate-200"
    >
      {/* Group 1: Measured Client Diagnostics */}
      <section data-testid="hud-group-diagnostics" className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-200">
            <Activity className="h-3.5 w-3.5 text-cyan-400" />
            <span>Measured Client Diagnostics</span>
          </h2>
          <span className="font-mono text-[11px] text-cyan-300 tabular-nums">
            {telemetry.mode === 'ground' ? 'Ground ENU' : 'Orbit Schematic'}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Browser WebGL measurements only; unmeasured values remain N/A.
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
          <div>
            <dt className="text-slate-500">Frame Rate / Time</dt>
            <dd className="mt-0.5 font-mono text-slate-100 tabular-nums">
              {telemetry.fps !== null && telemetry.frameTimeMs !== null
                ? `${telemetry.fps.toFixed(1)} FPS · ${telemetry.frameTimeMs.toFixed(1)} ms`
                : 'Not measured (on-demand idle)'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Pixel Ratio / GL</dt>
            <dd className="mt-0.5 font-mono text-slate-100 tabular-nums">
              {telemetry.dpr.toFixed(2)}x · {telemetry.isSoftwareGl ? 'Software GL' : 'Hardware GL'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Local ENU (X, Y, Z m)</dt>
            <dd className="mt-0.5 font-mono text-slate-100 tabular-nums">
              {telemetry.localPosition_m
                ? `${telemetry.localPosition_m[0].toFixed(1)}, ${telemetry.localPosition_m[1].toFixed(1)}, ${telemetry.localPosition_m[2].toFixed(1)}`
                : 'N/A'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Datum Elevation</dt>
            <dd className="mt-0.5 font-mono text-slate-100 tabular-nums">
              {telemetry.absoluteElevation_m !== null
                ? `${telemetry.absoluteElevation_m.toFixed(2)} m (${telemetry.verticalDatum ?? 'datum'})`
                : 'N/A'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">DEM Slope (derived)</dt>
            <dd className="mt-0.5 font-mono text-slate-100 tabular-nums">
              {telemetry.demSlopeDeg !== null ? `${telemetry.demSlopeDeg.toFixed(1)}°` : 'N/A'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Mesh / VRAM</dt>
            <dd className="mt-0.5 font-mono text-slate-100 tabular-nums">
              {telemetry.demTriangleCount !== null
                ? `${telemetry.demTriangleCount.toLocaleString()} tris`
                : 'N/A'}{' '}
              · VRAM N/A
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Sun Azimuth / Horizon</dt>
            <dd className="mt-0.5 font-mono text-slate-400">N/A (no ephemeris)</dd>
          </div>
          <div>
            <dt className="text-slate-500">JS Heap (optional)</dt>
            <dd className="mt-0.5 font-mono text-slate-400 tabular-nums">
              {telemetry.memoryUsedMiB !== null ? `${telemetry.memoryUsedMiB.toFixed(1)} MiB` : 'N/A'}
            </dd>
          </div>
        </dl>
      </section>

      {/* Group 2: Viewer Navigation Preferences */}
      <section data-testid="hud-group-preferences" className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-200">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
            <span>Viewer Navigation Preferences</span>
          </h2>
          <span className="text-[11px] text-slate-500">Non-scientific UI controls</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-slate-400">
              <span>Walk Speed</span>
              <span className="font-mono text-slate-200 tabular-nums">{walkSpeedMps.toFixed(1)} m/s</span>
            </span>
            <input
              type="range"
              min={0.5}
              max={15}
              step={0.5}
              value={walkSpeedMps}
              onChange={(e) => onWalkSpeedChange(Number(e.target.value))}
              className="accent-cyan-400"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-slate-400">
              <span>Eye Height</span>
              <span className="font-mono text-slate-200 tabular-nums">{eyeHeightM.toFixed(2)} m</span>
            </span>
            <input
              type="range"
              min={0.5}
              max={3.5}
              step={0.1}
              value={eyeHeightM}
              onChange={(e) => onEyeHeightChange(Number(e.target.value))}
              className="accent-cyan-400"
            />
          </label>
        </div>
      </section>

      {/* Group 3: Scientific Data & Source Provenance */}
      <div data-testid="hud-group-scientific" className="divide-y divide-slate-800/90">
        <div className="bg-[#090D14] px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-200">
              <FlaskConical className="h-3.5 w-3.5 text-amber-400" />
              <span>Scientific Data &amp; Provenance</span>
            </h2>
            <span className="text-[11px] text-slate-500">
              {selected ? 'Dataset-derived' : 'No data loaded'}
            </span>
          </div>
        </div>

        {selected && (
          <section className="p-4">
            <div className="text-xs text-cyan-400">
              {formatBodyName(selected.body)} · {selected.id}
            </div>
            <h3 className="mt-0.5 text-base font-semibold text-slate-100">{selected.name}</h3>
            <dl className="mt-2.5 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Coordinates</dt>
                <dd className="font-mono text-slate-200 tabular-nums">
                  {selected.coordinates.latitude_deg.toFixed(4)}°,{' '}
                  {selected.coordinates.longitude_deg.toFixed(4)}°
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Reference Frame</dt>
                <dd className="text-right text-slate-300">
                  {formatCoordinateFrame(selected.coordinates.frame)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Missions</dt>
                <dd className="text-right text-slate-300">
                  {selected.missions.length > 0 ? selected.missions.join(', ') : 'None listed'}
                </dd>
              </div>
            </dl>
          </section>
        )}

        {comparison && (
          <section className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-300">
                <Layers className="h-3.5 w-3.5" />
                <span>Comparison Sites</span>
              </h3>
              {profile && (
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {profile.id} v{profile.version} ({profile.features.length}/9)
                </span>
              )}
            </div>

            <div className="mt-2 space-y-1.5">
              <button
                type="button"
                onClick={() => onSelectLocation(comparison.target.id, comparison)}
                className={`w-full border px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  selected?.id === comparison.target.id
                    ? 'border-cyan-500/60 bg-cyan-500/10 text-slate-100'
                    : 'border-slate-800 bg-[#0F141E] text-slate-300 hover:border-slate-700'
                }`}
              >
                Target · {comparison.target.name} ({formatBodyName(comparison.target.body)})
              </button>

              {comparison.analogs.length === 0 ? (
                <p className="border border-slate-800 bg-[#0F141E] px-2.5 py-2 text-xs text-slate-400">
                  No ranked Earth analogs available for {comparison.target.name}.
                </p>
              ) : (
                comparison.analogs.map((analog) => (
                  <button
                    key={analog.location.id}
                    type="button"
                    onClick={() => onSelectLocation(analog.location.id, comparison)}
                    className={`w-full border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                      selected?.id === analog.location.id
                        ? 'border-cyan-500/60 bg-cyan-500/10'
                        : 'border-slate-800 bg-[#0F141E] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-100">
                        #{analog.rank} {analog.location.name}
                      </span>
                      <span className="font-mono font-semibold text-cyan-300 tabular-nums">
                        {analog.similarity_score.toFixed(1)}%
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        )}

        <AnalogPassport
          comparison={comparison}
          selectedAnalog={activeAnalogEntry}
          profile={profile}
          sources={dataset.sources}
          loading={loading}
          errorMessage={errorMessage}
        />
      </div>
    </aside>
  );
}
