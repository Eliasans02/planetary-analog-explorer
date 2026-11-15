import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { EarthDiscovery } from '@shared/types/earth-discovery';
import { latLonToPoint, pointToLatLon } from '../../terrain/planetGeometry';
import { attachGlobeOverlays, computeSearchCenter, createEarthSphereGeometry, ringToSpherePositions } from './earthGlobeGeometry';

const discovery: EarthDiscovery = JSON.parse(readFileSync(new URL('../../../public/data/earth_discovery.json', import.meta.url), 'utf8'));

describe('Earth globe geographic overlays', () => {
  it('centers the closed search ring without duplicating its first corner', () => {
    const center = computeSearchCenter(discovery);
    expect(center.lat).toBeCloseTo(43.5, 3);
    expect(center.lon).toBeCloseTo(54.5, 3);
    const positions = ringToSpherePositions(discovery.domain.footprint, 1.003);
    const point = pointToLatLon(positions[0], positions[1], positions[2]);
    expect(point.longitude_deg).toBeCloseTo(discovery.domain.footprint[0][0], 4);
    expect(point.latitude_deg).toBeCloseTo(discovery.domain.footprint[0][1], 4);
  });
  it('reuses the candidate GPU attribute while moving the actual footprint', () => {
    const scene = new THREE.Scene();
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const overlay = attachGlobeOverlays(scene, discovery, geometries, materials);
    overlay.updateSelected(discovery.candidates[0]);
    const candidate = scene.children[1] as THREE.Line;
    const attribute = candidate.geometry.getAttribute('position');
    const before = [...attribute.array];
    overlay.updateSelected(discovery.candidates[1]);
    expect(candidate.geometry.getAttribute('position')).toBe(attribute);
    expect([...attribute.array]).not.toEqual(before);
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
  });
  it('keeps the locator hollow and occluded by Earth from the far side', () => {
    const scene = new THREE.Scene();
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const earth = new THREE.Mesh(createEarthSphereGeometry(), new THREE.MeshBasicMaterial());
    scene.add(earth);
    const overlay = attachGlobeOverlays(scene, discovery, geometries, materials);
    const selected = discovery.candidates[0];
    overlay.updateSelected(selected);
    scene.updateMatrixWorld(true);
    const ring = scene.children.at(-1) as THREE.Mesh;
    const target = ring.localToWorld(new THREE.Vector3(0.018, 0, 0));
    const camera = new THREE.Vector3(...latLonToPoint(selected.latitude, selected.longitude, 3.3));
    const ray = new THREE.Raycaster(camera, target.clone().sub(camera).normalize());
    expect(ray.intersectObjects([earth, ring], false)[0].object).toBe(ring);
    camera.negate(); ray.set(camera, target.clone().sub(camera).normalize());
    expect(ray.intersectObjects([earth, ring], false)[0].object).toBe(earth);
    expect((ring.geometry as THREE.RingGeometry).parameters.innerRadius).toBeGreaterThan(0);
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
    earth.geometry.dispose(); earth.material.dispose();
  });
  it('keeps the locator at a readable screen size when zooming into regional imagery', () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 0.05, 30);
    const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
    const overlay = attachGlobeOverlays(scene, discovery, geometries, materials);
    const candidate = discovery.candidates[0];
    overlay.updateSelected(candidate);
    const ring = scene.children.at(-1) as THREE.Mesh;
    for (const distance of [3.3, 1.15]) {
      camera.position.set(...latLonToPoint(candidate.latitude, candidate.longitude, distance));
      overlay.updateMarkerScale(camera, 900);
      const pixelsPerUnit = 900 / (2 * camera.position.distanceTo(ring.position) * Math.tan(38 * Math.PI / 360));
      expect(0.02 * ring.scale.x * pixelsPerUnit).toBeCloseTo(12, 8);
    }
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
  });
});
