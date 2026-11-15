import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
} from '@ui-sdk/react/drawer';
import { X } from 'lucide-react';
import type { SurfaceCatalog, SurfaceRecord } from '@shared/types/surface-catalog';
import { SurfaceAnalysisPanel } from '../SurfaceAnalysisPanel';

export interface TerrainAnalysisDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surface: SurfaceRecord;
  catalog: SurfaceCatalog;
  analysisPath?: string;
  isMobile: boolean;
}

export function TerrainAnalysisDrawer({
  open,
  onOpenChange,
  surface,
  catalog,
  analysisPath,
  isMobile,
}: TerrainAnalysisDrawerProps) {
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
      <DrawerContent className={`px-drawer-content px-analysis-drawer ${isMobile ? 'px-drawer-sheet' : 'px-drawer-side-wide'}`}>
        {isMobile && <DrawerHandle className="px-drawer-handle" aria-label="Resize terrain analysis sheet" />}
        <div className="px-drawer-header">
          <div className="px-drawer-title-group">
            <DrawerTitle className="px-drawer-title">Terrain analysis</DrawerTitle>
            <DrawerDescription className="px-drawer-description">
              Source-grid elevation metrics verified against {surface.name} source checksums.
            </DrawerDescription>
          </div>
          <DrawerClose className="px-icon-btn" aria-label="Close terrain analysis">
            <X size={16} />
          </DrawerClose>
        </div>

        <div className="px-drawer-body">
          <SurfaceAnalysisPanel surface={surface} catalog={catalog} analysisPath={analysisPath} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
