import { expect, test } from '@playwright/test';

test('loads optional workspaces on demand and keeps the initial JavaScript within budget', async ({ page }) => {
  const scripts: string[] = [];
  const errors: string[] = [];
  page.on('request', request => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.globe-map-status')).toContainText('Showing Moon 2K');
  expect(scripts.some(url => /SimilarityWorkspace-|SurfaceExplorer-|EarthStage-/.test(url))).toBe(false);
  const initialBytes = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => new URL(entry.name).pathname.endsWith('.js'))
    .reduce((total, entry) => total + (entry as PerformanceResourceTiming).decodedBodySize, 0));
  expect(initialBytes).toBeGreaterThan(0);
  expect(initialBytes).toBeLessThan(1_050_000);

  await page.getByRole('button', { name: 'Surface archive', exact: true }).click();
  await expect(page.locator('.sx-status')).toContainText('Source assets verified');
  expect(scripts.some(url => /SurfaceExplorer-/.test(url))).toBe(true);
  expect(scripts.some(url => /SimilarityWorkspace-/.test(url))).toBe(false);
  await page.getByRole('button', { name: 'Earth', exact: true }).click();
  await expect(page.locator('.sa-context').first()).toContainText('Hawai');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Find Earth analogs', exact: true }).click();
  await expect(page.locator('.es-stage')).toBeVisible();
  expect(scripts.some(url => /EarthStage-/.test(url))).toBe(true);
  expect(scripts.some(url => /SimilarityWorkspace-/.test(url))).toBe(false);
  await page.getByRole('radio', { name: '01 Moon', exact: true }).click();
  await expect(page.locator('.globe-map-status')).toContainText('Showing Moon 2K');
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('keeps the return action usable when an optional workspace fails to load', async ({ page }) => {
  await page.route('**/EarthStage-*.js', route => route.abort());
  await page.goto('/');
  await page.getByRole('radio', { name: '00 Earth', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This world could not be opened');
  await page.getByRole('radio', { name: '01 Moon', exact: true }).click();
  await expect(page.locator('.globe-map-status')).toContainText('Showing Moon 2K');
});

test('opens all six verified terrain sites and preserves working split and walking controls', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.globe-map-status')).toContainText('Showing Moon 2K');
  await page.getByRole('button', { name: /Side by side/ }).click();
  await expect(page.locator('canvas')).toHaveCount(2);
  await expect(page.locator('.globe-map-status').last()).toContainText('Showing Mars Native');
  await page.getByRole('button', { name: /Side by side/ }).click();

  for (const body of ['01 Moon', '02 Mars']) {
    await page.getByRole('radio', { name: body, exact: true }).click();
    const ids = await page.locator('#px-site option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(id => !id.startsWith('regional-')));
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      await page.locator('#px-site').selectOption(id);
      await page.getByRole('button', { name: 'Explore verified site', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Start exploration', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Terrain analysis', exact: true }).click();
      await expect(page.locator('.sa-metrics')).toBeVisible();
      await page.getByRole('button', { name: 'Close terrain analysis', exact: true }).click();
      await expect(page.locator('canvas')).toHaveCount(1);
      await page.getByRole('button', { name: 'Relief shading', exact: true }).click();
      await expect(page.locator('.surface-image-status')).toContainText('Relief shading');
      await page.getByRole('button', { name: 'Start exploration', exact: true }).click();
      const position = page.getByLabel('Native navigation position');
      const before = await position.innerText();
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(250);
      await page.keyboard.up('KeyW');
      await expect(position).not.toHaveText(before);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Resume exploration', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Return to orbit', exact: true }).click();
      await expect(page.locator('.globe-map-status')).toContainText('verified map');
      await expect(page.locator('canvas')).toHaveCount(1);
    }
  }
  expect(errors).toEqual([]);
});

test('opens all fourteen regional landscapes with verified analysis and orbit-only navigation', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  for (const [body, totalCount, regionalCount] of [['01 Moon', 9, 6], ['02 Mars', 11, 8]] as const) {
    await page.getByRole('radio', { name: body, exact: true }).click();
    await expect(page.locator('.px-panel-label')).toContainText(`${String(totalCount).padStart(2, '0')} VERIFIED SITES`);
    await expect(page.locator('#px-site option')).toHaveCount(totalCount);
    const ids = await page.locator('#px-site option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(id => id.startsWith('regional-')));
    expect(ids).toHaveLength(regionalCount);
    for (const id of ids) {
      await page.locator('#px-site').selectOption(id);
      await page.getByRole('button', { name: 'Explore verified site', exact: true }).click();
      await expect(page.locator('.surface-viewport-help')).toContainText('Orbit only');
      await expect(page.getByRole('button', { name: /Enter first person|Start exploration/ })).toHaveCount(0);
      await expect(page.locator('canvas')).toHaveCount(1);
      await page.getByRole('button', { name: 'Terrain analysis', exact: true }).click();
      await expect(page.locator('.sa-metrics')).toBeVisible();
      await expect(page.locator('.sa-metrics')).not.toContainText('Unavailable');
      await page.getByRole('button', { name: 'Close terrain analysis', exact: true }).click();
      await page.getByRole('button', { name: 'Sources', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('orbital inspection mode only');
      await expect(page.getByRole('dialog').locator('a[href^="https://"]').first()).toBeVisible();
      await page.getByRole('button', { name: 'Close source details', exact: true }).click();
      await page.getByRole('button', { name: 'Return to orbit', exact: true }).click();
      await expect(page.locator('.globe-map-status')).toContainText('verified map');
    }
  }
  expect(errors).toEqual([]);
});

test('keeps the atlas and place search usable across narrow and wide viewports', async ({ page }) => {
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.globe-map-status')).toContainText('Showing Moon 2K');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const canvas = await page.locator('canvas').boundingBox();
    expect(canvas?.height).toBeGreaterThan(500);
    const places = page.getByRole('button', { name: 'Destinations', exact: true });
    await places.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('searchbox', { name: 'Filter prepared terrain destinations' }).fill('Tycho');
    await expect(page.locator('.px-dest-list li')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toContainText('Tycho');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(places).toBeFocused();
  }

  await page.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const result = matchMedia(query);
      if (query === '(pointer: coarse)') {
        Object.defineProperty(result, 'matches', { value: true });
      }
      return result;
    };
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore verified site', exact: true }).click();
  await expect(page.locator('.surface-viewport-help')).toContainText('Touch orbit · walking requires a keyboard');
  await expect(page.getByRole('button', { name: 'Start exploration', exact: true })).toHaveCount(0);
});
