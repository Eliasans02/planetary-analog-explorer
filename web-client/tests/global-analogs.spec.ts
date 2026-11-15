import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const ids = ['atacama', 'rio-tinto', 'haughton', 'hawaii', 'lanzarote', 'pilbara', 'dry-valleys'];

test('opens seven measured regional surveys, source briefs and shared terrain comparisons', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?workspace=earth');
  await expect(page.locator('#earth-region option')).toHaveCount(8);
  for (const id of ids) {
    await page.locator('#earth-region').selectOption(id);
    await expect(page.locator('#earth-region')).toHaveValue(id);
    await expect(page.locator('canvas[data-research-pins="7"]')).toBeVisible();
    await expect(page.locator('.esg-status-verified')).toBeVisible();
    await expect(page.locator('#eaf-target-select option')).toHaveCount(['haughton', 'lanzarote'].includes(id) ? 2 : 1);
    await page.getByRole('button', { name: 'Research brief', exact: true }).click();
    const brief = page.getByRole('dialog', { name: 'Published research brief' });
    await expect(brief).toBeVisible();
    await expect(brief.locator('.research-paper')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(brief).not.toBeVisible();
    await page.getByRole('radio', { name: 'Compare', exact: true }).click();
    await expect(page.locator('.tc-canvas')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByRole('radio', { name: 'Orbit', exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test('runs a paper-backed expedition and exports its research appendix', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start guided mission', exact: true }).click();
  await expect(page.locator('#mission-region option')).toHaveCount(8);
  await page.locator('#mission-region').selectOption('rio-tinto');
  const mission = page.getByRole('region', { name: 'Guided mission', exact: true });
  await mission.getByRole('button', { name: /Jezero crater/ }).click();
  await mission.getByRole('button', { name: 'Continue mission', exact: true }).click();
  await mission.getByRole('button', { name: 'Continue mission', exact: true }).click();
  await expect(mission.getByRole('heading')).toHaveText('Arrive in Spain');
  await mission.getByRole('button', { name: 'Biomarkers and abiotic conditions varied over short distances' }).click();
  await expect(mission.getByRole('status')).toContainText('Evidence supported');
  await mission.getByRole('button', { name: 'Continue mission', exact: true }).click();
  await mission.getByRole('button', { name: 'Open evidence & report', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF report', exact: true }).click();
  const pdf = await download;
  await pdf.saveAs('outputs/rio-tinto-research-report.pdf');
  const text = (await readFile((await pdf.path())!)).toString('latin1');
  expect(text).toContain('10.1089/ast.2019.2101');
  expect(text.includes('PUBLISHED RESEARCH')).toBe(true);
});

test('keeps regional mission controls usable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/?workspace=earth');
  await expect(page.locator('#earth-region option')).toHaveCount(8);
  await page.locator('#earth-region').selectOption('atacama');
  await expect(page.getByRole('button', { name: 'Global view', exact: true })).toBeVisible();
  const regionBox = await page.locator('.research-control').boundingBox();
  const cameraBox = await page.locator('.esg-toolbar').boundingBox();
  expect(cameraBox!.y).toBeGreaterThanOrEqual(regionBox!.y + regionBox!.height);
  await page.getByRole('button', { name: 'Research brief', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Published research brief' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start guided mission', exact: true }).click();
  await page.getByRole('region', { name: 'Guided mission' }).getByRole('button', { name: /Jezero crater/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('offers recovery when the worldwide catalog or a regional survey fails', async ({ page }) => {
  await page.route('**/data/global_analogs.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/?workspace=earth');
  await expect(page.getByRole('button', { name: 'Retry worldwide expeditions' })).toBeVisible();
  await page.unroute('**/data/global_analogs.json');
  await page.getByRole('button', { name: 'Retry worldwide expeditions' }).click();
  await expect(page.locator('#earth-region option')).toHaveCount(8);
  await page.route('**/data/earth-regions/atacama.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.locator('#earth-region').selectOption('atacama');
  await page.getByRole('button', { name: 'Return to Ustyurt survey' }).click();
  await expect(page.locator('#earth-region')).toHaveValue('ustyurt');
  await expect(page.locator('.esg-status-verified')).toBeVisible();
});
