import { useEffect, useState } from 'react';
import type { EarthDiscovery } from '@shared/types/earth-discovery';
import type { EarthSession } from './unifiedTypes';

export function useEarthSession(enabled: boolean) {
  const [discovery, setDiscovery] = useState<EarthDiscovery | null>(null);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [session, setSession] = useState<EarthSession>({
    targetId: '', candidateId: '', mode: 'orbit', panel: 'none', query: '', scope: 'shortlist', page: 0,
  });
  useEffect(() => {
    if (!enabled || discovery) return;
    const controller = new AbortController();
    setError(undefined);
    import('../../data/earthDiscovery').then(module => module.loadEarthDiscovery(controller.signal))
      .then(data => {
        if (controller.signal.aborted) return;
        const target = data.targets.find(item => item.id === session.targetId) ?? data.targets[0];
        const best = data.candidates.reduce((a, b) => a.comparisons[target.id].rank < b.comparisons[target.id].rank ? a : b);
        setDiscovery(data);
        setSession(previous => ({ ...previous, targetId: target.id, candidateId: best.id }));
      }).catch(reason => {
        if (!controller.signal.aborted) setError(`Earth survey unavailable. ${reason instanceof Error ? reason.message : 'Please retry.'}`);
      });
    return () => controller.abort();
  }, [enabled, discovery, retry]);
  return { discovery, session, setSession, error, retry: () => setRetry(value => value + 1) };
}
