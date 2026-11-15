import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Recorded NASA tile for deterministic loading/lifecycle checks; visual QA uses live tiles.
const nasaTile = readFileSync(new URL('../../evidence/earth_context/gibs-7-20-104.jpeg', import.meta.url));
const tilePattern = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/**';

async function openEarthGlobe(page: Page) {
  await page.goto('/?workspace=earth');
  await expect(page.locator('.esg-status-verified')).toHaveText('Global image verified');
}
const mode = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });

test('loads Earth on demand, remembers camera and selection, idles and releases WebGL', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route(tilePattern, route => route.fulfill({ body: nasaTile, contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.addInitScript(() => {
    (window as any).earthDraws = 0;
    for (const Constructor of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const original = Constructor.prototype.drawElements;
      Constructor.prototype.drawElements = function (...args) {
        (window as any).earthDraws++;
        return original.apply(this, args);
      };
    }
  });
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.globe-map-status')).toContainText('Showing Moon 2K');
  expect(requests.some(url => /EarthStage-|EarthSurveyGlobe-|earth-context|earth_discovery/.test(url))).toBe(false);
  const header = (await page.locator('.es-header').elementHandle())!;
  await mode(page, '00 Earth').click();
  await expect(page.locator('.esg-status-verified')).toBeVisible();
  expect(requests.filter(url => url.endsWith('/earth-context/blue-marble-2048.jpg'))).toHaveLength(1);
  expect(await header.evaluate(el => el === document.querySelector('.es-header'))).toBe(true);
  const canvas = page.locator('.esg-canvas-host canvas');
  const originalCanvas = (await canvas.elementHandle())!;
  const readDraws = () => page.evaluate(() => (window as any).earthDraws as number);
  const before = await readDraws();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(readDraws).toBeGreaterThan(before);
  await canvas.focus();
  const beforeKey = await readDraws();
  await page.keyboard.press('ArrowRight');
  await expect.poll(readDraws).toBeGreaterThan(beforeKey);
  await page.locator('#eaf-target-select').selectOption('mars-jezero-hirise-600m');
  await page.getByRole('button', { name: 'Candidates', exact: true }).click();
  await page.getByRole('listbox').getByRole('option').nth(1).click();
  const selected = await page.locator('.es-cand-meta').textContent();
  const savedView = JSON.parse((await canvas.getAttribute('data-view'))!);
  expect(await originalCanvas.evaluate(el => el === document.querySelector('.esg-canvas-host canvas'))).toBe(true);
  await page.waitForTimeout(200);
  await expect(page.locator('.esg-imagery-status')).not.toHaveAttribute('data-status', 'loading');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const idle = await readDraws();
  await page.waitForTimeout(400);
  expect(await readDraws()).toBe(idle);
  await mode(page, '02 Mars').click();
  await expect(page.locator('.globe-map-status')).toContainText('Showing Mars Native');
  await expect.poll(() => originalCanvas.evaluate(el => ((el as HTMLCanvasElement).getContext('webgl2') || (el as HTMLCanvasElement).getContext('webgl'))!.isContextLost())).toBe(true);
  await mode(page, '00 Earth').click();
  await expect(page.locator('.esg-status-verified')).toBeVisible();
  await expect(page.locator('.es-cand-meta')).toHaveText(selected!);
  const restored = JSON.parse((await canvas.getAttribute('data-view'))!);
  expect(restored.azimuth).toBeCloseTo(savedView.azimuth, 6);
  expect(restored.polar).toBeCloseTo(savedView.polar, 6);
  expect(restored.distance).toBeCloseTo(savedView.distance, 6);
  await page.getByRole('button', { name: 'Close candidates list', exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await mode(page, 'Survey').click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('.eaf-map-cell')).toHaveCount(1600);
    await mode(page, 'Orbit').click();
    await expect(page.locator('.esg-status-verified')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1);
  }
  // Search starts at the globe center, so the real cluster can be selected directly.
  await page.getByRole('button', { name: 'Global view', exact: true }).click();
  await page.waitForTimeout(800);
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(mode(page, 'Survey')).toBeChecked();
  expect(errors).toEqual([]);
});

test('keeps globe and survey controls usable at mobile, tablet, and desktop sizes', async ({ page }) => {
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await openEarthGlobe(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await page.locator('.esg-stage').boundingBox())!.height).toBeGreaterThan(700);
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await page.getByRole('button', { name: 'Global view', exact: true }).click();
    await mode(page, 'Survey').click();
    await page.getByRole('button', { name: 'Focus selected window', exact: true }).click();
    await expect(page.locator('.eaf-map-svg')).not.toHaveAttribute('viewBox', '0 0 600 450');
    await page.getByRole('button', { name: 'Reset survey view', exact: true }).click();
    await expect(page.locator('.eaf-map-svg')).toHaveAttribute('viewBox', '0 0 600 450');
  }
});

test('rejects a changed NASA texture and preserves the survey fallback', async ({ page, request }) => {
  const bytes = Buffer.from(await (await request.get('/assets/earth-context/blue-marble-2048.jpg')).body());
  bytes[100] ^= 1;
  await page.route('**/earth-context/blue-marble-2048.jpg', route => route.fulfill({ body: bytes, contentType: 'image/jpeg' }));
  await page.goto('/?workspace=earth');
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await expect(page.locator('.esg-status-verified')).toHaveCount(0);
  await mode(page, 'Survey').click();
  await expect(page.locator('.eaf-map-cell')).toHaveCount(1600);
  await page.unroute('**/earth-context/blue-marble-2048.jpg');
  await mode(page, 'Orbit').click();
  await expect(page.locator('.esg-status-verified')).toBeVisible();
});

test('recovers from WebGL loss and missing globe code without losing the map', async ({ page }) => {
  await openEarthGlobe(page);
  await page.locator('.esg-canvas-host canvas').evaluate(canvas => {
    ((canvas as HTMLCanvasElement).getContext('webgl2') || (canvas as HTMLCanvasElement).getContext('webgl'))!.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(page.getByRole('alert')).toContainText('context was interrupted');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.esg-status-verified')).toBeVisible();
  await page.route('**/EarthSurveyGlobe-*.js', route => route.abort());
  await page.goto('/?workspace=earth');
  await expect(page.getByRole('alert')).toContainText('could not be opened');
  await page.getByRole('button', { name: 'Return to survey map', exact: true }).click();
  await expect(page.locator('.eaf-map-cell')).toHaveCount(1600);
});

test('upgrades Earth imagery on approach and keeps the same interactive canvas', async ({ page }) => {
  const tileRequests: string[] = [];
  await page.route(tilePattern, route => {
    tileRequests.push(route.request().url());
    return route.fulfill({ body: nasaTile, contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await openEarthGlobe(page);
  const canvas = page.locator('.esg-canvas-host canvas');
  const original = (await canvas.elementHandle())!;
  await expect(canvas).toHaveAttribute('data-base-resolution', '5400');
  expect(tileRequests).toHaveLength(0);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('.esg-imagery-status')).toHaveAttribute('data-status', 'detail');
  await expect(canvas).toHaveAttribute('data-imagery-level', '7');
  expect(Number(await canvas.getAttribute('data-imagery-tiles'))).toBeGreaterThan(0);
  expect(Number(await canvas.getAttribute('data-imagery-tiles'))).toBeLessThanOrEqual(48);
  expect(await original.evaluate(el => el === document.querySelector('.esg-canvas-host canvas'))).toBe(true);
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.esg-imagery-status')).toHaveAttribute('data-status', 'detail');
  await page.getByRole('button', { name: 'Global view', exact: true }).click();
  await expect(page.locator('.esg-imagery-status')).toHaveAttribute('data-status', 'overview');
  await expect(canvas).toHaveAttribute('data-imagery-tiles', '0');
});

test('retains the sharp global image during tile failures and retries regional imagery', async ({ page }) => {
  let unavailable = true;
  await page.route(tilePattern, route => unavailable ? route.abort() : route.fulfill({ body: nasaTile, contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await openEarthGlobe(page);
  const canvas = page.locator('.esg-canvas-host canvas');
  await expect(canvas).toHaveAttribute('data-base-resolution', '5400');
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('.esg-imagery-status')).toHaveAttribute('data-status', 'fallback');
  await expect(canvas).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: 'Retry imagery', exact: true }).click();
  await expect(page.locator('.esg-imagery-status')).toHaveAttribute('data-status', 'detail');
  await page.getByRole('radio', { name: 'Survey', exact: true }).click();
  await expect(page.locator('.eaf-map-cell')).toHaveCount(1600);
});
