import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
} from '@ui-sdk/react/drawer';
import { ArrowUpRight, X } from 'lucide-react';
import type { RefObject } from 'react';
import type { DiscoveryTarget, EarthDiscovery } from '@shared/types/earth-discovery';
import { formatBytes, formatCoordPair, formatNum } from './types';

export interface ProvenanceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discovery: EarthDiscovery;
  target: DiscoveryTarget;
  isMobile: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
}

export function ProvenanceDrawer({
  open,
  onOpenChange,
  discovery,
  target,
  isMobile,
  returnFocusRef,
}: ProvenanceDrawerProps) {
  const exclusionEntries = Object.entries(discovery.domain.exclusion_reasons);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side={isMobile ? 'bottom' : 'right'}
      snapPoints={isMobile ? [0.6, 0.92] : undefined}
      defaultSnapPoint={isMobile ? 0.6 : undefined}
      modal={true}
    >
      <DrawerBackdrop className="eaf-drawer-backdrop" />
      <DrawerContent
        className={`eaf-drawer-content ${isMobile ? 'eaf-drawer-sheet' : 'eaf-drawer-side'}`}
        finalFocus={() => returnFocusRef.current}
      >
        {isMobile && (
          <DrawerHandle className="eaf-drawer-handle" aria-label="Resize provenance sheet" />
        )}
        <div className="eaf-drawer-head">
          <div>
            <DrawerTitle className="eaf-drawer-title">
              Method, coverage &amp; provenance
            </DrawerTitle>
            <DrawerDescription className="eaf-drawer-desc eaf-mono">
              Run {discovery.run_id} · schema {discovery.schema_version}
            </DrawerDescription>
          </div>
          <DrawerClose className="eaf-btn-subtle" aria-label="Close provenance panel">
            <X size={15} />
          </DrawerClose>
        </div>

        <div className="eaf-drawer-body">
          {/* Method formula & uncertainty */}
          <div className="eaf-prov-block">
            <h3>{discovery.method.name}</h3>
            <p>{discovery.method.description}</p>
            <p className="eaf-mono" style={{ fontSize: 11 }}>
              {discovery.method.grid_size} × {discovery.method.grid_size} cells ·{' '}
              {discovery.method.grid_spacing_m} m common-grid spacing (not source resolution) ·{' '}
              {discovery.method.window_size_m} m window · ≥
              {formatNum(discovery.method.shortlist_separation_m / 1000, 1)} km shortlist separation
            </p>
            <div className="eaf-prov-code">
              <div>Formula: {discovery.method.distance_formula}</div>
              <div style={{ marginTop: 4 }}>Sensitivity: {discovery.method.sensitivity}</div>
              <div style={{ marginTop: 4 }}>Profile SHA-256: {discovery.method.profile_sha256}</div>
            </div>
            <p>
              <strong>Uncertainty:</strong> {discovery.method.uncertainty}
            </p>
          </div>

          {/* Domain coverage & exclusion counts */}
          <div className="eaf-prov-block">
            <h3>Survey domain &amp; exclusions</h3>
            <p>
              {discovery.domain.name} ({formatNum(discovery.domain.area_km2, 1)} km² ·{' '}
              {discovery.domain.crs}) — {discovery.domain.description}
            </p>
            <p className="eaf-mono" style={{ fontSize: 11 }}>
              Generated: {discovery.domain.generated_count.toLocaleString('en-US')} · Eligible:{' '}
              {discovery.domain.eligible_count.toLocaleString('en-US')} · Excluded:{' '}
              {discovery.domain.excluded_count.toLocaleString('en-US')}
            </p>
            {exclusionEntries.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {exclusionEntries.map(([reason, count]) => (
                  <li key={reason} className="eaf-mono" style={{ fontSize: 11 }}>
                    {reason}: {count.toLocaleString('en-US')} windows
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Reference baseline */}
          <div className="eaf-prov-block">
            <h3>NASA reference baseline ({discovery.baseline.sites.length} sites)</h3>
            <p>{discovery.baseline.description}</p>
            <div className="eaf-prov-code">Baseline SHA-256: {discovery.baseline.sha256}</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {discovery.baseline.sites.map((site) => (
                <li key={site.name}>
                  <a href={site.url} target="_blank" rel="noreferrer" className="eaf-link">
                    {site.name} <ArrowUpRight size={11} aria-hidden="true" />
                  </a>{' '}
                  <span className="eaf-mono" style={{ fontSize: 11 }}>
                    · {formatCoordPair(site.latitude, site.longitude, 2)} · r=
                    {formatNum(site.radius_km, 0)} km
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Source products & SHA-256 hashes */}
          <div className="eaf-prov-block">
            <h3>Verified datasets &amp; checksums ({discovery.sources.length})</h3>
            {discovery.sources.map((src) => (
              <div key={src.id} className="eaf-prov-code" style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <a href={src.url} target="_blank" rel="noreferrer" className="eaf-link">
                    {src.provider} · {src.title} <ArrowUpRight size={11} aria-hidden="true" />
                  </a>
                  <span>{formatBytes(src.bytes)}</span>
                </div>
                <div style={{ marginTop: 3, color: 'var(--eaf-text-muted)' }}>
                  Role: {src.role} · License: {src.license} · Scope: {src.hash_scope}
                </div>
                <div style={{ marginTop: 2, color: 'var(--eaf-text-muted)' }}>
                  SHA-256: {src.sha256}
                </div>
              </div>
            ))}
          </div>

          {/* Run & Target limitations */}
          <div className="eaf-prov-block">
            <h3>Limitations ({target.name} &amp; run)</h3>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {target.limitations.map((item) => (
                <li key={`t-${item}`}>{item}</li>
              ))}
              {discovery.limitations.map((item) => (
                <li key={`d-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
