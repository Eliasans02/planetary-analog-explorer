import { expect, test } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import { createServer, type ViteDevServer } from 'vite';
import type { LocationsDataset } from '@shared/types/analog-location';

const EXPECTED_DISCLOSURE_LABELS = [
  'Physical profile',
  'Why this match',
  'Limits of this comparison',
  'Source evidence',
] as const;

// Strictly TEST_ONLY dataset fixture for verifying real AnalogPassport DOM behavior without public/data files.
function makeTestOnlyFeature<U extends 'deg' | '1' | 'm' | 'degC' | 'kWh/m2/day'>(
  unit: U,
  quantity: string,
  value: number | null,
  sourceIds: string[],
  missingReason: string | null,
) {
  if (value === null) {
    return {
      unit,
      quantity,
      method: 'TEST_ONLY_METHOD',
      spatial_resolution_m: null,
      support_window_m: null,
      period: null,
      value: null as null,
      source_ids: sourceIds,
      missing_reason: missingReason ?? 'TEST_ONLY missing reason',
    };
  }
  return {
    unit,
    quantity,
    method: 'TEST_ONLY_METHOD',
    spatial_resolution_m: 30,
    support_window_m: 500,
    period: { start: '2024-01-01T00:00:00Z', end: '2024-12-31T00:00:00Z' },
    value,
    source_ids: [sourceIds[0] ?? 'src_test_https', ...sourceIds.slice(1)] as [string, ...string[]],
    missing_reason: null as null,
  };
}

const TEST_ONLY_POPULATED_DATASET: LocationsDataset = {
  schema_version: '1.0.0',
  generated_at: '2026-01-01T00:00:00Z',
  sources: [
    {
      id: 'src_test_https',
      provider: 'TEST_ONLY Planetary Archive',
      product_id: 'TEST_ONLY_LRO_DEM',
      product_url: 'https://example.org/products/test-only-dem',
      mission: 'TEST_ONLY LRO',
      access_url: 'https://example.org/archive',
      retrieved_at: '2026-01-01T00:00:00Z',
      sha256: 'b'.repeat(64),
      license: 'CC0-1.0',
      local_path: 'raw/test_only_lro.tif',
    },
    {
      id: 'src_test_unsafe_url',
      provider: 'TEST_ONLY Credentialed URL Archive',
      product_id: 'TEST_ONLY_UNSAFE_URL',
      product_url: 'https://user:secret@example.org/unsafe',
      mission: null,
      access_url: 'https://example.org/archive',
      retrieved_at: '2026-01-01T00:00:00Z',
      sha256: 'c'.repeat(64),
      license: 'CC-BY-4.0',
      local_path: 'raw/test_only_earth.tif',
    },
  ],
  profiles: [
    {
      id: 'lunar_south_pole_test_only',
      version: '1.0.0',
      algorithm: 'weighted_cosine_euclidean_v1',
      alpha: 0.5,
      features: [
        {
          key: 'slope_mean_deg',
          unit: 'deg',
          quantity: 'mean slope',
          weight: 0.6,
          lower: 0,
          upper: 45,
          calibration_source_ids: ['src_test_https'],
          calibration_method: 'TEST_ONLY quantile',
        },
        {
          key: 'solar_irradiance_kwh_m2',
          unit: 'kWh/m2/day',
          quantity: 'mean daily solar irradiation',
          weight: 0.4,
          lower: 0,
          upper: 10,
          calibration_source_ids: ['src_test_https'],
          calibration_method: 'TEST_ONLY quantile',
        },
      ],
      comparison_resolution_m: 30,
      window_m: 500,
      min_valid_area_fraction: 0.85,
    },
  ],
  comparisons: [
    {
      profile_id: 'lunar_south_pole_test_only',
      target: {
        id: 'test_only_moon_site',
        name: 'TEST_ONLY Shackleton Rim',
        body: 'moon',
        coordinates: {
          latitude_deg: -89.5,
          longitude_deg: 0.0,
          frame: 'moon_iau_planetocentric',
          source_ids: ['src_test_https'],
        },
        aoi: { local_path: '/assets/aoi/moon_test.geojson', source_ids: ['src_test_https'] },
        missions: ['TEST_ONLY LRO'],
        features: {
          slope_mean_deg: makeTestOnlyFeature('deg', 'mean slope', 12.5, ['src_test_https'], null),
          slope_max_deg: makeTestOnlyFeature('deg', 'max slope', 28.0, ['src_test_https'], null),
          roughness_index: makeTestOnlyFeature('1', 'surface roughness', 0.42, ['src_test_https'], null),
          elevation_delta_m: makeTestOnlyFeature('m', 'elevation relief', 420, ['src_test_https'], null),
          temp_min_c: makeTestOnlyFeature('degC', 'minimum temperature', -210, ['src_test_https'], null),
          temp_max_c: makeTestOnlyFeature('degC', 'maximum temperature', -55, ['src_test_https'], null),
          solar_irradiance_kwh_m2: makeTestOnlyFeature(
            'kWh/m2/day',
            'mean daily solar irradiation',
            1.4,
            ['src_test_https'],
            null,
          ),
          aridity_index: makeTestOnlyFeature(
            '1',
            'aridity index',
            null,
            [],
            'Not applicable to airless lunar vacuum body',
          ),
          albedo: makeTestOnlyFeature('1', 'bolometric albedo', 0.14, ['src_test_https'], null),
        },
        geology: {
          classes: ['anorthositic_regolith'],
          method: 'TEST_ONLY spectral unit map',
          source_ids: ['src_test_https'],
          missing_reason: null,
        },
        assets: {
          dem: null,
          heightmap: null,
          splat: {
            asset: {
              path: '/assets/test_only_splat.splat',
              sha256: 'd'.repeat(64),
              bytes: 1024,
              source_ids: ['src_test_https'],
            },
            format: 'splat',
            gaussian_count: 1000,
            scale_is_metric: false,
            world_from_asset: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            reconstruction_method: 'TEST_ONLY single-image splat',
            geometry_provenance: 'inferred',
          },
        },
        camera: null,
      },
      analogs: [
        {
          rank: 1,
          similarity_score: 96.39127114417117,
          coverage: 1.0,
          location: {
            id: 'test_only_earth_site',
            name: 'TEST_ONLY McMurdo Dry Valleys',
            body: 'earth',
            coordinates: {
              latitude_deg: -77.5,
              longitude_deg: 161.8,
              frame: 'earth_wgs84',
              source_ids: ['src_test_unsafe_url'],
            },
            aoi: { local_path: '/assets/aoi/earth_test.geojson', source_ids: ['src_test_unsafe_url'] },
            missions: [],
            features: {
              slope_mean_deg: makeTestOnlyFeature('deg', 'mean slope', 11.2, ['src_test_unsafe_url'], null),
              slope_max_deg: makeTestOnlyFeature('deg', 'max slope', 24.5, ['src_test_unsafe_url'], null),
              roughness_index: makeTestOnlyFeature('1', 'surface roughness', 0.39, ['src_test_unsafe_url'], null),
              elevation_delta_m: makeTestOnlyFeature('m', 'elevation relief', 380, ['src_test_unsafe_url'], null),
              temp_min_c: makeTestOnlyFeature('degC', 'minimum temperature', -42, ['src_test_unsafe_url'], null),
              temp_max_c: makeTestOnlyFeature('degC', 'maximum temperature', 2, ['src_test_unsafe_url'], null),
              solar_irradiance_kwh_m2: makeTestOnlyFeature(
                'kWh/m2/day',
                'mean daily solar irradiation',
                2.1,
                ['src_test_unsafe_url'],
                null,
              ),
              aridity_index: makeTestOnlyFeature('1', 'aridity index', 0.03, ['src_test_unsafe_url'], null),
              albedo: makeTestOnlyFeature('1', 'surface albedo', 0.28, ['src_test_unsafe_url'], null),
            },
            geology: {
              classes: [],
              method: 'TEST_ONLY geological survey',
              source_ids: [],
              missing_reason: 'Lithologic unit polygon unavailable in test fixture',
            },
            assets: { dem: null, heightmap: null, splat: null },
            camera: null,
          },
          breakdown: {
            slope_mean_deg: { similarity_pct: 97.1111111111111, squared_distance_contribution: 0.0005007407407407414, reason: null },
            slope_max_deg: { similarity_pct: null, squared_distance_contribution: null, reason: 'Excluded from profile' },
            roughness_index: { similarity_pct: null, squared_distance_contribution: null, reason: 'Excluded from profile' },
            elevation_delta_m: { similarity_pct: null, squared_distance_contribution: null, reason: 'Excluded from profile' },
            temp_min_c: { similarity_pct: null, squared_distance_contribution: null, reason: 'Excluded from profile' },
            temp_max_c: { similarity_pct: null, squared_distance_contribution: null, reason: 'Excluded from profile' },
            solar_irradiance_kwh_m2: { similarity_pct: 93, squared_distance_contribution: 0.001960000000000002, reason: null },
            aridity_index: { similarity_pct: null, squared_distance_contribution: null, reason: 'Excluded from profile' },
            albedo: { similarity_pct: null, squared_distance_contribution: null, reason: 'Excluded from profile' },
          },
        },
      ],
      excluded: [
        {
          location_id: 'test_only_excluded_site',
          reasons: ['Valid DEM coverage 0.42 below min_valid_area_fraction 0.85'],
        },
      ],
    },
  ],
};

test.describe('UI SDK InfoDisclosure & AnalogPassport - App Integration & Keyboard Accessibility', () => {
  test('renders honest empty AnalogPassport, toggles 4 unique disclosures via Enter/Space, prevents Tab into closed panels, and preserves single WebGL canvas across 20 toggles + resize', async ({
    page,
  }) => {
    let datasetRequestCount = 0;
    await page.route('**/data/locations_dataset.json', (route) => {
      datasetRequestCount += 1;
      return route.fulfill({ status: 404, body: 'Not Found' });
    });

    await page.goto('/?workspace=calibrated');

    const passport = page.getByTestId('analog-passport');
    await expect(passport).toBeVisible();
    await expect(passport).toContainText('Analog Passport');
    await expect(passport).toContainText('Inspect the evidence behind a comparison');
    await expect(passport).toContainText('No prepared comparison yet');

    // Error technical details disclosure inside AnalogPassport is collapsed initially and expandable.
    const errorBox = page.getByTestId('passport-error-status');
    await expect(errorBox).toBeVisible();
    const errorTrigger = errorBox.locator('[data-slot="collapsible-trigger"]');
    await expect(errorTrigger).toHaveText(/Technical details/);
    await expect(errorTrigger).toHaveAttribute('aria-expanded', 'false');

    const triggers = page
      .getByTestId('passport-disclosures')
      .locator('[data-slot="collapsible-trigger"]');
    await expect(triggers).toHaveCount(4);

    // Verify 4 unique expected trigger labels and collapsed initial state.
    const observedLabels: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const trigger = triggers.nth(i);
      const rawText = (await trigger.innerText()).replace(/\s*▾\s*$/, '').trim();
      observedLabels.push(rawText);
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }
    expect(observedLabels).toEqual([...EXPECTED_DISCLOSURE_LABELS]);
    expect(new Set(observedLabels).size).toBe(4);

    // Closed panels must not expose panel DOM to Tab order.
    const panels = page
      .getByTestId('passport-disclosures')
      .locator('[data-slot="collapsible-panel"]');
    await expect(panels).toHaveCount(0);

    // Keyboard Enter & Space toggle each trigger once per press and keep focus on trigger.
    for (let i = 0; i < 4; i += 1) {
      const trigger = triggers.nth(i);
      await trigger.focus();
      await expect(trigger).toBeFocused();

      await page.keyboard.press('Enter');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(trigger).toBeFocused();

      await page.keyboard.press('Space');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).toBeFocused();

      await page.keyboard.press('Space');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(trigger).toBeFocused();

      await page.keyboard.press('Enter');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).toBeFocused();
    }

    // Check closed panel is unreachable by Tab from the last trigger.
    await triggers.nth(3).focus();
    await page.keyboard.press('Tab');
    const focusedInsideClosedPanel = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active?.closest('[data-slot="collapsible-panel"]'));
    });
    expect(focusedInsideClosedPanel).toBe(false);

    // Record initial canvas ownership and request count before 20 rapid toggles + resizes.
    const webglErrorCount = await page.getByTestId('viewport3d-webgl-error').count();
    if (webglErrorCount === 0) {
      await expect(page.getByTestId('viewport3d-canvas')).toHaveCount(1);
    }
    const fetchesBeforeToggles = datasetRequestCount;

    for (let i = 0; i < 20; i += 1) {
      await triggers.nth(i % 4).click();
    }

    await page.setViewportSize({ width: 1100, height: 760 });
    await page.setViewportSize({ width: 1440, height: 900 });

    if (webglErrorCount === 0) {
      await expect(page.getByTestId('viewport3d-canvas')).toHaveCount(1);
    }
    expect(datasetRequestCount).toBe(fetchesBeforeToggles);
  });

  test('narrow mobile viewport allows keyboard access to telemetry sidebar and AnalogPassport disclosures without horizontal overflow', async ({
    page,
  }) => {
    await page.route('**/data/locations_dataset.json', (route) =>
      route.fulfill({ status: 404, body: 'Not Found' }),
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?workspace=calibrated');

    // Keyboard open Telemetry sidebar via existing toggle button.
    const toggleTelemetryBtn = page.getByTestId('toggle-telemetry-btn');
    await toggleTelemetryBtn.focus();
    await expect(toggleTelemetryBtn).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('analog-passport')).toBeVisible();
    await expect(page.getByTestId('passport-empty-state')).toContainText(
      'No prepared comparison yet',
    );

    const firstTrigger = page
      .getByTestId('passport-disclosures')
      .locator('[data-slot="collapsible-trigger"]')
      .first();
    await firstTrigger.focus();
    await page.keyboard.press('Space');
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'true');

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('populated TEST_ONLY dataset renders Physical profile, Why this match, Limits, Source evidence (HTTPS validation, no local_path download, Tab into open panel), and aborts stale loads cleanly', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    let requestNumber = 0;
    await page.route('**/data/locations_dataset.json', async (route) => {
      requestNumber += 1;
      if (requestNumber === 1) {
        // Delay the first request so clicking Reload aborts it via AbortController cleanly.
        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.fulfill({
          status: 404,
          body: 'Stale aborted response',
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_ONLY_POPULATED_DATASET),
      });
    });

    await page.goto('/?workspace=calibrated', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => requestNumber).toBe(1);
    // Trigger immediate reload while request #1 is pending to verify AbortController cancellation.
    await page.getByTestId('reload-dataset-btn').click();
    await expect(page.getByTestId('target-selector')).toBeEnabled();

    // Select the Earth analog in comparison so AnalogPassport shows Why this match & analog evidence.
    await page.getByTestId('target-selector').selectOption(JSON.stringify(['test_only_moon_site', 'lunar_south_pole_test_only', 'test_only_earth_site']));

    const triggers = page
      .getByTestId('passport-disclosures')
      .locator('[data-slot="collapsible-trigger"]');

    // 1. Physical profile
    await triggers.nth(0).click();
    const physicalPanel = page
      .getByTestId('passport-disclosures')
      .locator('[data-slot="collapsible-panel"]')
      .first();
    await expect(physicalPanel).toContainText('TEST_ONLY Shackleton Rim');
    await expect(physicalPanel).toContainText('TEST_ONLY McMurdo Dry Valleys');
    await expect(physicalPanel).toContainText('kWh/m²/day (mean daily)');
    await expect(physicalPanel).toContainText('Not applicable to airless lunar vacuum body');
    await expect(physicalPanel).toContainText('anorthositic_regolith');
    await expect(physicalPanel).not.toContainText('Walk Speed');
    await expect(physicalPanel).not.toContainText('Eye Height');

    // 2. Why this match
    await triggers.nth(1).click();
    const matchPanel = page
      .getByTestId('passport-disclosures')
      .locator('[data-slot="collapsible-panel"]')
      .nth(1);
    await expect(matchPanel).toContainText('Project-defined similarity index');
    await expect(matchPanel).toContainText('lunar_south_pole_test_only v1.0.0');
    await expect(matchPanel).toContainText('Active-profile coverage');
    await expect(matchPanel).toContainText('Normalized Euclidean squared distance contribution');

    // 3. Limits of this comparison
    await triggers.nth(2).click();
    const limitsPanel = page
      .getByTestId('passport-disclosures')
      .locator('[data-slot="collapsible-panel"]')
      .nth(2);
    await expect(limitsPanel).toContainText('test_only_excluded_site');
    await expect(limitsPanel).toContainText('aridity_index');
    await expect(limitsPanel).toContainText(
      'inferred or non-metric splat geometry is not a metric terrain measurement',
    );

    // 4. Source evidence + Tab into open panel focusable HTTPS link
    await triggers.nth(3).focus();
    await page.keyboard.press('Enter');
    await expect(triggers.nth(3)).toHaveAttribute('aria-expanded', 'true');

    const sourcePanel = page
      .getByTestId('passport-disclosures')
      .locator('[data-slot="collapsible-panel"]')
      .nth(3);
    await expect(sourcePanel).toContainText('Recorded checksum (sha256)');
    await expect(sourcePanel).toContainText('Product reference link withheld');
    // Relative local_path must never be rendered as a download link.
    await expect(sourcePanel.locator('a[href*="raw/test_only"]')).toHaveCount(0);

    // Tab enters the real opened panel link.
    await page.keyboard.press('Tab');
    const activeLinkHref = await page.evaluate(() => {
      const el = document.activeElement as HTMLAnchorElement | null;
      return el?.tagName === 'A' ? el.href : null;
    });
    expect(activeLinkHref).toBe('https://example.org/products/test-only-dem');
    expect(pageErrors).toEqual([]);
  });
});

test.describe('UI SDK Agent Harness & React 19 StrictMode Mount Lifecycle (TEST_ONLY Harness)', () => {
  let devServer: ViteDevServer | null = null;
  let harnessBaseUrl = '';

  test.beforeAll(async () => {
    devServer = await createServer({
      root: process.cwd(),
      server: {
        host: '127.0.0.1',
        port: 0,
        hmr: false,
      },
      logLevel: 'silent',
    });
    await devServer.listen();
    const addr = devServer.httpServer?.address() as AddressInfo | null;
    if (!addr) {
      throw new Error('Failed to bind ephemeral Vite dev server for agent harness test');
    }
    harnessBaseUrl = `http://127.0.0.1:${addr.port}`;
  });

  test.afterAll(async () => {
    if (devServer) {
      await devServer.close();
      devServer = null;
    }
  });

  test('createAgent snapshot exposes 4 expected disclosures and executes available action to update DOM state', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(`${harnessBaseUrl}/tests/agent-harness.html`);
    await expect(page.getByTestId('analog-passport')).toBeVisible();

    const snapshotEntries = await page.evaluate(() => {
      return window.__TEST_ONLY_AGENT__?.snapshot() ?? [];
    });

    const collapsibleEntries = snapshotEntries.filter((e) => e.component === 'collapsible');
    expect(collapsibleEntries.map((e) => e.label)).toEqual([...EXPECTED_DISCLOSURE_LABELS]);

    const targetEntry = collapsibleEntries.find((e) => e.label === 'Physical profile');
    expect(targetEntry).toBeDefined();

    // Execute toggle only if snapshot declares toggle; otherwise use the declared action (setOpen).
    const actionResult = await page.evaluate(async (entry) => {
      const agent = window.__TEST_ONLY_AGENT__;
      if (!agent) return { ok: false, errorMessage: 'Missing agent' };
      const chosenStep = entry.actions.includes('toggle')
        ? { ref: entry.label ?? entry.ref, action: 'toggle', args: [] }
        : { ref: entry.label ?? entry.ref, action: entry.actions[0] ?? 'setOpen', args: [true] };
      return await agent.act({ steps: [chosenStep] });
    }, targetEntry!);

    expect(actionResult.ok).toBe(true);

    const physicalTrigger = page
      .getByTestId('passport-disclosures')
      .locator('[data-slot="collapsible-trigger"]')
      .first();
    await expect(physicalTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByTestId('passport-disclosures').locator('[data-slot="collapsible-panel"]').first(),
    ).toContainText('No prepared comparison yet');

    // React 19 StrictMode unmount -> remount regression check.
    await page.getByTestId('harness-toggle-mount').click();
    await expect(page.getByTestId('analog-passport')).toHaveCount(0);
    await page.getByTestId('harness-toggle-mount').click();
    await expect(page.getByTestId('analog-passport')).toBeVisible();

    // Scoring profile ID mismatch check: refuses mismatched analytics honestly.
    await page.getByTestId('harness-toggle-mismatch').click();
    const triggers = page
      .getByTestId('passport-disclosures')
      .locator('[data-slot="collapsible-trigger"]');
    await triggers.nth(1).click();
    await expect(
      page.getByTestId('passport-disclosures').locator('[data-slot="collapsible-panel"]').first(),
    ).toContainText('scoring profile mismatch');

    expect(pageErrors).toEqual([]);
  });
});
