import type { ResearchRegion } from '../../data/globalAnalogs';
import type { ReactNode } from 'react';
import type { EarthDiscovery } from '@shared/types/earth-discovery';
import type { PlanetView } from '../PlanetViewport';

export type ExplorerBody = 'earth' | 'moon' | 'mars';
export type EarthMode = 'orbit' | 'survey' | 'compare';
export interface MissionState { body: 'moon' | 'mars'; step: number }
export const missionTargets = {
  moon: { target: 'moon-shackleton-lola-600m', surface: 'lola-site04-roi3', name: 'Shackleton rim', source: 'NASA LOLA' },
  mars: { target: 'mars-jezero-hirise-600m', surface: 'mars-jezero-hirise', name: 'Jezero crater', source: 'NASA HiRISE' },
} as const;
export interface EarthSession {
  targetId: string;
  candidateId: string;
  mode: EarthMode;
  panel: 'none' | 'candidates' | 'details';
  query: string;
  scope: 'shortlist' | 'all';
  page: number;
  globeView?: PlanetView;
}
export interface EarthStageProps {
  regions?: ResearchRegion[];
  regionId?: string;
  regionError?: string;
  onRetryRegions?: () => void;
  onRegionChange?: (id: string) => void;
  discovery: EarthDiscovery;
  session: EarthSession;
  onSessionChange: (next: EarthSession) => void;
  onExploreTarget: (surfaceId: string) => void;
}

export interface ExplorerHeaderProps {
  body: ExplorerBody;
  contextLabel: string;
  isTerrain: boolean;
  onBodyChange: (body: ExplorerBody) => void;
  onReturnToOrbit: () => void;
  actions?: ReactNode;
}
