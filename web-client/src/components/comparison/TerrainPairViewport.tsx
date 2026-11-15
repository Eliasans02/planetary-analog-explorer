import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  comparisonCameraDistance,
  profileLinePositions,
  type ProfileDirection,
} from './terrainComparisonMath';
import { terrainScene, updateSurface, disposeAxisLabels, scaleAxisLabels, type TerrainSurface } from './terrainScientificScene';

interface TerrainPairViewportProps {
  earthHeights: number[];
  targetHeights: number[];
  earthName: string;
  targetName: string;
  direction: ProfileDirection;
  profileIndex: number;
  verticalExaggeration: 1 | 3;
  elevationMaximum: number;
  showContours: boolean;
  showMesh: boolean;
}

interface TerrainApi {
  earth: TerrainSurface;
  target: TerrainSurface;
  canvas: HTMLCanvasElement;
  invalidate: () => void;
}

export function TerrainPairViewport({
  earthHeights,
  targetHeights,
  earthName,
  targetName,
  direction,
  profileIndex,
  verticalExaggeration,
  elevationMaximum,
  showContours,
  showMesh,
}: TerrainPairViewportProps) {
  const host = useRef<HTMLDivElement>(null);
  const terrainApi = useRef<TerrainApi | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const resources = { geometries: [] as THREE.BufferGeometry[], materials: [] as THREE.Material[] };
    setError(null);

    const fail = () => {
      if (!disposed) setError('Interactive terrain rendering is unavailable on this device. The measured elevation profile remains available below.');
    };

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.autoClear = false;
      renderer.domElement.className = 'tc-canvas';
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute('role', 'region');
      container.appendChild(renderer.domElement);

      const earth = terrainScene('#ffffff', resources);
      const target = terrainScene('#ffffff', resources);
      const camera = new THREE.PerspectiveCamera(36, 1, 1, 8000);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false;
      controls.enablePan = false;
      controls.target.set(0, 60, 0);
      controls.minDistance = 320;
      controls.maxDistance = 7000;
      controls.maxPolarAngle = Math.PI * 0.48;

      const render = () => {
        if (!renderer || disposed) return;
        const width = Math.max(2, container.clientWidth);
        const height = Math.max(2, container.clientHeight);
        const stacked = width < 640;
        const half = Math.floor((stacked ? height : width) / 2);
        renderer.setSize(width, height, false);
        camera.aspect = stacked ? width / half : half / height;
        camera.updateProjectionMatrix();
        scaleAxisLabels(earth.surface.labels, camera, stacked ? half : height);
        scaleAxisLabels(target.surface.labels, camera, stacked ? half : height);
        renderer.setScissorTest(true);
        renderer.setViewport(0, stacked ? half : 0, stacked ? width : half, stacked ? height - half : height);
        renderer.setScissor(0, stacked ? half : 0, stacked ? width : half, stacked ? height - half : height);
        renderer.setClearColor('#07131b', 1);
        renderer.clear(true, true, true);
        renderer.render(earth.scene, camera);
        renderer.setViewport(stacked ? 0 : half, 0, stacked ? width : width - half, stacked ? half : height);
        renderer.setScissor(stacked ? 0 : half, 0, stacked ? width : width - half, stacked ? half : height);
        renderer.setClearColor('#0d1115', 1);
        renderer.clear(true, true, true);
        renderer.render(target.scene, camera);
        renderer.setScissorTest(false);
      };
      const invalidate = () => {
        if (disposed || frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          render();
        });
      };
      const fitCamera = (resetDirection: boolean) => {
        const stacked = container.clientWidth < 640;
        const distance = comparisonCameraDistance(container.clientWidth / (stacked ? 1 : 2), container.clientHeight / (stacked ? 2 : 1));
        if (!resetDirection && controls && controls.getDistance() >= distance) return;
        const directionVector = resetDirection
          ? new THREE.Vector3(1, 0.72, 1).normalize()
          : camera.position.clone().sub(controls!.target).normalize();
        camera.position.copy(controls!.target).addScaledVector(directionVector, distance);
        controls!.update();
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (!controls) return;
        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        if (event.key === 'ArrowLeft') spherical.theta -= Math.PI / 18;
        else if (event.key === 'ArrowRight') spherical.theta += Math.PI / 18;
        else if (event.key === 'ArrowUp') spherical.phi = Math.max(0.16, spherical.phi - Math.PI / 24);
        else if (event.key === 'ArrowDown') spherical.phi = Math.min(Math.PI * 0.48, spherical.phi + Math.PI / 24);
        else if (event.key === '+' || event.key === '=') spherical.radius = Math.max(controls.minDistance, spherical.radius * 0.86);
        else if (event.key === '-' || event.key === '_') spherical.radius = Math.min(controls.maxDistance, spherical.radius * 1.16);
        else if (event.key === 'Home') {
          fitCamera(true);
          event.preventDefault();
          invalidate();
          return;
        } else return;
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
        controls.update();
        event.preventDefault();
        invalidate();
      };
      terrainApi.current = { earth: earth.surface, target: target.surface, canvas: renderer.domElement, invalidate };
      controls.addEventListener('change', invalidate);
      fitCamera(true);
      controls.update();
      resizeObserver = new ResizeObserver(() => {
        fitCamera(false);
        invalidate();
      });
      resizeObserver.observe(container);
      const onContextLost = (event: Event) => {
        event.preventDefault();
        fail();
      };
      renderer.domElement.addEventListener('keydown', onKeyDown);
      renderer.domElement.addEventListener('webglcontextlost', onContextLost);
      invalidate();

      return () => {
        disposed = true;
        disposeAxisLabels(earth.surface.labels);
        disposeAxisLabels(target.surface.labels);
        terrainApi.current = null;
        if (frame) cancelAnimationFrame(frame);
        resizeObserver?.disconnect();
        controls?.removeEventListener('change', invalidate);
        controls?.dispose();
        renderer?.domElement.removeEventListener('keydown', onKeyDown);
        renderer?.domElement.removeEventListener('webglcontextlost', onContextLost);
        resources.geometries.forEach(resource => resource.dispose());
        resources.materials.forEach(resource => resource.dispose());
        renderer?.forceContextLoss();
        renderer?.dispose();
        renderer?.domElement.remove();
      };
    } catch {
      fail();
      resources.geometries.forEach(resource => resource.dispose());
      resources.materials.forEach(resource => resource.dispose());
      renderer?.forceContextLoss();
      renderer?.dispose();
      renderer?.domElement.remove();
    }
  }, []);

  useEffect(() => {
    const api = terrainApi.current;
    if (!api) return;
    updateSurface(api.earth, earthHeights, verticalExaggeration, elevationMaximum);
    updateSurface(api.target, targetHeights, verticalExaggeration, elevationMaximum);
    api.invalidate();
  }, [earthHeights, targetHeights, verticalExaggeration, elevationMaximum]);

  useEffect(() => {
    const api = terrainApi.current;
    if (!api) return;
    for (const surface of [api.earth, api.target]) {
      surface.contours.visible = showContours;
      surface.wireframe.visible = showMesh;
    }
    api.canvas.dataset.contours = String(showContours);
    api.canvas.dataset.mesh = String(showMesh);
    api.invalidate();
  }, [showContours, showMesh]);

  useEffect(() => {
    const api = terrainApi.current;
    if (!api) return;
    api.earth.profilePositions.copyArray(profileLinePositions(earthHeights, direction, profileIndex, verticalExaggeration));
    api.target.profilePositions.copyArray(profileLinePositions(targetHeights, direction, profileIndex, verticalExaggeration));
    api.earth.profilePositions.needsUpdate = true;
    api.target.profilePositions.needsUpdate = true;
    api.earth.profileGeometry.computeBoundingSphere();
    api.target.profileGeometry.computeBoundingSphere();
    api.invalidate();
  }, [direction, earthHeights, profileIndex, targetHeights, verticalExaggeration]);

  useEffect(() => {
    terrainApi.current?.canvas.setAttribute('aria-label', `${earthName} and ${targetName}: synchronized interactive terrain comparison. Drag to orbit, scroll or plus and minus to zoom, use arrow keys to rotate, and Home to reset.`);
  }, [earthName, targetName]);

  return (
    <div className="tc-viewport" ref={host}>
      <div className="tc-viewport-label tc-viewport-label-earth"><span>EARTH WINDOW</span><strong>{earthName}</strong></div>
      <div className="tc-viewport-label tc-viewport-label-target"><span>{targetName.toUpperCase()}</span><strong>{targetName}</strong></div>
      <div className="tc-divider" aria-hidden="true" />
      {error && <div className="tc-render-error" role="status">{error}</div>}
    </div>
  );
}
