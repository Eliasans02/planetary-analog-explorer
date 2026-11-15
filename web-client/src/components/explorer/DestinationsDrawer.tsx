import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
} from '@ui-sdk/react/drawer';
import { ArrowUpRight, Compass, MapPin, Orbit, Search, X } from 'lucide-react';
import type { SurfaceCatalog, SurfaceRecord } from '@shared/types/surface-catalog';
import type { SurfaceBrowseEntry } from './types';

export interface DestinationsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: SurfaceBrowseEntry[];
  activeBody: 'moon' | 'mars';
  selectedSiteId?: string;
  onSelectSite: (entry: SurfaceBrowseEntry) => void;
  onLocateSite: (entry: SurfaceBrowseEntry) => void;
  onExploreSite: (entry: SurfaceBrowseEntry) => void;
  isMobile: boolean;
}

function formatSpacing(spacing: [number, number]): string {
  return spacing
    .map((v) => v.toLocaleString('en-US', { maximumFractionDigits: 1 }))
    .join(' × ');
}

function formatCoord(deg: number, pos: string, neg: string): string {
  const dir = deg >= 0 ? pos : neg;
  return `${Math.abs(deg).toFixed(3)}° ${dir}`;
}

export function DestinationsDrawer({
  open,
  onOpenChange,
  entries,
  activeBody,
  selectedSiteId,
  onSelectSite,
  onLocateSite,
  onExploreSite,
  isMobile,
}: DestinationsDrawerProps) {
  const [query, setQuery] = useState('');
  const [bodyFilter, setBodyFilter] = useState<'all' | 'moon' | 'mars'>(activeBody);
  const [tierFilter, setTierFilter] = useState<'all' | 'native' | 'regional'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setBodyFilter(activeBody);
    }
  }, [open, activeBody]);

  const hasRegional = useMemo(() => entries.some((e) => e.isRegional), [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (bodyFilter !== 'all' && entry.surface.body !== bodyFilter) return false;
      if (tierFilter === 'native' && entry.isRegional) return false;
      if (tierFilter === 'regional' && !entry.isRegional) return false;
      if (!q) return true;
      const s = entry.surface;
      const sourceText = entry.catalog.sources
        .filter((src) => s.source_ids.includes(src.id))
        .map((src) => `${src.provider} ${src.product}`)
        .join(' ');
      const haystack = `${s.name} ${s.id} ${s.body} ${s.coordinates.frame} ${s.roi.label} ${sourceText}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, bodyFilter, tierFilter, query]);

  const getSources = (surface: SurfaceRecord, catalog: SurfaceCatalog) =>
    catalog.sources.filter((src) => surface.source_ids.includes(src.id));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side={isMobile ? 'bottom' : 'left'}
      snapPoints={isMobile ? [0.55, 0.9] : undefined}
      defaultSnapPoint={isMobile ? 0.55 : undefined}
      modal={true}
    >
      <DrawerBackdrop className="px-drawer-backdrop" />
      <DrawerContent
        className={`px-drawer-content ${isMobile ? 'px-drawer-sheet' : 'px-drawer-side'}`}
        initialFocus={() => searchInputRef.current}
      >
        {isMobile && <DrawerHandle className="px-drawer-handle" aria-label="Resize destinations sheet" />}
        <div className="px-drawer-header">
          <div className="px-drawer-title-group">
            <DrawerTitle className="px-drawer-title">Destinations</DrawerTitle>
            <DrawerDescription className="px-drawer-description">
              Verified elevation windows on the Moon and Mars. Search by crater, mission, or frame.
            </DrawerDescription>
          </div>
          <DrawerClose className="px-icon-btn" aria-label="Close destinations">
            <X size={16} />
          </DrawerClose>
        </div>

        <div className="px-drawer-controls">
          <div className="px-search-field">
            <Search size={14} className="px-search-icon" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sites, coordinates, or sensors…"
              aria-label="Filter prepared terrain destinations"
              className="px-search-input"
            />
            {query && (
              <button
                type="button"
                className="px-search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear destination search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="px-filter-row" role="group" aria-label="Filter destinations by body">
            {(['all', 'moon', 'mars'] as const).map((filterVal) => (
              <button
                key={filterVal}
                type="button"
                className={`px-filter-btn ${bodyFilter === filterVal ? 'active' : ''}`}
                aria-pressed={bodyFilter === filterVal}
                onClick={() => setBodyFilter(filterVal)}
              >
                {filterVal === 'all' ? 'All worlds' : filterVal === 'moon' ? 'Moon' : 'Mars'}
              </button>
            ))}
            {hasRegional && (
              <>
                <span className="px-filter-sep" aria-hidden="true" />
                {(['all', 'native', 'regional'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    className={`px-filter-btn ${tierFilter === tier ? 'active' : ''}`}
                    aria-pressed={tierFilter === tier}
                    onClick={() => setTierFilter(tier)}
                  >
                    {tier === 'all' ? 'All scales' : tier === 'native' ? 'Native DEM' : 'Regional'}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="px-drawer-body">
          {filtered.length === 0 ? (
            <div className="px-empty-state" role="status">
              <Compass size={18} aria-hidden="true" />
              <p>No prepared terrain windows match your filter.</p>
              {query && (
                <button type="button" className="px-ghost-btn" onClick={() => setQuery('')}>
                  Reset search
                </button>
              )}
            </div>
          ) : (
            <ul className="px-dest-list">
              {filtered.map((entry) => {
                const { surface: site, isRegional, catalog } = entry;
                const isSelected = site.id === selectedSiteId;
                const sources = getSources(site, catalog);
                return (
                  <li key={site.id} className={`px-dest-item ${isSelected ? 'selected' : ''}`}>
                    <button
                      type="button"
                      className="px-dest-select"
                      aria-pressed={isSelected}
                      onClick={() => onSelectSite(entry)}
                    >
                      <div className="px-dest-meta">
                        <span>{site.body === 'moon' ? 'Moon' : 'Mars'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{isRegional ? 'Coarse regional orbit' : 'Native walk-ready'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {formatCoord(site.coordinates.latitude_deg, 'N', 'S')},{' '}
                          {formatCoord(site.coordinates.longitude_deg, 'E', 'W')}
                        </span>
                      </div>
                      <strong className="px-dest-name">{site.name}</strong>
                      <div className="px-dest-specs tabular-nums">
                        <span>
                          {site.grid.width} × {site.grid.height} samples
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatSpacing(site.grid.spacing_m)} m spacing</span>
                        <span aria-hidden="true">·</span>
                        <span>{site.stats.relief_m.toFixed(0)} m relief</span>
                      </div>
                    </button>
                    {sources.length > 0 && (
                      <div className="px-dest-sources">
                        {sources.map((src) => (
                          <a
                            key={src.id}
                            href={src.product_url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-inline-link"
                          >
                            {src.provider} · {src.product}
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="px-dest-actions">
                      <button
                        type="button"
                        className="px-dest-action-secondary"
                        onClick={() => {
                          onLocateSite(entry);
                          onOpenChange(false);
                        }}
                      >
                        <Orbit size={13} aria-hidden="true" />
                        <span>Locate on globe</span>
                      </button>
                      <button
                        type="button"
                        className="px-dest-action-primary"
                        onClick={() => {
                          onExploreSite(entry);
                          onOpenChange(false);
                        }}
                      >
                        <MapPin size={13} aria-hidden="true" />
                        <span>Explore verified site</span>
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
