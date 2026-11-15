import type { SurfaceAsset } from './surface-catalog';

/** Source imagery sampled on the DEM grid; appearance is not a height measurement. */
export interface SurfaceImageryLayer {
  id: 'orbital-color' | 'local-ortho';
  label: string;
  color_mode: 'published_false_color' | 'published_grayscale' | 'global_display_mosaic';
  registration: 'approximate_global_mosaic' | 'projected_ortho';
  source_url: string;
  image: SurfaceAsset & { width: number; height: number };
  provenance: SurfaceAsset;
  limitations: string[];
}
export interface SurfaceImageryRecord {
  surface_id: string;
  inputs: {
    heights_sha256: string; valid_mask_sha256: string; width: number; height: number;
    native_origin: [number, number]; native_spacing: [number, number]; native_crs_wkt: string;
  };
  layers: SurfaceImageryLayer[];
}
export interface SurfaceImageryCatalog {
  schema_version: '1.0.0'; generated_at: string; catalog_sha256: string;
  records: SurfaceImageryRecord[];
}
