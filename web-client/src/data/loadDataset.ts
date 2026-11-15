import Ajv2020Import from 'ajv/dist/2020';
import addFormatsImport from 'ajv-formats';
import schema from '@shared/schemas/analog_location.schema.json';
import type {
  Asset,
  Feature,
  FeatureKey,
  Location,
  LocationsDataset,
  ScoringProfile,
  Source,
} from '@shared/types/analog-location';
import { expectedFrameForBody } from '../terrain/coordinates';
import { validateAndDecomposeSplatMatrix } from '../terrain/splatUtils';

type Ajv2020Constructor = new (options?: {
  allErrors?: boolean;
  strict?: boolean;
}) => {
  compile: (schemaObj: object) => {
    (data: unknown): boolean;
    errors?: Array<{ instancePath?: string; message?: string }> | null;
  };
};

type AddFormatsFn = (ajv: unknown) => void;

const Ajv2020 = (
  (Ajv2020Import as unknown as { default?: Ajv2020Constructor }).default ??
  (Ajv2020Import as unknown as Ajv2020Constructor)
);
const addFormats = (
  (addFormatsImport as unknown as { default?: AddFormatsFn }).default ??
  (addFormatsImport as unknown as AddFormatsFn)
);

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

export type DatasetErrorKind = 'missing' | 'network' | 'json' | 'schema' | 'invariant';

export class DatasetValidationError extends Error {
  readonly kind: DatasetErrorKind;
  readonly details: string[];

  constructor(kind: DatasetErrorKind, message: string, details: string[] = []) {
    super(message);
    this.name = 'DatasetValidationError';
    this.kind = kind;
    this.details = details;
  }
}

// Absolute score points, matching scoring.py FP_SCORE_TOLERANCE. Never round input scores.
const SCORE_TOLERANCE = 1e-10;

const FEATURE_KEYS: FeatureKey[] = [
  'slope_mean_deg',
  'slope_max_deg',
  'roughness_index',
  'elevation_delta_m',
  'temp_min_c',
  'temp_max_c',
  'solar_irradiance_kwh_m2',
  'aridity_index',
  'albedo',
];

/**
 * Resolves a contract `/assets/...` path to a safe same-origin URL under `import.meta.env.BASE_URL`.
 * Rejects external origins, protocol-relative URLs, data/blob URLs, and path traversal.
 */
export function resolveSameOriginAssetUrl(assetPath: string): string {
  if (typeof assetPath !== 'string' || assetPath.length === 0) {
    throw new DatasetValidationError('invariant', 'Asset path must be a non-empty string.');
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(assetPath) || assetPath.startsWith('//')) {
    throw new DatasetValidationError(
      'invariant',
      `External or non-relative asset URL blocked: ${assetPath}`,
    );
  }
  if (!assetPath.startsWith('/assets/')) {
    throw new DatasetValidationError(
      'invariant',
      `Asset path must begin with /assets/: ${assetPath}`,
    );
  }
  const segments = assetPath.split('/');
  if (segments.some((seg) => seg === '.' || seg === '..')) {
    throw new DatasetValidationError(
      'invariant',
      `Path traversal detected in asset path: ${assetPath}`,
    );
  }

  const baseUrl = import.meta.env?.BASE_URL ?? '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${assetPath.slice(1)}`;
}

function assertAllNumbersFinite(value: unknown, path = '$'): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new DatasetValidationError('invariant', `Non-finite number at ${path}: ${value}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      assertAllNumbersFinite(value[i], `${path}[${i}]`);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      assertAllNumbersFinite(v, `${path}.${k}`);
    }
  }
}

function assertSourceIdsExist(
  sourceIds: string[],
  sourceMap: Map<string, Source>,
  context: string,
): void {
  for (const id of sourceIds) {
    if (!sourceMap.has(id)) {
      throw new DatasetValidationError(
        'invariant',
        `Missing source reference "${id}" in ${context}.`,
      );
    }
  }
}

function validateAssetMeta(
  asset: Asset,
  sourceMap: Map<string, Source>,
  context: string,
): void {
  resolveSameOriginAssetUrl(asset.path);
  assertSourceIdsExist(asset.source_ids, sourceMap, context);
}

function samePeriod(a: Feature['period'], b: Feature['period']): boolean {
  if (a === null || b === null) return a === b;
  return Date.parse(a.start) === Date.parse(b.start) && Date.parse(a.end) === Date.parse(b.end);
}

function sameScale(a: number | null, b: number | null): boolean {
  return a === null || b === null ? a === b : Math.abs(a - b) <= 1e-6;
}

function sameSupport(a: Feature, b: Feature): boolean {
  return a.method === b.method && samePeriod(a.period, b.period)
    && sameScale(a.spatial_resolution_m, b.spatial_resolution_m)
    && sameScale(a.support_window_m, b.support_window_m);
}

// Conservative allowlist: unknown identifiers never establish comparable thermal extrema.
function temperatureFamily(quantity: string): string | null {
  const families: Record<string, string> = {
    air_2m_temperature: 'air_2m_temperature',
    air_2m_temperature_daily_min: 'air_2m_temperature',
    air_2m_temperature_daily_max: 'air_2m_temperature',
    surface_temperature: 'surface_temperature',
    surface_temperature_min: 'surface_temperature',
    surface_temperature_max: 'surface_temperature',
    surface_temperature_daily_min: 'surface_temperature',
    surface_temperature_daily_max: 'surface_temperature',
  };
  return families[quantity] ?? null;
}

function compatibleExtremaMethods(min: string, max: string): boolean {
  if (min === max) return true;
  // Explicit daily extrema pair; arbitrary method suffixes are never stripped.
  return (min === 'daily_min' && max === 'daily_max')
    || (min === 'nasa_power_daily_point_min_over_period;point_sampling_coarse_grid_context'
      && max === 'nasa_power_daily_point_max_over_period;point_sampling_coarse_grid_context');
}

function comparableTemperatureExtrema(min: Feature, max: Feature): boolean {
  const family = temperatureFamily(min.quantity);
  return family !== null && family === temperatureFamily(max.quantity)
    && compatibleExtremaMethods(min.method, max.method)
    && samePeriod(min.period, max.period)
    && sameScale(min.spatial_resolution_m, max.spatial_resolution_m)
    && sameScale(min.support_window_m, max.support_window_m);
}

function validateLocationInvariants(
  loc: Location,
  sourceMap: Map<string, Source>,
  context: string,
): void {
  if (loc.coordinates.frame !== expectedFrameForBody(loc.body)) {
    throw new DatasetValidationError(
      'invariant',
      `${context}: coordinate frame "${loc.coordinates.frame}" does not match body "${loc.body}".`,
    );
  }
  assertSourceIdsExist(loc.coordinates.source_ids, sourceMap, `${context}.coordinates`);
  resolveSameOriginAssetUrl(loc.aoi.local_path);
  assertSourceIdsExist(loc.aoi.source_ids, sourceMap, `${context}.aoi`);

  for (const key of FEATURE_KEYS) {
    const feat = loc.features[key];
    assertSourceIdsExist(feat.source_ids, sourceMap, `${context}.features.${key}`);
    if (feat.period !== null) {
      const startMs = Date.parse(feat.period.start);
      const endMs = Date.parse(feat.period.end);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
        throw new DatasetValidationError(
          'invariant',
          `${context}.features.${key}: invalid observation period (start > end).`,
        );
      }
    }
  }

  const slopeMean = loc.features.slope_mean_deg.value;
  const slopeMax = loc.features.slope_max_deg.value;
  if (slopeMean !== null && slopeMax !== null && slopeMean > slopeMax) {
    throw new DatasetValidationError(
      'invariant',
      `${context}: slope_mean_deg (${slopeMean}) exceeds slope_max_deg (${slopeMax}).`,
    );
  }

  const tempMin = loc.features.temp_min_c.value;
  const tempMax = loc.features.temp_max_c.value;
  const minFeature = loc.features.temp_min_c;
  const maxFeature = loc.features.temp_max_c;
  if (tempMin !== null && tempMax !== null && tempMin > tempMax
    && comparableTemperatureExtrema(minFeature, maxFeature)) {
    throw new DatasetValidationError(
      'invariant',
      `${context}: temp_min_c (${tempMin}) exceeds temp_max_c (${tempMax}).`,
    );
  }

  assertSourceIdsExist(loc.geology.source_ids, sourceMap, `${context}.geology`);

  if (loc.assets.dem !== null) {
    validateAssetMeta(loc.assets.dem, sourceMap, `${context}.assets.dem`);
  }

  const hm = loc.assets.heightmap;
  if (hm !== null) {
    validateAssetMeta(hm.asset, sourceMap, `${context}.assets.heightmap.asset`);
    validateAssetMeta(hm.valid_mask, sourceMap, `${context}.assets.heightmap.valid_mask`);

    if (hm.width < 2 || hm.height < 2) {
      throw new DatasetValidationError(
        'invariant',
        `${context}.assets.heightmap: width (${hm.width}) and height (${hm.height}) must be >= 2.`,
      );
    }
    const expectedHeightBytes = hm.width * hm.height * 4;
    if (hm.asset.bytes !== expectedHeightBytes) {
      throw new DatasetValidationError(
        'invariant',
        `${context}.assets.heightmap: height asset bytes (${hm.asset.bytes}) != width*height*4 (${expectedHeightBytes}).`,
      );
    }
    const expectedMaskBytes = hm.width * hm.height;
    if (hm.valid_mask.bytes !== expectedMaskBytes) {
      throw new DatasetValidationError(
        'invariant',
        `${context}.assets.heightmap: valid_mask bytes (${hm.valid_mask.bytes}) != width*height (${expectedMaskBytes}).`,
      );
    }
    const [xMin, zMin, xMax, zMax] = hm.extent_m;
    if (!(xMin < xMax) || !(zMin < zMax)) {
      throw new DatasetValidationError(
        'invariant',
        `${context}.assets.heightmap: extent_m must satisfy x_min < x_max and z_min < z_max.`,
      );
    }
  }

  if (loc.assets.splat !== null) {
    validateAssetMeta(loc.assets.splat.asset, sourceMap, `${context}.assets.splat.asset`);
    const matrixCheck = validateAndDecomposeSplatMatrix(loc.assets.splat.world_from_asset);
    if (!matrixCheck.ok) {
      throw new DatasetValidationError(
        'invariant',
        `${context}.assets.splat.world_from_asset: ${matrixCheck.reason}`,
      );
    }
  }

  if (loc.camera !== null) {
    if (hm === null) {
      throw new DatasetValidationError(
        'invariant',
        `${context}.camera: camera metadata cannot be present without a heightmap asset.`,
      );
    }
    if (loc.camera.near >= loc.camera.far) {
      throw new DatasetValidationError(
        'invariant',
        `${context}.camera: near (${loc.camera.near}) must be < far (${loc.camera.far}).`,
      );
    }
    const dx = loc.camera.lookAt[0] - loc.camera.position[0];
    const dy = loc.camera.lookAt[1] - loc.camera.position[1];
    const dz = loc.camera.lookAt[2] - loc.camera.position[2];
    if (Math.hypot(dx, dy, dz) <= 1e-6) {
      throw new DatasetValidationError(
        'invariant',
        `${context}.camera: position and lookAt must define a nonzero viewing direction.`,
      );
    }
    const [xMin, zMin, xMax, zMax] = hm.extent_m;
    const [camX, , camZ] = loc.camera.position;
    if (camX < xMin || camX > xMax || camZ < zMin || camZ > zMax) {
      throw new DatasetValidationError(
        'invariant',
        `${context}.camera: initial position (${camX}, ${camZ}) lies outside heightmap extent_m [${xMin}, ${zMin}, ${xMax}, ${zMax}].`,
      );
    }
  }
}

function validateProfileInvariants(
  profile: ScoringProfile,
  sourceMap: Map<string, Source>,
): void {
  const totalWeight = profile.features.reduce((total, feature) => total + feature.weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    throw new DatasetValidationError('invariant', `Profile "${profile.id}" has invalid total weight.`);
  }
  const seenKeys = new Set<FeatureKey>();
  for (const feat of profile.features) {
    if (seenKeys.has(feat.key)) {
      throw new DatasetValidationError(
        'invariant',
        `Scoring profile "${profile.id}" contains duplicate feature key "${feat.key}".`,
      );
    }
    seenKeys.add(feat.key);
    if (!(feat.weight > 0) || !Number.isFinite(feat.weight)) {
      throw new DatasetValidationError('invariant', `Profile "${profile.id}" has invalid feature weight.`);
    }
    if (!(feat.lower < feat.upper)) {
      throw new DatasetValidationError(
        'invariant',
        `Scoring profile "${profile.id}" feature "${feat.key}" must satisfy lower < upper.`,
      );
    }
    assertSourceIdsExist(
      feat.calibration_source_ids,
      sourceMap,
      `profile "${profile.id}" feature "${feat.key}"`,
    );
  }
}

export function validateDatasetInvariants(dataset: LocationsDataset): void {
  assertAllNumbersFinite(dataset);

  const sourceMap = new Map<string, Source>();
  for (const src of dataset.sources) {
    if (sourceMap.has(src.id)) {
      throw new DatasetValidationError('invariant', `Duplicate source ID "${src.id}".`);
    }
    if (!Number.isFinite(Date.parse(src.retrieved_at))) {
      throw new DatasetValidationError(
        'invariant',
        `Source "${src.id}" has invalid retrieved_at timestamp.`,
      );
    }
    sourceMap.set(src.id, src);
  }

  const profileMap = new Map<string, ScoringProfile>();
  for (const profile of dataset.profiles) {
    if (profileMap.has(profile.id)) {
      throw new DatasetValidationError('invariant', `Duplicate scoring profile ID "${profile.id}".`);
    }
    validateProfileInvariants(profile, sourceMap);
    profileMap.set(profile.id, profile);
  }

  const targetIds = new Set<string>();
  const locationSignatures = new Map<string, string>();

  const recordLocationSignature = (loc: Location, role: 'target' | 'analog') => {
    const sig = JSON.stringify({
      role,
      name: loc.name,
      body: loc.body,
      lat: loc.coordinates.latitude_deg,
      lon: loc.coordinates.longitude_deg,
      frame: loc.coordinates.frame,
    });
    const prev = locationSignatures.get(loc.id);
    if (prev !== undefined && prev !== sig) {
      throw new DatasetValidationError(
        'invariant',
        `Location ID "${loc.id}" appears with conflicting definitions or roles.`,
      );
    }
    locationSignatures.set(loc.id, sig);
  };

  for (let cIdx = 0; cIdx < dataset.comparisons.length; cIdx += 1) {
    const comp = dataset.comparisons[cIdx];
    if (!profileMap.has(comp.profile_id)) {
      throw new DatasetValidationError(
        'invariant',
        `Comparison[${cIdx}] references missing profile_id "${comp.profile_id}".`,
      );
    }
    if (targetIds.has(comp.target.id)) {
      throw new DatasetValidationError(
        'invariant',
        `Duplicate target location ID "${comp.target.id}".`,
      );
    }
    targetIds.add(comp.target.id);
    recordLocationSignature(comp.target, 'target');
    validateLocationInvariants(comp.target, sourceMap, `comparisons[${cIdx}].target`);

    const compLocationIds = new Set<string>([comp.target.id]);
    for (let aIdx = 0; aIdx < comp.analogs.length; aIdx += 1) {
      const analog = comp.analogs[aIdx];
      if (analog.rank !== aIdx + 1) {
        throw new DatasetValidationError(
          'invariant',
          `Comparison[${cIdx}] analog "${analog.location.id}" has rank ${analog.rank}, expected ${aIdx + 1}.`,
        );
      }
      if (compLocationIds.has(analog.location.id)) {
        throw new DatasetValidationError(
          'invariant',
          `Duplicate location ID "${analog.location.id}" within comparison[${cIdx}].`,
        );
      }
      compLocationIds.add(analog.location.id);
      recordLocationSignature(analog.location, 'analog');
      validateLocationInvariants(
        analog.location,
        sourceMap,
        `comparisons[${cIdx}].analogs[${aIdx}].location`,
      );

      const profile = profileMap.get(comp.profile_id)!;
      const active = new Set(profile.features.map((feature) => feature.key));
      const totalWeight = profile.features.reduce((total, feature) => total + feature.weight, 0);
      let validWeight = 0;
      let squaredDistance = 0;
      let targetNormSquared = 0;
      let analogNormSquared = 0;
      let dotProduct = 0;
      for (const feature of profile.features) {
        const targetValue = comp.target.features[feature.key];
        const earthValue = analog.location.features[feature.key];
        const breakdown = analog.breakdown[feature.key];
        if (targetValue.value === null || earthValue.value === null) {
          throw new DatasetValidationError('invariant', `Ranked analog "${analog.location.id}" is missing active feature ${feature.key}.`);
        }
        if (targetValue.quantity !== feature.quantity || earthValue.quantity !== feature.quantity
          || targetValue.unit !== feature.unit || earthValue.unit !== feature.unit
          || !sameSupport(targetValue, earthValue)
          || !sameScale(targetValue.spatial_resolution_m, profile.comparison_resolution_m)
          || !sameScale(targetValue.support_window_m, profile.window_m)) {
          throw new DatasetValidationError('invariant', `Ranked analog "${analog.location.id}" has incompatible active feature ${feature.key}.`);
        }
        if ([targetValue.value, earthValue.value].some((value) => value < feature.lower || value > feature.upper)) {
          throw new DatasetValidationError('invariant', `Active feature ${feature.key} is outside calibration bounds.`);
        }
        const span = feature.upper - feature.lower;
        const x = (targetValue.value - feature.lower) / span;
        const y = (earthValue.value - feature.lower) / span;
        const difference = x - y;
        // Divide weights first: equivalent to the frozen formula, without W*W overflow.
        const weightShare = feature.weight / totalWeight;
        targetNormSquared += weightShare * x * x;
        analogNormSquared += weightShare * y * y;
        dotProduct += weightShare * x * y;
        const expectedMatch = 100 * (1 - Math.abs(difference));
        const expectedDistance = weightShare * difference * difference;
        squaredDistance += expectedDistance;
        if (breakdown.reason !== null || breakdown.similarity_pct === null || breakdown.squared_distance_contribution === null
          || Math.abs(breakdown.similarity_pct - expectedMatch) > 1e-6
          || Math.abs(breakdown.squared_distance_contribution - expectedDistance) > 1e-6) {
          throw new DatasetValidationError('invariant', `Inconsistent breakdown for active feature ${feature.key}.`);
        }
        validWeight += feature.weight;
      }
      for (const key of FEATURE_KEYS) {
        if (!active.has(key) && (analog.breakdown[key].similarity_pct !== null
          || analog.breakdown[key].squared_distance_contribution !== null
          || !analog.breakdown[key].reason)) {
          throw new DatasetValidationError('invariant', `Inactive feature ${key} must have an unavailable breakdown.`);
        }
      }
      if (Math.abs(analog.coverage - validWeight / totalWeight) > 1e-6) {
        throw new DatasetValidationError('invariant', `Ranked analog "${analog.location.id}" has inconsistent weighted coverage.`);
      }

      // Exact zero-norm rules from weighted_cosine_euclidean_v1; validate, never replace.
      const cosine = targetNormSquared === 0 && analogNormSquared === 0 ? 1
        : targetNormSquared === 0 || analogNormSquared === 0 ? 0
        : dotProduct / (Math.sqrt(targetNormSquared) * Math.sqrt(analogNormSquared));
      const expectedScore = 100 * (profile.alpha * cosine
        + (1 - profile.alpha) * (1 - Math.sqrt(squaredDistance)));
      if (!Number.isFinite(expectedScore)
        || Math.abs(analog.similarity_score - expectedScore) > SCORE_TOLERANCE) {
        throw new DatasetValidationError('invariant',
          `Ranked analog "${analog.location.id}" has inconsistent similarity_score (expected ${expectedScore}).`);
      }

      if (aIdx > 0) {
        const prev = comp.analogs[aIdx - 1];
        if (
          analog.similarity_score > prev.similarity_score ||
          (analog.similarity_score === prev.similarity_score &&
            analog.location.id.localeCompare(prev.location.id) < 0)
        ) {
          throw new DatasetValidationError(
            'invariant',
            `Comparison[${cIdx}] analogs are not sorted by descending similarity_score then ascending location.id.`,
          );
        }
      }
    }

    const excludedIds = new Set<string>();
    for (const ex of comp.excluded) {
      if (excludedIds.has(ex.location_id)) {
        throw new DatasetValidationError(
          'invariant',
          `Comparison[${cIdx}] contains duplicate excluded location_id "${ex.location_id}".`,
        );
      }
      if (compLocationIds.has(ex.location_id)) {
        throw new DatasetValidationError(
          'invariant',
          `Comparison[${cIdx}] excluded location_id "${ex.location_id}" overlaps target or ranked analogs.`,
        );
      }
      excludedIds.add(ex.location_id);
    }
  }
}

export function parseDataset(value: unknown): LocationsDataset {
  const valid = validateSchema(value);
  if (!valid) {
    const details = (validateSchema.errors ?? []).map(
      (err) => `${err.instancePath || '$'} ${err.message ?? 'invalid'}`,
    );
    throw new DatasetValidationError(
      'schema',
      `Dataset failed JSON Schema 2020-12 validation (${details.length} error${details.length === 1 ? '' : 's'}).`,
      details,
    );
  }

  const typed = value as LocationsDataset;
  validateDatasetInvariants(typed);
  return typed;
}

export async function loadDataset(signal: AbortSignal): Promise<LocationsDataset> {
  const baseUrl = import.meta.env?.BASE_URL ?? '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = `${normalizedBase}data/locations_dataset.json`;

  let response: Response;
  try {
    response = await fetch(url, { signal, cache: 'no-store' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new DatasetValidationError(
      'network',
      `Failed to fetch local dataset at ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (response.status === 404) {
    throw new DatasetValidationError(
      'missing',
      `No prepared dataset found at ${url} (HTTP 404). Provide Dev_A output in public/data/locations_dataset.json.`,
    );
  }
  if (!response.ok) {
    throw new DatasetValidationError(
      'network',
      `Unable to load dataset at ${url} (HTTP ${response.status} ${response.statusText}).`,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  if (contentType.includes('text/html') || text.trimStart().startsWith('<')) {
    throw new DatasetValidationError(
      'missing',
      `No prepared dataset found at ${url}. Provide Dev_A output in public/data/locations_dataset.json.`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new DatasetValidationError(
      'json',
      `Dataset at ${url} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return parseDataset(json);
}
