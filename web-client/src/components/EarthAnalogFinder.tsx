import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BookOpen, Globe, Loader2, RefreshCw } from 'lucide-react';
import type {
  DiscoveryCandidate,
  DiscoveryTarget,
  EarthDiscovery,
} from '@shared/types/earth-discovery';
import { loadEarthDiscovery } from '../data/earthDiscovery';
import { EarthMapPane } from './earth-analogs/EarthMapPane';
import { CandidateList } from './earth-analogs/CandidateList';
import { CandidateDetail } from './earth-analogs/CandidateDetail';
import { ProvenanceDrawer } from './earth-analogs/ProvenanceDrawer';
import type { ListScope } from './earth-analogs/types';
import './earth-analogs/earth-analog-finder.css';
import './earth-analogs/earth-analog-panels.css';
import './earth-analogs/earth-analog-detail.css';

export function EarthAnalogFinder({
  onExploreTarget,
}: {
  onExploreTarget?: (surfaceId: string) => void;
}) {
  const [discovery, setDiscovery] = useState<EarthDiscovery | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [listScope, setListScope] = useState<ListScope>('shortlist');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const provenanceTriggerRef = useRef<HTMLElement | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (ev: MediaQueryListEvent) => setIsMobile(ev.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError(null);

    loadEarthDiscovery(controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setDiscovery(loaded);
        setStatus('ready');

        const firstTarget = loaded.targets[0];
        if (firstTarget) {
          setSelectedTargetId((prev) =>
            loaded.targets.some((t) => t.id === prev) ? prev : firstTarget.id,
          );
          const effectiveTargetId = loaded.targets.some((t) => t.id === selectedTargetId)
            ? selectedTargetId
            : firstTarget.id;

          setSelectedCandidateId((prev) => {
            if (prev && loaded.candidates.some((c) => c.id === prev)) return prev;
            const ranked = [...loaded.candidates].sort((a, b) => {
              const ra = a.comparisons[effectiveTargetId]?.rank ?? Number.MAX_SAFE_INTEGER;
              const rb = b.comparisons[effectiveTargetId]?.rank ?? Number.MAX_SAFE_INTEGER;
              return ra - rb;
            });
            return ranked[0]?.id ?? '';
          });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setDiscovery(null);
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => controller.abort();
  }, [retryNonce]);

  const activeTarget: DiscoveryTarget | null = useMemo(() => {
    if (!discovery || discovery.targets.length === 0) return null;
    return (
      discovery.targets.find((t) => t.id === selectedTargetId) ?? discovery.targets[0] ?? null
    );
  }, [discovery, selectedTargetId]);

  const activeCandidate: DiscoveryCandidate | null = useMemo(() => {
    if (!discovery || discovery.candidates.length === 0) return null;
    const exact = discovery.candidates.find((c) => c.id === selectedCandidateId);
    if (exact) return exact;
    if (!activeTarget) return discovery.candidates[0] ?? null;
    const ranked = [...discovery.candidates].sort((a, b) => {
      const ra = a.comparisons[activeTarget.id]?.rank ?? Number.MAX_SAFE_INTEGER;
      const rb = b.comparisons[activeTarget.id]?.rank ?? Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
    return ranked[0] ?? null;
  }, [discovery, selectedCandidateId, activeTarget]);

  const handleTargetChange = useCallback(
    (nextTargetId: string) => {
      setSelectedTargetId(nextTargetId);
      setSelectedCandidateId(() => {
        let bestId = '';
        let bestRank = Number.MAX_SAFE_INTEGER;
        for (const candidate of discovery?.candidates ?? []) {
          const rank = candidate.comparisons[nextTargetId]?.rank ?? Number.MAX_SAFE_INTEGER;
          if (rank < bestRank) {
            bestRank = rank;
            bestId = candidate.id;
          }
        }
        return bestId;
      });
      setPage(0);
    },
    [discovery],
  );

  const handleScopeChange = useCallback((nextScope: ListScope) => {
    setListScope(nextScope);
    setPage(0);
  }, []);

  const handleSearchChange = useCallback((nextQuery: string) => {
    setSearchQuery(nextQuery);
    setPage(0);
  }, []);

  const handleRetry = useCallback(() => {
    setRetryNonce((n) => n + 1);
  }, []);

  const openProvenance = useCallback((trigger: HTMLElement) => {
    provenanceTriggerRef.current = trigger;
    setProvenanceOpen(true);
  }, []);

  return (
    <div className="eaf-app">
      <header className="eaf-header">
        <div className="eaf-header-left">
          <h1 className="eaf-title">
            <Globe size={15} className="eaf-title-icon" aria-hidden="true" />
            <span>Earth Analog Finder</span>
          </h1>
          {discovery && (
            <>
              <span className="eaf-sep" aria-hidden="true">
                ·
              </span>
              <span className="eaf-domain-meta">
                {discovery.domain.name} ({discovery.domain.eligible_count.toLocaleString('en-US')}{' '}
                eligible windows)
              </span>
            </>
          )}
        </div>

        <div className="eaf-header-controls">
          {discovery && discovery.targets.length > 0 && (
            <div className="eaf-target-select-wrap">
              <label htmlFor="eaf-target-select" className="eaf-control-label">
                Target
              </label>
              <select
                id="eaf-target-select"
                className="eaf-select"
                value={activeTarget?.id ?? ''}
                onChange={(e) => handleTargetChange(e.target.value)}
              >
                {discovery.targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.body === 'moon' ? 'Moon' : 'Mars'} · {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {discovery && (
            <button
              type="button"
              className="eaf-btn-subtle"
              onClick={(event) => openProvenance(event.currentTarget)}
              aria-label="Open method and provenance"
              aria-expanded={provenanceOpen}
            >
              <BookOpen size={14} aria-hidden="true" />
              <span className="eaf-btn-label-mobile-hide">Method &amp; provenance</span>
            </button>
          )}
        </div>
      </header>

      {status === 'loading' && (
        <div className="eaf-state-shell" role="status">
          <div className="eaf-state-card">
            <h2>
              <Loader2 size={16} className="eaf-spinner" aria-hidden="true" />
              <span>Loading Earth analog survey</span>
            </h2>
            <p>Loading the measured terrain survey and planetary reference regions.</p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="eaf-state-shell" role="alert">
          <div className="eaf-state-card">
            <h2>
              <AlertCircle size={16} color="#f59e0b" aria-hidden="true" />
              <span>Earth discovery data unavailable</span>
            </h2>
            <p>{error ?? 'The Earth analog survey could not be loaded.'}</p>
            <div>
              <button type="button" className="eaf-btn-primary" onClick={handleRetry}>
                <RefreshCw size={14} aria-hidden="true" />
                <span>Retry load</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'ready' && discovery && (!activeTarget || !activeCandidate) && (
        <div className="eaf-state-shell" role="status">
          <div className="eaf-state-card">
            <h2>No prepared survey pairs</h2>
            <p>
              The loaded discovery dataset contains {discovery.targets.length} planetary targets and{' '}
              {discovery.candidates.length} Earth candidates.
            </p>
          </div>
        </div>
      )}

      {status === 'ready' && discovery && activeTarget && activeCandidate && (
        <>
          <main className="eaf-workspace">
            <CandidateList
              candidates={discovery.candidates}
              target={activeTarget}
              selectedCandidateId={activeCandidate.id}
              onSelectCandidate={setSelectedCandidateId}
              scope={listScope}
              onScopeChange={handleScopeChange}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              page={page}
              onPageChange={setPage}
            />

            <EarthMapPane
              discovery={discovery}
              target={activeTarget}
              selectedCandidateId={activeCandidate.id}
              onSelectCandidate={setSelectedCandidateId}
            />

            <CandidateDetail
              discovery={discovery}
              target={activeTarget}
              candidate={activeCandidate}
              onExploreTarget={onExploreTarget}
              onOpenProvenance={openProvenance}
            />
          </main>

          <ProvenanceDrawer
            open={provenanceOpen}
            onOpenChange={setProvenanceOpen}
            discovery={discovery}
            target={activeTarget}
            isMobile={isMobile}
            returnFocusRef={provenanceTriggerRef}
          />
        </>
      )}
    </div>
  );
}

export default EarthAnalogFinder;
