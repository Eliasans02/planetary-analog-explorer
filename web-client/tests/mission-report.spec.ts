import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('guides both missions from planetary terrain to Earth evidence and a downloadable PDF', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  for (const [body, name, target] of [['moon', 'Shackleton rim', 'moon-shackleton-lola-600m'], ['mars', 'Jezero crater', 'mars-jezero-hirise-600m']]) {
    await page.getByRole('button', { name: 'Start guided mission', exact: true }).click();
    const mission = page.getByRole('region', { name: 'Guided mission', exact: true });
    await mission.getByRole('button', { name: new RegExp(name) }).click();
    await expect(mission.getByRole('heading')).toHaveText(`Begin at ${name}`);
    await mission.getByRole('button', { name: 'Continue mission', exact: true }).click();
    await expect(page.locator('.surface-viewport-help')).toBeVisible();
    await mission.getByRole('button', { name: 'Continue mission', exact: true }).click();
    await expect(page.locator('.esg-status-verified')).toBeVisible();
    await expect(page.locator('#eaf-target-select')).toHaveValue(target);
    await mission.getByRole('button', { name: 'Continue mission', exact: true }).click();
    await expect(page.locator('.tc-canvas')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1);
    await mission.getByRole('button', { name: 'Open evidence & report', exact: true }).click();
    await expect(mission).toHaveCount(0);
    const grids = page.getByRole('grid');
    await expect(grids).toHaveCount(2);
    expect(await grids.first().locator('[tabindex="0"]').count()).toBe(1);
    const first = grids.first().getByRole('gridcell').first();
    await first.focus(); await page.keyboard.press('ArrowRight');
    await expect(grids.first().getByRole('gridcell').nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(grids.first().getByRole('gridcell').nth(11)).toBeFocused();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF report', exact: true }).click();
    const pdf = await download;
    expect(pdf.suggestedFilename()).toContain(target);
    await pdf.saveAs(`outputs/research-report-${body}.pdf`);
    const bytes = await readFile((await pdf.path())!);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(8000);
    await page.getByRole('button', { name: 'Close candidate details', exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test('keeps mission controls inside a narrow screen and supports Escape', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start guided mission', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Guided mission' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Guided mission' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start guided mission', exact: true })).toBeFocused();
});
