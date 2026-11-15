import { writeSharedPaths } from './scripts/shared-root.mjs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const sharedDir = writeSharedPaths(import.meta.dirname);

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
      '@shared': sharedDir,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
