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
import type { PlanetRecord } from '@shared/types/planet-catalog';
import type { SurfaceCatalog, SurfaceRecord } from '@shared/types/surface-catalog';
import { InfoDisclosure } from '../ui/InfoDisclosure';

export interface SourcesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panels: PlanetRecord[];
  landing: SurfaceRecord | null;
  landingCatalog: SurfaceCatalog | null;
  isRegionalLanding: boolean;
  isMobile: boolean;
}

export function SourcesDrawer({
  open,
  onOpenChange,
  panels,
  landing,
  landingCatalog,
  isRegionalLanding,
  isMobile,
}: SourcesDrawerProps) {
  const landingSources =
    landing && landingCatalog
      ? landingCatalog.sources.filter((s) => landing.source_ids.includes(s.id))
      : [];

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side={isMobile ? 'bottom' : 'right'}
      snapPoints={isMobile ? [0.55, 0.9] : undefined}
      defaultSnapPoint={isMobile ? 0.55 : undefined}
      modal={true}
    >
      <DrawerBackdrop className="px-drawer-backdrop" />
      <DrawerContent className={`px-drawer-content ${isMobile ? 'px-drawer-sheet' : 'px-drawer-side'}`}>
        {isMobile && <DrawerHandle className="px-drawer-handle" aria-label="Resize sources sheet" />}
        <div className="px-drawer-header">
          <div className="px-drawer-title-group">
            <DrawerTitle className="px-drawer-title">
              {landing ? 'Landing source & coverage' : 'Planetary imagery & provenance'}
            </DrawerTitle>
            <DrawerDescription className="px-drawer-description">
              {landing
                ? `${landing.name} · ${landing.coordinates.frame}`
                : 'NASA source credits, coordinate frames, and verified display boundaries.'}
            </DrawerDescription>
          </div>
          <DrawerClose className="px-icon-btn" aria-label="Close source details">
            <X size={16} />
          </DrawerClose>
        </div>

        <div className="px-drawer-body px-sources-body">
          {landing ? (
            <div className="px-sources-stack">
              <div className="px-source-section">
                <h3>Site overview</h3>
                <p>{landing.description}</p>
                <p className="px-muted-text">
                  {isRegionalLanding
                    ? 'Coarse regional window · orbital inspection mode only (first-person walking disabled for regional resolution).'
                    : 'Native DEM window · bounded walking on keyboard devices; orbital inspection on touch devices.'}
                </p>
              </div>

              <InfoDisclosure label="Coordinate reference & vertical datum" defaultOpen={true}>
                <p>{landing.coordinates.provenance}</p>
                <p style={{ marginTop: 8 }}>
                  Heights use {landing.grid.vertical_datum ?? 'the source reference'}; no cross-body frame conversion.
                </p>
                <p style={{ marginTop: 8 }} className="tabular-nums">
                  Grid: {landing.grid.width} × {landing.grid.height} samples ·{' '}
                  {landing.grid.spacing_m
                    .map((v) => v.toLocaleString('en-US', { maximumFractionDigits: 3 }))
                    .join(' × ')}{' '}
                  m spacing.
                </p>
              </InfoDisclosure>

              <InfoDisclosure label={`Source products (${landingSources.length})`} defaultOpen={true}>
                <ul className="px-plain-list">
                  {landingSources.map((s) => (
                    <li key={s.id}>
                      <a href={s.product_url} target="_blank" rel="noreferrer" className="px-inline-link">
                        {s.provider} · {s.product} <ArrowUpRight size={11} aria-hidden="true" />
                      </a>
                      <span className="px-muted-inline"> · {s.license}</span>
                    </li>
                  ))}
                </ul>
                <p style={{ marginTop: 10 }}>
                  <a href={landing.provenance.path} target="_blank" rel="noreferrer" className="px-inline-link">
                    Local processing provenance <ArrowUpRight size={11} aria-hidden="true" />
                  </a>
                </p>
              </InfoDisclosure>

              <InfoDisclosure label={`Coverage limitations (${landing.limitations.length})`} defaultOpen={false}>
                <ul className="px-bullet-list">
                  {landing.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </InfoDisclosure>
            </div>
          ) : (
            <div className="px-sources-stack">
              <div className="px-source-section">
                <h3>Global display mosaics</h3>
                <p>
                  Global color mosaics are display imagery and may include documented polar fill or inpainting.
                  Texture detail is not a scientific ground-resolution measurement. Shading is illustrative; it does
                  not represent current sunlight.
                </p>
                <p className="px-muted-text" style={{ marginTop: 8 }}>
                  Sites are approximate orbit locators; local terrain retains its native source frame.
                </p>
              </div>

              {panels.map((p) => (
                <InfoDisclosure key={p.id} label={`${p.name} · ${p.source_credit}`} defaultOpen={panels.length === 1}>
                  <p>
                    Equirectangular mosaic · 0° center longitude.{' '}
                    {p.displacement
                      ? 'Source-derived global radial relief; see provenance for its separate resolution and reference.'
                      : 'Spherical globe; local elevation is available at verified sites.'}
                  </p>
                  <div className="px-source-links">
                    <a href={p.source_url} target="_blank" rel="noreferrer" className="px-inline-link">
                      Original source <ArrowUpRight size={11} aria-hidden="true" />
                    </a>
                    <span aria-hidden="true">·</span>
                    <a href={p.provenance.path} target="_blank" rel="noreferrer" className="px-inline-link">
                      Local processing provenance <ArrowUpRight size={11} aria-hidden="true" />
                    </a>
                  </div>
                  <ul className="px-bullet-list" style={{ marginTop: 8 }}>
                    {p.limitations.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </InfoDisclosure>
              ))}

              <InfoDisclosure label="Reconstruction phase notice" defaultOpen={false}>
                <p>
                  Gaussian splat exploration is reserved for a future phase and requires a real, source-backed
                  reconstruction. No synthetic terrain or upscaled imagery is used.
                </p>
              </InfoDisclosure>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
