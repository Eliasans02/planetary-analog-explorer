/** Descriptive native-grid metrics, never a suitability or similarity score. */
export interface SurfaceAnalysisRecord {
  surface_id: string;
  inputs: {
    heights_sha256: string; valid_mask_sha256: string;
    width: number; height: number; spacing_m: [number, number];
  };
  coverage: {
    valid_height_samples: number; total_samples: number;
    analyzed_centers: number; possible_interior_centers: number;
  };
  metrics: {
    relief_m: number;
    mean_slope_deg: number | null; p95_slope_deg: number | null; max_slope_deg: number | null;
    mean_roughness_m: number | null; max_roughness_m: number | null; mean_tri_m: number | null;
  };
  /** [min_deg,max_deg), except the final bin includes 90; denominator = analyzed_centers. */
  slope_histogram: { min_deg: number; max_deg: number; samples: number; fraction_pct: number | null }[];
  limitations: string[];
}
export interface SurfaceAnalysisCatalog {
  schema_version: '1.0.0';
  /** Reuses source catalog publication time for reproducible identical output. */
  generated_at: string;
  catalog_sha256: string;
  method: { id: 'horn_3x3_v1'; references: string[] };
  surfaces: SurfaceAnalysisRecord[];
}
