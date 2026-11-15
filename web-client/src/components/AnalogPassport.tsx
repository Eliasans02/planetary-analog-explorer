import React, { useMemo } from 'react';
import type {
  Analog,
  Comparison,
  Feature,
  FeatureKey,
  Location,
  ScoringProfile,
  Source,
} from '@shared/types/analog-location';
import { InfoDisclosure } from './ui/InfoDisclosure';

export interface AnalogPassportProps {
  comparison: Comparison | null;
  selectedAnalog: Analog | null;
  profile: ScoringProfile | null;
  sources: readonly Source[];
  loading: boolean;
  errorMessage: string | null;
}

const ALL_FEATURE_KEYS: readonly FeatureKey[] = [
  'slope_mean_deg',
  'slope_max_deg',
  'roughness_index',
  'elevation_delta_m',
  'temp_min_c',
  'temp_max_c',
  'solar_irradiance_kwh_m2',
  'aridity_index',
  'albedo',
] as const;

const FEATURE_LABELS: Record<FeatureKey, string> = {
  slope_mean_deg: 'Mean slope',
  slope_max_deg: 'Maximum slope',
  roughness_index: 'Roughness index',
  elevation_delta_m: 'Elevation relief',
  temp_min_c: 'Minimum temperature',
  temp_max_c: 'Maximum temperature',
  solar_irradiance_kwh_m2: 'Daily solar irradiation (mean daily kWh/m²/day)',
  aridity_index: 'Aridity index',
  albedo: 'Surface albedo',
};

function formatNumericValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatUnitDisplay(key: FeatureKey, unit: Feature['unit']): string {
  if (key === 'solar_irradiance_kwh_m2') {
    return 'kWh/m²/day (mean daily)';
  }
  return unit;
}

function formatUtcTimestamp(iso: string): string {
  if (!iso) return 'Not recorded';
  return iso.length >= 19 ? `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC` : iso;
}

function formatBodyLabel(body: Location['body']): string {
  if (body === 'moon') return 'Moon';
  if (body === 'mars') return 'Mars';
  return 'Earth';
}

function toSafeHttpsUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username !== '' || parsed.password !== '') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function collectLocationSourceIds(location: Location, out: Set<string>): void {
  for (const id of location.coordinates.source_ids) out.add(id);
  for (const id of location.aoi.source_ids) out.add(id);
  for (const id of location.geology.source_ids) out.add(id);

  for (const key of ALL_FEATURE_KEYS) {
    for (const id of location.features[key].source_ids) out.add(id);
  }

  if (location.assets.dem) {
    for (const id of location.assets.dem.source_ids) out.add(id);
  }
  if (location.assets.heightmap) {
    for (const id of location.assets.heightmap.asset.source_ids) out.add(id);
    for (const id of location.assets.heightmap.valid_mask.source_ids) out.add(id);
  }
  if (location.assets.splat) {
    for (const id of location.assets.splat.asset.source_ids) out.add(id);
  }
}

function FeatureValueBlock({
  siteLabel,
  featureKey,
  feature,
}: {
  siteLabel: string;
  featureKey: FeatureKey;
  feature: Feature;
}): React.JSX.Element {
  return (
    <div className="mt-1.5 border-l-2 border-slate-700 pl-2 text-[11px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-slate-300">{siteLabel}</span>
        <span
          className={`font-mono tabular-nums ${
            feature.value !== null ? 'text-slate-100' : 'text-amber-300'
          }`}
        >
          {feature.value !== null
            ? `${formatNumericValue(feature.value)} ${formatUnitDisplay(featureKey, feature.unit)}`
            : 'Not available'}
        </span>
      </div>
      <div className="mt-0.5 text-slate-400">
        Quantity: {feature.quantity} · Method: {feature.method}
      </div>
      <div className="mt-0.5 font-mono text-slate-400 tabular-nums">
        Spatial resolution:{' '}
        {feature.spatial_resolution_m !== null ? `${feature.spatial_resolution_m} m` : 'Not recorded'}{' '}
        · Support window:{' '}
        {feature.support_window_m !== null ? `${feature.support_window_m} m` : 'Not recorded'}
      </div>
      <div className="mt-0.5 font-mono text-slate-400 tabular-nums">
        Period:{' '}
        {feature.period !== null
          ? `${feature.period.start.slice(0, 10)} → ${feature.period.end.slice(0, 10)}`
          : 'Not recorded'}
      </div>
      {feature.value === null && (
        <div className="mt-0.5 text-amber-300">Missing reason: {feature.missing_reason}</div>
      )}
    </div>
  );
}

export function AnalogPassport({
  comparison,
  selectedAnalog,
  profile,
  sources,
  loading,
  errorMessage,
}: AnalogPassportProps): React.JSX.Element {
  const matchedAnalog = useMemo<Analog | null>(() => {
    if (!comparison || !selectedAnalog) return null;
    const found = comparison.analogs.find(
      (entry) =>
        entry === selectedAnalog ||
        (entry.location.id === selectedAnalog.location.id &&
          entry.rank === selectedAnalog.rank &&
          entry.similarity_score === selectedAnalog.similarity_score),
    );
    return found ?? null;
  }, [comparison, selectedAnalog]);

  const analogBelongsToComparison =
    selectedAnalog === null || (comparison !== null && matchedAnalog !== null);

  const profileMatchesComparison =
    comparison !== null && profile !== null && profile.id === comparison.profile_id;

  const missingLimitItems = useMemo(() => {
    if (!comparison) return [];
    const items: Array<{ key: string; site: string; field: string; reason: string }> = [];

    const inspectLocation = (loc: Location, roleLabel: string) => {
      for (const fKey of ALL_FEATURE_KEYS) {
        const feat = loc.features[fKey];
        if (feat.value === null) {
          items.push({
            key: `${loc.id}:feature:${fKey}`,
            site: `${roleLabel} (${loc.name})`,
            field: FEATURE_LABELS[fKey],
            reason: feat.missing_reason,
          });
        }
      }
      if (loc.geology.missing_reason !== null) {
        items.push({
          key: `${loc.id}:geology`,
          site: `${roleLabel} (${loc.name})`,
          field: 'Geology classification',
          reason: loc.geology.missing_reason,
        });
      }
    };

    inspectLocation(comparison.target, 'Target');
    if (matchedAnalog) {
      inspectLocation(matchedAnalog.location, 'Analog');
    }
    return items;
  }, [comparison, matchedAnalog]);

  const inactiveFeatureKeys = useMemo<FeatureKey[]>(() => {
    if (!profileMatchesComparison || !profile) return [];
    const activeSet = new Set<FeatureKey>(profile.features.map((f) => f.key));
    return ALL_FEATURE_KEYS.filter((k) => !activeSet.has(k));
  }, [profileMatchesComparison, profile]);

  const referencedSources = useMemo(() => {
    if (!comparison) return [];
    const ids = new Set<string>();
    collectLocationSourceIds(comparison.target, ids);
    if (matchedAnalog) {
      collectLocationSourceIds(matchedAnalog.location, ids);
    }
    if (profileMatchesComparison && profile) {
      for (const pf of profile.features) {
        for (const id of pf.calibration_source_ids) {
          ids.add(id);
        }
      }
    }

    const byId = new Map<string, Source>();
    for (const src of sources) {
      byId.set(src.id, src);
    }

    return Array.from(ids).map((id) => ({
      id,
      source: byId.get(id) ?? null,
    }));
  }, [comparison, matchedAnalog, profileMatchesComparison, profile, sources]);

  const terrainLimitSites = useMemo(() => {
    if (!comparison) return [];
    const list: Array<{ key: string; role: string; location: Location }> = [
      { key: `target:${comparison.target.id}`, role: 'Target', location: comparison.target },
    ];
    if (matchedAnalog) {
      list.push({
        key: `analog:${matchedAnalog.location.id}`,
        role: 'Selected analog',
        location: matchedAnalog.location,
      });
    }
    return list;
  }, [comparison, matchedAnalog]);

  return (
    <section
      data-testid="analog-passport"
      aria-label="Analog Passport"
      className="space-y-3 p-4"
    >
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-slate-100">
          Analog Passport
        </h3>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Inspect the evidence behind a comparison
        </p>
      </div>

      {loading && (
        <div
          role="status"
          data-testid="passport-loading-status"
          className="border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200"
        >
          Loading prepared comparison dataset…
        </div>
      )}

      {errorMessage && (
        <div
          role="status"
          data-testid="passport-error-status"
          className="space-y-2 border border-amber-500/40 bg-[#15120C] p-3 text-xs text-amber-200"
        >
          <div className="font-medium text-amber-100">
            Dataset error: comparison evidence could not be loaded.
          </div>
          <InfoDisclosure label="Technical details">
            <div className="break-words font-mono text-[11px] text-amber-200/90">
              {errorMessage}
            </div>
          </InfoDisclosure>
        </div>
      )}

      {comparison === null && !loading && (
        <div
          data-testid="passport-empty-state"
          className="border border-slate-800 bg-[#0F141E] px-3 py-2.5 text-xs leading-relaxed text-slate-300"
        >
          <div className="font-medium text-slate-100">No prepared comparison yet</div>
          <p className="mt-1 text-slate-400">
            A comparison will appear once a validated source-backed dataset is loaded.
          </p>
        </div>
      )}

      {comparison !== null && !analogBelongsToComparison && (
        <div
          role="status"
          data-testid="passport-analog-mismatch"
          className="border border-amber-500/40 bg-[#15120C] px-3 py-2 text-xs text-amber-200"
        >
          Selected analog does not belong to the active comparison ({comparison.target.name}); match
          analytics are unavailable.
        </div>
      )}

      <div className="space-y-2" data-testid="passport-disclosures">
        {/* 1. Physical profile */}
        <InfoDisclosure label="Physical profile">
          {comparison === null ? (
            <p className="text-slate-400">
              No prepared comparison yet. Physical measurements, units, resolution, and geology
              classes will appear once a dataset is loaded.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="border-b border-slate-800 pb-2 text-[11px]">
                <div>
                  <span className="text-slate-400">Target: </span>
                  <span className="font-semibold text-slate-100">{comparison.target.name}</span>{' '}
                  <span className="text-cyan-300">
                    ({formatBodyLabel(comparison.target.body)})
                  </span>
                </div>
                {matchedAnalog ? (
                  <div className="mt-1">
                    <span className="text-slate-400">Selected Earth analog: </span>
                    <span className="font-semibold text-slate-100">
                      {matchedAnalog.location.name}
                    </span>{' '}
                    <span className="font-mono text-cyan-300 tabular-nums">
                      (#{matchedAnalog.rank})
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-slate-400">
                    {selectedAnalog !== null
                      ? 'Selected analog is unavailable for this comparison; showing target measurements only.'
                      : 'No Earth analog selected; showing target measurements only.'}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {ALL_FEATURE_KEYS.map((key) => {
                  const targetFeature = comparison.target.features[key];
                  const analogFeature = matchedAnalog?.location.features[key] ?? null;
                  return (
                    <div
                      key={`${comparison.target.id}:${key}`}
                      className="border border-slate-800/80 bg-[#0B1018] p-2"
                    >
                      <div className="text-xs font-medium text-slate-100">
                        {FEATURE_LABELS[key]}
                      </div>
                      <FeatureValueBlock
                        siteLabel={`Target · ${comparison.target.name}`}
                        featureKey={key}
                        feature={targetFeature}
                      />
                      {matchedAnalog && analogFeature && (
                        <FeatureValueBlock
                          siteLabel={`Analog · ${matchedAnalog.location.name}`}
                          featureKey={key}
                          feature={analogFeature}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border border-slate-800/80 bg-[#0B1018] p-2 text-[11px]">
                <div className="font-medium text-slate-100">Geology (categorical)</div>
                <div className="mt-1 text-slate-300">
                  <span className="text-slate-400">Target ({comparison.target.name}): </span>
                  {comparison.target.geology.classes.length > 0
                    ? comparison.target.geology.classes.join(', ')
                    : `Not available (${comparison.target.geology.missing_reason})`}
                  <div className="text-slate-400">Method: {comparison.target.geology.method}</div>
                </div>
                {matchedAnalog && (
                  <div className="mt-2 border-t border-slate-800 pt-1.5 text-slate-300">
                    <span className="text-slate-400">
                      Analog ({matchedAnalog.location.name}):{' '}
                    </span>
                    {matchedAnalog.location.geology.classes.length > 0
                      ? matchedAnalog.location.geology.classes.join(', ')
                      : `Not available (${matchedAnalog.location.geology.missing_reason})`}
                    <div className="text-slate-400">
                      Method: {matchedAnalog.location.geology.method}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </InfoDisclosure>

        {/* 2. Why this match */}
        <InfoDisclosure label="Why this match">
          {comparison === null ? (
            <p className="text-slate-400">
              No prepared comparison yet. Project-defined similarity scores and per-feature
              breakdown require a loaded comparison and Earth analog.
            </p>
          ) : selectedAnalog === null ? (
            <p className="text-slate-400">
              Select an Earth analog in this comparison to inspect why it ranked as a match.
            </p>
          ) : !matchedAnalog ? (
            <p className="text-amber-300">
              Match breakdown unavailable: the selected analog does not belong to{' '}
              {comparison.target.name}.
            </p>
          ) : profile === null ? (
            <p className="text-amber-300">
              Match breakdown unavailable: scoring profile {comparison.profile_id} is missing from
              the dataset.
            </p>
          ) : !profileMatchesComparison ? (
            <p className="text-amber-300">
              Match breakdown unavailable: scoring profile mismatch (comparison expects{' '}
              {comparison.profile_id}, provided {profile.id}).
            </p>
          ) : (
            <div className="space-y-3 text-[11px]">
              <div className="border border-slate-800/80 bg-[#0B1018] p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-200">
                    Project-defined similarity index (#{matchedAnalog.rank}{' '}
                    {matchedAnalog.location.name})
                  </span>
                  <span className="font-mono text-sm font-semibold text-cyan-300 tabular-nums">
                    {matchedAnalog.similarity_score.toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 text-slate-400">
                  Computed by profile{' '}
                  <span className="font-mono text-slate-200">
                    {profile.id} v{profile.version}
                  </span>{' '}
                  ({profile.algorithm}, {profile.features.length}/9 active numerical features). This is a
                  project-defined similarity index, not habitability probability or mission
                  certification.
                </p>

                <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-slate-800 pt-2">
                  <span className="font-medium text-slate-200">Active-profile coverage</span>
                  <span className="font-mono text-slate-100 tabular-nums">
                    {(matchedAnalog.coverage * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="mt-0.5 text-slate-400">
                  Valid active-profile weight / total active-profile weight. Ranked rows require
                  100%; this does not measure physical equivalence or unmodeled environmental physics.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="font-medium text-slate-200">
                  Active profile feature contributions ({profile.features.length})
                </div>
                {profile.features.map((pf) => {
                  const bd = matchedAnalog.breakdown[pf.key];
                  return (
                    <div
                      key={`${profile.id}:${pf.key}`}
                      className="border border-slate-800/80 bg-[#0B1018] p-2"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-slate-200">
                          {FEATURE_LABELS[pf.key]}
                        </span>
                        <span className="font-mono text-slate-400 tabular-nums">
                          weight {pf.weight} · [{pf.lower}, {pf.upper}] {pf.unit}
                        </span>
                      </div>
                      {bd.similarity_pct !== null ? (
                        <div className="mt-1 space-y-0.5 font-mono text-cyan-300 tabular-nums">
                          <div>Per-feature similarity: {bd.similarity_pct.toFixed(1)}%</div>
                          <div className="text-slate-300">
                            Normalized Euclidean squared distance contribution:{' '}
                            {bd.squared_distance_contribution.toFixed(4)}
                          </div>
                          <div className="font-sans text-slate-400">
                            Distance term only; not a percentage share of the total hybrid score.
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 text-amber-300">Omitted: {bd.reason}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </InfoDisclosure>

        {/* 3. Limits of this comparison */}
        <InfoDisclosure label="Limits of this comparison">
          {comparison === null ? (
            <p className="text-slate-400">
              No prepared comparison yet. Missing observations, inactive features, excluded
              candidates, and terrain reconstruction caveats will appear here once loaded.
            </p>
          ) : (
            <div className="space-y-3 text-[11px]">
              <div>
                <div className="font-medium text-slate-200">Missing measurements &amp; geology</div>
                {missingLimitItems.length === 0 ? (
                  <p className="mt-1 text-slate-400">
                    All 9 numeric features and categorical geology classes are recorded for the
                    inspected site(s).
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {missingLimitItems.map((item) => (
                      <li
                        key={item.key}
                        className="border border-slate-800/80 bg-[#0B1018] px-2 py-1.5 text-slate-300"
                      >
                        <span className="font-medium text-slate-200">
                          {item.site} · {item.field}:
                        </span>{' '}
                        <span className="text-amber-300">{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="font-medium text-slate-200">
                  Inactive numeric features vs active profile
                </div>
                {!profileMatchesComparison ? (
                  <p className="mt-1 text-amber-300">
                    Unavailable: matching scoring profile ({comparison.profile_id}) not loaded.
                  </p>
                ) : inactiveFeatureKeys.length === 0 ? (
                  <p className="mt-1 text-slate-400">
                    All 9 schema numeric features are active in profile {profile?.id}.
                  </p>
                ) : (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-300">
                    {inactiveFeatureKeys.map((k) => (
                      <li key={`${comparison.profile_id}:inactive:${k}`}>
                        <span className="font-mono text-slate-200">{k}</span> ({FEATURE_LABELS[k]})
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="font-medium text-slate-200">
                  Excluded candidates ({comparison.excluded.length})
                </div>
                {comparison.excluded.length === 0 ? (
                  <p className="mt-1 text-slate-400">
                    No excluded Earth candidates recorded for {comparison.target.name}.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {comparison.excluded.map((ex) => (
                      <li
                        key={`${comparison.target.id}:excluded:${ex.location_id}`}
                        className="border border-slate-800/80 bg-[#0B1018] px-2 py-1.5 text-slate-300"
                      >
                        <span className="font-mono text-slate-200">{ex.location_id}</span>:{' '}
                        {ex.reasons.join('; ')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="font-medium text-slate-200">
                  Terrain DEM &amp; 3D reconstruction limits
                </div>
                <div className="mt-1 space-y-1.5">
                  {terrainLimitSites.map(({ key, role, location }) => {
                    const hm = location.assets.heightmap;
                    const splat = location.assets.splat;
                    return (
                      <div
                        key={key}
                        className="border border-slate-800/80 bg-[#0B1018] px-2 py-1.5 text-slate-300"
                      >
                        <div className="font-medium text-slate-200">
                          {role}: {location.name}
                        </div>
                        <div className="mt-0.5">
                          Heightmap:{' '}
                          {hm
                            ? `${hm.width}×${hm.height} grid (${hm.vertical_datum})`
                            : 'Not prepared (null) — 3D ground terrain view unavailable.'}
                        </div>
                        <div className="mt-0.5">
                          3D Splat:{' '}
                          {splat === null
                            ? 'Not prepared (null).'
                            : `${splat.gaussian_count.toLocaleString()} Gaussians (${splat.geometry_provenance}, scale_is_metric=${String(splat.scale_is_metric)}).`}
                        </div>
                        {splat && (!splat.scale_is_metric || splat.geometry_provenance === 'inferred') && (
                          <div className="mt-0.5 text-amber-300">
                            Caveat: inferred or non-metric splat geometry is not a metric terrain
                            measurement.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </InfoDisclosure>

        {/* 4. Source evidence */}
        <InfoDisclosure label="Source evidence">
          {comparison === null || referencedSources.length === 0 ? (
            <p className="text-slate-400">
              No referenced source records yet. Citations and recorded checksums will appear when
              a source-backed comparison is loaded.
            </p>
          ) : (
            <ul className="space-y-2 text-[11px]">
              {referencedSources.map(({ id, source }) => {
                if (!source) {
                  return (
                    <li
                      key={id}
                      className="border border-amber-500/30 bg-[#15120C] p-2 text-amber-200"
                    >
                      <span className="font-mono">{id}</span> — Unavailable (source metadata missing
                      from dataset.sources)
                    </li>
                  );
                }
                const safeProductUrl = toSafeHttpsUrl(source.product_url);
                return (
                  <li
                    key={source.id}
                    className="border border-slate-800/80 bg-[#0B1018] p-2 text-slate-300"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-slate-100">{source.provider}</span>
                      <span className="font-mono text-slate-400">{source.license}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-slate-200">
                      ID: {source.id} · {source.product_id}
                    </div>
                    <div className="mt-0.5 text-slate-400">
                      Mission: {source.mission ?? 'Not recorded'} · Retrieved:{' '}
                      <span className="font-mono tabular-nums">
                        {formatUtcTimestamp(source.retrieved_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 break-all font-mono text-slate-400">
                      Recorded checksum (sha256):{' '}
                      <span className="text-slate-200">{source.sha256}</span>
                    </div>
                    <div className="mt-0.5 break-all text-slate-400">
                      Local dataset path: <code className="font-mono text-slate-300">{source.local_path}</code>
                    </div>
                    <div className="mt-1 border-t border-slate-800 pt-1">
                      {safeProductUrl ? (
                        <a
                          href={safeProductUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 underline decoration-cyan-500/50 underline-offset-2 hover:text-cyan-300"
                        >
                          Product reference (HTTPS)
                        </a>
                      ) : (
                        <span className="text-amber-300">
                          Product reference link withheld (requires HTTPS URL without credentials)
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </InfoDisclosure>
      </div>
    </section>
  );
}
