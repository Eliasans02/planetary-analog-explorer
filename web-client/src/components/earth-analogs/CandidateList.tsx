import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import type {
  DiscoveryCandidate,
  DiscoveryTarget,
} from '@shared/types/earth-discovery';
import { formatCoordPair, formatNum, type ListScope } from './types';

export const CANDIDATE_PAGE_SIZE = 20;

export interface CandidateListProps {
  candidates: DiscoveryCandidate[];
  target: DiscoveryTarget;
  selectedCandidateId: string;
  onSelectCandidate: (candidateId: string) => void;
  scope: ListScope;
  onScopeChange: (scope: ListScope) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}

export function CandidateList({
  candidates,
  target,
  selectedCandidateId,
  onSelectCandidate,
  scope,
  onScopeChange,
  searchQuery,
  onSearchChange,
  page,
  onPageChange,
}: CandidateListProps) {
  const shortlistCount = useMemo(
    () => candidates.filter((c) => c.comparisons[target.id]?.shortlisted).length,
    [candidates, target.id],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matched = candidates.filter((c) => {
      const comp = c.comparisons[target.id];
      if (!comp) return false;
      if (scope === 'shortlist' && !comp.shortlisted) return false;
      if (!q) return true;
      return `${c.id} ${c.name}`.toLowerCase().includes(q);
    });

    return matched.sort((a, b) => {
      const ra = a.comparisons[target.id]?.rank ?? Number.MAX_SAFE_INTEGER;
      const rb = b.comparisons[target.id]?.rank ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.id.localeCompare(b.id);
    });
  }, [candidates, target.id, scope, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / CANDIDATE_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * CANDIDATE_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + CANDIDATE_PAGE_SIZE);

  return (
    <aside className="eaf-pane-list" aria-label="Earth candidate rankings">
      <div className="eaf-list-head">
        <div className="eaf-scope-switch" role="group" aria-label="Candidate filter scope">
          <button
            type="button"
            className="eaf-scope-btn"
            aria-pressed={scope === 'shortlist'}
            onClick={() => onScopeChange('shortlist')}
          >
            Shortlist ({shortlistCount})
          </button>
          <button
            type="button"
            className="eaf-scope-btn"
            aria-pressed={scope === 'all'}
            onClick={() => onScopeChange('all')}
          >
            All ({candidates.length.toLocaleString('en-US')})
          </button>
        </div>

        <div className="eaf-search-box">
          <Search size={13} className="eaf-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter by candidate ID or name…"
            aria-label="Search candidates by ID or name"
            className="eaf-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="eaf-search-clear"
              aria-label="Clear candidate filter"
              onClick={() => onSearchChange('')}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="eaf-list-summary">
          <span>
            {filtered.length === 0
              ? '0 matching windows'
              : `Showing ${start + 1}–${Math.min(filtered.length, start + CANDIDATE_PAGE_SIZE)} of ${filtered.length.toLocaleString('en-US')}`}
          </span>
          <span>Lower dist = closer</span>
        </div>
      </div>

      <div className="eaf-list-scroll" role="listbox" aria-label="Ranked Earth windows">
        {pageItems.length === 0 ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--eaf-text-muted)', fontSize: 12 }}>
            No survey windows match your filter.
            {scope === 'shortlist' && searchQuery && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="eaf-page-btn"
                  onClick={() => onScopeChange('all')}
                >
                  Search all {candidates.length.toLocaleString('en-US')} windows
                </button>
              </div>
            )}
          </div>
        ) : (
          pageItems.map((cand) => {
            const comp = cand.comparisons[target.id];
            const isSelected = cand.id === selectedCandidateId;
            return (
              <button
                key={cand.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`eaf-candidate-row ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectCandidate(cand.id)}
              >
                <div className="eaf-row-top">
                  <span className="eaf-row-title">
                    <span className="eaf-mono" style={{ color: 'var(--eaf-text-muted)', marginRight: 6 }}>
                      #{comp?.rank ?? '—'}
                    </span>
                    {cand.name}
                  </span>
                  <span className="eaf-row-dist eaf-mono">
                    {comp ? formatNum(comp.distance, 3) : '—'}
                  </span>
                </div>
                <div className="eaf-row-meta eaf-mono">
                  <span>{cand.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatCoordPair(cand.latitude, cand.longitude, 2)}</span>
                </div>
                <div className="eaf-row-meta">
                  <span>Sens #{comp?.sensitivity_rank ?? '—'}</span>
                  <span aria-hidden="true">·</span>
                  <span>Mean {formatNum(cand.metrics.mean_slope_deg, 1)}°</span>
                  {comp?.shortlisted && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="eaf-row-shortlist">Shortlisted</span>
                    </>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="eaf-pagination">
          <button
            type="button"
            className="eaf-page-btn"
            disabled={safePage === 0}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Previous candidate page"
          >
            <ChevronLeft size={13} style={{ verticalAlign: 'middle' }} /> Prev
          </button>
          <span className="eaf-mono">
            Page {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="eaf-page-btn"
            disabled={safePage >= totalPages - 1}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Next candidate page"
          >
            Next <ChevronRight size={13} style={{ verticalAlign: 'middle' }} />
          </button>
        </div>
      )}
    </aside>
  );
}
