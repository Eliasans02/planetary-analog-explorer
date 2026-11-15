import { ResearchRegionControl } from './ResearchRegionControl';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control';
import { Drawer, DrawerBackdrop, DrawerClose, DrawerContent, DrawerDescription, DrawerHandle, DrawerTitle } from '@ui-sdk/react/drawer';
import { ArrowRight, BookOpen, Compass, Globe, Layers2, ListFilter, Loader2, Map as MapIcon, X } from 'lucide-react';
import type { DiscoveryCandidate, DiscoveryTarget } from '@shared/types/earth-discovery';
import type { PlanetView } from '../PlanetViewport';
import { EarthViewBoundary } from './EarthViewBoundary';
const EarthSurveyGlobe = lazy(() => import('../earth-analogs/EarthSurveyGlobe').then(module => ({ default: module.EarthSurveyGlobe })));
import { SurveyMap } from '../earth-analogs/SurveyMap';
import { CandidateList } from '../earth-analogs/CandidateList';
import { CandidateDetail } from '../earth-analogs/CandidateDetail';
import { ProvenanceDrawer } from '../earth-analogs/ProvenanceDrawer';
import { formatCoordPair, formatNum } from '../earth-analogs/types';
import '../earth-analogs/earth-analog-finder.css';
import '../earth-analogs/earth-analog-panels.css';
import '../earth-analogs/earth-analog-detail.css';
import type { EarthSession, EarthStageProps } from './unifiedTypes';
import './earth-stage.css';
import './earth-stage-overlays.css';

const LazyTerrainComparison = lazy(() =>
  import('../comparison/TerrainComparison').then((mod) => ({ default: mod.TerrainComparison })),
);

function lowestDistanceCandidate(candidates: DiscoveryCandidate[], targetId: string): DiscoveryCandidate | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestDist = best.comparisons[targetId]?.distance ?? Infinity;
  let bestRank = best.comparisons[targetId]?.rank ?? Number.MAX_SAFE_INTEGER;
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const comp = c.comparisons[targetId];
    const dist = comp?.distance ?? Infinity;
    const rank = comp?.rank ?? Number.MAX_SAFE_INTEGER;
    if (dist < bestDist || (dist === bestDist && rank < bestRank)) {
      best = c;
      bestDist = dist;
      bestRank = rank;
    }
  }
  return best;
}

export function EarthStage({
  discovery,
  session,
  onSessionChange,
  onExploreTarget,
  regions = [], regionId = 'ustyurt', onRegionChange, regionError, onRetryRegions,
}: EarthStageProps) {
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  );

  const provenanceTriggerRef = useRef<HTMLElement | null>(null);
  const detailsTriggerRef = useRef<HTMLButtonElement>(null);
  const candidatesTriggerRef = useRef<HTMLButtonElement>(null);
  const prevPanelRef = useRef(session.panel);
  const latestSessionRef = useRef(session);
  latestSessionRef.current = session;
  const onSessionChangeRef = useRef(onSessionChange);
  onSessionChangeRef.current = onSessionChange;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (ev: MediaQueryListEvent) => setIsMobile(ev.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const activeTarget: DiscoveryTarget | null = useMemo(
    () => {
      const region = regions.find(item => item.id === regionId);
      const targets = discovery.targets.filter(item => !region || region.bodies.includes(item.body));
      return targets.find(t => t.id === session.targetId) ?? targets[0] ?? null;
    },
    [discovery.targets, session.targetId, regions, regionId],
  );

  const activeCandidate: DiscoveryCandidate | null = useMemo(() => {
    if (!activeTarget) return discovery.candidates[0] ?? null;
    return (
      discovery.candidates.find((c) => c.id === session.candidateId) ??
      lowestDistanceCandidate(discovery.candidates, activeTarget.id)
    );
  }, [discovery.candidates, session.candidateId, activeTarget]);

  useEffect(() => {
    const prev = prevPanelRef.current;
    prevPanelRef.current = session.panel;
    if (session.panel === 'none') {
      if (prev === 'candidates') candidatesTriggerRef.current?.focus();
      if (prev === 'details') detailsTriggerRef.current?.focus();
    }
  }, [session.panel, isMobile]);

  useEffect(() => {
    if (isMobile || provenanceOpen || session.panel !== 'candidates') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSessionChangeRef.current({ ...latestSessionRef.current, panel: 'none' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobile, session.panel, provenanceOpen]);

  const patchSession = useCallback(
    (patch: Partial<EarthSession>) => {
      const next = { ...latestSessionRef.current, ...patch };
      latestSessionRef.current = next;
      onSessionChangeRef.current(next);
    },
    [],
  );

  const handleTargetChange = useCallback(
    (nextTargetId: string) => {
      const best = lowestDistanceCandidate(discovery.candidates, nextTargetId);
      patchSession({
        targetId: nextTargetId,
        candidateId: best?.id ?? latestSessionRef.current.candidateId,
        query: '',
        page: 0,
      });
    },
    [discovery.candidates, patchSession],
  );

  const handleGlobeViewChange = useCallback((view: PlanetView) => {
    patchSession({ globeView: view });
  }, [patchSession]);



  if (!activeTarget || !activeCandidate) {
    return (
      <div className="es-stage">
        <div className="es-compare-fallback" role="status">
          <h3>No prepared Earth analog pairs</h3>
          <p>The loaded Earth discovery dataset contains no active target or candidate records.</p>
        </div>
      </div>
    );
  }

  const comparison = activeCandidate.comparisons[activeTarget.id] ?? null;
  const candidateListNode = (
    <CandidateList
      candidates={discovery.candidates}
      target={activeTarget}
      selectedCandidateId={activeCandidate.id}
      onSelectCandidate={(candidateId) =>
        patchSession(isMobile ? { candidateId, panel: 'none' } : { candidateId })
      }
      scope={session.scope}
      onScopeChange={(scope) => patchSession({ scope, page: 0 })}
      searchQuery={session.query}
      onSearchChange={(query) => patchSession({ query, page: 0 })}
      page={session.page}
      onPageChange={(page) => patchSession({ page })}
    />
  );

  return (
    <div className="es-stage">
      {onRegionChange && <ResearchRegionControl regions={regions} regionId={regionId} onChange={onRegionChange} error={regionError} onRetry={onRetryRegions} />}
      {session.mode === 'orbit' && (
        <div className="es-orbit-canvas">
          <EarthViewBoundary label="Earth globe" onReturnSurvey={() => patchSession({ mode: 'survey' })}>
          <Suspense fallback={<div className="es-compare-fallback" role="status">Opening Earth globe…</div>}>
          <EarthSurveyGlobe regions={regions} onRegionChange={onRegionChange}
            discovery={discovery}
            selectedCandidateId={activeCandidate.id}
            onShowMap={() => patchSession({ mode: 'survey' })}
            immersive={true}
            initialView={session.globeView}
            onViewChange={handleGlobeViewChange}
          />
          </Suspense></EarthViewBoundary>
        </div>
      )}

      {session.mode === 'survey' && (
        <div className="es-survey-canvas">
          <div className="es-survey-inner">
            <SurveyMap
              discovery={discovery}
              target={activeTarget}
              selectedCandidateId={activeCandidate.id}
              onSelectCandidate={(candidateId) => patchSession({ candidateId })}
            />
          </div>
        </div>
      )}

      {session.mode === 'compare' && (
        <div className="es-compare-canvas">
          <EarthViewBoundary label="3D terrain comparison" onReturnSurvey={() => patchSession({ mode: 'survey' })}>
            <Suspense
              fallback={
                <div className="es-compare-fallback" role="status">
                  <Loader2 size={16} className="eaf-spinner" aria-hidden="true" />
                  <span>Loading paired 3D terrain comparison…</span>
                </div>
              }
            >
              <LazyTerrainComparison
                discovery={discovery}
                target={activeTarget}
                candidate={activeCandidate}
              />
            </Suspense>
          </EarthViewBoundary>
        </div>
      )}

      <div className="es-hud-layer">
        <div className="es-hud-top">
          {session.mode !== 'compare' ? (
            <div className="es-hero-meta">
              <div className="es-hero-title">{discovery.domain.name.includes('Ustyurt') ? 'Ustyurt Plateau · Kazakhstan' : discovery.domain.name}</div>
              <div className="es-hero-stats eaf-mono">
                <span>{discovery.domain.eligible_count.toLocaleString('en-US')} windows</span>
                <span aria-hidden="true">·</span>
                <span>{formatNum(discovery.domain.area_km2, 0)} km²</span>
                {session.mode === 'orbit' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{regions.length + 1} regions available</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="es-hero-meta">
              <div className="es-hero-title">
                Earth / {activeTarget.body === 'moon' ? 'Moon' : 'Mars'} · Terrain comparison
              </div>
              <div className="es-hero-stats eaf-mono">
                <span>Exploratory dist {comparison ? formatNum(comparison.distance, 3) : '—'}</span>
                <span aria-hidden="true">·</span>
                <span>Rank #{comparison?.rank ?? '—'}</span>
              </div>
            </div>
          )}

          <div className="es-top-tools" role="toolbar" aria-label="Earth discovery tools">
            <label htmlFor="eaf-target-select" className="es-tool-label">
              Planetary target
            </label>
            <select
              id="eaf-target-select"
              className="es-target-select"
              value={activeTarget.id}
              onChange={(e) => handleTargetChange(e.target.value)}
            >
              {discovery.targets.filter(t => { const region = regions.find(item => item.id === regionId); return !region || region.bodies.includes(t.body); }).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.body === 'moon' ? 'Moon' : 'Mars'} · {t.id === 'moon-shackleton-lola-600m' ? 'Shackleton rim' : t.id === 'mars-jezero-hirise-600m' ? 'Jezero crater' : t.name}
                </option>
              ))}
            </select>
            <span className="es-tool-sep" aria-hidden="true" />
            <button
              ref={candidatesTriggerRef}
              type="button"
              className={`es-tool-btn ${session.panel === 'candidates' ? 'active' : ''}`}
              aria-expanded={session.panel === 'candidates'}
              onClick={() =>
                patchSession({ panel: session.panel === 'candidates' ? 'none' : 'candidates' })
              }
            >
              <ListFilter size={13} aria-hidden="true" />
              <span>Candidates</span>
            </button>
            <button
              type="button"
              className={`es-tool-btn ${provenanceOpen ? 'active' : ''}`}
              aria-label="Open method and provenance"
              aria-expanded={provenanceOpen}
              onClick={event => { provenanceTriggerRef.current = event.currentTarget; setProvenanceOpen(true); }}
            >
              <BookOpen size={13} aria-hidden="true" />
              <span className="es-hide-xs">Method</span>
            </button>
          </div>
        </div>

        {!isMobile && session.panel === 'candidates' && (
          <div className="es-left-overlay" role="region" aria-label="Candidate windows list">
            <div className="es-left-overlay-head">
              <span>Ranked Earth windows</span>
              <button
                type="button"
                className="es-close-btn"
                aria-label="Close candidates list"
                onClick={() => patchSession({ panel: 'none' })}
              >
                <X size={14} />
              </button>
            </div>
            {candidateListNode}
          </div>
        )}

        <div className="es-hud-bottom">
          {session.mode !== 'compare' ? (
            <div className="es-candidate-card">
              <div className="es-cand-info">
                <div className="es-cand-title">
                  <span className="eaf-mono es-cand-rank">#{comparison?.rank ?? '—'}</span>
                  <span>{activeCandidate.name.replace('Ustyurt systematic window ', 'Window ')}</span>
                </div>
                <div className="es-cand-meta eaf-mono">
                  <span>{activeCandidate.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>dist {comparison ? formatNum(comparison.distance, 3) : '—'}</span>
                  <span aria-hidden="true" className="es-hide-sm">·</span>
                  <span className="es-hide-sm">
                    {formatCoordPair(activeCandidate.latitude, activeCandidate.longitude, 2)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="es-btn-subtle-sm"
                ref={detailsTriggerRef}
                aria-expanded={session.panel === 'details'}
                onClick={() =>
                  patchSession({ panel: session.panel === 'details' ? 'none' : 'details' })
                }
              >
                <span>Details</span>
                <ArrowRight size={12} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div />
          )}

          <div className="es-dock" role="toolbar" aria-label="Earth exploration dock">
            <SegmentedControl
              value={session.mode}
              onValueChange={(next) => {
                if (next === 'orbit' || next === 'survey' || next === 'compare') {
                  patchSession({ mode: next });
                }
              }}
              aria-label="Earth exploration mode"
              className="es-dock-segmented"
            >
              <SegmentedControlIndicator className="es-dock-indicator" />
              <SegmentedControlItem value="orbit" className="es-dock-item">
                <Globe size={13} aria-hidden="true" />
                <span>Orbit</span>
              </SegmentedControlItem>
              <SegmentedControlItem value="survey" className="es-dock-item">
                <MapIcon size={13} aria-hidden="true" />
                <span>Survey</span>
              </SegmentedControlItem>
              <SegmentedControlItem value="compare" className="es-dock-item">
                <Layers2 size={13} aria-hidden="true" />
                <span>Compare</span>
              </SegmentedControlItem>
            </SegmentedControl>

            {session.mode === 'orbit' && (
              <button
                type="button"
                className="es-btn-accent"
                onClick={() => patchSession({ mode: 'survey' })}
              >
                <Compass size={14} aria-hidden="true" />
                <span>Explore search area</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {isMobile && session.panel === 'candidates' && (
        <Drawer
          open={session.panel === 'candidates'}
          onOpenChange={(open) => {
            if (!open && latestSessionRef.current.panel === 'candidates') patchSession({ panel: 'none' });
          }}
          side="bottom"
          snapPoints={[0.58, 0.92]}
          defaultSnapPoint={0.58}
          modal={true}
        >
          <DrawerBackdrop className="eaf-drawer-backdrop" />
          <DrawerContent className="eaf-drawer-content eaf-drawer-sheet es-drawer-sheet" finalFocus={() => candidatesTriggerRef.current}>
            <DrawerHandle className="eaf-drawer-handle" aria-label="Resize candidates list" />
            <div className="eaf-drawer-head">
              <div>
                <DrawerTitle className="eaf-drawer-title">Candidate windows</DrawerTitle>
                <DrawerDescription className="eaf-drawer-desc">
                  {discovery.domain.name} · {activeTarget.name}
                </DrawerDescription>
              </div>
              <DrawerClose className="es-close-btn" aria-label="Close candidates list">
                <X size={15} />
              </DrawerClose>
            </div>
            <div className="es-mobile-list-wrap">{candidateListNode}</div>
          </DrawerContent>
        </Drawer>
      )}

      {session.panel === 'details' && <Drawer
        open={true}
        onOpenChange={(open) => {
          if (!open && latestSessionRef.current.panel === 'details') patchSession({ panel: 'none' });
        }}
        side={isMobile ? 'bottom' : 'right'}
        snapPoints={isMobile ? [0.62, 0.94] : undefined}
        defaultSnapPoint={isMobile ? 0.62 : undefined}
        modal={true}
      >
        <DrawerBackdrop className="eaf-drawer-backdrop" />
        <DrawerContent
          finalFocus={() => detailsTriggerRef.current}
          className={`eaf-drawer-content ${
            isMobile ? 'eaf-drawer-sheet es-drawer-sheet' : 'es-drawer-details'
          }`}
        >
          {isMobile && (
            <DrawerHandle className="eaf-drawer-handle" aria-label="Resize candidate details" />
          )}
          <div className="eaf-drawer-head">
            <div>
              <DrawerTitle className="eaf-drawer-title">{activeCandidate.name}</DrawerTitle>
              <DrawerDescription className="eaf-drawer-desc eaf-mono">
                {activeCandidate.id} vs {activeTarget.name}
              </DrawerDescription>
            </div>
            <DrawerClose className="es-close-btn" aria-label="Close candidate details">
              <X size={15} />
            </DrawerClose>
          </div>
          <div className="es-drawer-detail-body">
            <CandidateDetail
                researchRegion={regions.find(region => region.id === regionId)}
              discovery={discovery}
              target={activeTarget}
              candidate={activeCandidate}
              onExploreTarget={onExploreTarget}
              onOpenProvenance={trigger => { provenanceTriggerRef.current = trigger; setProvenanceOpen(true); }}
            />
          </div>
        </DrawerContent>
      </Drawer>}

      <ProvenanceDrawer
        open={provenanceOpen}
        onOpenChange={setProvenanceOpen}
        discovery={discovery}
        target={activeTarget}
        isMobile={isMobile}
        returnFocusRef={provenanceTriggerRef}
      />
    </div>
  );
}

export default EarthStage;
