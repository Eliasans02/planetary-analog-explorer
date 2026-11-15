import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { EarthDiscovery } from '@shared/types/earth-discovery';

async function openFinder(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: /Earth$/, exact: true }).click();
  await expect(page.locator('.es-stage')).toBeVisible();
  await page.getByRole('radio', { name: 'Survey', exact: true }).click();
}

test('identifies real Earth candidates for both worlds and exports the selected evidence', async ({ page, request }) => {
  const data = await (await request.get('/data/earth_discovery.json')).json() as EarthDiscovery;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openFinder(page);
  const representedWindowKm = await page.locator('.eaf-map-scale').evaluate(scale => {
    const points = document.querySelector<SVGPolygonElement>('.eaf-map-cell')!.points;
    const edge = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    const length = Number(scale.querySelector('line')!.getAttribute('x2'));
    const km = parseFloat(scale.querySelector('text')!.textContent!);
    return edge / length * km;
  });
  expect(representedWindowKm).toBeGreaterThan(0.59);
  expect(representedWindowKm).toBeLessThan(0.61);
  await page.getByRole('button', { name: 'Candidates', exact: true }).click();
  const list = page.getByRole('listbox', { name: 'Ranked Earth windows' });
  const detail = page.getByRole('region', { name: 'Selected candidate comparison' });
  for (const body of ['moon', 'mars']) {
    const target = data.targets.find(item => item.body === body)!;
    await page.locator('#eaf-target-select').selectOption(target.id);
    const shortlisted = data.candidates.filter(item => item.comparisons[target.id].shortlisted);
    await expect(list.getByRole('option')).toHaveCount(shortlisted.length);
    const chosen = [...shortlisted].sort((a, b) => a.comparisons[target.id].rank - b.comparisons[target.id].rank)[1];
    await list.getByRole('option').filter({ hasText: chosen.id }).click();
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(detail.getByRole('heading', { level: 2 })).toHaveText(chosen.name);
    await expect(detail).toContainText('Exploratory topographic distance');
    expect((await page.locator('.eaf-kpi-grid').boundingBox())!.height).toBeGreaterThan(150);
    await expect(detail).toContainText(chosen.latitude.toFixed(5));
    await expect(detail).toContainText('not');

    const geoEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'GeoJSON', exact: true }).click();
    const geoDownload = await geoEvent;
    const geo = JSON.parse(await readFile((await geoDownload.path())!, 'utf8'));
    expect(geo.features[0].properties.candidate_id).toBe(chosen.id);
    expect(geo.features[0].geometry.coordinates[0]).toEqual(chosen.footprint);

    const evidenceEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Evidence JSON', exact: true }).click();
    const download = await evidenceEvent;
    const evidence = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(evidence.target.id).toBe(target.id);
    expect(evidence.candidate.id).toBe(chosen.id);
    expect(evidence.candidate.comparison_for_selected_target.distance).toBe(chosen.comparisons[target.id].distance);
    expect(evidence.sources.map((source: { id: string }) => source.id)).toEqual(expect.arrayContaining(target.source_ids));
    expect(evidence.method.grid_spacing_m).toBe(60);
    await page.getByRole('button', { name: 'Close candidate details', exact: true }).click();
    await page.getByRole('button', { name: 'Candidates', exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test('searches the whole cohort, paginates, and keeps target terrain navigation working', async ({ page, request }) => {
  const data = await (await request.get('/data/earth_discovery.json')).json() as EarthDiscovery;
  await openFinder(page);
  await page.getByRole('button', { name: 'Candidates', exact: true }).click();
  await page.getByRole('button', { name: /^All \(/ }).click();
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(20);
  await page.getByRole('button', { name: 'Next candidate page', exact: true }).click();
  await expect(page.locator('.eaf-pagination')).toContainText('Page 2');
  const selected = data.candidates.at(-1)!;
  await page.getByRole('searchbox', { name: 'Search candidates by ID or name' }).fill(selected.id);
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await page.getByRole('listbox').getByRole('option').click();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Selected candidate comparison' })).toContainText(selected.id);
  await page.getByRole('button', { name: 'View 3D target context', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Return to orbit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start exploration', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return to orbit', exact: true }).click();
  await expect(page.locator('.globe-map-status')).toContainText('verified map');
});

test('supports narrow screens and restores focus when provenance closes', async ({ page }) => {
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await openFinder(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const method = page.getByRole('button', { name: 'Open method and provenance', exact: true });
    await method.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Copernicus');
    await page.keyboard.press('Escape');
    await expect(method).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('fails closed on a corrupted distance and recovers from a network error', async ({ page, request }) => {
  const data = await (await request.get('/data/earth_discovery.json')).json() as EarthDiscovery;
  data.candidates[0].comparisons[data.targets[0].id].distance = 0.999999;
  await page.route('**/data/earth_discovery.json', route => route.fulfill({ json: data }));
  await page.goto('/');
  await page.getByRole('radio', { name: /Earth$/, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('distance does not match');
  await page.unroute('**/data/earth_discovery.json');
  await page.getByRole('button', { name: 'Retry Earth survey', exact: true }).click();
  await expect(page.locator('.es-stage')).toBeVisible();
  await page.route('**/data/earth_discovery.json', route => route.abort());
  await page.goto('/');
  await page.getByRole('radio', { name: /Earth$/, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('unavailable');
});
