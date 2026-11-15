export interface DiscoveryMetrics {
  mean_slope_deg: number;
  p95_slope_deg: number;
  relief_m: number;
  roughness_m: number;
  slope_histogram: number[];
  valid_fraction: number;
}

export interface DiscoverySource {
  id: string;
  title: string;
  provider: string;
  url: string;
  role: string;
  sha256: string;
  bytes: number;
  license: string;
  hash_scope: string;
}

export interface DiscoveryTarget {
  id: string;
  name: string;
  body: 'moon' | 'mars';
  surface_id: string;
  latitude: number;
  longitude: number;
  source_ids: string[];
  metrics: DiscoveryMetrics;
  heights_m: number[];
  limitations: string[];
}

export interface DiscoveryCandidate {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  footprint: [number, number][];
  metrics: DiscoveryMetrics;
  heights_m: number[];
  comparisons: Record<string, {
    distance: number;
    rank: number;
    sensitivity_rank: number;
    shortlisted: boolean;
  }>;
  novelty: 'outside_reference_baseline' | 'unresolved';
}

export interface EarthDiscovery {
  schema_version: '1.0.0';
  run_id: string;
  generated_at: string;
  method: {
    name: string;
    description: string;
    grid_spacing_m: number;
    window_size_m: number;
    grid_size: number;
    slope_bins_deg: number[];
    distance_formula: string;
    sensitivity: string;
    shortlist_separation_m: number;
    profile_sha256: string;
    uncertainty: string;
  };
  domain: {
    name: string;
    description: string;
    footprint: [number, number][];
    crs: string;
    area_km2: number;
    generated_count: number;
    eligible_count: number;
    excluded_count: number;
    exclusion_reasons: Record<string, number>;
  };
  baseline: {
    description: string;
    sha256: string;
    sites: { name: string; latitude: number; longitude: number; radius_km: number; url: string }[];
  };
  sources: DiscoverySource[];
  targets: DiscoveryTarget[];
  candidates: DiscoveryCandidate[];
  limitations: string[];
}
