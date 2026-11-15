import type { HeightfieldData } from './heightfield';

export interface TerrainBuffers {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/**
 * Builds terrain BufferGeometry arrays in a dedicated module WebWorker.
 * Copies height/valid buffers before transfer so the caller's collision sampler buffers
 * are never detached. Always terminates the worker on completion, error, or abort.
 */
export function buildTerrainInWorker(
  grid: HeightfieldData,
  signal: AbortSignal,
): Promise<TerrainBuffers> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Terrain build aborted.', 'AbortError'));
  }

  return new Promise<TerrainBuffers>((resolve, reject) => {
    const worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), {
      type: 'module',
    });

    let settled = false;

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Terrain build aborted.', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (
      event: MessageEvent<
        | { type: 'ok'; positions: Float32Array; normals: Float32Array; indices: Uint32Array }
        | { type: 'error'; message: string }
      >,
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (event.data.type === 'ok') {
        resolve({
          positions: event.data.positions,
          normals: event.data.normals,
          indices: event.data.indices,
        });
      } else {
        reject(new Error(event.data.message));
      }
    };

    worker.onerror = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(event.message || 'Terrain worker execution failed.'));
    };

    // Clone buffers so the main-thread collision sampler retains ownership without detachment.
    const heightsCopy = new Float32Array(grid.heights);
    const validCopy = new Uint8Array(grid.valid);

    worker.postMessage(
      {
        type: 'build',
        grid: {
          ...grid,
          heights: heightsCopy,
          valid: validCopy,
        },
      },
      [heightsCopy.buffer, validCopy.buffer],
    );
  });
}
