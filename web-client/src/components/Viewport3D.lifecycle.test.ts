// Astra B04. TEST_ONLY lifecycle scheduling; no terrain/scientific fixtures or WebGL claims.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mkkellogg/gaussian-splats-3d', () => ({ Viewer: class {} }));
vi.mock('../data/loadDataset', () => ({ resolveSameOriginAssetUrl: (path: string) => path }));

import { createViewportScheduler, disposeViewportAfter } from './Viewport3D';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function controlledClock() {
  let next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, () => void>();
  return {
    frames,
    timers,
    clock: {
      requestFrame(callback: FrameRequestCallback) {
        const id = ++next;
        frames.set(id, callback);
        return id;
      },
      cancelFrame(id: number) { frames.delete(id); },
      setTimer(callback: () => void) {
        const id = ++next;
        timers.set(id, callback);
        return id;
      },
      clearTimer(id: number) { timers.delete(id); },
    },
  };
}

describe('viewport scheduling across interruption and restart', () => {
  it('coalesces frames and ignores an already-dispatched stale frame', () => {
    const driver = controlledClock();
    const scheduler = createViewportScheduler(driver.clock);
    const first = vi.fn();
    const second = vi.fn();
    scheduler.frame(first);
    const oldCallback = [...driver.frames.values()][0];
    scheduler.frame(second);
    expect(driver.frames.size).toBe(1);
    oldCallback(10);
    expect(first).not.toHaveBeenCalled();
    [...driver.frames.values()][0](20);
    expect(second).toHaveBeenCalledExactlyOnceWith(20);
  });

  it('cancels both pacing and frame work on loss, then permits a new ground loop', () => {
    const driver = controlledClock();
    const scheduler = createViewportScheduler(driver.clock);
    const render = vi.fn();
    const stalePacing = vi.fn();
    scheduler.frame(render);
    scheduler.delay(stalePacing, 80);
    const oldFrame = [...driver.frames.values()][0];
    const oldTimer = [...driver.timers.values()][0];
    scheduler.stop();
    expect(driver.frames.size).toBe(0);
    expect(driver.timers.size).toBe(0);
    const restoredFrame = vi.fn();
    scheduler.frame(restoredFrame);
    oldFrame(30);
    oldTimer();
    expect(render).not.toHaveBeenCalled();
    expect(stalePacing).not.toHaveBeenCalled();
    [...driver.frames.values()][0](40);
    expect(restoredFrame).toHaveBeenCalledExactlyOnceWith(40);
    scheduler.stop();
  });

  it('keeps only the newest software pacing callback after a mode transition', () => {
    const driver = controlledClock();
    const scheduler = createViewportScheduler(driver.clock);
    const oldMode = vi.fn();
    const newMode = vi.fn();
    scheduler.delay(oldMode, 80);
    const oldCallback = [...driver.timers.values()][0];
    scheduler.delay(newMode, 80);
    expect(driver.timers.size).toBe(1);
    oldCallback();
    expect(oldMode).not.toHaveBeenCalled();
    [...driver.timers.values()][0]();
    expect(newMode).toHaveBeenCalledOnce();
  });
});

describe('shared renderer disposal ordering', () => {
  it('waits for an aborted load to settle and async viewer disposal before freeing the renderer', async () => {
    const load = deferred();
    const viewerCleanup = deferred();
    const order: string[] = [];
    const viewer = vi.fn(async () => {
      order.push('viewer:start');
      await viewerCleanup.promise;
      order.push('viewer:end');
    });
    const renderer = vi.fn(() => { order.push('renderer'); });
    const cleanup = disposeViewportAfter(load.promise, viewer, renderer);
    expect(viewer).not.toHaveBeenCalled();
    load.reject(new Error('TEST_ONLY aborted load'));
    await vi.waitFor(() => expect(viewer).toHaveBeenCalledOnce());
    expect(renderer).not.toHaveBeenCalled();
    viewerCleanup.resolve();
    await cleanup;
    expect(order).toEqual(['viewer:start', 'viewer:end', 'renderer']);
    expect(renderer).toHaveBeenCalledOnce();
  });

  it('releases the renderer even when viewer disposal rejects, and preserves the error', async () => {
    const failure = new Error('TEST_ONLY disposal failure');
    const renderer = vi.fn();
    await expect(disposeViewportAfter(Promise.resolve(), () => Promise.reject(failure), renderer))
      .rejects.toBe(failure);
    expect(renderer).toHaveBeenCalledOnce();
  });

  it('waits for every old owner even when one rejects before another settles', async () => {
    const oldRenderer = deferred();
    const oldSplat = deferred();
    const dispose = vi.fn(async () => {});
    const renderer = vi.fn();
    const cleanup = disposeViewportAfter(
      Promise.allSettled([oldRenderer.promise, oldSplat.promise]), dispose, renderer,
    );
    oldRenderer.reject(new Error('TEST_ONLY prior cleanup failed'));
    await Promise.resolve();
    expect(dispose).not.toHaveBeenCalled();
    oldSplat.resolve();
    await cleanup;
    expect(dispose).toHaveBeenCalledOnce();
    expect(renderer).toHaveBeenCalledOnce();
  });
});
