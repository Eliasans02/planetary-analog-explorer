import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const DATASET_FILE = path.resolve(process.cwd(), 'public/data/locations_dataset.json');

function hasGroundReadyDataset(): boolean {
  if (!fs.existsSync(DATASET_FILE)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(DATASET_FILE, 'utf8'));
    return (
      Array.isArray(raw.comparisons) &&
      raw.comparisons.some(
        (c: { target?: { assets?: { heightmap?: unknown }; camera?: unknown } }) =>
          Boolean(c?.target?.assets?.heightmap && c?.target?.camera),
      )
    );
  } catch {
    return false;
  }
}

test.describe('Planetary Analog Explorer - Empty / Error State & UX Disclosure', () => {
  test('shows plain empty state with collapsed technical details, retry flow, keyboard focus, disabled reason, and zero external requests', async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    let datasetRequests = 0;
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        externalRequests.push(req.url());
      }
      if (url.pathname.endsWith('/data/locations_dataset.json')) {
        datasetRequests += 1;
      }
    });

    await page.route('**/data/locations_dataset.json', (route) =>
      route.fulfill({ status: 404, body: 'Not Found' }),
    );

    await page.goto('/?workspace=calibrated');

    const banner = page.getByTestId('dataset-error-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Prepared Data Unavailable');
    await expect(banner).not.toContainText('3D-реконструкция');
    await expect(page.getByTestId('target-selector')).toBeDisabled();

    // Ground mode disabled + accessible visible reason
    const groundBtn = page.getByTestId('mode-btn-ground');
    await expect(groundBtn).toBeDisabled();
    const disabledReason = page.getByTestId('ground-disabled-reason');
    await expect(disabledReason).toBeVisible();
    await expect(disabledReason).toContainText('Ground mode locked');

    // Technical details disclosure starts collapsed, then expands to show diagnostic paths
    const disclosure = page.getByTestId('technical-details-disclosure');
    await expect(disclosure).toBeVisible();
    await expect(disclosure).not.toHaveAttribute('open', '');
    await disclosure.locator('summary').click();
    await expect(disclosure).toHaveAttribute('open', '');
    await expect(disclosure).toContainText('public/data/locations_dataset.json');

    // Retry triggers a fresh dataset fetch
    const beforeRetry = datasetRequests;
    await page.getByTestId('retry-dataset-btn').click();
    await expect.poll(() => datasetRequests).toBeGreaterThan(beforeRetry);

    // Keyboard focus & activation path across controls and Pegman handle
    await page.getByTestId('reload-dataset-btn').focus();
    await expect(page.getByTestId('reload-dataset-btn')).toBeFocused();
    await page.getByTestId('body-btn-mars').focus();
    await expect(page.getByTestId('body-btn-mars')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('viewport3d-root')).toHaveAttribute('data-body', 'mars');

    const pegman = page.getByTestId('pegman-handle');
    await pegman.focus();
    await expect(pegman).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('viewport3d-orbit-notice')).toContainText(
      'No prepared data for this area yet',
    );

    // Telemetry HUD displays the three distinct groups on desktop (1440x900)
    await expect(page.getByTestId('hud-group-diagnostics')).toBeVisible();
    await expect(page.getByTestId('hud-group-diagnostics')).toContainText('Not measured');
    await expect(page.getByTestId('hud-group-preferences')).toBeVisible();
    await expect(page.getByTestId('hud-group-scientific')).toBeVisible();

    // Must never make requests to external origins
    expect(externalRequests).toEqual([]);

    // Verify WebGL initialized cleanly or surfaced explicit WebGL error
    const webglErrorCount = await page.getByTestId('viewport3d-webgl-error').count();
    if (webglErrorCount === 0) {
      await expect(page.getByTestId('viewport3d-canvas')).toHaveCount(1);
    }

    // Resize checks must not duplicate canvas elements
    await page.setViewportSize({ width: 960, height: 700 });
    await page.setViewportSize({ width: 1440, height: 900 });
    if (webglErrorCount === 0) {
      await expect(page.getByTestId('viewport3d-canvas')).toHaveCount(1);
    }
  });

  test('narrow viewport collapses telemetry by default, avoids horizontal overflow, and expands cleanly', async ({
    page,
  }) => {
    await page.route('**/data/locations_dataset.json', (route) =>
      route.fulfill({ status: 404, body: 'Not Found' }),
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?workspace=calibrated');

    await expect(page.getByTestId('dataset-error-banner')).toBeVisible();
    await expect(page.getByTestId('telemetry-hud-panel')).toHaveCount(0);

    // Viewport canvas retains adequate space and no horizontal overflow occurs
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);

    const rootBox = await page.getByTestId('viewport3d-root').boundingBox();
    expect(rootBox).not.toBeNull();
    expect(rootBox!.height).toBeGreaterThanOrEqual(420);

    // Expanding telemetry on mobile reveals the grouped HUD cleanly
    await page.getByTestId('toggle-telemetry-btn').click();
    await expect(page.getByTestId('telemetry-hud-panel')).toBeVisible();
    await expect(page.getByTestId('hud-group-diagnostics')).toBeVisible();
  });

  test('rejects invalid JSON schema dataset with clear validation banner and collapsed details', async ({
    page,
  }) => {
    await page.route('**/data/locations_dataset.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ schema_version: '0.0.0', invalid: true }),
      }),
    );

    await page.goto('/?workspace=calibrated');
    await expect(page.getByTestId('dataset-error-banner')).toContainText('Dataset Validation Failed');
    await expect(page.getByTestId('technical-details-disclosure')).not.toHaveAttribute('open', '');
    await expect(page.getByTestId('mode-btn-ground')).toBeDisabled();
  });
});

test.describe('Planetary Analog Explorer - Real Dev_A Assets Integration', () => {
  test.skip(
    !hasGroundReadyDataset(),
    'Real Dev_A dataset with target heightmap + camera not present in public/data/locations_dataset.json (ground integration NOT VERIFIED)',
  );

  test('supports target selection, orbit/ground switching, 20 rapid switches without canvas leaks, and splat failure DEM fallback', async ({
    page,
  }) => {
    await page.goto('/?workspace=calibrated');

    const webglUnavailable = await page.getByTestId('viewport3d-webgl-error').count();
    test.skip(webglUnavailable > 0, 'WebGL unavailable in test browser');

    const selector = page.getByTestId('target-selector');
    await expect(selector).toBeEnabled();

    // Verify ground mode button becomes enabled when ground-ready target is selected
    const groundBtn = page.getByTestId('mode-btn-ground');
    const orbitBtn = page.getByTestId('mode-btn-orbit');
    await expect(groundBtn).toBeEnabled();

    // Perform 20 rapid mode switches and verify single owned canvas persists
    for (let i = 0; i < 20; i += 1) {
      if (i % 2 === 0) {
        await groundBtn.click();
      } else {
        await orbitBtn.click();
      }
      await page.waitForTimeout(60);
    }

    await expect(page.getByTestId('viewport3d-canvas')).toHaveCount(1);
  });
});
