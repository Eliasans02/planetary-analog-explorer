import { buildTerrainGeometryData, type HeightfieldData } from './heightfield';

interface WorkerRequest {
  type: 'build';
  grid: HeightfieldData;
}

interface WorkerSuccessResponse {
  type: 'ok';
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

interface WorkerErrorResponse {
  type: 'error';
  message: string;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerSuccessResponse | WorkerErrorResponse, transfer?: Transferable[]): void;
}

const workerScope = globalThis as unknown as WorkerScope;

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    const { grid } = event.data;
    const { positions, normals, indices } = buildTerrainGeometryData(grid);
    workerScope.postMessage(
      { type: 'ok', positions, normals, indices },
      [positions.buffer, normals.buffer, indices.buffer],
    );
  } catch (err) {
    workerScope.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
