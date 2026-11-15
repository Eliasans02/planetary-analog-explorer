import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const { values } = parseArgs({ options: {
  url: { type: 'string', default: 'http://127.0.0.1:4173/' },
  output: { type: 'string', default: 'test-results/performance.json' },
  headed: { type: 'boolean', default: false },
  seconds: { type: 'string', default: '3' },
  repeats: { type: 'string', default: '3' },
} });
const seconds = Number(values.seconds), repeats = Number(values.repeats);
const url = new URL(values.url);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) {
  throw new Error('Measure a local preview server.');
}
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 30 || !Number.isInteger(repeats) || repeats < 1 || repeats > 5) {
  throw new Error('Use --seconds between 1 and 30 and --repeats between 1 and 5.');
}

function installProbe() {
  let sample = null, frameTime = 0;
  const renderers = new Map();
  const requestFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => requestFrame(time => {
    frameTime = time;
    callback(time);
  });
  for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const draw = prototype[method];
      if (typeof draw !== 'function') continue;
      prototype[method] = function (...args) {
        if (!renderers.has(this)) {
          const extension = this.getExtension('WEBGL_debug_renderer_info');
          renderers.set(this, extension ? this.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'Unavailable');
        }
        if (sample) { sample.frames.add(frameTime); sample.drawCalls++; }
        return draw.apply(this, args);
      };
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (sample && document.visibilityState !== 'visible') sample.hidden = true;
  });
  window.explorerProbe = {
    start() {
      sample = { start: performance.now(), frames: new Set(), drawCalls: 0, hidden: document.visibilityState !== 'visible' };
    },
    stop() {
      const elapsedMs = performance.now() - sample.start;
      const frames = [...sample.frames].sort((a, b) => a - b);
      const intervals = frames.slice(1).map((time, index) => time - frames[index]).sort((a, b) => a - b);
      const result = {
        elapsedMs, renderSubmissionFrames: frames.length,
        renderSubmissionFps: frames.length * 1000 / elapsedMs,
        p95SubmissionIntervalMs: intervals.length ? intervals[Math.ceil(intervals.length * .95) - 1] : null,
        drawCalls: sample.drawCalls, hidden: sample.hidden,
        pointerLocked: document.pointerLockElement !== null,
        renderers: [...new Set(renderers.values())],
      };
      sample = null;
      return result;
    },
  };
}

const browser = await chromium.launch({ headless: !values.headed, channel: process.env.PLAYWRIGHT_CHANNEL });
const report = {
  measuredAt: new Date().toISOString(), url: url.href, browser: browser.version(),
  headed: values.headed, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
  seconds, repeats, runs: [],
  limits: [
    'Counts WebGL draw submissions grouped by animation-frame timestamp, not GPU completion or displayed frames.',
    'Globe views render on demand; zero idle submissions is expected. Split-view frames count once across both canvases.',
    'JS heap is measured through Chrome DevTools, not process RAM, GPU memory or total browser memory.',
    'Local synthetic run with instrumentation overhead; no cross-device FPS or native-pointer-lock certification.',
  ],
};
try {
  for (let repeat = 1; repeat <= repeats; repeat++) {
    const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await session.send('Network.enable');
      await session.send('Network.setCacheDisabled', { cacheDisabled: true });
      await page.addInitScript(installProbe);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const started = performance.now();
      await page.goto(url.href);
      await page.bringToFront();
      await expect(page.locator('.globe-map-status')).toContainText('Showing Moon 2K');
      const readyMs = performance.now() - started;
      const scripts = await page.evaluate(() => performance.getEntriesByType('resource')
        .filter(entry => new URL(entry.name).pathname.endsWith('.js'))
        .map(entry => ({ path: new URL(entry.name).pathname, bytes: entry.decodedBodySize })));
      const run = { repeat, readyMs, scripts, initialJsBytes: scripts.reduce((sum, entry) => sum + entry.bytes, 0), samples: [] };
      report.runs.push(run);

      async function measure(name, action) {
        await page.waitForTimeout(300);
        await page.evaluate(() => window.explorerProbe.start());
        if (action) await action(); else await page.waitForTimeout(seconds * 1000);
        const result = await page.evaluate(() => window.explorerProbe.stop());
        const heap = await session.send('Runtime.getHeapUsage');
        if (result.hidden) throw new Error(`Page became hidden during ${name}; rerun in the foreground.`);
        run.samples.push({ name, ...result, jsHeapUsedBytes: heap.usedSize });
        console.log(`Run ${repeat} ${name}: ${result.renderSubmissionFps.toFixed(1)} render submissions/s; ${(heap.usedSize / 1048576).toFixed(1)} MiB JS heap`);
      }
      async function rotate() {
        const box = await page.locator('canvas').first().boundingBox();
        if (!box) throw new Error('Globe canvas missing.');
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        try {
          const start = performance.now();
          while (performance.now() - start < seconds * 1000) {
            const phase = (performance.now() - start) / 600;
            await page.mouse.move(x + Math.sin(phase) * 80, y + Math.cos(phase) * 30);
            await page.waitForTimeout(16);
          }
        } finally { await page.mouse.up(); }
      }
      await measure('moon-idle');
      await measure('moon-orbit', rotate);
      await page.getByRole('radio', { name: '02 Mars', exact: true }).click();
      await expect(page.locator('.globe-map-status')).toContainText('Showing Mars Native');
      await measure('mars-orbit', rotate);
      await page.getByRole('button', { name: /Side by side/ }).click();
      await expect(page.locator('.globe-map-status').first()).toContainText('Showing Moon 2K');
      await expect(page.locator('.globe-map-status').last()).toContainText('Showing Mars Native');
      await measure('split-orbit-first-canvas', rotate);
      await page.getByRole('button', { name: /Side by side/ }).click();
      for (const [button, name] of [['01 Moon', 'moon-walk'], ['02 Mars', 'mars-walk']]) {
        await page.getByRole('radio', { name: button, exact: true }).click();
        await page.getByRole('button', { name: 'Explore verified site', exact: true }).click();
        await expect(page.locator('.surface-image-status')).not.toContainText('Loading');
        await page.getByRole('button', { name: 'Start exploration', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Pause exploration', exact: true })).toBeVisible();
        await page.keyboard.down('KeyW');
        try { await measure(name); } finally { await page.keyboard.up('KeyW'); }
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: 'Resume exploration', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Return to orbit', exact: true }).click();
      }
      if (errors.length) throw new Error(errors.join('\n'));
    } finally { await context.close(); }
  }
  await mkdir(path.dirname(values.output), { recursive: true });
  await writeFile(values.output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${values.output}`);
} finally { await browser.close(); }
