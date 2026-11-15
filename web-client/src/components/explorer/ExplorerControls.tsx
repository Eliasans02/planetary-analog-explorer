import { useCallback, useMemo, type RefObject } from 'react';
import { ArrowUpRight, Compass, Info, Layers2, Orbit, PersonStanding, X } from 'lucide-react';
import type { PlanetDrop, PlanetRecord } from '@shared/types/planet-catalog';
import type { SurfaceRecord } from '@shared/types/surface-catalog';
import { PlanetViewport, type PlanetView } from '../PlanetViewport';
import type { Resolution, SurfaceBrowseEntry } from './types';

export function GlobePanel({
  planet,
  surfaces,
  resolution,
  onDrop,
  onSelect,
  selectedSiteId,
  focusRequest,
  view,
  onViewChange,
}: {
  planet: PlanetRecord;
  surfaces: SurfaceRecord[];
  resolution: Resolution;
  onDrop: (drop: PlanetDrop) => void;
  onSelect: (surface: SurfaceRecord) => void;
  selectedSiteId?: string;
  focusRequest?: { surfaceId: string; revision: number };
  view?: PlanetView;
  onViewChange: (body: PlanetRecord['id'], view: PlanetView) => void;
}) {
  const stableSurfaces = useMemo(() => surfaces, [surfaces.map((s) => s.id).join('|')]);
  const remember = useCallback(
    (next: PlanetView) => onViewChange(planet.id, next),
    [planet.id, onViewChange],
  );

  return (
    <div className={`px-globe-panel ${planet.id}`}>
      <div className="px-panel-label">
        <strong>{planet.name.toUpperCase()}</strong>
        <span aria-hidden="true">·</span>
        <span>
          {String(surfaces.length).padStart(2, '0')} VERIFIED SITE{surfaces.length === 1 ? '' : 'S'}
        </span>
      </div>
      <PlanetViewport
        planet={planet}
        surfaces={stableSurfaces}
        resolution={resolution}
        onDrop={onDrop}
        onSelect={onSelect}
        selectedSiteId={selectedSiteId}
        focusRequest={focusRequest}
        syncView={view}
        onViewChange={remember}
      />
    </div>
  );
}

export function FloatingOrbitToolbar({
  body,
  effectiveSplit,
  isMobile,
  planet,
  resolution,
  onToggleSplit,
  onResolutionChange,
}: {
  body: 'moon' | 'mars';
  effectiveSplit: boolean;
  isMobile: boolean;
  planet?: PlanetRecord;
  resolution: Resolution;
  onToggleSplit: () => void;
  onResolutionChange: (resolution: Resolution) => void;
}) {
  return (
    <div className="px-floating-toolbar" role="toolbar" aria-label="Orbit view controls">
      <button
        type="button"
        className={`px-tool-btn ${effectiveSplit ? 'active' : ''}`}
        aria-pressed={effectiveSplit}
        disabled={isMobile}
        title={
          isMobile
            ? 'Side-by-side comparison requires a wider viewport'
            : 'Compare Moon and Mars side by side'
        }
        onClick={onToggleSplit}
      >
        <Layers2 size={14} aria-hidden="true" />
        <span>Side by side</span>
      </button>

      {planet && (
        <>
          <span className="px-tool-sep" aria-hidden="true" />
          <div className="px-res-group" role="group" aria-label={`${planet.name} texture resolution`}>
            {planet.textures.map((texture) => (
              <button
                key={texture.label}
                type="button"
                className={`px-res-btn ${resolution === texture.label ? 'active' : ''}`}
                onClick={() => onResolutionChange(texture.label)}
                aria-pressed={resolution === texture.label}
                title={`${texture.width} × ${texture.height} source pixels`}
              >
                {texture.label === 'Native' ? `Native ${texture.width}` : texture.label}
              </button>
            ))}
          </div>
        </>
      )}

      <details style={{ position: 'relative' }}>
        <summary
          className="px-tool-btn"
          style={{ listStyle: 'none' }}
          aria-label="Imagery resolution and elevation notes"
        >
          <Info size={14} aria-hidden="true" />
        </summary>
        <div
          className="px-popover-content"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 'min(340px, calc(100vw - 32px))',
            padding: 16,
            border: '1px solid var(--px-border)',
            borderRadius: 'var(--px-r-md)',
            background: 'var(--px-surface)',
          }}
        >
          <h3 className="px-popover-title">
            {planet ? `${planet.name} source mosaic` : 'Source mosaic'}
          </h3>
          <p className="px-popover-desc">
            {body === 'mars' && !planet?.displacement
              ? 'NASA published display texture (Native 1440 × 720 px; no AI upscaling). Spherical globe; local elevation is at verified sites.'
              : 'Source-derived display pixels within the mosaic detail limit. No AI upscaling. Drag globe to orbit; scroll to zoom.'}
            {effectiveSplit ? ' Resolution applies to the active planet.' : ''}
          </p>
        </div>
      </details>
    </div>
  );
}

export function DestinationDock({
  triggerRef,
  destinationsOpen,
  bodyEntries,
  selectedSite,
  onOpen,
  onSelectSite,
  onLocateSite,
  onVisitSite,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  destinationsOpen: boolean;
  bodyEntries: SurfaceBrowseEntry[];
  selectedSite: SurfaceRecord | null;
  onOpen: () => void;
  onSelectSite: (siteId: string) => void;
  onLocateSite: (site: SurfaceRecord) => void;
  onVisitSite: (site: SurfaceRecord) => void;
}) {
  return (
    <div className="px-dock" role="region" aria-label="Destination selection">
      <button
        type="button"
        className="px-dock-trigger"
        ref={triggerRef}
        aria-label="Destinations"
        aria-expanded={destinationsOpen}
        onClick={onOpen}
      >
        <Compass size={14} aria-hidden="true" />
        <span>Destinations</span>
        <span className="px-kbd">/</span>
      </button>

      <div className="px-site-select-wrap">
        <label className="sr-only" htmlFor="px-site">
          Verified landing site
        </label>
        <select
          id="px-site"
          value={selectedSite?.id ?? ''}
          disabled={bodyEntries.length === 0}
          onChange={(event) => onSelectSite(event.target.value)}
        >
          {bodyEntries.length === 0 ? (
            <option value="">Opening catalog…</option>
          ) : (
            bodyEntries.map((entry) => (
              <option key={entry.surface.id} value={entry.surface.id}>
                {entry.surface.name}
              </option>
            ))
          )}
        </select>
      </div>

      <button
        type="button"
        className="px-locate"
        disabled={!selectedSite}
        onClick={() => selectedSite && onLocateSite(selectedSite)}
        title="Center globe on selected site"
      >
        <Orbit size={13} aria-hidden="true" />
        <span>Locate</span>
      </button>

      <button
        type="button"
        className="px-visit"
        disabled={!selectedSite}
        onClick={() => selectedSite && onVisitSite(selectedSite)}
      >
        <span>Explore verified site</span>
        <ArrowUpRight size={14} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="px-astronaut"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-pae-astronaut', 'astronaut');
          event.dataTransfer.effectAllowed = 'copy';
        }}
        aria-label="Drag astronaut onto a verified site marker"
        title="Drag onto a globe site marker to descend"
      >
        <PersonStanding size={15} aria-hidden="true" />
        <span>Drop</span>
      </button>
    </div>
  );
}

export function DropUnavailable({
  drop,
  entries,
  onDismiss,
  onVisit,
}: {
  drop: PlanetDrop;
  entries: SurfaceBrowseEntry[];
  onDismiss: () => void;
  onVisit: (site: SurfaceRecord) => void;
}) {
  return (
    <div className="px-unavailable" role="status">
      <div className="px-unavailable-head">
        <div>
          <strong>Local terrain unavailable here</strong>
          <p>
            {drop.body === 'moon' ? 'Moon' : 'Mars'} · {drop.latitude_deg.toFixed(3)}°,{' '}
            {drop.longitude_deg.toFixed(3)}°. No prepared elevation window covers this coordinate.
          </p>
        </div>
        <button
          type="button"
          className="px-icon-btn"
          onClick={onDismiss}
          aria-label="Dismiss terrain unavailable message"
        >
          <X size={14} />
        </button>
      </div>
      <div className="px-unavailable-links">
        {entries
          .filter((entry) => entry.surface.body === drop.body)
          .slice(0, 4)
          .map((entry) => (
            <button key={entry.surface.id} type="button" onClick={() => onVisit(entry.surface)}>
              <span>Explore {entry.surface.name}</span>
              <ArrowUpRight size={12} aria-hidden="true" />
            </button>
          ))}
      </div>
    </div>
  );
}
