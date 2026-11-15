import { writeSharedPaths } from './scripts/shared-root.mjs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

const sharedDir = writeSharedPaths(import.meta.dirname);

function serveSourceBundle(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const rawUrl = req.url ?? '';
  const [urlPath, queryString = ''] = rawUrl.split('?');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }

  const bundlePath = path.resolve(import.meta.dirname, 'reports/source-bundle.json');

  if (urlPath === '/__dev/source-bundle-meta.json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (!fs.existsSync(bundlePath)) {
      res.statusCode = 404;
      res.end(JSON.stringify({ available: false, error: 'reports/source-bundle.json not found' }));
      return;
    }
    const body = fs.readFileSync(bundlePath);
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    let fileCount = 0;
    try {
      const parsed = JSON.parse(body.toString('utf8')) as {
        files?: unknown[];
        file_count?: number;
      };
      fileCount = Array.isArray(parsed.files)
        ? parsed.files.length
        : Number(parsed.file_count ?? 0);
    } catch {
      fileCount = 0;
    }
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        available: true,
        file_count: fileCount,
        bytes: body.byteLength,
        sha256,
      }),
    );
    return;
  }

  if (urlPath !== '/__dev/source-bundle.json') {
    next();
    return;
  }

  if (!fs.existsSync(bundlePath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'reports/source-bundle.json not found' }));
    return;
  }

  const params = new URLSearchParams(queryString);
  const viewInline = params.get('view') === '1';
  const body = fs.readFileSync(bundlePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    viewInline
      ? 'inline; filename="source-bundle.json"'
      : 'attachment; filename="source-bundle.json"',
  );
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', String(body.byteLength));
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(body);
}

function devSourceBundlePlugin(): Plugin {
  return {
    name: 'pae-dev-source-bundle',
    configureServer(server) {
      server.middlewares.use(serveSourceBundle);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), devSourceBundlePlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
        '@shared': sharedDir,
      },
    },
    worker: {
      format: 'es' as const,
    },
    server: {
      fs: { allow: [import.meta.dirname, sharedDir] },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
