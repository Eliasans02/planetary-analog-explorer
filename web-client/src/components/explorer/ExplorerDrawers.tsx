import { lazy, Suspense } from 'react';
import type { PlanetRecord } from '@shared/types/planet-catalog';
import type { SurfaceCatalog, SurfaceRecord } from '@shared/types/surface-catalog';
import type { SurfaceBrowseEntry } from './types';

const DestinationsDrawer = lazy(() =>
  import('./DestinationsDrawer').then((module) => ({ default: module.DestinationsDrawer })),
);
const SourcesDrawer = lazy(() =>
  import('./SourcesDrawer').then((module) => ({ default: module.SourcesDrawer })),
);
const TerrainAnalysisDrawer = lazy(() =>
  import('./TerrainAnalysisDrawer').then((module) => ({
    default: module.TerrainAnalysisDrawer,
  })),
);

export function ExplorerDrawers({
  destinationsOpen,
  sourcesOpen,
  analysisOpen,
  onDestinationsOpenChange,
  onSourcesOpenChange,
  onAnalysisOpenChange,
  entries,
  activeBody,
  selectedSiteId,
  onSelectSite,
  onLocateSite,
  onExploreSite,
  panels,
  landing,
  landingCatalog,
  isRegionalLanding,
  isMobile,
}: {
  destinationsOpen: boolean;
  sourcesOpen: boolean;
  analysisOpen: boolean;
  onDestinationsOpenChange: (open: boolean) => void;
  onSourcesOpenChange: (open: boolean) => void;
  onAnalysisOpenChange: (open: boolean) => void;
  entries: SurfaceBrowseEntry[];
  activeBody: 'moon' | 'mars';
  selectedSiteId?: string;
  onSelectSite: (entry: SurfaceBrowseEntry) => void;
  onLocateSite: (entry: SurfaceBrowseEntry) => void;
  onExploreSite: (entry: SurfaceBrowseEntry) => void;
  panels: PlanetRecord[];
  landing: SurfaceRecord | null;
  landingCatalog: SurfaceCatalog | null;
  isRegionalLanding: boolean;
  isMobile: boolean;
}) {
  return (
    <>
      {destinationsOpen && (
        <Suspense fallback={null}>
          <DestinationsDrawer
            open={destinationsOpen}
            onOpenChange={onDestinationsOpenChange}
            entries={entries}
            activeBody={activeBody}
            selectedSiteId={selectedSiteId}
            onSelectSite={onSelectSite}
            onLocateSite={onLocateSite}
            onExploreSite={onExploreSite}
            isMobile={isMobile}
          />
        </Suspense>
      )}

      {sourcesOpen && (
        <Suspense fallback={null}>
          <SourcesDrawer
            open={sourcesOpen}
            onOpenChange={onSourcesOpenChange}
            panels={panels}
            landing={landing}
            landingCatalog={landingCatalog}
            isRegionalLanding={isRegionalLanding}
            isMobile={isMobile}
          />
        </Suspense>
      )}

      {analysisOpen && landing && landingCatalog && (
        <Suspense fallback={null}>
          <TerrainAnalysisDrawer
            open={analysisOpen}
            onOpenChange={onAnalysisOpenChange}
            surface={landing}
            catalog={landingCatalog}
            analysisPath={isRegionalLanding ? '/data/regional_analysis.json' : undefined}
            isMobile={isMobile}
          />
        </Suspense>
      )}
    </>
  );
}
