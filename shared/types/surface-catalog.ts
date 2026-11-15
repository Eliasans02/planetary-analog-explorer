/** Source-backed, unranked relief browsing. Separate from the ENU/scoring contract. */
export interface SurfaceAsset { path: string; sha256: string; bytes: number }
export interface SurfaceSource {
  id: string; provider: string; product: string; product_url: string; access_url: string;
  retrieved_at: string; sha256: string; license: string; local_path: string;
}
export interface SurfaceRecord {
  id: string; name: string; body: 'moon' | 'earth' | 'mars'; description: string;
  coordinates: { latitude_deg: number; longitude_deg: number; frame: 'MOON_ME_DE421' | 'NAD83' | 'MARS_HIRISE_PLANETOCENTRIC'; provenance: string };
  source_ids: string[];
  grid: {
    width: number; height: number; spacing_m: [number, number];
    display_frame: 'native_projected_relief'; horizontal_method: string;
    heights: SurfaceAsset; valid_mask: SurfaceAsset;
    vertical_zero_m: number; vertical_datum: string | null;
    vertical_datum_status: 'unverified' | 'source_declared';
    native_crs_wkt: string; native_origin: [number, number]; native_spacing: [number, number]; native_units: 'm' | 'deg';
  };
  stats: { min_source_height_m: number; max_source_height_m: number; relief_m: number; valid_samples: number; total_samples: number; direct_return_samples: number | null };
  roi: { label: string; kind: 'published_source_polygon' | 'project_selected_window'; outline_grid: [number, number][]; source_record: number | null };
  limitations: string[]; provenance: SurfaceAsset;
}
export interface SurfaceCatalog { schema_version: '1.0.0' | '1.1.0'; generated_at: string; sources: SurfaceSource[]; surfaces: SurfaceRecord[] }
