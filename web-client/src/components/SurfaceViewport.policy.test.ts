import { describe, expect, it } from 'vitest';
import { surfaceWalkMode } from './SurfaceViewport';

describe('surface walking policy', () => {
  it('keeps coarse regional surfaces in orbit even when walking is requested', () => {
    expect(surfaceWalkMode('walk', false)).toBe('orbit');
    expect(surfaceWalkMode('orbit', false)).toBe('orbit');
  });

  it('preserves walking for prepared native terrain', () => {
    expect(surfaceWalkMode('walk', true)).toBe('walk');
    expect(surfaceWalkMode(undefined, true)).toBe('orbit');
  });
});
