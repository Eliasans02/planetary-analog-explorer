import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createAgent } from '@ui-sdk/react/agent';
import type { Comparison, ScoringProfile, Source } from '@shared/types/analog-location';
import { AnalogPassport } from '../src/components/AnalogPassport';
import '../src/styles.css';

// Created BEFORE first React render so @ui-sdk/react/agent observes every disclosure primitive.
const agent = createAgent();

declare global {
  interface Window {
    __TEST_ONLY_AGENT__?: ReturnType<typeof createAgent>;
  }
}

window.__TEST_ONLY_AGENT__ = agent;

// Strictly TEST_ONLY fixture used solely inside the agent/mismatch harness (never shipped in dist or public/data).
const TEST_ONLY_SOURCES: Source[] = [
  {
    id: 'src_test_only_1',
    provider: 'TEST_ONLY Provider',
    product_id: 'TEST_PROD_01',
    product_url: 'https://example.org/test-only-product',
    mission: 'TEST_MISSION',
    access_url: 'https://example.org/archive',
    retrieved_at: '2026-01-01T00:00:00Z',
    sha256: 'a'.repeat(64),
    license: 'CC0-1.0',
    local_path: 'raw/test_only_dem.tif',
  },
];

const TEST_ONLY_MISMATCH_PROFILE: ScoringProfile = {
  id: 'profile_mismatch_test_only',
  version: '1.0.0',
  algorithm: 'weighted_cosine_euclidean_v1',
  alpha: 0.5,
  features: [
    {
      key: 'slope_mean_deg',
      unit: 'deg',
      quantity: 'mean terrain slope',
      weight: 1,
      lower: 0,
      upper: 45,
      calibration_source_ids: ['src_test_only_1'],
      calibration_method: 'TEST_ONLY_CALIBRATION',
    },
  ],
  comparison_resolution_m: 10,
  window_m: 100,
  min_valid_area_fraction: 0.8,
};

function makeEmptyFeature<U extends 'deg' | '1' | 'm' | 'degC' | 'kWh/m2/day'>(
  unit: U,
  quantity: string,
) {
  return {
    unit,
    quantity,
    method: 'TEST_ONLY',
    spatial_resolution_m: null,
    support_window_m: null,
    period: null,
    value: null,
    source_ids: [],
    missing_reason: 'TEST_ONLY missing observation',
  };
}

const TEST_ONLY_COMPARISON: Comparison = {
  profile_id: 'profile_expected_test_only',
  target: {
    id: 'test_only_target',
    name: 'TEST_ONLY Lunar Target',
    body: 'moon',
    coordinates: {
      latitude_deg: 0,
      longitude_deg: 0,
      frame: 'moon_iau_planetocentric',
      source_ids: ['src_test_only_1'],
    },
    aoi: { local_path: 'aoi/test_only.geojson', source_ids: ['src_test_only_1'] },
    missions: ['TEST_ONLY'],
    features: {
      slope_mean_deg: makeEmptyFeature('deg', 'mean slope'),
      slope_max_deg: makeEmptyFeature('deg', 'max slope'),
      roughness_index: makeEmptyFeature('1', 'roughness'),
      elevation_delta_m: makeEmptyFeature('m', 'elevation delta'),
      temp_min_c: makeEmptyFeature('degC', 'min temperature'),
      temp_max_c: makeEmptyFeature('degC', 'max temperature'),
      solar_irradiance_kwh_m2: makeEmptyFeature('kWh/m2/day', 'daily solar irradiation'),
      aridity_index: makeEmptyFeature('1', 'aridity'),
      albedo: makeEmptyFeature('1', 'albedo'),
    },
    geology: {
      classes: [],
      method: 'TEST_ONLY',
      source_ids: [],
      missing_reason: 'TEST_ONLY geology omitted',
    },
    assets: { dem: null, heightmap: null, splat: null },
    camera: null,
  },
  analogs: [
    {
      rank: 1,
      similarity_score: 50,
      coverage: 0.5,
      location: {
        id: 'test_only_earth',
        name: 'TEST_ONLY Earth Site',
        body: 'earth',
        coordinates: {
          latitude_deg: 0,
          longitude_deg: 0,
          frame: 'earth_wgs84',
          source_ids: ['src_test_only_1'],
        },
        aoi: { local_path: 'aoi/test_only_earth.geojson', source_ids: ['src_test_only_1'] },
        missions: [],
        features: {
          slope_mean_deg: makeEmptyFeature('deg', 'mean slope'),
          slope_max_deg: makeEmptyFeature('deg', 'max slope'),
          roughness_index: makeEmptyFeature('1', 'roughness'),
          elevation_delta_m: makeEmptyFeature('m', 'elevation delta'),
          temp_min_c: makeEmptyFeature('degC', 'min temperature'),
          temp_max_c: makeEmptyFeature('degC', 'max temperature'),
          solar_irradiance_kwh_m2: makeEmptyFeature('kWh/m2/day', 'daily solar irradiation'),
          aridity_index: makeEmptyFeature('1', 'aridity'),
          albedo: makeEmptyFeature('1', 'albedo'),
        },
        geology: {
          classes: [],
          method: 'TEST_ONLY',
          source_ids: [],
          missing_reason: 'TEST_ONLY geology omitted',
        },
        assets: { dem: null, heightmap: null, splat: null },
        camera: null,
      },
      breakdown: {
        slope_mean_deg: { similarity_pct: null, squared_distance_contribution: null, reason: 'TEST_ONLY' },
        slope_max_deg: { similarity_pct: null, squared_distance_contribution: null, reason: 'TEST_ONLY' },
        roughness_index: { similarity_pct: null, squared_distance_contribution: null, reason: 'TEST_ONLY' },
        elevation_delta_m: { similarity_pct: null, squared_distance_contribution: null, reason: 'TEST_ONLY' },
        temp_min_c: { similarity_pct: null, squared_distance_contribution: null, reason: 'TEST_ONLY' },
        temp_max_c: { similarity_pct: null, squared_distance_contribution: null, reason: 'TEST_ONLY' },
        solar_irradiance_kwh_m2: { similarity_pct: null, squared_distance_contribution: null, reason: 'TEST_ONLY' },
        aridity_index: { similarity_pct: null, squared_distance_contribution: null, reason: 'TEST_ONLY' },
        albedo: { similarity_pct: null, squared_distance_contribution: null, reason: 'TEST_ONLY' },
      },
    },
  ],
  excluded: [],
};

function HarnessApp(): React.JSX.Element {
  const [mounted, setMounted] = useState(true);
  const [mismatchMode, setMismatchMode] = useState(false);

  return (
    <main className="mx-auto max-w-md space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="harness-toggle-mount"
          onClick={() => setMounted((v) => !v)}
          className="border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs"
        >
          {mounted ? 'Unmount Passport' : 'Mount Passport'}
        </button>
        <button
          type="button"
          data-testid="harness-toggle-mismatch"
          onClick={() => setMismatchMode((v) => !v)}
          className="border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs"
        >
          {mismatchMode ? 'Use Empty' : 'Use TEST_ONLY Profile Mismatch'}
        </button>
      </div>

      {mounted && (
        <AnalogPassport
          comparison={mismatchMode ? TEST_ONLY_COMPARISON : null}
          selectedAnalog={mismatchMode ? TEST_ONLY_COMPARISON.analogs[0] : null}
          profile={mismatchMode ? TEST_ONLY_MISMATCH_PROFILE : null}
          sources={mismatchMode ? TEST_ONLY_SOURCES : []}
          loading={false}
          errorMessage={null}
        />
      )}
    </main>
  );
}

const rootEl = document.getElementById('harness-root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <HarnessApp />
    </StrictMode>,
  );
}
