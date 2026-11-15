import type {
  DiscoveryCandidate,
  DiscoveryTarget,
  EarthDiscovery,
} from '@shared/types/earth-discovery';

export type ListScope = 'shortlist' | 'all';

export function formatCoord(deg: number, pos: string, neg: string, digits = 4): string {
  if (!Number.isFinite(deg)) return '—';
  const dir = deg >= 0 ? pos : neg;
  return `${Math.abs(deg).toFixed(digits)}° ${dir}`;
}

export function formatCoordPair(lat: number, lon: number, digits = 4): string {
  return `${formatCoord(lat, 'N', 'S', digits)}, ${formatCoord(lon, 'E', 'W', digits)}`;
}

export function formatNum(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDelta(value: number, unit: string, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(digits)} ${unit}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 6371.0088;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Distance color ramp: lower topographic distance = closer match = high-clarity cyan;
 * farther cells recede into muted slate/charcoal so spatial clustering stays readable.
 */
export function distanceFillColor(distance: number, minDist: number, maxDist: number): string {
  const span = maxDist - minDist;
  const linear = span > 1e-9 ? Math.max(0, Math.min(1, (distance - minDist) / span)) : 0;
  const t = Math.pow(linear, 0.72);
  // Stops: 0 -> #38bdf8, 0.25 -> #0284c7, 0.55 -> #1e40af, 0.8 -> #1e293b, 1 -> #121722
  const stops: [number, [number, number, number]][] = [
    [0, [56, 189, 248]],
    [0.25, [2, 132, 199]],
    [0.55, [30, 64, 175]],
    [0.82, [30, 41, 59]],
    [1, [18, 23, 34]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * f);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * f);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * f);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return 'rgb(18, 23, 34)';
}

export function triggerBlobDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildCandidateGeoJson(
  discovery: EarthDiscovery,
  candidate: DiscoveryCandidate,
  target: DiscoveryTarget,
): string {
  const ring = candidate.footprint;
  const closedRing =
    ring.length > 0 &&
    (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
      ? [...ring, ring[0]]
      : ring;
  const comparison = candidate.comparisons[target.id] ?? null;

  const featureCollection = {
    type: 'FeatureCollection',
    name: `${candidate.id}_${target.id}`,
    properties: {
      schema_version: discovery.schema_version,
      run_id: discovery.run_id,
      generated_at: discovery.generated_at,
      profile_sha256: discovery.method.profile_sha256,
      domain_name: discovery.domain.name,
      geometry_crs: 'EPSG:4326',
      survey_crs: discovery.domain.crs,
      note: 'Exploratory topographic distance only (0 = closer); not a full environment or habitat suitability claim.',
    },
    features: [
      {
        type: 'Feature',
        id: candidate.id,
        geometry: {
          type: 'Polygon',
          coordinates: [closedRing],
        },
        properties: {
          candidate_id: candidate.id,
          candidate_name: candidate.name,
          center_latitude: candidate.latitude,
          center_longitude: candidate.longitude,
          novelty: candidate.novelty,
          target_id: target.id,
          target_name: target.name,
          target_body: target.body,
          exploratory_distance: comparison?.distance ?? null,
          survey_rank: comparison?.rank ?? null,
          sensitivity_rank: comparison?.sensitivity_rank ?? null,
          shortlisted: comparison?.shortlisted ?? false,
          metrics: candidate.metrics,
        },
      },
      {
        type: 'Feature',
        id: `${candidate.id}-center`,
        geometry: {
          type: 'Point',
          coordinates: [candidate.longitude, candidate.latitude],
        },
        properties: {
          feature_role: 'window_center',
          candidate_id: candidate.id,
          target_id: target.id,
        },
      },
    ],
  };

  return JSON.stringify(featureCollection, null, 2);
}

export function buildCandidateEvidenceJson(
  discovery: EarthDiscovery,
  candidate: DiscoveryCandidate,
  target: DiscoveryTarget,
): string {
  const targetSources = discovery.sources.filter((s) => target.source_ids.includes(s.id));
  const earthSources = discovery.sources.filter((s) => !target.source_ids.includes(s.id));
  const comparison = candidate.comparisons[target.id] ?? null;

  const evidence = {
    schema_version: discovery.schema_version,
    run_id: discovery.run_id,
    generated_at: discovery.generated_at,
    profile_sha256: discovery.method.profile_sha256,
    interpretation_notice: `Exploratory topographic distance only (lower is closer). Covers slope, relief, and roughness on a common ${discovery.method.grid_spacing_m} m analysis grid, not native sensor resolution; excludes climate, geology, radiation, gravity, water ice, and access.`,
    target,
    candidate: {
      id: candidate.id,
      name: candidate.name,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      footprint: candidate.footprint,
      novelty: candidate.novelty,
      metrics: candidate.metrics,
      heights_m: candidate.heights_m,
      comparison_for_selected_target: comparison,
    },
    method: discovery.method,
    domain: discovery.domain,
    baseline: discovery.baseline,
    sources: [...targetSources, ...earthSources],
    limitations: [...discovery.limitations, ...target.limitations],
  };

  return JSON.stringify(evidence, null, 2);
}
