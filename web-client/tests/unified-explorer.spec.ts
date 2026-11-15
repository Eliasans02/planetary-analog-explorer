import { expect, test } from '@playwright/test';

const targetIds = ['moon-shackleton-lola-600m', 'mars-jezero-hirise-600m'];

test('compares measured grids interactively and links both planetary counterparts in one shell', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?workspace=earth');
  await expect(page.locator('.esg-status-verified')).toBeVisible();
  await page.screenshot({ path: 'outputs/unified-earth-desktop.png' });
  await page.getByRole('radio', { name: 'Compare', exact: true }).click();
  const header = (await page.locator('.es-header').elementHandle())!;
  for (const [index, targetId] of targetIds.entries()) {
    await page.locator('#eaf-target-select').selectOption(targetId);
    await expect(page.locator('.tc-canvas')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1);
    const canvas = (await page.locator('.tc-canvas').elementHandle())!;
    await expect(page.getByLabel('Shared elevation colour scale')).toContainText('Relative elevation');
    await expect(page.locator('.tc-canvas')).toHaveAttribute('data-contours', 'true');
    await page.getByRole('button', { name: 'Contours', exact: true }).click();
    await expect(page.locator('.tc-canvas')).toHaveAttribute('data-contours', 'false');
    await page.getByRole('button', { name: 'Contours', exact: true }).click();
    await page.getByRole('button', { name: 'Mesh', exact: true }).click();
    await expect(page.locator('.tc-canvas')).toHaveAttribute('data-mesh', 'true');
    await page.getByRole('button', { name: 'Mesh', exact: true }).click();
    const originalProfile = await page.locator('.tc-profile-earth').getAttribute('d');
    await page.getByRole('slider').fill('8');
    await expect(page.locator('.tc-profile-earth')).not.toHaveAttribute('d', originalProfile!);
    await page.getByRole('button', { name: 'Column', exact: true }).click();
    await expect(page.locator('.tc-chart')).toHaveAttribute('aria-label', /top to bottom/);
    await page.getByRole('button', { name: '3×', exact: true }).click();
    expect(await canvas.evaluate(el => el === document.querySelector('.tc-canvas'))).toBe(true);
    await page.locator('.tc-canvas').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('+');
    await page.keyboard.press('Home');
    await expect(page.getByRole('complementary', { name: 'Exploratory distance explanation' })).toContainText('Recomputed total');
    await page.getByRole('radio', { name: 'Survey', exact: true }).click();
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByRole('button', { name: 'View 3D target context', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Return to orbit', exact: true })).toBeVisible();
    await expect(page.locator('.es-header')).toHaveCount(1);
    expect(await header.evaluate(el => el === document.querySelector('.es-header'))).toBe(true);
    await page.getByRole('button', { name: 'Compare Earth counterpart', exact: true }).click();
    await expect(page.locator('#eaf-target-select')).toHaveValue(targetId);
    await expect(page.getByRole('radio', { name: 'Compare', exact: true })).toBeChecked();
    if (index === 1) {
      await page.locator('.es-compare-canvas').evaluate(el => el.scrollTo(0, 0));
      await page.screenshot({ path: 'outputs/unified-comparison-desktop.png' });
      await page.locator('.tc-profile-panel').scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'outputs/unified-profile-desktop.png' });
    }
  }
  expect(errors).toEqual([]);
});

test('keeps comparison and candidate sheets usable on small screens', async ({ page }) => {
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?workspace=earth');
    await expect(page.locator('.esg-status-verified')).toBeVisible();
    await page.getByRole('button', { name: 'Candidates', exact: true }).click();
    await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(12);
    await page.getByRole('listbox').getByRole('option').nth(1).click();
    if (width > 768) await page.getByRole('button', { name: 'Close candidates list', exact: true }).click();
    await page.getByRole('radio', { name: 'Compare', exact: true }).click();
    await expect(page.locator('.tc-canvas')).toBeVisible();
    await page.getByRole('slider').fill('10');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator('.es-compare-canvas').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (width === 320) {
      await page.locator('.es-compare-canvas').evaluate(el => el.scrollTo(0, 0));
      await page.screenshot({ path: 'outputs/unified-comparison-mobile.png' });
      await page.getByRole('radio', { name: 'Orbit', exact: true }).click();
      await expect(page.locator('.esg-status-verified')).toBeVisible();
      await page.screenshot({ path: 'outputs/unified-earth-mobile.png' });
    }
  }
});

test('remembers the outgoing destination when another world is selected through the drawer', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#px-site option')).toHaveCount(9);
  await page.locator('#px-site').selectOption('regional-moon-tycho');
  const previous = await page.locator('#px-site').inputValue();
  await page.getByRole('button', { name: 'Destinations', exact: true }).click();
  await page.getByRole('button', { name: 'Mars', exact: true }).click();
  await page.locator('.px-dest-select').first().click();
  await page.getByRole('button', { name: 'Close destinations', exact: true }).click();
  await expect(page.getByRole('radio', { name: '02 Mars', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: '01 Moon', exact: true }).click();
  await expect(page.locator('#px-site')).toHaveValue(previous);
  await page.getByRole('button', { name: 'Explore verified site', exact: true }).click();
  await expect(page.locator('.surface-viewport-help')).toContainText('Orbit only');
  await page.getByRole('radio', { name: '00 Earth', exact: true }).click();
  await expect(page.locator('.esg-status-verified')).toBeVisible();
  await page.getByRole('radio', { name: '01 Moon', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Return to orbit', exact: true })).toBeVisible();
  await expect(page.locator('.px-context-label')).toContainText('Tycho');
});
