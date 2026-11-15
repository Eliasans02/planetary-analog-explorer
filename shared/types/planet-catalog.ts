import type { SurfaceAsset } from './surface-catalog';
export interface PlanetTexture extends SurfaceAsset { width: number; height: number; label: '1K' | '2K' | '4K' | 'Native' }
export interface PlanetRecord {
  id: 'moon' | 'mars'; name: string;
  textures: PlanetTexture[];
  projection: 'equirectangular'; longitude_center_deg: 0;
  source_url: string; source_credit: string; source_sha256: string;
  provenance: SurfaceAsset; limitations: string[];
  /** Optional source-derived global radial elevations, row0 north, col0 west (-180). */
  displacement: null | { asset: SurfaceAsset; width: number; height: number; radius_m: number; height_unit: 'm'; source_url: string; reference: string };
}
export interface PlanetCatalog { schema_version: '1.0.0'; generated_at: string; planets: PlanetRecord[] }
export interface PlanetDrop { body: 'moon' | 'mars'; latitude_deg: number; longitude_deg: number; surfaceId: string | null }
