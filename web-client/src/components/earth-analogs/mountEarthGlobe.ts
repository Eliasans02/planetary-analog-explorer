import type { ResearchRegion } from '../../data/globalAnalogs';
import { researchGlobeMarkers } from './researchGlobeMarkers';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { EarthDiscovery } from '@shared/types/earth-discovery';
import type { PlanetView } from '../PlanetViewport';
import { loadEarthContext, type EarthContextManifest } from '../../data/earthContext';
import { latLonToPoint } from '../../terrain/planetGeometry';
import { attachGlobeOverlays, computeSearchCenter, createEarthSphereGeometry } from './earthGlobeGeometry';
import { createEarthGlobeTiles, type EarthImageryStatus } from './earthGlobeTiles';

export interface GlobeActions {
  centerOnSearch: () => void;
  globalView: () => void;
  zoomBy: (factor: number) => void;
  updateCandidate: (candidateId: string) => void;
  retryImagery: () => void;
  updateRegions: (regions: ResearchRegion[]) => void;
}
const MIN_ZOOM_DISTANCE = 1.15;
const DEFAULT_GLOBAL_DISTANCE = 3.3;
const DEFAULT_CENTER_DISTANCE = 2.05;
const ARROW_STEP_RAD = 0.14;
const ZOOM_STEP_FACTOR = 0.82;
export function mountEarthGlobe(container: HTMLDivElement, discovery: EarthDiscovery, options: {
  getCandidateId: () => string;
  getRegions?: () => ResearchRegion[];
  onRegionChange?: (id: string) => void;
  initialView?: PlanetView;
  onViewChange: (view: PlanetView) => void;
  onShowMap: () => void;
  onState: (state: 'loading' | 'ready' | 'error') => void;
  onError: (message: string | null) => void;
  onManifest: (manifest: EarthContextManifest | null) => void;
  onResolution: (width: number) => void;
  onImageryStatus: (status: EarthImageryStatus) => void;
  setActions: (actions: GlobeActions | null) => void;
}) {
  const searchCenter = computeSearchCenter(discovery);
    const abort = new AbortController();
    let disposed = false;
    let rafId = 0;
    let flightId = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let loadedBitmap: ImageBitmap | null = null;
    let loadedTexture: THREE.Texture | null = null;
    let tiles: ReturnType<typeof createEarthGlobeTiles> | undefined;
    let researchPins: ReturnType<typeof researchGlobeMarkers> | undefined;
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    let removeListeners = () => {};

    options.onState('loading');
    options.onError(null);
    options.onManifest(null);
    options.onResolution(2048);
    options.onImageryStatus('overview');

    void (async () => {
      try {
        const result = await loadEarthContext(abort.signal);
        if (disposed || abort.signal.aborted) {
          result.bitmap.close();
          return;
        }
        loadedBitmap = result.bitmap;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#06070a');
        const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 30);
        camera.position.set(
          ...latLonToPoint(searchCenter.lat, searchCenter.lon, DEFAULT_GLOBAL_DISTANCE),
        );

        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
        } catch {
          throw new Error('WebGL is unavailable in this browser.');
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const canvas = renderer.domElement;
        canvas.tabIndex = 0;
        canvas.setAttribute(
          'aria-label',
          `3D spherical Earth context globe showing ${discovery.domain.name}. Drag to orbit, scroll or use plus and minus keys to zoom, and use arrow keys to rotate.`,
        );
        container.appendChild(canvas);

        const texture = new THREE.Texture(result.bitmap);
        texture.flipY = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        loadedTexture = texture;

        const invalidate = () => {
          if (disposed || rafId !== 0) return;
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            if (!disposed && renderer) renderer.render(scene, camera);
          });
        };

        const sphereGeom = createEarthSphereGeometry();
        geometries.push(sphereGeom);
        const earthMat = new THREE.MeshLambertMaterial({ map: texture, color: 0xffffff });
        materials.push(earthMat);
        const earthMesh = new THREE.Mesh(sphereGeom, earthMat);
        scene.add(earthMesh);
        tiles = createEarthGlobeTiles(scene, camera, renderer, invalidate, options.onImageryStatus);

        if (renderer.capabilities.maxTextureSize >= 5400) {
          void loadEarthContext(abort.signal, 'detail').then(detail => {
            if (disposed || abort.signal.aborted) { detail.bitmap.close(); return; }
            const sharper = new THREE.Texture(detail.bitmap);
            sharper.flipY = false;
            sharper.colorSpace = THREE.SRGBColorSpace;
            sharper.anisotropy = Math.min(8, renderer!.capabilities.getMaxAnisotropy());
            sharper.needsUpdate = true;
            earthMat.map = sharper;
            loadedTexture?.dispose(); loadedBitmap?.close();
            loadedTexture = sharper; loadedBitmap = detail.bitmap;
            canvas.dataset.baseResolution = String(detail.bitmap.width);
            options.onResolution(detail.bitmap.width);
            invalidate();
          }).catch(() => { /* Keep the verified overview if detail imagery is unavailable. */ });
        }

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.78);
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.52);
        scene.add(ambientLight, keyLight);

        researchPins = researchGlobeMarkers(scene, options.getRegions?.() ?? []);
        canvas.dataset.researchPins = String(options.getRegions?.().length ?? 0);
        const overlays = attachGlobeOverlays(scene, discovery, geometries, materials);
        const applyCandidateGeometry = (candId: string) => {
          const cand =
            discovery.candidates.find((c) => c.id === candId) ??
            discovery.candidates[0] ??
            null;
          overlays.updateSelected(cand);
          overlays.updateMarkerScale(camera, container.clientHeight);
          researchPins?.update(camera, container.clientHeight);
          invalidate();
        };
        applyCandidateGeometry(options.getCandidateId());

        controls = new OrbitControls(camera, canvas);
        controls.enablePan = false;
        controls.enableDamping = false;
        controls.autoRotate = false;
        controls.minDistance = MIN_ZOOM_DISTANCE;
        controls.maxDistance = 8.5;
        controls.minPolarAngle = 0.05;
        controls.maxPolarAngle = Math.PI - 0.05;

        let fitGlobalDist = DEFAULT_GLOBAL_DISTANCE;
        let viewReady = false;
        const updateLightAndRender = () => {
          if (viewReady && controls) {
            const view = { azimuth: controls.getAzimuthalAngle(), polar: controls.getPolarAngle(), distance: camera.position.length(), fitDistance: fitGlobalDist };
            canvas.dataset.view = JSON.stringify(view);
            options.onViewChange(view);
          }
          keyLight.position.copy(camera.position).normalize().multiplyScalar(4);
          overlays.updateMarkerScale(camera, container.clientHeight);
          researchPins?.update(camera, container.clientHeight);
          if (viewReady) tiles?.update();
          invalidate();
        };
        controls.addEventListener('change', updateLightAndRender);

        const setCameraPoint = (lat: number, lon: number, dist: number) => {
          if (!controls) return;
          const clamped = Math.max(controls.minDistance, Math.min(controls.maxDistance, dist));
          camera.position.set(...latLonToPoint(lat, lon, clamped));
          controls.update();
          updateLightAndRender();
        };
        const stopFlight = () => { cancelAnimationFrame(flightId); flightId = 0; };
        controls.addEventListener('start', stopFlight);
        const flyTo = (lat: number, lon: number, distance: number) => {
          stopFlight();
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setCameraPoint(lat, lon, distance);
            return;
          }
          const start = camera.position.clone();
          const destination = new THREE.Vector3(...latLonToPoint(lat, lon, distance));
          const rotation = new THREE.Quaternion().setFromUnitVectors(start.clone().normalize(), destination.clone().normalize());
          const startedAt = performance.now();
          const step = (now: number) => {
            if (disposed) return;
            const progress = Math.min(1, (now - startedAt) / 650);
            const eased = progress * progress * (3 - 2 * progress);
            camera.position.copy(start).normalize().applyQuaternion(new THREE.Quaternion().slerp(rotation, eased))
              .multiplyScalar(THREE.MathUtils.lerp(start.length(), distance, eased));
            controls?.update();
            updateLightAndRender();
            flightId = progress < 1 ? requestAnimationFrame(step) : 0;
          };
          flightId = requestAnimationFrame(step);
        };
        const zoomBy = (factor: number) => {
          if (!controls) return;
          const next = Math.max(
            controls.minDistance,
            Math.min(controls.maxDistance, camera.position.length() * factor),
          );
          stopFlight();
          camera.position.normalize().multiplyScalar(next);
          controls.update();
          updateLightAndRender();
        };

        options.setActions({
          centerOnSearch: () => {
            const targetCand =
              discovery.candidates.find((c) => c.id === options.getCandidateId()) ?? null;
            flyTo(
              targetCand?.latitude ?? searchCenter.lat,
              targetCand?.longitude ?? searchCenter.lon,
              Math.min(camera.position.length(), DEFAULT_CENTER_DISTANCE),
            );
          },
          globalView: () => flyTo(searchCenter.lat, searchCenter.lon, fitGlobalDist),
          zoomBy,
          updateCandidate: applyCandidateGeometry,
          retryImagery: () => tiles?.retry(),
          updateRegions: regions => {
            researchPins?.dispose();
            researchPins = researchGlobeMarkers(scene, regions);
            researchPins.update(camera, container.clientHeight);
            canvas.dataset.researchPins = String(regions.length);
            invalidate();
          },
        });

        const onKeyDown = (e: KeyboardEvent) => {
          if (!controls) return;
          stopFlight();
          const spherical = new THREE.Spherical().setFromVector3(camera.position);
          if (e.key === 'ArrowLeft') spherical.theta -= ARROW_STEP_RAD;
          else if (e.key === 'ArrowRight') spherical.theta += ARROW_STEP_RAD;
          else if (e.key === 'ArrowUp') spherical.phi = Math.max(0.05, spherical.phi - ARROW_STEP_RAD);
          else if (e.key === 'ArrowDown')
            spherical.phi = Math.min(Math.PI - 0.05, spherical.phi + ARROW_STEP_RAD);
          else if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            zoomBy(ZOOM_STEP_FACTOR);
            return;
          } else if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            zoomBy(1 / ZOOM_STEP_FACTOR);
            return;
          } else if (e.key === '0' || e.key === 'Home') {
            e.preventDefault();
            setCameraPoint(searchCenter.lat, searchCenter.lon, fitGlobalDist);
            return;
          } else return;

          e.preventDefault();
          camera.position.setFromSpherical(spherical);
          controls.update();
          updateLightAndRender();
        };

        const onContextLost = (e: Event) => {
          e.preventDefault();
          if (!disposed) {
            options.onState('error');
            options.onError('WebGL graphics context was interrupted. Return to 2D map or retry.');
          }
        };

        let pointerStart = { x: 0, y: 0 };
        const pointerDown = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY }; };
        const pointerUp = (event: PointerEvent) => {
          if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) return;
          const rect = canvas.getBoundingClientRect();
          const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
          const ray = new THREE.Raycaster();
          ray.setFromCamera(pointer, camera);
          const hit = ray.intersectObject(earthMesh)[0];
          const region = researchPins?.pick(ray, hit?.distance ?? Infinity);
          if (region) {
            if (discovery.candidates[0]?.id.startsWith(`${region.id}-`)) options.onShowMap();
            else options.onRegionChange?.(region.id);
            return;
          }
          const candidate = discovery.candidates.find(item => item.id === options.getCandidateId());
          const location = new THREE.Vector3(...latLonToPoint(candidate?.latitude ?? searchCenter.lat, candidate?.longitude ?? searchCenter.lon));
          const hitRadius = Math.min(0.06, 40 * camera.position.distanceTo(location) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, container.clientHeight));
          if (hit && hit.point.distanceTo(location) < hitRadius) options.onShowMap();
        };
        canvas.addEventListener('pointerdown', pointerDown);
        canvas.addEventListener('pointerup', pointerUp);
        canvas.addEventListener('keydown', onKeyDown);
        canvas.addEventListener('webglcontextlost', onContextLost);
        removeListeners = () => {
          canvas.removeEventListener('pointerdown', pointerDown);
          canvas.removeEventListener('pointerup', pointerUp);
          canvas.removeEventListener('keydown', onKeyDown);
          canvas.removeEventListener('webglcontextlost', onContextLost);
        };

        const handleResize = () => {
          if (!renderer || !controls || disposed) return;
          const w = Math.max(1, container.clientWidth);
          const h = Math.max(1, container.clientHeight);
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
          // Stop before stretching the finest 500 m imagery beyond useful detail.
          controls.minDistance = Math.max(MIN_ZOOM_DISTANCE, 1 + (2.25 / 512 * Math.PI / 180) * h * renderer.getPixelRatio() / (2 * Math.tan(halfFov) * 1.25));
          if (camera.position.length() < controls.minDistance) camera.position.normalize().multiplyScalar(controls.minDistance);
          const fit =
            1.02 / Math.sin(Math.atan(Math.tan(halfFov) * Math.min(camera.aspect, 1))) * 1.05;
          fitGlobalDist = Math.max(DEFAULT_GLOBAL_DISTANCE, fit);
          controls.maxDistance = Math.max(8.5, fitGlobalDist * 1.4);
          updateLightAndRender();
        };

        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(container);
        handleResize();
        const saved = options.initialView;
        if (saved && [saved.azimuth, saved.polar, saved.distance].every(Number.isFinite)) {
          camera.position.setFromSpherical(new THREE.Spherical(
            Math.max(controls.minDistance, Math.min(controls.maxDistance, saved.distance)),
            Math.max(0.05, Math.min(Math.PI - 0.05, saved.polar)), saved.azimuth,
          ));
          controls.update();
        } else setCameraPoint(searchCenter.lat, searchCenter.lon, fitGlobalDist);
        viewReady = true;
        updateLightAndRender();

        options.onManifest(result.manifest);
        options.onState('ready');
      } catch (err) {
        loadedTexture?.dispose();
        loadedTexture = null;
        loadedBitmap?.close();
        loadedBitmap = null;
        if (disposed || abort.signal.aborted) return;
        options.onState('error');
        options.onError(
          err instanceof Error ? err.message : 'Unable to initialize 3D Earth context globe.',
        );
      }
    })();

    return () => {
      disposed = true;
      abort.abort();
      if (rafId !== 0) cancelAnimationFrame(rafId);
      cancelAnimationFrame(flightId);
      options.setActions(null);
      resizeObserver?.disconnect();
      removeListeners();
      controls?.dispose();
      researchPins?.dispose();
      tiles?.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      loadedTexture?.dispose();
      loadedBitmap?.close();
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
    };
}
