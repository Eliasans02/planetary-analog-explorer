declare module '@mkkellogg/gaussian-splats-3d' {
  import type { Camera, Scene, WebGLRenderer } from 'three';
  export interface SceneLoad {
    readonly promise: Promise<void>;
    abort(reason?: string): void;
  }
  export class Viewer {
    constructor(options: {
      renderer: WebGLRenderer;
      camera: Camera;
      threeScene: Scene;
      rootElement: HTMLElement;
      selfDrivenMode: false;
      useBuiltInControls: false;
      sharedMemoryForWorkers: false;
      gpuAcceleratedSort?: boolean;
      integerBasedSort?: boolean;
      sphericalHarmonicsDegree?: number;
    });
    addSplatScene(path: string, options?: {
      showLoadingUI?: boolean;
      progressiveLoad?: boolean;
      position?: [number, number, number];
      rotation?: [number, number, number, number];
      scale?: [number, number, number];
    }): SceneLoad;
    update(): void;
    render(): void;
    dispose(): Promise<void>;
  }
}
