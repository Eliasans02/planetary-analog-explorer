import { useEffect, useRef, useState } from 'react';
import type { EarthDiscovery } from '@shared/types/earth-discovery';
import type { ResearchRegion } from '../../data/globalAnalogs';
import type { EarthSession } from './unifiedTypes';

export function useEarthSession(enabled: boolean) {
  const [discovery, setDiscovery] = useState<EarthDiscovery | null>(null);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [regions, setRegions] = useState<ResearchRegion[]>([]);
  const [regionError, setRegionError] = useState<string>();
  const [regionId, setRegionId] = useState('ustyurt');
  const cache = useRef(new Map<string, EarthDiscovery>());
  const [session, setSession] = useState<EarthSession>({
    targetId: '', candidateId: '', mode: 'orbit', panel: 'none', query: '', scope: 'shortlist', page: 0,
  });
  const currentSession = useRef(session);
  currentSession.current = session;
  useEffect(() => {
    if (!enabled || regions.length) return;
    const controller = new AbortController();
    setRegionError(undefined);
    import('../../data/globalAnalogs').then(module => module.loadGlobalAnalogs(controller.signal))
      .then(data => { if (!controller.signal.aborted) setRegions(data); })
      .catch(reason => { if (!controller.signal.aborted) setRegionError(String(reason.message)); });
    return () => controller.abort();
  }, [enabled, regions.length, retry]);
  useEffect(() => {
    if (!enabled || discovery) return;
    const controller = new AbortController();
    setError(undefined);
    const accept = (data: EarthDiscovery) => {
      if (controller.signal.aborted) return;
      cache.current.set(regionId, data);
      const region = regions.find(item => item.id === regionId);
      const targets = data.targets.filter(item => !region || region.bodies.includes(item.body));
      const target = targets.find(item => item.id === currentSession.current.targetId) ?? targets[0];
      const best = data.candidates.find(item => item.comparisons[target.id].rank === 1)!;
      setDiscovery(data);
      setSession(previous => ({ ...previous, targetId: target.id, candidateId: best.id }));
    };
    const cached = cache.current.get(regionId);
    if (cached) accept(cached);
    else import('../../data/earthDiscovery').then(module => module.loadEarthDiscovery(controller.signal,
      regionId === 'ustyurt' ? '/data/earth_discovery.json' : `/data/earth-regions/${regionId}.json`))
      .then(accept).catch(reason => {
        if (!controller.signal.aborted) setError(`Earth survey unavailable. ${reason instanceof Error ? reason.message : 'Please retry.'}`);
      });
    return () => controller.abort();
  }, [enabled, regionId, retry, discovery]);
  const selectRegion = (id: string) => {
    if (id === regionId || (id !== 'ustyurt' && !regions.some(region => region.id === id))) return;
    setDiscovery(null); setError(undefined); setRegionId(id);
    setSession(previous => ({ ...previous, candidateId: '', mode: 'orbit', panel: 'none', query: '', page: 0, globeView: undefined }));
  };
  return { discovery, session, setSession, error, regions, regionId, selectRegion, regionError,
    region: regions.find(region => region.id === regionId), retry: () => setRetry(value => value + 1) };
}
