// TEST_ONLY mathematical fixture, not Earth/Moon/Mars data
import { describe, expect, it } from 'vitest';
import type { Feature, Features, LocationsDataset } from '@shared/types/analog-location';
import { DatasetValidationError, parseDataset, resolveSameOriginAssetUrl } from './loadDataset';

function makeFeature<U extends 'deg' | '1' | 'm' | 'degC' | 'kWh/m2/day'>(
  unit: U,
  value: number | null,
): Feature<U> {
  if (value === null) {
    return {
      value: null,
      unit,
      quantity: 'test_quantity',
      method: 'test_method',
      spatial_resolution_m: 10,
      support_window_m: 100,
      period: null,
      source_ids: [],
      missing_reason: 'TEST_ONLY_OMITTED',
    };
  }
  return {
    value,
    unit,
    quantity: 'test_quantity',
    method: 'test_method',
    spatial_resolution_m: 10,
    support_window_m: 100,
    period: { start: '2025-01-01T00:00:00Z', end: '2025-01-02T00:00:00Z' },
    source_ids: ['src_1'],
    missing_reason: null,
  };
}

function makeFeatures(): Features {
  return {
    slope_mean_deg: makeFeature('deg', 0),
    slope_max_deg: makeFeature('deg', 12),
    roughness_index: makeFeature('1', 0.2),
    elevation_delta_m: makeFeature('m', 15),
    temp_min_c: makeFeature('degC', -40),
    temp_max_c: makeFeature('degC', 5),
    solar_irradiance_kwh_m2: makeFeature('kWh/m2/day', 2.5),
    aridity_index: makeFeature('1', 0.05),
    albedo: makeFeature('1', 0.14),
  };
}

function makeMinimalValidDataset(): LocationsDataset {
  return {
    schema_version: '1.0.0',
    generated_at: '2026-01-01T00:00:00Z',
    sources: [
      {
        id: 'src_1',
        provider: 'TEST_ONLY_PROVIDER',
        product_id: 'TEST_PROD_1',
        product_url: 'https://example.org/product',
        mission: null,
        access_url: 'https://example.org/access',
        retrieved_at: '2026-01-01T00:00:00Z',
        sha256: 'a'.repeat(64),
        license: 'CC0-1.0',
        local_path: 'raw/test_only.bin',
      },
    ],
    profiles: [
      {
        id: 'profile_test',
        version: '1.0.0',
        algorithm: 'weighted_cosine_euclidean_v1',
        alpha: 0.5,
        features: [
          {
            key: 'slope_mean_deg',
            unit: 'deg',
            quantity: 'test_quantity',
            weight: 1,
            lower: 0,
            upper: 45,
            calibration_source_ids: ['src_1'],
            calibration_method: 'test_calibration',
          },
        ],
        comparison_resolution_m: 10,
        window_m: 100,
        min_valid_area_fraction: 0.8,
      },
    ],
    comparisons: [
      {
        target: {
          id: 'target_test_moon',
          name: 'Test Mathematical Target',
          body: 'moon',
          coordinates: {
            latitude_deg: 10,
            longitude_deg: 20,
            frame: 'moon_iau_planetocentric',
            source_ids: ['src_1'],
          },
          aoi: {
            local_path: '/assets/test_only/aoi.geojson',
            source_ids: ['src_1'],
          },
          missions: [],
          features: makeFeatures(),
          geology: {
            classes: [],
            method: 'none',
            source_ids: [],
            missing_reason: 'TEST_ONLY_NO_GEOLOGY',
          },
          assets: {
            dem: null,
            heightmap: null,
            splat: null,
          },
          camera: null,
        },
        profile_id: 'profile_test',
        analogs: [],
        excluded: [],
      },
    ],
  };
}

describe('loadDataset schema and semantic invariant validation (TEST_ONLY fixtures)', () => {
  it('accepts a valid schema-compliant dataset with null ground assets', () => {
    const ds = makeMinimalValidDataset();
    expect(() => parseDataset(ds)).not.toThrow();
  });

  it('rejects bad schema version and missing required fields', () => {
    const bad = makeMinimalValidDataset() as unknown as Record<string, unknown>;
    bad.schema_version = '0.9.0';
    expect(() => parseDataset(bad)).toThrow(DatasetValidationError);
  });

  it('rejects missing source_ids referential integrity', () => {
    const ds = makeMinimalValidDataset();
    ds.comparisons[0].target.coordinates.source_ids = ['nonexistent_src'];
    expect(() => parseDataset(ds)).toThrow(/Missing source reference/);
  });

  it('rejects slope_mean_deg > slope_max_deg and temp_min_c > temp_max_c', () => {
    const dsSlope = makeMinimalValidDataset();
    dsSlope.comparisons[0].target.features.slope_mean_deg = makeFeature('deg', 30);
    dsSlope.comparisons[0].target.features.slope_max_deg = makeFeature('deg', 10);
    expect(() => parseDataset(dsSlope)).toThrow(/slope_mean_deg/);

    const dsTemp = makeMinimalValidDataset();
    dsTemp.comparisons[0].target.features.temp_min_c = makeFeature('degC', 20);
    dsTemp.comparisons[0].target.features.temp_max_c = makeFeature('degC', -10);
    dsTemp.comparisons[0].target.features.temp_min_c.quantity = 'air_2m_temperature_daily_min';
    dsTemp.comparisons[0].target.features.temp_max_c.quantity = 'air_2m_temperature_daily_max';
    expect(() => parseDataset(dsTemp)).toThrow(/temp_min_c/);
  });

  it('rejects camera metadata when heightmap asset is null', () => {
    const ds = makeMinimalValidDataset();
    ds.comparisons[0].target.camera = {
      position: [0, 2, 0],
      lookAt: [5, 0, 5],
      frame: 'local_enu_x_east_y_up_z_south',
      fov: 60,
      near: 0.1,
      far: 500,
    };
    expect(() => parseDataset(ds)).toThrow(/without a heightmap asset/);
  });

  it('rejects heightmap byte length mismatch with width and height', () => {
    const ds = makeMinimalValidDataset();
    ds.comparisons[0].target.assets.heightmap = {
      asset: {
        path: '/assets/test_only/h.bin',
        sha256: 'b'.repeat(64),
        bytes: 12, // invalid for 2x2 float32 (must be 16)
        source_ids: ['src_1'],
      },
      valid_mask: {
        path: '/assets/test_only/m.bin',
        sha256: 'c'.repeat(64),
        bytes: 4,
        source_ids: ['src_1'],
      },
      width: 2,
      height: 2,
      encoding: 'float32_le',
      nodata: null,
      row_order: 'north_to_south',
      col_order: 'west_to_east',
      samples: 'grid_nodes',
      height_reference: 'offset_from_origin_elevation_m',
      extent_m: [0, 0, 10, 10],
      origin: { latitude_deg: 0, longitude_deg: 0, elevation_m: 0 },
      frame: 'local_enu_x_east_y_up_z_south',
      vertical_datum: 'TEST',
      meters_per_unit: 1,
    };
    expect(() => parseDataset(ds)).toThrow(/height asset bytes/);
  });

  it('blocks external URLs and path traversal in asset URL resolution', () => {
    expect(() => resolveSameOriginAssetUrl('https://evil.example/a.bin')).toThrow();
    expect(() => resolveSameOriginAssetUrl('//evil.example/a.bin')).toThrow();
    expect(() => resolveSameOriginAssetUrl('/assets/../secret.bin')).toThrow();
    expect(resolveSameOriginAssetUrl('/assets/test_only/h.bin')).toBe('/assets/test_only/h.bin');
  });
});

function rankedFixture(): LocationsDataset {
 const ds=makeMinimalValidDataset(); const profile=ds.profiles[0];
 profile.features.push({key:'slope_max_deg',unit:'deg',quantity:'test_quantity',weight:3,lower:0,upper:60,calibration_source_ids:['src_1'],calibration_method:'TEST_ONLY'});
 const earth={...structuredClone(ds.comparisons[0].target),id:'earth_test',body:'earth' as const};
 earth.coordinates.frame='earth_wgs84';earth.features.slope_mean_deg.value=9;
 const breakdown=Object.fromEntries(Object.keys(earth.features).map(key=>[key,{similarity_pct:null,squared_distance_contribution:null,reason:'TEST_ONLY_INACTIVE'}]));
 // Independent expected difference 9/45=.2 and weight fraction 1/4.
 breakdown.slope_mean_deg={similarity_pct:80,squared_distance_contribution:.01,reason:null} as never;
 breakdown.slope_max_deg={similarity_pct:100,squared_distance_contribution:0,reason:null} as never;
 ds.comparisons[0].analogs=[{location:earth,rank:1,similarity_score:88.30127018922194,coverage:1,breakdown:breakdown as never}];return ds;
}
describe('B04 ranked weighted semantics TEST_ONLY',()=>{
 it('accepts independently calculated unequal-weight breakdown',()=>expect(()=>parseDataset(rankedFixture())).not.toThrow());
 it.each(['coverage','breakdown','missing','quantity','period','bounds','support','inactive'])('rejects %s corruption',kind=>{
 const ds=rankedFixture();const a=ds.comparisons[0].analogs[0];const f=a.location.features.slope_mean_deg;
 if(kind==='coverage')a.coverage=.75;
 if(kind==='breakdown')a.breakdown.slope_mean_deg.squared_distance_contribution=.04;
 if(kind==='missing')a.location.features.slope_mean_deg=makeFeature('deg',null);
 if(kind==='quantity')f.quantity='different';
 if(kind==='period')f.period={start:'2024-01-01T00:00:00Z',end:'2024-01-02T00:00:00Z'};
 if(kind==='bounds')f.value=50;
 if(kind==='support')f.support_window_m=200;
 if(kind==='inactive')a.breakdown.albedo={similarity_pct:100,squared_distance_contribution:0,reason:null};
 expect(()=>parseDataset(ds)).toThrow(DatasetValidationError);
 });
 it.each(['surface','period','unknown','method'])('allows incomparable thermal %s observations',kind=>{
 const ds=makeMinimalValidDataset();const f=ds.comparisons[0].target.features;
 f.temp_min_c.value=20;f.temp_max_c.value=-10;f.temp_min_c.quantity='air_2m_temperature_daily_min';f.temp_max_c.quantity='air_2m_temperature_daily_max';
 if(kind==='surface')f.temp_max_c.quantity='surface_temperature_daily_max';
 if(kind==='unknown'){f.temp_min_c.quantity='unknown';f.temp_max_c.quantity='unknown';}
 if(kind==='period')f.temp_max_c.period={start:'2024-01-01T00:00:00Z',end:'2024-01-02T00:00:00Z'};
 if(kind==='method')f.temp_max_c.method='unrelated';expect(()=>parseDataset(ds)).not.toThrow();
 });
 it.each([['daily_min','daily_max'], ['nasa_power_daily_point_min_over_period;point_sampling_coarse_grid_context','nasa_power_daily_point_max_over_period;point_sampling_coarse_grid_context']])('rejects inverted compatible extrema methods %s', (minMethod,maxMethod)=>{
 const ds=makeMinimalValidDataset();const f=ds.comparisons[0].target.features;
 f.temp_min_c.value=20;f.temp_max_c.value=-10;f.temp_min_c.quantity='air_2m_temperature_daily_min';f.temp_max_c.quantity='air_2m_temperature_daily_max';f.temp_min_c.method=minMethod;f.temp_max_c.method=maxMethod;
 expect(()=>parseDataset(ds)).toThrow(/temp_min_c/);
 });
});


describe('frozen hybrid score consistency TEST_ONLY', () => {
 it('accepts the nontrivial cosine/Euclidean blend without rounding or mutation', () => {
  // x=[0,.2], y=[.2,.2], w=[1,3]: D=.1, C=sqrt(3)/2, alpha=.5.
  const ds=rankedFixture(); const before=structuredClone(ds);
  expect(parseDataset(ds).comparisons[0].analogs[0].similarity_score).toBe(88.30127018922194);
  expect(ds).toEqual(before);
 });
 it.each([0, 80, 88.3, 100])('rejects an in-range but inconsistent score %s', score => {
  const ds=rankedFixture();ds.comparisons[0].analogs[0].similarity_score=score;
  expect(()=>parseDataset(ds)).toThrow(/inconsistent similarity_score/);
 });
 it('rejects wrong scores even when the rank order is valid', () => {
  const ds=rankedFixture();const first=ds.comparisons[0].analogs[0];
  const second=structuredClone(first);second.location.id='earth_test_z';second.rank=2;
  first.similarity_score=90;second.similarity_score=80;ds.comparisons[0].analogs.push(second);
  expect(()=>parseDataset(ds)).toThrow(/inconsistent similarity_score/);
 });
 it.each([[0,0,100,100,0],[0,9,40,80,.04],[9,0,40,80,.04]])(
  'uses canonical zero-norm behavior for target=%s analog=%s', (targetValue,analogValue,score,pct,contribution) => {
   const ds=rankedFixture();ds.profiles[0].features=[ds.profiles[0].features[0]];
   const target=ds.comparisons[0].target;const analog=ds.comparisons[0].analogs[0];
   target.features.slope_mean_deg.value=targetValue;analog.location.features.slope_mean_deg.value=analogValue;
   analog.breakdown.slope_mean_deg={similarity_pct:pct,squared_distance_contribution:contribution,reason:null};
   analog.breakdown.slope_max_deg={similarity_pct:null,squared_distance_contribution:null,reason:'TEST_ONLY_INACTIVE'};
   analog.similarity_score=score;expect(()=>parseDataset(ds)).not.toThrow();
   analog.similarity_score=score===100?50:90;expect(()=>parseDataset(ds)).toThrow(/inconsistent similarity_score/);
  });
 it('allows only floating-point score roundoff within 1e-10 absolute score points', () => {
  const ds=rankedFixture();ds.comparisons[0].analogs[0].similarity_score+=5e-11;
  expect(()=>parseDataset(ds)).not.toThrow();
  ds.comparisons[0].analogs[0].similarity_score+=1e-8;
  expect(()=>parseDataset(ds)).toThrow(/inconsistent similarity_score/);
 });
});
