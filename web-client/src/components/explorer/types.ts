import type { PlanetTexture } from '@shared/types/planet-catalog';
import type { SurfaceCatalog, SurfaceRecord } from '@shared/types/surface-catalog';

export type Resolution = PlanetTexture['label'];

export interface SurfaceBrowseEntry {
  surface: SurfaceRecord;
  /** Exact owning catalog instance (kept separate for WeakMap SHA-256 verification). */
  catalog: SurfaceCatalog;
  isRegional: boolean;
}
