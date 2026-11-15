import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BarChart3, BookOpen, Archive, Compass } from 'lucide-react';
import type { PlanetCatalog, PlanetDrop, PlanetRecord } from '@shared/types/planet-catalog';
import type { SurfaceCatalog, SurfaceRecord } from '@shared/types/surface-catalog';
import { loadPlanetCatalog } from '../data/planetCatalog';
import { loadSurface, loadSurfaceCatalog } from '../data/surfaceCatalog';
import type { PlanetView } from './PlanetViewport';
const SurfaceViewport = lazy(() => import('./SurfaceViewport').then(module => ({ default: module.SurfaceViewport })));
import { planetResolution } from '../terrain/planetResolution';
import {
  DestinationDock,
  DropUnavailable,
  FloatingOrbitToolbar,
  GlobePanel,
} from './explorer/ExplorerControls';
import { ExplorerDrawers } from './explorer/ExplorerDrawers';
import type { Resolution, SurfaceBrowseEntry } from './explorer/types';
import './planet-explorer.css';
import { ExplorerHeader } from './explorer/ExplorerHeader';
import { StageBoundary } from './explorer/StageBoundary';
import { useEarthSession } from './explorer/useEarthSession';
import { missionTargets, type ExplorerBody, type MissionState } from './explorer/unifiedTypes';
const GuidedMission = lazy(() => import('./explorer/GuidedMission').then(module => ({ default: module.GuidedMission })));
const EarthStage = lazy(() => import('./explorer/EarthStage').then(module => ({ default: module.EarthStage })));


export function PlanetExplorer({
  onSurfaces,
  initialBody = 'moon',
  initialSiteId,
}: {
  onSurfaces: () => void;
  initialBody?: ExplorerBody;
  initialSiteId?: string;
}) {
  const [catalog, setCatalog] = useState<PlanetCatalog | null>(null);
  const [nativeCatalog, setNativeCatalog] = useState<SurfaceCatalog | null>(null);
  const [regionalCatalog, setRegionalCatalog] = useState<SurfaceCatalog | null>(null);
  const [body, setBody] = useState<ExplorerBody>(initialBody);
  const [mission, setMission] = useState<MissionState | null>(null);
  const missionTrigger = useRef<HTMLButtonElement>(null);
  const earth = useEarthSession(body === 'earth' || mission !== null);
  const savedWorlds = useRef<Partial<Record<ExplorerBody, { drop: PlanetDrop | null; siteId: string }>>>({});
  const [split, setSplit] = useState(false);
  const [resolutions, setResolutions] = useState<Record<'moon' | 'mars', Resolution>>({
    moon: '2K',
    mars: 'Native',
  });
  const [error, setError] = useState<string | null>(null);
  const [drop, setDrop] = useState<PlanetDrop | null>(null);
  const [terrain, setTerrain] = useState<{
    id: string;
    heights: Float32Array;
    validMask: Uint8Array;
  } | null>(null);
  const [terrainError, setTerrainError] = useState<string | null>(null);
  const [siteId, setSiteId] = useState('');
  const activeWorld = useRef({ body, drop, siteId });
  activeWorld.current = { body, drop, siteId };
  const activateWorld = useCallback((next: ExplorerBody) => {
    const current = activeWorld.current;
    if (next !== current.body) savedWorlds.current[current.body] = { drop: current.drop, siteId: current.siteId };
    setBody(next);
  }, []);
  const [focusRequest, setFocusRequest] = useState<{ surfaceId: string; revision: number }>();
  const [destinationsOpen, setDestinationsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  );
  const [isTouchDevice, setIsTouchDevice] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false,
  );
  const destinationTrigger = useRef<HTMLButtonElement>(null);
  const focusRevision = useRef(0);
  const views = useRef<Partial<Record<PlanetRecord['id'], PlanetView>>>({});
  const rememberView = useCallback((id: PlanetRecord['id'], view: PlanetView) => {
    views.current[id] = { ...view };
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mqMobile = window.matchMedia('(max-width: 768px)');
    const mqTouch = window.matchMedia('(pointer: coarse)');
    const onMobileChange = (ev: MediaQueryListEvent) => setIsMobile(ev.matches);
    const onTouchChange = (ev: MediaQueryListEvent) => setIsTouchDevice(ev.matches);
    setIsMobile(mqMobile.matches);
    setIsTouchDevice(mqTouch.matches);
    mqMobile.addEventListener('change', onMobileChange);
    mqTouch.addEventListener('change', onTouchChange);
    return () => {
      mqMobile.removeEventListener('change', onMobileChange);
      mqTouch.removeEventListener('change', onTouchChange);
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    Promise.all([
      loadPlanetCatalog(c.signal),
      loadSurfaceCatalog(c.signal),
      loadSurfaceCatalog(c.signal, '/data/regional_catalog.json').catch(() => null),
    ])
      .then(([p, nativeSurfaces, regionalSurfaces]) => {
        if (c.signal.aborted) return;
        setCatalog(p);
        setNativeCatalog(nativeSurfaces);
        setRegionalCatalog(regionalSurfaces);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e.message ?? e));
      });
    return () => c.abort();
  }, []);
  // Keep native and regional catalog objects strictly separate for WeakMap SHA-256 validation;
  // combine entries only for browse display while retaining each entry's owning catalog reference.
  const browseEntries = useMemo<SurfaceBrowseEntry[]>(() => {
    const entries: SurfaceBrowseEntry[] = [];
    if (nativeCatalog) {
      for (const surface of nativeCatalog.surfaces) {
        if (surface.body === 'moon' || surface.body === 'mars') {
          entries.push({ surface, catalog: nativeCatalog, isRegional: false });
        }
      }
    }
    if (regionalCatalog) {
      for (const surface of regionalCatalog.surfaces) {
        if (surface.body === 'moon' || surface.body === 'mars') {
          entries.push({ surface, catalog: regionalCatalog, isRegional: true });
        }
      }
    }
    return entries;
  }, [nativeCatalog, regionalCatalog]);
  const bodyEntries = useMemo(
    () => browseEntries.filter((e) => e.surface.body === body),
    [browseEntries, body],
  );
  const selectedEntry = useMemo(
    () => bodyEntries.find((e) => e.surface.id === siteId) ?? bodyEntries[0] ?? null,
    [bodyEntries, siteId],
  );
  const selectedSite = selectedEntry?.surface ?? null;
  const landingEntry = useMemo(() => {
    if (!drop?.surfaceId) return null;
    return (
      browseEntries.find(
        (e) => e.surface.id === drop.surfaceId && e.surface.body === drop.body,
      ) ?? null
    );
  }, [browseEntries, drop]);
  const landing = landingEntry?.surface ?? null;
  const landingCatalog = landingEntry?.catalog ?? null;
  const isRegionalLanding = landingEntry?.isRegional ?? false;
  const handleDrop = useCallback((next: PlanetDrop) => {
    setFocusRequest(undefined);
    activateWorld(next.body);
    if (next.surfaceId) setSiteId(next.surfaceId);
    setDrop(next);
    setAnalysisOpen(false);
  }, []);
  const selectPin = useCallback((site: SurfaceRecord) => {
    if (site.body !== 'earth') {
      setFocusRequest(undefined);
      setDrop(null);
      activateWorld(site.body);
      setSiteId(site.id);
    }
  }, []);
  useEffect(() => {
    if (!landing || body === 'earth') {
      setTerrain(null);
      setAnalysisOpen(false);
      return;
    }
    const c = new AbortController();
    setTerrain(null);
    setTerrainError(null);
    loadSurface(landing, c.signal)
      .then((data) => setTerrain({ id: landing.id, ...data }))
      .catch((e) => {
        if (!c.signal.aborted) setTerrainError(String(e.message ?? e));
      });
    return () => c.abort();
  }, [landing, body]);
  const visit = useCallback(
    (site: SurfaceRecord) => {
      if (site.body !== 'earth') {
        handleDrop({
          body: site.body,
          latitude_deg: site.coordinates.latitude_deg,
          longitude_deg: site.coordinates.longitude_deg,
          surfaceId: site.id,
        });
      }
    },
    [handleDrop],
  );
  useEffect(() => {
    const entry = browseEntries.find(item => item.surface.id === initialSiteId);
    if (entry) visit(entry.surface);
  }, [initialSiteId, browseEntries, visit]);
  const locateSite = useCallback((site: SurfaceRecord) => {
    if (site.body === 'earth') return;
    activateWorld(site.body);
    setSiteId(site.id);
    setDrop(null);
    setFocusRequest({ surfaceId: site.id, revision: ++focusRevision.current });
  }, []);
  // Keyboard shortcuts: / or Cmd/Ctrl+K opens Destinations in orbit; Escape dismisses drop-unavailable notice.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inFormControl =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if (e.key === 'Escape' && drop && !landing && !destinationsOpen && !sourcesOpen && !analysisOpen) {
        setDrop(null);
        return;
      }
      if (body !== 'earth' && !landing && ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !inFormControl))) {
        e.preventDefault();
        setDestinationsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [body, drop, landing, destinationsOpen, sourcesOpen, analysisOpen]);
  const effectiveSplit = body !== 'earth' && split && !isMobile;
  const planet = catalog?.planets.find((p) => p.id === body);
  const panels = effectiveSplit ? catalog?.planets ?? [] : planet ? [planet] : [];
  const resolution = planet ? planetResolution(planet, resolutions[planet.id]) : '2K';
  const allowWalk = !isRegionalLanding && !isTouchDevice;
  const moonSurfaces = useMemo(
    () => browseEntries.filter((e) => e.surface.body === 'moon').map((e) => e.surface),
    [browseEntries],
  );
  const marsSurfaces = useMemo(
    () => browseEntries.filter((e) => e.surface.body === 'mars').map((e) => e.surface),
    [browseEntries],
  );
  const changeBody = (next: ExplorerBody) => {
    if (next === body) return;
    const saved = savedWorlds.current[next];
    activateWorld(next);
    setDrop(saved?.drop ?? null);
    setSiteId(saved?.siteId ?? '');
    setFocusRequest(undefined);
    setAnalysisOpen(false);
    setSourcesOpen(false);
    setDestinationsOpen(false);
  };
  const openEarthCounterpart = () => {
    const surfaceId = landing?.id ?? selectedSite?.id;
    const targetId = surfaceId === 'mars-jezero-hirise' ? 'mars-jezero-hirise-600m' : 'moon-shackleton-lola-600m';
    const supported = !earth.region || earth.region.bodies.includes(targetId.startsWith('moon') ? 'moon' : 'mars');
    if (!supported) earth.selectRegion('ustyurt');
    const best = supported ? earth.discovery?.candidates.find(candidate => candidate.comparisons[targetId]?.rank === 1) : undefined;
    earth.setSession(previous => ({ ...previous, targetId, candidateId: best?.id ?? '', mode: 'compare', panel: 'none' }));
    changeBody('earth');
  };
  const hasCounterpart = ['lola-site04-roi3', 'mars-jezero-hirise'].includes(landing?.id ?? selectedSite?.id ?? '');
  const endMission = useCallback(() => {
    setMission(null);
    requestAnimationFrame(() => missionTrigger.current?.focus());
  }, []);
  const goMission = (world: MissionState['body'], step: number) => {
    const selected = missionTargets[world];
    const site = browseEntries.find(entry => entry.surface.id === selected.surface)?.surface;
    const candidate = earth.discovery?.candidates.find(item => item.comparisons[selected.target]?.rank === 1);
    if (step >= 0 && (!site || !candidate)) return;
    setMission({ body: world, step });
    setDestinationsOpen(false); setSourcesOpen(false); setAnalysisOpen(false); setSplit(false);
    if (step === 0 && site) locateSite(site);
    if (step === 1 && site) visit(site);
    if (step >= 2 && candidate) {
      earth.setSession(previous => ({ ...previous, targetId: selected.target, candidateId: candidate.id,
        mode: step === 2 ? 'orbit' : 'compare', panel: 'none',
        globeView: { azimuth: (90 + candidate.longitude) * Math.PI / 180, polar: (90 - candidate.latitude) * Math.PI / 180, distance: 1.7 },
      }));
      changeBody('earth');
    }
  };
  return (
    <div className="px-app" data-mission={mission?.step}>
      <ExplorerHeader body={body} contextLabel={body === 'earth' ? 'Earth' : landing?.name ?? (effectiveSplit ? 'Moon & Mars' : planet?.name ?? body)}
        isTerrain={body !== 'earth' && !!landing} onBodyChange={next => { setMission(null); changeBody(next); }} onReturnToOrbit={() => { setMission(null); setDrop(null); }}
        actions={<>
          <button ref={missionTrigger} className="px-nav-btn" aria-label="Start guided mission" title="Start guided mission" onClick={() => setMission({ body: body === 'mars' ? 'mars' : 'moon', step: -1 })}><Compass size={14} /><span>Guided mission</span></button>
          {body !== 'earth' && <>
            {landing && terrain?.id === landing.id && <button className={`px-nav-btn ${analysisOpen ? 'active' : ''}`} aria-label="Terrain analysis" title="Terrain analysis" aria-expanded={analysisOpen} onClick={() => setAnalysisOpen(value => !value)}>
              <BarChart3 size={14} aria-hidden="true" /><span>Terrain analysis</span>
            </button>}
            <button className="px-nav-btn" aria-label="Sources" title="Sources" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen(value => !value)}><BookOpen size={14} /><span>Sources</span></button>
            {hasCounterpart && <button className="px-nav-btn" aria-label="Compare Earth counterpart" title="Compare Earth counterpart" onClick={openEarthCounterpart}><ArrowUpRight size={14} /><span>Earth counterpart</span></button>}
          </>}
          <button className="px-nav-btn" aria-label="Surface archive" title="Surface archive" onClick={onSurfaces}><Archive size={14} /><span>Surface archive</span></button>
        </>} />
      <main className="px-stage">
        {body === 'earth' ? <StageBoundary>
          {earth.error ? <div className="px-message" role="alert"><p>{earth.error}</p><button onClick={earth.retry}>Retry Earth survey</button>{earth.regionId !== 'ustyurt' && <button onClick={() => { setMission(null); earth.selectRegion('ustyurt'); }}>Return to Ustyurt survey</button>}</div>
            : earth.discovery ? <Suspense fallback={<div className="px-message" role="status">Opening Earth explorer…</div>}>
              <EarthStage regionError={earth.regionError} onRetryRegions={earth.retry} key={earth.regionId} regions={earth.regions} regionId={earth.regionId} onRegionChange={id => { setMission(null); earth.selectRegion(id); }} discovery={earth.discovery} session={earth.session} onSessionChange={earth.setSession}
                onExploreTarget={surfaceId => { const entry = browseEntries.find(item => item.surface.id === surfaceId); if (entry) visit(entry.surface); }} />
            </Suspense> : <div className="px-message" role="status">Verifying Earth survey…</div>}
        </StageBoundary> : error ? (
          <div className="px-message" role="alert">
            {error}
          </div>
        ) : drop && landing ? (
          <div className="px-ground">
            {terrain?.id === landing.id ? (
              <Suspense fallback={<div className="px-message" role="status">Loading terrain…</div>}><SurfaceViewport
                key={landing.id}
                surface={landing}
                catalog={landingCatalog ?? undefined}
                heights={terrain.heights}
                validMask={terrain.validMask}
                mode={allowWalk ? 'walk' : 'orbit'}
                allowWalking={allowWalk}
                imageryPath={isRegionalLanding ? '/data/regional_imagery.json' : undefined}
                onError={setTerrainError}
              /></Suspense>
            ) : (
              <div className="px-message" role="status">
                {terrainError ?? 'Verifying source elevation assets…'}
              </div>
            )}
            {terrainError && terrain?.id === landing.id && (
              <p className="px-ground-error" role="alert">
                {terrainError}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className={`px-orbits ${effectiveSplit ? 'split' : ''}`}>
              {panels.map((p) => {
                const panelSurfaces = p.id === 'moon' ? moonSurfaces : marsSurfaces;
                return (
                  <GlobePanel
                    key={p.id}
                    planet={p}
                    surfaces={panelSurfaces}
                    resolution={planetResolution(p, resolutions[p.id])}
                    onDrop={handleDrop}
                    onSelect={selectPin}
                    selectedSiteId={selectedSite?.id}
                    view={views.current[p.id]}
                    onViewChange={rememberView}
                    focusRequest={
                      browseEntries.find((e) => e.surface.id === focusRequest?.surfaceId)?.surface
                        .body === p.id
                        ? focusRequest
                        : undefined
                    }
                  />
                );
              })}
              {!catalog && (
                <div className="px-message" role="status">
                  Opening local planetary imagery…
                </div>
              )}
            </div>
            <FloatingOrbitToolbar
              body={body}
              effectiveSplit={effectiveSplit}
              isMobile={isMobile}
              planet={planet}
              resolution={resolution}
              onToggleSplit={() => {
                if (isMobile) return;
                setFocusRequest(undefined);
                setSplit((value) => !value);
                setDrop(null);
              }}
              onResolutionChange={(nextResolution) =>
                setResolutions((previous) => ({
                  ...previous,
                  [body]: nextResolution,
                }))
              }
            />
            {drop && !landing && (
              <DropUnavailable
                drop={drop}
                entries={browseEntries}
                onDismiss={() => setDrop(null)}
                onVisit={visit}
              />
            )}
            <DestinationDock
              triggerRef={destinationTrigger}
              destinationsOpen={destinationsOpen}
              bodyEntries={bodyEntries}
              selectedSite={selectedSite}
              onOpen={() => setDestinationsOpen(true)}
              onSelectSite={setSiteId}
              onLocateSite={locateSite}
              onVisitSite={visit}
            />
          </>
        )}
        {mission && <Suspense fallback={<div className="px-message" role="status">Preparing guided mission…</div>}><GuidedMission regions={earth.regions} regionId={earth.regionId} onRegionChange={earth.selectRegion} regionError={earth.regionError} mission={mission} discovery={earth.discovery} error={earth.error} onRetry={earth.retry}
          onStep={goMission} onClose={endMission} onEvidence={() => { endMission(); earth.setSession(previous => ({ ...previous, panel: 'details' })); }} /></Suspense>}
      </main>
      {body !== 'earth' && <ExplorerDrawers
        destinationsOpen={destinationsOpen}
        sourcesOpen={sourcesOpen}
        analysisOpen={analysisOpen}
        onDestinationsOpenChange={(open) => {
          setDestinationsOpen(open);
          if (!open) requestAnimationFrame(() => destinationTrigger.current?.focus());
        }}
        onSourcesOpenChange={setSourcesOpen}
        onAnalysisOpenChange={setAnalysisOpen}
        entries={browseEntries}
        activeBody={body}
        selectedSiteId={selectedSite?.id}
        onSelectSite={(entry) => {
          if (entry.surface.body !== 'earth') {
            activateWorld(entry.surface.body);
            setSiteId(entry.surface.id);
          }
        }}
        onLocateSite={(entry) => locateSite(entry.surface)}
        onExploreSite={(entry) => visit(entry.surface)}
        panels={panels}
        landing={drop ? landing : null}
        landingCatalog={drop ? landingCatalog : null}
        isRegionalLanding={isRegionalLanding}
        isMobile={isMobile}
      />}
    </div>
  );
}
