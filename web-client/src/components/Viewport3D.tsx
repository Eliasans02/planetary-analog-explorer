import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Viewer, type SceneLoad } from '@mkkellogg/gaussian-splats-3d';
import { Compass, Eye, Footprints, Globe, Lock, Move, RotateCcw, TriangleAlert, Unlock } from 'lucide-react';
import type { Body, Location, LocationsDataset } from '@shared/types/analog-location';
import { formatBodyName, formatCoordinateFrame, latLonToUnitSphere } from '../terrain/coordinates';
import {
  readHeightfield,
  fetchVerifiedAsset,
  sampleHeightAndSlope,
  type HeightfieldData,
} from '../terrain/heightfield';
import { canRenderSplatOnMetricTerrain, MAX_SCENE_ASSET_BYTES_BUDGET } from '../terrain/splatUtils';
import { splatSdkFormat, validateSplatPayload } from '../terrain/splatPayload';
import { buildTerrainInWorker } from '../terrain/terrain-worker-client';

export type ViewportMode = 'orbit' | 'ground';

export type SplatStatus =
  | { status: 'none'; message: string }
  | { status: 'loading'; message: string }
  | { status: 'ready'; gaussianCount: number; provenance: 'photogrammetric' | 'inferred' }
  | { status: 'rejected'; message: string }
  | { status: 'error'; message: string };

export interface ViewportTelemetry {
  mode: ViewportMode;
  fps: number | null;
  frameTimeMs: number | null;
  dpr: number;
  isSoftwareGl: boolean;
  localPosition_m: [number, number, number] | null;
  absoluteElevation_m: number | null;
  demSlopeDeg: number | null;
  demTriangleCount: number | null;
  verticalDatum: string | null;
  verticalOrigin_m: number | null;
  groundLoading: boolean;
  groundError: string | null;
  splatStatus: SplatStatus;
  pointerLocked: boolean;
  memoryUsedMiB: number | null;
}

export interface Viewport3DProps {
  selected: Location | null;
  dataset: LocationsDataset;
  onTargetSelected: (id: string) => void;
  activeBody?: Body;
  onBodyChange?: (body: Body) => void;
  mode?: ViewportMode;
  onModeChange?: (mode: ViewportMode) => void;
  walkSpeedMps?: number;
  eyeHeightM?: number;
  onTelemetryUpdate?: (telemetry: ViewportTelemetry) => void;
}

interface GlobeMarkerEntry {
  location: Location;
  role: 'target' | 'analog';
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  headMat: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshBasicMaterial;
}

const MAX_DPR_BUDGET = 1.5;
const DPR_STEPS = [1.5, 1.25, 1.0, 0.85] as const;

/** Astra B04: a renderer owns one frame and one pacing timer, including across mode changes. */
export function createViewportScheduler(clock: {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  setTimer: (callback: () => void, delay: number) => number;
  clearTimer: (id: number) => void;
}) {
  let generation = 0;
  let frame: number | null = null;
  let timer: number | null = null;
  return {
    frame(callback: FrameRequestCallback): void {
      if (frame !== null) clock.cancelFrame(frame);
      const owner = generation;
      const id = clock.requestFrame((time) => {
        if (owner !== generation || frame !== id) return;
        frame = null;
        callback(time);
      });
      frame = id;
    },
    delay(callback: () => void, delay: number): void {
      if (timer !== null) clock.clearTimer(timer);
      const owner = generation;
      const id = clock.setTimer(() => {
        if (owner !== generation || timer !== id) return;
        timer = null;
        callback();
      }, delay);
      timer = id;
    },
    stop(): void {
      generation += 1;
      if (frame !== null) clock.cancelFrame(frame);
      if (timer !== null) clock.clearTimer(timer);
      frame = timer = null;
    },
  };
}

/** Do not release a shared renderer before its viewer's pending work and disposal settle. */
export async function disposeViewportAfter(
  pendingWork: Promise<unknown>,
  disposeViewer: () => Promise<void>,
  disposeRenderer: () => void,
): Promise<void> {
  await pendingWork.catch(() => {});
  try {
    await disposeViewer();
  } finally {
    disposeRenderer();
  }
}

// Reusable scratch objects outside any RAF loop to prevent GC allocations.
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _upVec = new THREE.Vector3(0, 1, 0);
const _forwardVec = new THREE.Vector3();
const _rightVec = new THREE.Vector3();
const _moveVec = new THREE.Vector3();
const _projVec = new THREE.Vector3();

function collectBodyMarkers(dataset: LocationsDataset, body: Body): Array<{ location: Location; role: 'target' | 'analog' }> {
  const seen = new Set<string>();
  const result: Array<{ location: Location; role: 'target' | 'analog' }> = [];

  if (body === 'moon' || body === 'mars') {
    for (const comp of dataset.comparisons) {
      if (comp.target.body === body && !seen.has(comp.target.id)) {
        seen.add(comp.target.id);
        result.push({ location: comp.target, role: 'target' });
      }
    }
    return result;
  }

  for (const comp of dataset.comparisons) {
    for (const analog of comp.analogs) {
      if (analog.location.body === 'earth' && !seen.has(analog.location.id)) {
        seen.add(analog.location.id);
        result.push({ location: analog.location, role: 'analog' });
      }
    }
  }
  return result;
}

function buildSchematicGraticule(radius: number): THREE.LineSegments {
  const positions: number[] = [];
  const colors: number[] = [];

  const pushSegment = (
    p1: [number, number, number],
    p2: [number, number, number],
    r: number,
    g: number,
    b: number,
  ) => {
    positions.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    colors.push(r, g, b, r, g, b);
  };

  // Parallels every 30 degrees (-60 to +60)
  for (let lat = -60; lat <= 60; lat += 30) {
    const isEquator = lat === 0;
    const [cr, cg, cb] = isEquator ? [0.13, 0.72, 0.85] : [0.22, 0.3, 0.4];
    for (let lon = -180; lon < 180; lon += 6) {
      const p1 = latLonToUnitSphere(lat, lon, radius);
      const p2 = latLonToUnitSphere(lat, lon + 6, radius);
      pushSegment(p1, p2, cr, cg, cb);
    }
  }

  // Meridians every 30 degrees (-180 to +150)
  for (let lon = -180; lon < 180; lon += 30) {
    const isPrime = lon === 0;
    const isAntimeridian = lon === -180;
    const [cr, cg, cb] = isPrime
      ? [0.13, 0.72, 0.85]
      : isAntimeridian
        ? [0.65, 0.45, 0.16]
        : [0.22, 0.3, 0.4];
    for (let lat = -84; lat < 84; lat += 6) {
      const p1 = latLonToUnitSphere(lat, lon, radius);
      const p2 = latLonToUnitSphere(lat + 6, lon, radius);
      pushSegment(p1, p2, cr, cg, cb);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
  });
  return new THREE.LineSegments(geo, mat);
}

function disposeObject3DTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else if (mat) {
      mat.dispose();
    }
  });
}

function readOptionalMemoryMiB(): number | null {
  const perf = performance as unknown as {
    memory?: { usedJSHeapSize?: number };
  };
  if (perf.memory && typeof perf.memory.usedJSHeapSize === 'number') {
    return perf.memory.usedJSHeapSize / (1024 * 1024);
  }
  return null;
}

export function Viewport3D({
  selected,
  dataset,
  onTargetSelected,
  activeBody: controlledBody,
  onBodyChange,
  mode: controlledMode,
  onModeChange,
  walkSpeedMps = 3.5,
  eyeHeightM = 1.6,
  onTelemetryUpdate,
}: Viewport3DProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [internalBody, setInternalBody] = useState<Body>(selected?.body ?? 'moon');
  const [internalMode, setInternalMode] = useState<ViewportMode>('orbit');

  const activeBody = controlledBody ?? internalBody;
  const activeMode = controlledMode ?? internalMode;

  const [webglError, setWebglError] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [rendererEpoch, setRendererEpoch] = useState(0);
  const [rendererReadyEpoch, setRendererReadyEpoch] = useState<number | null>(null);

  const [pegmanDragging, setPegmanDragging] = useState(false);
  const [pegmanScreenPos, setPegmanScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [pegmanHoverName, setPegmanHoverName] = useState<string | null>(null);
  const [orbitNotice, setOrbitNotice] = useState<string | null>(null);

  const [groundLoading, setGroundLoading] = useState(false);
  const [groundError, setGroundError] = useState<string | null>(null);
  const [splatStatus, setSplatStatus] = useState<SplatStatus>({
    status: 'none',
    message: '3D reconstruction not prepared',
  });
  const [pointerLocked, setPointerLocked] = useState(false);
  const [groundHudReadout, setGroundHudReadout] = useState<{
    fps: number | null;
    frameTimeMs: number | null;
    dpr: number;
    pos: [number, number, number] | null;
    absElev: number | null;
    slopeDeg: number | null;
  }>({
    fps: null,
    frameTimeMs: null,
    dpr: 1,
    pos: null,
    absElev: null,
    slopeDeg: null,
  });

  // Mutable refs accessed inside Three.js lifecycle without re-mounting renderer
  const onTargetSelectedRef = useRef(onTargetSelected);
  onTargetSelectedRef.current = onTargetSelected;
  const onTelemetryUpdateRef = useRef(onTelemetryUpdate);
  onTelemetryUpdateRef.current = onTelemetryUpdate;
  const activeModeRef = useRef<ViewportMode>(activeMode);
  activeModeRef.current = activeMode;
  const walkSpeedRef = useRef(walkSpeedMps);
  walkSpeedRef.current = walkSpeedMps;
  const eyeHeightRef = useRef(eyeHeightM);
  eyeHeightRef.current = eyeHeightM;

  const setBody = (next: Body) => {
    setOrbitNotice(null);
    if (onBodyChange) onBodyChange(next);
    else setInternalBody(next);
  };

  const setMode = (next: ViewportMode) => {
    if (onModeChange) onModeChange(next);
    else setInternalMode(next);
  };

  const canEnterGround = Boolean(
    selected && selected.assets.heightmap !== null && selected.camera !== null,
  );

  const groundUnavailableReason = useMemo(() => {
    if (!selected) return 'requires prepared DEM & camera metadata.';
    if (selected.assets.heightmap === null) {
      return `${selected.name} has no heightmap asset.`;
    }
    if (selected.camera === null) {
      return `${selected.name} has no camera metadata.`;
    }
    return null;
  }, [selected]);

  // Auto-revert to orbit if selected location lacks ground assets while in ground mode.
  useEffect(() => {
    if (activeMode === 'ground' && !canEnterGround) {
      setMode('orbit');
    }
  }, [activeMode, canEnterGround]);

  // Core Three.js refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const pointerLockControlsRef = useRef<PointerLockControls | null>(null);
  const orbitGroupRef = useRef<THREE.Group | null>(null);
  const groundGroupRef = useRef<THREE.Group | null>(null);
  const globeMeshRef = useRef<THREE.Mesh | null>(null);
  const markerEntriesRef = useRef<GlobeMarkerEntry[]>([]);
  const isSoftwareGlRef = useRef(false);
  const dprStepIdxRef = useRef(0);
  const requestOrbitRenderRef = useRef<() => void>(() => {});
  const restartRenderLoopRef = useRef<() => void>(() => {});
  const abortGroundLoadRef = useRef<() => void>(() => {});

  // Ground scene runtime state refs
  const groundGenerationRef = useRef(0);
  const activeHeightfieldRef = useRef<HeightfieldData | null>(null);
  const activeSplatViewerRef = useRef<Viewer | null>(null);
  const splatReadyRef = useRef(false);
  const splatQueueRef = useRef<Promise<void>>(Promise.resolve());
  const disposalChainRef = useRef<Promise<void>>(Promise.resolve());
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const userMovedOnGroundRef = useRef(false);
  const demTriangleCountRef = useRef<number | null>(null);
  const verticalDatumRef = useRef<string | null>(null);
  const verticalOriginRef = useRef<number | null>(null);
  const latestTelemetryStateRef = useRef<{
    groundLoading: boolean;
    groundError: string | null;
    splatStatus: SplatStatus;
    pointerLocked: boolean;
  }>({
    groundLoading: false,
    groundError: null,
    splatStatus: { status: 'none', message: '3D reconstruction not prepared' },
    pointerLocked: false,
  });

  latestTelemetryStateRef.current = {
    groundLoading,
    groundError,
    splatStatus,
    pointerLocked,
  };

  // Emit telemetry when discrete status changes in Orbit/Ground
  useEffect(() => {
    onTelemetryUpdateRef.current?.({
      mode: activeMode,
      fps: activeMode === 'ground' ? groundHudReadout.fps : null,
      frameTimeMs: activeMode === 'ground' ? groundHudReadout.frameTimeMs : null,
      dpr: groundHudReadout.dpr,
      isSoftwareGl: isSoftwareGlRef.current,
      localPosition_m: activeMode === 'ground' ? groundHudReadout.pos : null,
      absoluteElevation_m: activeMode === 'ground' ? groundHudReadout.absElev : null,
      demSlopeDeg: activeMode === 'ground' ? groundHudReadout.slopeDeg : null,
      demTriangleCount: activeMode === 'ground' ? demTriangleCountRef.current : null,
      verticalDatum: activeMode === 'ground' ? verticalDatumRef.current : null,
      verticalOrigin_m: activeMode === 'ground' ? verticalOriginRef.current : null,
      groundLoading,
      groundError,
      splatStatus,
      pointerLocked,
      memoryUsedMiB: readOptionalMemoryMiB(),
    });
  }, [
    activeMode,
    groundHudReadout,
    groundLoading,
    groundError,
    splatStatus,
    pointerLocked,
  ]);

  // 1. Mount WebGLRenderer once per rendererEpoch, StrictMode-safe with serialized cleanup
  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    setRendererReadyEpoch(null);
    let cancelled = false;
    const scheduler = createViewportScheduler({
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (id) => window.cancelAnimationFrame(id),
      setTimer: (callback, delay) => window.setTimeout(callback, delay),
      clearTimer: (id) => window.clearTimeout(id),
    });
    let resizeObserver: ResizeObserver | null = null;
    const rollbackInitialization: Array<() => void> = [];

    // Probe WebGL availability & software-GL status before constructing Three renderer
    const probeCanvas = document.createElement('canvas');
    const probeGl =
      (probeCanvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
      (probeCanvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!probeGl) {
      setWebglError('WebGL is unavailable in this browser/device. 3D viewport cannot render.');
      return;
    }

    const debugExt = probeGl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = String(
      probeGl.getParameter(debugExt ? debugExt.UNMASKED_RENDERER_WEBGL : probeGl.RENDERER) ?? '',
    );
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
    probeGl.getExtension('WEBGL_lose_context')?.loseContext();
    isSoftwareGlRef.current = isSoftwareGl;
    setWebglError(null);
    setContextLost(false);

    const initAfterPendingDispose = async () => {
      await disposalChainRef.current.catch(() => {});
      if (cancelled) return;

      // Guarantee single canvas child
      while (mountEl.firstChild) {
        mountEl.removeChild(mountEl.firstChild);
      }

      const width = Math.max(mountEl.clientWidth, 1);
      const height = Math.max(mountEl.clientHeight, 1);

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
      rollbackInitialization.push(() => {
        renderer.dispose();
        renderer.domElement.remove();
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      const initialDpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, MAX_DPR_BUDGET);
      dprStepIdxRef.current = DPR_STEPS.findIndex((s) => s <= initialDpr);
      if (dprStepIdxRef.current < 0) dprStepIdxRef.current = DPR_STEPS.length - 1;
      renderer.setPixelRatio(initialDpr);
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      renderer.domElement.setAttribute('data-testid', 'viewport3d-canvas');
      mountEl.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x07090e);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnvironment = new RoomEnvironment();
      let environmentTarget: THREE.WebGLRenderTarget;
      try {
        environmentTarget = pmrem.fromScene(roomEnvironment, 0.04);
      } finally {
        roomEnvironment.dispose();
        pmrem.dispose();
      }
      scene.environment = environmentTarget.texture;
      rollbackInitialization.push(() => environmentTarget.dispose());

      const hemiLight = new THREE.HemisphereLight(0xbcd4f5, 0x1a1e26, 0.85);
      scene.add(hemiLight);
      const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.55);
      keyLight.position.set(8, 12, 6);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0x52a8d8, 0.45);
      rimLight.position.set(-8, -4, -6);
      scene.add(rimLight);

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 5000);
      camera.position.set(0, 0.72, 3.35);
      camera.lookAt(0, 0, 0);

      const orbitGroup = new THREE.Group();
      orbitGroup.name = 'orbit-schematic-group';
      scene.add(orbitGroup);
      rollbackInitialization.push(() => disposeObject3DTree(orbitGroup));

      const globeGeometry = new THREE.SphereGeometry(1, 48, 36);
      const globeMaterial = new THREE.MeshStandardMaterial({
        color: 0x242b36,
        roughness: 0.9,
        metalness: 0.06,
      });
      const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
      globeMesh.name = 'schematic-reference-globe';
      orbitGroup.add(globeMesh);

      const graticule = buildSchematicGraticule(1.003);
      orbitGroup.add(graticule);

      const groundGroup = new THREE.Group();
      groundGroup.name = 'ground-terrain-group';
      groundGroup.visible = false;
      scene.add(groundGroup);
      rollbackInitialization.push(() => disposeObject3DTree(groundGroup));

      const orbitControls = new OrbitControls(camera, renderer.domElement);
      orbitControls.enablePan = false;
      orbitControls.minDistance = 1.45;
      orbitControls.maxDistance = 6.0;
      orbitControls.enableDamping = !isSoftwareGl;
      orbitControls.dampingFactor = 0.07;

      const pointerLockControls = new PointerLockControls(camera, renderer.domElement);
      rollbackInitialization.push(() => {
        orbitControls.dispose();
        pointerLockControls.dispose();
      });

      rendererRef.current = renderer;
      sceneRef.current = scene;
      cameraRef.current = camera;
      orbitControlsRef.current = orbitControls;
      pointerLockControlsRef.current = pointerLockControls;
      orbitGroupRef.current = orbitGroup;
      groundGroupRef.current = groundGroup;
      globeMeshRef.current = globeMesh;
      rollbackInitialization.push(() => {
        if (rendererRef.current !== renderer) return;
        rendererRef.current = null;
        sceneRef.current = null;
        cameraRef.current = null;
        orbitControlsRef.current = null;
        pointerLockControlsRef.current = null;
        orbitGroupRef.current = null;
        groundGroupRef.current = null;
        globeMeshRef.current = null;
        requestOrbitRenderRef.current = () => {};
        restartRenderLoopRef.current = () => {};
      });

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      // Context loss / restore handlers
      let isContextLostLocal = false;
      let pendingFence: WebGLSync | null = null;
      const stopScheduling = () => {
        scheduler.stop();
        if (pendingFence !== null) {
          (renderer.getContext() as WebGL2RenderingContext).deleteSync(pendingFence);
          pendingFence = null;
        }
      };
      const handleContextLost = (e: Event) => {
        e.preventDefault();
        isContextLostLocal = true;
        orbitControls.enabled = false;
        pressedKeysRef.current.clear();
        stopScheduling();
        groundGenerationRef.current += 1;
        abortGroundLoadRef.current();
        activeHeightfieldRef.current = null;
        demTriangleCountRef.current = null;
        verticalDatumRef.current = null;
        verticalOriginRef.current = null;
        if (pointerLockControls.isLocked) pointerLockControls.unlock();
        setPointerLocked(false);
        setGroundLoading(false);
        setSplatStatus({ status: 'none', message: 'Renderer context lost; reconstruction unavailable.' });
        setGroundHudReadout((previous) => ({
          fps: null, frameTimeMs: null, dpr: previous.dpr,
          pos: null, absElev: null, slopeDeg: null,
        }));
        setRendererReadyEpoch(null);
        setContextLost(true);
      };
      const handleContextRestored = () => {
        if (cancelled) return;
        // Recreate after queued viewer disposal; readiness restarts the current mode's loop.
        setRendererEpoch((epoch) => epoch + 1);
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);
      rollbackInitialization.push(() => {
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      });

      // PointerLock lifecycle + key hygiene
      const clearKeys = () => {
        pressedKeysRef.current.clear();
      };
      const handleLock = () => {
        setPointerLocked(true);
      };
      const handleUnlock = () => {
        clearKeys();
        setPointerLocked(false);
      };
      pointerLockControls.addEventListener('lock', handleLock);
      pointerLockControls.addEventListener('unlock', handleUnlock);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (cancelled || isContextLostLocal || activeModeRef.current !== 'ground') return;
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        if (
          e.code === 'KeyW' ||
          e.code === 'KeyA' ||
          e.code === 'KeyS' ||
          e.code === 'KeyD' ||
          e.code === 'ArrowUp' ||
          e.code === 'ArrowDown' ||
          e.code === 'ArrowLeft' ||
          e.code === 'ArrowRight'
        ) {
          pressedKeysRef.current.add(e.code);
        }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        pressedKeysRef.current.delete(e.code);
      };
      const handleVisibilityChange = () => {
        if (document.hidden) clearKeys();
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('blur', clearKeys);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      rollbackInitialization.push(() => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('blur', clearKeys);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      });

      // Software-WebGL fence pacing helper (threejs skill)
      const afterDraw = (cb: () => void) => {
        if (cancelled || isContextLostLocal) return;
        const gl = renderer.getContext();
        if ('fenceSync' in gl) {
          const gl2 = gl as WebGL2RenderingContext;
          const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
          if (sync) {
            pendingFence = sync;
            gl2.flush();
            const poll = () => {
              if (cancelled || isContextLostLocal) {
                if (pendingFence === sync) gl2.deleteSync(sync);
                pendingFence = null;
                return;
              }
              const status = gl2.getSyncParameter(sync, gl2.SYNC_STATUS);
              if (status === gl2.UNSIGNALED) {
                scheduler.delay(poll, 5);
              } else {
                gl2.deleteSync(sync);
                pendingFence = null;
                scheduler.delay(cb, 80);
              }
            };
            scheduler.delay(poll, 5);
            return;
          }
        }
        scheduler.delay(cb, 80);
      };

      // Coalesced on-demand renderer for Orbit mode
      let orbitRenderBusy = false;
      let orbitRenderDirty = false;
      const drawCurrentFrame = () => {
        if (cancelled || isContextLostLocal) return;
        const size = new THREE.Vector2();
        renderer.getSize(size);
        if (size.x <= 0 || size.y <= 0) return;

        if (activeModeRef.current === 'ground' && splatReadyRef.current && activeSplatViewerRef.current) {
          activeSplatViewerRef.current.update();
          activeSplatViewerRef.current.render();
        } else {
          renderer.render(scene, camera);
        }
      };

      const requestOrbitRender = () => {
        if (cancelled || isContextLostLocal || activeModeRef.current !== 'orbit') return;
        if (orbitRenderBusy) {
          orbitRenderDirty = true;
          return;
        }
        orbitRenderBusy = true;
        scheduler.frame(() => {
          orbitRenderDirty = false;
          if (cancelled || isContextLostLocal) {
            orbitRenderBusy = false;
            return;
          }
          const moved = orbitControls.update();
          drawCurrentFrame();
          const done = () => {
            orbitRenderBusy = false;
            if (orbitRenderDirty || (moved && orbitControls.enableDamping && activeModeRef.current === 'orbit')) {
              requestOrbitRender();
            }
          };
          if (isSoftwareGl) afterDraw(done);
          else done();
        });
      };

      requestOrbitRenderRef.current = requestOrbitRender;
      orbitControls.addEventListener('change', requestOrbitRender);

      // Ground loop with real FPS/frame-time measurement, adaptive DPR with hysteresis, and 4Hz HUD throttle
      let lastFrameTs = performance.now();
      let lastHudEmitTs = 0;
      let frameWindowCount = 0;
      let frameWindowSumMs = 0;
      let windowStartTs = performance.now();
      let slowWindows = 0;
      let fastWindows = 0;

      const stepGroundMovement = (dtSec: number) => {
        const grid = activeHeightfieldRef.current;
        if (!grid || activeModeRef.current !== 'ground') return;

        const keys = pressedKeysRef.current;
        const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
          (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
        const strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
          (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);

        if (forward === 0 && strafe === 0) return;

        userMovedOnGroundRef.current = true;
        camera.getWorldDirection(_forwardVec);
        _forwardVec.y = 0;
        if (_forwardVec.lengthSq() < 1e-8) {
          _forwardVec.set(0, 0, -1);
        } else {
          _forwardVec.normalize();
        }
        _rightVec.crossVectors(_forwardVec, _upVec).normalize();

        _moveVec
          .set(0, 0, 0)
          .addScaledVector(_forwardVec, forward)
          .addScaledVector(_rightVec, strafe);
        if (_moveVec.lengthSq() > 0) {
          _moveVec.normalize();
        }

        const stepDist = walkSpeedRef.current * dtSec;
        const curX = camera.position.x;
        const curZ = camera.position.z;
        const targetX = curX + _moveVec.x * stepDist;
        const targetZ = curZ + _moveVec.z * stepDist;

        // Validate against exact DEM triangles; fall back to axis-sliding if diagonal hits boundary/NoData
        const fullSample = sampleHeightAndSlope(grid, targetX, targetZ);
        if (fullSample !== null) {
          camera.position.set(targetX, fullSample.y_m + eyeHeightRef.current, targetZ);
          return;
        }
        const xOnly = sampleHeightAndSlope(grid, targetX, curZ);
        if (xOnly !== null) {
          camera.position.set(targetX, xOnly.y_m + eyeHeightRef.current, curZ);
          return;
        }
        const zOnly = sampleHeightAndSlope(grid, curX, targetZ);
        if (zOnly !== null) {
          camera.position.set(curX, zOnly.y_m + eyeHeightRef.current, targetZ);
        }
      };

      const updateAdaptiveDpr = (avgMs: number) => {
        if (isSoftwareGl) return;
        const maxDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR_BUDGET);
        if (avgMs > 24) {
          slowWindows += 1;
          fastWindows = 0;
          if (slowWindows >= 2 && dprStepIdxRef.current < DPR_STEPS.length - 1) {
            dprStepIdxRef.current += 1;
            const nextDpr = Math.min(DPR_STEPS[dprStepIdxRef.current], maxDpr);
            renderer.setPixelRatio(nextDpr);
            slowWindows = 0;
          }
        } else if (avgMs < 12) {
          fastWindows += 1;
          slowWindows = 0;
          if (fastWindows >= 3 && dprStepIdxRef.current > 0) {
            const candidate = DPR_STEPS[dprStepIdxRef.current - 1];
            if (candidate <= maxDpr) {
              dprStepIdxRef.current -= 1;
              renderer.setPixelRatio(candidate);
            }
            fastWindows = 0;
          }
        } else {
          slowWindows = 0;
          fastWindows = 0;
        }
      };

      const groundLoopTick = () => {
        if (cancelled || isContextLostLocal) return;

        if (activeModeRef.current !== 'ground') {
          // Mode synchronization explicitly starts the next loop; no orphan polling timer.
          return;
        }

        const now = performance.now();
        const rawDtMs = now - lastFrameTs;
        lastFrameTs = now;
        const dtSec = Math.min(Math.max(rawDtMs / 1000, 0), 0.05);

        if (pointerLockControls.isLocked) stepGroundMovement(dtSec);

        const renderStart = performance.now();
        drawCurrentFrame();
        const renderElapsed = performance.now() - renderStart;

        frameWindowCount += 1;
        frameWindowSumMs += Math.max(rawDtMs, renderElapsed);

        if (now - lastHudEmitTs >= 250) {
          const windowMs = now - windowStartTs;
          const avgFrameMs = frameWindowCount > 0 ? frameWindowSumMs / frameWindowCount : null;
          const measuredFps =
            windowMs > 0 && frameWindowCount > 0 ? (frameWindowCount * 1000) / windowMs : null;

          if (avgFrameMs !== null && frameWindowCount >= 10) {
            updateAdaptiveDpr(avgFrameMs);
          }

          const grid = activeHeightfieldRef.current;
          const sample = grid
            ? sampleHeightAndSlope(grid, camera.position.x, camera.position.z)
            : null;
          const pos: [number, number, number] | null = grid ? [
            camera.position.x,
            camera.position.y,
            camera.position.z,
          ] : null;
          const absElev =
            grid !== null ? camera.position.y + grid.verticalOrigin_m : null;

          setGroundHudReadout({
            fps: measuredFps,
            frameTimeMs: avgFrameMs,
            dpr: renderer.getPixelRatio(),
            pos,
            absElev,
            slopeDeg: sample ? sample.slope_deg : null,
          });

          lastHudEmitTs = now;
          frameWindowCount = 0;
          frameWindowSumMs = 0;
          windowStartTs = now;
        }

        if (isSoftwareGl) {
          afterDraw(groundLoopTick);
        } else {
          scheduler.frame(groundLoopTick);
        }
      };

      const restartRenderLoop = () => {
        stopScheduling();
        orbitRenderBusy = false;
        orbitRenderDirty = false;
        lastFrameTs = windowStartTs = performance.now();
        lastHudEmitTs = frameWindowCount = frameWindowSumMs = 0;
        if (cancelled || isContextLostLocal) return;
        if (activeModeRef.current === 'ground') scheduler.frame(groundLoopTick);
        else requestOrbitRender();
      };
      restartRenderLoopRef.current = restartRenderLoop;

      // ResizeObserver updates camera aspect & renderer CSS size, skipping 0-size renders
      resizeObserver = new ResizeObserver((entries) => {
        if (cancelled) return;
        const entry = entries[0];
        const w = Math.floor(entry?.contentRect.width ?? mountEl.clientWidth);
        const h = Math.floor(entry?.contentRect.height ?? mountEl.clientHeight);
        if (w <= 0 || h <= 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        if (activeModeRef.current === 'orbit') {
          requestOrbitRender();
        } else {
          drawCurrentFrame();
        }
      });
      resizeObserver.observe(mountEl);

      // Store synchronous/async cleanup closure on ref for unmount
      cleanupFnRef.current = () => {
        if (cancelled) return;
        cancelled = true;
        stopScheduling();
        abortGroundLoadRef.current();
        resizeObserver?.disconnect();
        clearKeys();

        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('blur', clearKeys);
        document.removeEventListener('visibilitychange', handleVisibilityChange);

        orbitControls.removeEventListener('change', requestOrbitRender);
        orbitControls.dispose();
        pointerLockControls.removeEventListener('lock', handleLock);
        pointerLockControls.removeEventListener('unlock', handleUnlock);
        if (pointerLockControls.isLocked) {
          pointerLockControls.unlock();
        }
        pointerLockControls.dispose();

        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

        requestOrbitRenderRef.current = () => {};
        restartRenderLoopRef.current = () => {};
        orbitControlsRef.current = null;
        pointerLockControlsRef.current = null;
        globeMeshRef.current = null;
        markerEntriesRef.current = [];

        const activeViewer = activeSplatViewerRef.current;
        activeSplatViewerRef.current = null;
        splatReadyRef.current = false;

        const pendingWork = Promise.allSettled([disposalChainRef.current, splatQueueRef.current]);
        const disposeTask = disposeViewportAfter(pendingWork, async () => {
          if (activeViewer) {
            try {
              await activeViewer.dispose();
            } catch (error) {
              console.error('Splat viewer disposal failed during renderer cleanup.', error);
            }
          }
        }, () => {
          disposeObject3DTree(orbitGroup);
          disposeObject3DTree(groundGroup);
          scene.clear();
          scene.environment = null;
          environmentTarget.dispose();
          renderer.dispose();
          if (renderer.domElement.parentNode === mountEl) {
            mountEl.removeChild(renderer.domElement);
          }
          if (rendererRef.current === renderer) {
            rendererRef.current = null;
            sceneRef.current = null;
            cameraRef.current = null;
            orbitGroupRef.current = null;
            groundGroupRef.current = null;
          }
        });

        disposalChainRef.current = disposeTask;
        splatQueueRef.current = disposeTask;
      };
      rollbackInitialization.length = 0;
      setRendererReadyEpoch(rendererEpoch);
    };

    const cleanupFnRef: { current: () => void } = {
      current: () => {
        cancelled = true;
        scheduler.stop();
        resizeObserver?.disconnect();
        for (const release of rollbackInitialization.reverse()) release();
        rollbackInitialization.length = 0;
      },
    };

    void initAfterPendingDispose().catch((error: unknown) => {
      if (cancelled) return;
      cleanupFnRef.current();
      setWebglError(`Unable to initialize the 3D viewport: ${error instanceof Error ? error.message : String(error)}`);
    });

    return () => {
      groundGenerationRef.current += 1;
      cleanupFnRef.current();
    };
  }, [rendererEpoch]);

  // 2. Update Schematic Globe material & AOI markers when dataset / activeBody / selected changes
  useEffect(() => {
    if (rendererReadyEpoch !== rendererEpoch) return;
    const orbitGroup = orbitGroupRef.current;
    const globeMesh = globeMeshRef.current;
    if (!orbitGroup || !globeMesh) return;

    const globeMat = globeMesh.material as THREE.MeshStandardMaterial;
    if (activeBody === 'earth') globeMat.color.setHex(0x1b2d42);
    else if (activeBody === 'moon') globeMat.color.setHex(0x2a2f38);
    else globeMat.color.setHex(0x42251d);

    // Dispose previous markers cleanly
    for (const entry of markerEntriesRef.current) {
      orbitGroup.remove(entry.group);
      disposeObject3DTree(entry.group);
    }
    markerEntriesRef.current = [];

    const markers = collectBodyMarkers(dataset, activeBody);
    const created: GlobeMarkerEntry[] = [];

    for (const { location, role } of markers) {
      const isSelected = selected?.id === location.id;
      const surfacePos = latLonToUnitSphere(
        location.coordinates.latitude_deg,
        location.coordinates.longitude_deg,
        1.004,
      );
      const normal = new THREE.Vector3(...surfacePos).normalize();

      const group = new THREE.Group();
      group.position.set(...surfacePos);
      group.quaternion.setFromUnitVectors(_upVec, normal);

      const baseRingGeo = new THREE.RingGeometry(0.018, 0.028, 24);
      baseRingGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0x22d3ee : role === 'target' ? 0xf59e0b : 0x38bdf8,
        side: THREE.DoubleSide,
      });
      const baseRing = new THREE.Mesh(baseRingGeo, ringMat);
      group.add(baseRing);

      const stemGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.045, 10);
      stemGeo.translate(0, 0.0225, 0);
      const stemMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.4,
        metalness: 0.5,
      });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      group.add(stem);

      const headGeo = new THREE.SphereGeometry(isSelected ? 0.021 : 0.016, 16, 12);
      headGeo.translate(0, 0.052, 0);
      const headMat = new THREE.MeshStandardMaterial({
        color: isSelected ? 0x22d3ee : role === 'target' ? 0xf59e0b : 0x38bdf8,
        emissive: isSelected ? 0x0e7490 : 0x000000,
        roughness: 0.35,
        metalness: 0.25,
      });
      const head = new THREE.Mesh(headGeo, headMat);
      group.add(head);

      const hitGeo = new THREE.SphereGeometry(0.07, 12, 10);
      hitGeo.translate(0, 0.035, 0);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.userData.locationId = location.id;
      hitMesh.userData.locationName = location.name;
      group.add(hitMesh);

      orbitGroup.add(group);
      created.push({ location, role, group, hitMesh, headMat, ringMat });
    }

    markerEntriesRef.current = created;
    requestOrbitRenderRef.current();
  }, [dataset, activeBody, selected, rendererEpoch, rendererReadyEpoch]);

  // 3. Synchronize Orbit vs Ground visibility, controls exclusion, and real Heightfield + Splat loading
  useEffect(() => {
    if (rendererReadyEpoch !== rendererEpoch) return;
    const orbitGroup = orbitGroupRef.current;
    const groundGroup = groundGroupRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const orbitControls = orbitControlsRef.current;
    const pointerLockControls = pointerLockControlsRef.current;
    const mountEl = mountRef.current;

    if (
      !orbitGroup ||
      !groundGroup ||
      !camera ||
      !renderer ||
      !scene ||
      !orbitControls ||
      !pointerLockControls ||
      !mountEl
    ) {
      return;
    }

    const token = ++groundGenerationRef.current;
    const controller = new AbortController();
    let activeSplatLoad: SceneLoad | null = null;
    const abortCurrentLoad = () => {
      controller.abort();
      if (activeSplatLoad) {
        try {
          activeSplatLoad.abort('Selection, renderer or mode changed');
        } catch {
          // Aborting an already completed/rejected scene load is harmless.
        }
      }
    };
    abortGroundLoadRef.current = abortCurrentLoad;

    const clearGroundSceneObjects = () => {
      while (groundGroup.children.length > 0) {
        const child = groundGroup.children[0];
        groundGroup.remove(child);
        disposeObject3DTree(child);
      }
      activeHeightfieldRef.current = null;
      demTriangleCountRef.current = null;
      verticalDatumRef.current = null;
      verticalOriginRef.current = null;
      userMovedOnGroundRef.current = false;
      setGroundHudReadout((previous) => ({
        fps: null, frameTimeMs: null, dpr: renderer.getPixelRatio() || previous.dpr,
        pos: null, absElev: null, slopeDeg: null,
      }));
    };

    const disposeActiveViewerSerialized = () => {
      const existing = activeSplatViewerRef.current;
      activeSplatViewerRef.current = null;
      splatReadyRef.current = false;
      if (!existing) return splatQueueRef.current.catch(() => {});
      const task = splatQueueRef.current
        .catch(() => {})
        .then(async () => {
          try {
            await existing.dispose();
          } catch (error) {
            console.error('Splat viewer disposal failed during scene replacement.', error);
          }
        });
      splatQueueRef.current = task;
      return task;
    };

    const cleanupGroundLoad = () => {
      groundGenerationRef.current += 1;
      abortCurrentLoad();
      if (abortGroundLoadRef.current === abortCurrentLoad) abortGroundLoadRef.current = () => {};
      splatReadyRef.current = false;
      void disposeActiveViewerSerialized();
    };

    restartRenderLoopRef.current();

    if (activeMode === 'orbit') {
      if (pointerLockControls.isLocked) {
        pointerLockControls.unlock();
      }
      pressedKeysRef.current.clear();
      setPointerLocked(false);
      setGroundLoading(false);
      setGroundError(null);
      setSplatStatus({ status: 'none', message: '3D reconstruction not prepared' });

      clearGroundSceneObjects();
      void disposeActiveViewerSerialized();

      groundGroup.visible = false;
      orbitGroup.visible = true;
      orbitControls.enabled = true;

      camera.fov = 42;
      camera.near = 0.05;
      camera.far = 5000;
      camera.position.set(0, 0.72, 3.35);
      orbitControls.target.set(0, 0, 0);
      camera.updateProjectionMatrix();
      orbitControls.update();
      requestOrbitRenderRef.current();

      return cleanupGroundLoad;
    }

    // Ground Mode entry: OrbitControls strictly disabled
    orbitControls.enabled = false;
    orbitGroup.visible = false;
    groundGroup.visible = true;
    pressedKeysRef.current.clear();
    clearGroundSceneObjects();
    setGroundError(null);

    if (!selected || !selected.assets.heightmap || !selected.camera) {
      setGroundLoading(false);
      setGroundError('Ground mode requires valid heightmap and camera metadata.');
      return cleanupGroundLoad;
    }

    const targetLocation = selected;
    const hmMeta = targetLocation.assets.heightmap;
    const camMeta = targetLocation.camera;
    if (!hmMeta || !camMeta) return cleanupGroundLoad;

    setGroundLoading(true);
    setSplatStatus(
      targetLocation.assets.splat
        ? { status: 'loading', message: 'Validating splat alignment...' }
        : { status: 'none', message: '3D reconstruction not prepared' },
    );

    const runGroundLoad = async () => {
      try {
        await disposeActiveViewerSerialized();
        if (token !== groundGenerationRef.current || controller.signal.aborted) return;

        const grid = await readHeightfield(targetLocation, controller.signal);
        if (token !== groundGenerationRef.current || controller.signal.aborted || !grid) return;

        // Validate initial camera placement over valid DEM triangles before building geometry
        const initialSample = sampleHeightAndSlope(
          grid,
          camMeta.position[0],
          camMeta.position[2],
        );
        if (initialSample === null) {
          throw new Error(
            'Initial camera position from metadata lies over NoData or outside DEM extent.',
          );
        }

        const buffers = await buildTerrainInWorker(grid, controller.signal);
        if (token !== groundGenerationRef.current || controller.signal.aborted) return;

        const terrainGeo = new THREE.BufferGeometry();
        terrainGeo.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
        terrainGeo.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3));
        terrainGeo.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
        terrainGeo.computeBoundingBox();
        terrainGeo.computeBoundingSphere();

        const terrainColor =
          targetLocation.body === 'mars'
            ? 0x8a5b48
            : targetLocation.body === 'moon'
              ? 0x7a7f87
              : 0x6f7a73;
        const terrainMat = new THREE.MeshStandardMaterial({
          color: terrainColor,
          roughness: 0.92,
          metalness: 0.04,
        });
        const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
        terrainMesh.name = `dem-terrain-${targetLocation.id}`;
        groundGroup.add(terrainMesh);

        activeHeightfieldRef.current = grid;
        demTriangleCountRef.current = buffers.indices.length / 3;
        verticalDatumRef.current = hmMeta.vertical_datum;
        verticalOriginRef.current = hmMeta.origin.elevation_m;

        // Place camera strictly from metadata
        camera.fov = camMeta.fov;
        camera.near = camMeta.near;
        camera.far = camMeta.far;
        camera.position.set(camMeta.position[0], camMeta.position[1], camMeta.position[2]);
        camera.lookAt(camMeta.lookAt[0], camMeta.lookAt[1], camMeta.lookAt[2]);
        camera.updateProjectionMatrix();

        setGroundHudReadout((prev) => ({
          ...prev,
          pos: [...camMeta.position] as [number, number, number],
          absElev: camMeta.position[1] + grid.verticalOrigin_m,
          slopeDeg: initialSample.slope_deg,
        }));
        setGroundLoading(false);

        // Render DEM immediately before attempting optional splat load
        renderer.render(scene, camera);

        const splatMeta = targetLocation.assets.splat;
        if (!splatMeta) {
          setSplatStatus({ status: 'none', message: '3D reconstruction not prepared' });
          return;
        }

        const otherBytes = hmMeta.asset.bytes + hmMeta.valid_mask.bytes;
        const eligibility = canRenderSplatOnMetricTerrain(splatMeta, otherBytes);
        if (!eligibility.ok) {
          setSplatStatus({ status: 'rejected', message: eligibility.reason });
          return;
        }

        const splatBytes = await fetchVerifiedAsset(
          splatMeta.asset, controller.signal, MAX_SCENE_ASSET_BYTES_BUDGET - otherBytes,
        );
        if (token !== groundGenerationRef.current || controller.signal.aborted) return;
        validateSplatPayload(splatBytes, splatMeta.format, splatMeta.gaussian_count, splatMeta.world_from_asset);
        setSplatStatus({
          status: 'loading',
          message: `Loading ${splatMeta.gaussian_count.toLocaleString()} Gaussians...`,
        });

        await splatQueueRef.current.catch(() => {});
        if (token !== groundGenerationRef.current || controller.signal.aborted) return;

        const viewer = new Viewer({
          renderer,
          camera,
          threeScene: scene,
          rootElement: mountEl,
          selfDrivenMode: false,
          useBuiltInControls: false,
          sharedMemoryForWorkers: false,
          gpuAcceleratedSort: false,
        });
        activeSplatViewerRef.current = viewer;

        const loadTask = splatQueueRef.current.then(async () => {
          if (token !== groundGenerationRef.current || controller.signal.aborted) {
            // Cleanup already queued this viewer after its load task; it owns disposal.
            return;
          }
          const splatUrl = URL.createObjectURL(new Blob([splatBytes], { type: 'application/octet-stream' }));
          try {
            const formatOptions = { format: splatSdkFormat(splatMeta.format) };
            const load = viewer.addSplatScene(splatUrl, {
              ...formatOptions,
              showLoadingUI: false,
              progressiveLoad: false,
              position: eligibility.transform.position,
              rotation: eligibility.transform.quaternion,
              scale: eligibility.transform.scale,
            });
            activeSplatLoad = load;
            await load.promise;
          } finally {
            activeSplatLoad = null;
            URL.revokeObjectURL(splatUrl);
          }
        });
        splatQueueRef.current = loadTask.catch(() => {});

        await loadTask;

        if (token !== groundGenerationRef.current || controller.signal.aborted) {
          return;
        }

        splatReadyRef.current = true;
        setSplatStatus({
          status: 'ready',
          gaussianCount: splatMeta.gaussian_count,
          provenance: splatMeta.geometry_provenance,
        });
      } catch (err) {
        if (
          token !== groundGenerationRef.current ||
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === 'AbortError')
        ) {
          return;
        }
        if (activeHeightfieldRef.current !== null) {
          // DEM succeeded; error came from splat load -> keep DEM active as honest fallback!
          splatReadyRef.current = false;
          await disposeActiveViewerSerialized();
          if (token === groundGenerationRef.current) {
            setSplatStatus({
              status: 'error',
              message: `Splat overlay failed (${err instanceof Error ? err.message : String(err)}). Showing DEM terrain fallback.`,
            });
          }
        } else {
          setGroundLoading(false);
          setGroundError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    void runGroundLoad();

    return cleanupGroundLoad;
  }, [activeMode, selected, rendererEpoch, rendererReadyEpoch]);

  // 4. Direct Orbit click raycast onto target markers
  const handleCanvasPointerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (contextLost || rendererReadyEpoch !== rendererEpoch) return;
    if (activeMode === 'ground') {
      if (!groundLoading && !groundError && pointerLockControlsRef.current && !pointerLockControlsRef.current.isLocked) {
        try {
          pointerLockControlsRef.current.lock();
        } catch {
          // Pointer lock can fail in headless/non-gesture contexts
        }
      }
      return;
    }

    if (pegmanDragging) return;
    const mountEl = mountRef.current;
    const camera = cameraRef.current;
    if (!mountEl || !camera) return;

    const rect = mountEl.getBoundingClientRect();
    _ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, camera);

    const hitMeshes = markerEntriesRef.current.map((m) => m.hitMesh);
    const hits = _raycaster.intersectObjects(hitMeshes, false);
    if (hits.length > 0) {
      const locId = hits[0].object.userData.locationId as string | undefined;
      if (locId) {
        setOrbitNotice(null);
        onTargetSelectedRef.current(locId);
      }
    }
  };

  // 5. Pegman drag-and-drop onto schematic globe markers
  const findMarkerHitAtClientPoint = (clientX: number, clientY: number): {
    marker: GlobeMarkerEntry | null;
    hitGlobe: boolean;
  } => {
    const mountEl = mountRef.current;
    const camera = cameraRef.current;
    const globeMesh = globeMeshRef.current;
    if (!mountEl || !camera || !globeMesh) {
      return { marker: null, hitGlobe: false };
    }

    const rect = mountEl.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return { marker: null, hitGlobe: false };
    }

    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, camera);

    const hitMeshes = markerEntriesRef.current.map((m) => m.hitMesh);
    const markerHits = _raycaster.intersectObjects(hitMeshes, false);
    if (markerHits.length > 0) {
      const hitId = markerHits[0].object.userData.locationId as string | undefined;
      const entry = markerEntriesRef.current.find((m) => m.location.id === hitId) ?? null;
      if (entry) return { marker: entry, hitGlobe: true };
    }

    // Screen-space snap fallback within 24 CSS px for front-facing markers
    let closest: GlobeMarkerEntry | null = null;
    let closestDist = 24;
    for (const entry of markerEntriesRef.current) {
      entry.group.getWorldPosition(_projVec);
      // Skip markers on far hemisphere relative to camera
      if (_projVec.dot(camera.position) <= 0) continue;
      _projVec.project(camera);
      const sx = ((_projVec.x + 1) / 2) * rect.width + rect.left;
      const sy = ((-_projVec.y + 1) / 2) * rect.height + rect.top;
      const d = Math.hypot(clientX - sx, clientY - sy);
      if (d < closestDist) {
        closestDist = d;
        closest = entry;
      }
    }
    if (closest) return { marker: closest, hitGlobe: true };

    const globeHits = _raycaster.intersectObject(globeMesh, false);
    return { marker: null, hitGlobe: globeHits.length > 0 };
  };

  const handlePegmanPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (activeMode !== 'orbit') return;
    e.preventDefault();
    e.stopPropagation();

    setOrbitNotice(null);
    setPegmanDragging(true);
    setPegmanScreenPos({ x: e.clientX, y: e.clientY });
    if (orbitControlsRef.current) {
      orbitControlsRef.current.enabled = false;
    }

    const onMove = (ev: PointerEvent) => {
      setPegmanScreenPos({ x: ev.clientX, y: ev.clientY });
      const { marker } = findMarkerHitAtClientPoint(ev.clientX, ev.clientY);
      setPegmanHoverName(marker ? marker.location.name : null);
    };

    const finishDrag = (ev: PointerEvent, cancelledDrag: boolean) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);

      setPegmanDragging(false);
      setPegmanScreenPos(null);
      setPegmanHoverName(null);
      if (orbitControlsRef.current && activeModeRef.current === 'orbit') {
        orbitControlsRef.current.enabled = true;
      }
      if (cancelledDrag) return;

      const { marker, hitGlobe } = findMarkerHitAtClientPoint(ev.clientX, ev.clientY);
      if (marker) {
        setOrbitNotice(`Selected prepared AOI: ${marker.location.name}`);
        onTargetSelectedRef.current(marker.location.id);
      } else if (hitGlobe) {
        setOrbitNotice('No prepared data for this area yet');
      }
    };

    const onUp = (ev: PointerEvent) => finishDrag(ev, false);
    const onCancel = (ev: PointerEvent) => finishDrag(ev, true);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onCancel, { once: true });
  };

  const handlePegmanClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (activeMode !== 'orbit') return;
    // Handle keyboard activation (Enter / Space yields detail === 0) without interfering with pointer drags
    if (e.detail !== 0) return;
    const markers = collectBodyMarkers(dataset, activeBody);
    if (markers.length === 0) {
      setOrbitNotice('No prepared data for this area yet');
      return;
    }
    const currentIndex = markers.findIndex((m) => m.location.id === selected?.id);
    const nextEntry = markers[(currentIndex + 1) % markers.length];
    setOrbitNotice(`Selected prepared AOI: ${nextEntry.location.name}`);
    onTargetSelectedRef.current(nextEntry.location.id);
  };

  const handleResetOrbitCamera = () => {
    if (activeMode !== 'orbit' || !cameraRef.current || !orbitControlsRef.current) return;
    cameraRef.current.position.set(0, 0.72, 3.35);
    orbitControlsRef.current.target.set(0, 0, 0);
    orbitControlsRef.current.update();
    requestOrbitRenderRef.current();
  };

  const markersCount = useMemo(
    () => collectBodyMarkers(dataset, activeBody).length,
    [dataset, activeBody],
  );

  return (
    <div
      ref={containerRef}
      data-testid="viewport3d-root"
      data-mode={activeMode}
      data-body={activeBody}
      data-selected-id={selected?.id ?? ''}
      data-splat-status={splatStatus.status}
      data-ground-ready={String(!groundLoading && !groundError && activeMode === 'ground')}
      className="relative h-full w-full overflow-hidden bg-[#07090E] select-none"
    >
      {/* Dedicated WebGL canvas mount node — isolated from React HUD siblings */}
      <div
        ref={mountRef}
        onClick={handleCanvasPointerClick}
        className={`h-full w-full ${activeMode === 'ground' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
      />

      {/* WebGL unavailable or context lost recovery banner */}
      {(webglError || contextLost) && (
        <div
          role="alert"
          data-testid="viewport3d-webgl-error"
          className="absolute inset-0 z-30 flex items-center justify-center bg-[#07090E]/95 p-6"
        >
          <div className="max-w-md border border-amber-500/40 bg-[#0F141E] p-5 text-slate-200">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              <span>{contextLost ? 'WebGL Context Lost' : 'WebGL Unavailable'}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              {webglError ??
                'The graphics context was interrupted. Reload the viewport renderer to resume 3D inspection.'}
            </p>
            {contextLost && (
              <button
                type="button"
                onClick={() => setRendererEpoch((n) => n + 1)}
                className="mt-4 inline-flex items-center gap-1.5 border border-cyan-500/50 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore Renderer
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top viewport overlay: non-overlapping context stack + mode/body controls */}
      <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-col gap-1.5 sm:inset-x-3 sm:top-3 sm:gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col items-start gap-1">
          <div className="pointer-events-auto inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 border border-slate-800 bg-[#0B1018]/90 px-2.5 py-1 text-[11px] text-slate-300 sm:py-1.5 sm:text-xs">
            <Globe className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            <span className="font-medium text-slate-100">
              {activeMode === 'orbit'
                ? `Schematic Reference Globe · ${formatBodyName(activeBody)} (non-DEM)`
                : `Ground ENU Terrain · ${selected?.name ?? 'Unselected'}`}
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-400">
              {activeMode === 'orbit'
                ? `${markersCount} prepared marker${markersCount === 1 ? '' : 's'}`
                : selected
                  ? formatCoordinateFrame(selected.coordinates.frame)
                  : 'No target'}
            </span>
          </div>

          {!canEnterGround && groundUnavailableReason && activeMode === 'orbit' && (
            <div
              id="ground-disabled-reason-text"
              data-testid="ground-disabled-reason"
              className="pointer-events-auto max-w-md border border-slate-800/90 bg-[#0B1018]/90 px-2.5 py-1 text-[11px] text-slate-400"
            >
              Ground mode locked: {groundUnavailableReason}
            </div>
          )}

          {orbitNotice && activeMode === 'orbit' && (
            <div
              role="status"
              data-testid="viewport3d-orbit-notice"
              className="pointer-events-auto max-w-sm border border-amber-500/40 bg-[#0F141E]/95 px-3 py-1.5 text-xs text-amber-200"
            >
              {orbitNotice}
            </div>
          )}

          {activeMode === 'ground' && groundLoading && (
            <div className="pointer-events-auto border border-cyan-500/40 bg-[#0F141E]/95 px-3 py-1.5 text-xs text-cyan-200">
              Loading verified DEM heightfield &amp; building mesh in worker...
            </div>
          )}

          {activeMode === 'ground' && groundError && (
            <div
              role="alert"
              data-testid="viewport3d-ground-error"
              className="pointer-events-auto max-w-md border border-rose-500/50 bg-[#0F141E]/95 px-3 py-2 text-xs text-rose-200"
            >
              {groundError}
            </div>
          )}

          {activeMode === 'ground' && !groundLoading && !groundError && (
            <div
              data-testid="viewport3d-splat-banner"
              className={`pointer-events-auto max-w-md border px-3 py-1.5 text-xs ${
                splatStatus.status === 'ready'
                  ? 'border-cyan-500/35 bg-[#0B1018]/95 text-cyan-200'
                  : splatStatus.status === 'error' || splatStatus.status === 'rejected'
                    ? 'border-amber-500/40 bg-[#0F141E]/95 text-amber-200'
                    : 'border-slate-800 bg-[#0B1018]/95 text-slate-300'
              }`}
            >
              {splatStatus.status === 'ready'
                ? `Gaussian Splat active (${splatStatus.gaussianCount.toLocaleString()} splats · ${splatStatus.provenance})`
                : splatStatus.message}
            </div>
          )}
        </div>

        {/* Viewport mode & body controls */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 md:shrink-0 md:justify-end">
          {activeMode === 'orbit' && (
            <div
              role="group"
              aria-label="Planetary body selector"
              className="flex items-center border border-slate-800 bg-[#0B1018]/95 p-0.5"
            >
              {(['earth', 'moon', 'mars'] as const).map((bodyKey) => (
                <button
                  key={bodyKey}
                  type="button"
                  aria-pressed={activeBody === bodyKey}
                  onClick={() => setBody(bodyKey)}
                  data-testid={`body-btn-${bodyKey}`}
                  className={`px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                    activeBody === bodyKey
                      ? 'bg-cyan-500/20 text-cyan-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {formatBodyName(bodyKey)}
                </button>
              ))}
            </div>
          )}

          <div
            role="group"
            aria-label="Viewport navigation mode"
            className="flex items-center border border-slate-800 bg-[#0B1018]/95 p-0.5"
          >
            <button
              type="button"
              aria-pressed={activeMode === 'orbit'}
              onClick={() => setMode('orbit')}
              data-testid="mode-btn-orbit"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                activeMode === 'orbit'
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              Orbit
            </button>
            <button
              type="button"
              disabled={!canEnterGround}
              aria-pressed={activeMode === 'ground'}
              aria-describedby={!canEnterGround ? 'ground-disabled-reason-text' : undefined}
              title={groundUnavailableReason ?? 'Enter DEM-constrained Ground mode'}
              onClick={() => canEnterGround && setMode('ground')}
              data-testid="mode-btn-ground"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                activeMode === 'ground'
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : canEnterGround
                    ? 'text-slate-300 hover:text-white'
                    : 'cursor-not-allowed text-slate-600'
              }`}
            >
              <Footprints className="h-3.5 w-3.5" />
              Ground
            </button>
          </div>

          {activeMode === 'orbit' && (
            <button
              type="button"
              onClick={handleResetOrbitCamera}
              title="Reset orbital view"
              aria-label="Reset orbital view"
              className="inline-flex items-center gap-1 border border-slate-800 bg-[#0B1018]/95 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <Compass className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap">Reset View</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom-left Pegman drag handle (Orbit) or PointerLock instructions (Ground) */}
      <div className="pointer-events-auto absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2">
        {activeMode === 'orbit' ? (
          <div className="flex items-center gap-2 border border-slate-800 bg-[#0B1018]/95 px-2.5 py-1.5 text-xs text-slate-300">
            <button
              type="button"
              data-testid="pegman-handle"
              onPointerDown={handlePegmanPointerDown}
              onClick={handlePegmanClick}
              title="Drag onto a target marker on the schematic globe, or press Enter to cycle prepared AOIs"
              className="inline-flex cursor-grab items-center gap-1.5 border border-amber-500/45 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/25 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              <Move className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap">Pegman AOI Drop</span>
            </button>
            <span className="hidden sm:inline text-slate-400">
              Drag onto a marker to select target · Drag globe to orbit · Scroll to zoom
            </span>
          </div>
        ) : (
          <div
            data-testid="ground-controls-hint"
            className="flex items-center gap-2 border border-slate-800 bg-[#0B1018]/95 px-3 py-1.5 text-xs text-slate-300"
          >
            {pointerLocked ? (
              <>
                <Lock className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span>Mouse look locked · WASD move (DEM constrained) · Press Esc to unlock</span>
              </>
            ) : (
              <>
                <Unlock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>
                  Click terrain viewport to capture mouse look · WASD walk · Esc unlock
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Floating Pegman drag ghost */}
      {pegmanDragging && pegmanScreenPos && (
        <div
          style={{
            transform: `translate(${pegmanScreenPos.x + 12}px, ${pegmanScreenPos.y - 16}px)`,
          }}
          className="pointer-events-none fixed top-0 left-0 z-50 border border-amber-400/70 bg-[#0B1018]/95 px-2.5 py-1 text-xs font-medium text-amber-200"
        >
          {pegmanHoverName ? `Snap to AOI: ${pegmanHoverName}` : 'Drop on prepared marker'}
        </div>
      )}
    </div>
  );
}
