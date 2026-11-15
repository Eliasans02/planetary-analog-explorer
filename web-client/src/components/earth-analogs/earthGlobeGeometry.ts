import * as THREE from 'three';
import type { DiscoveryCandidate, EarthDiscovery } from '@shared/types/earth-discovery';
import { latLonToPoint, planetGeometryData } from '../../terrain/planetGeometry';

/** Subdivides polygon ring edges so boundaries follow spherical curvature cleanly. */
export function ringToSpherePositions(
  ringLonLat: [number, number][],
  radius: number,
  subdivisions = 4,
): Float32Array {
  if (ringLonLat.length === 0) return new Float32Array(0);
  const pts: number[] = [];
  for (let i = 0; i < ringLonLat.length; i++) {
    const [lon0, lat0] = ringLonLat[i];
    const [lon1, lat1] = ringLonLat[(i + 1) % ringLonLat.length];
    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions;
      const lat = lat0 + (lat1 - lat0) * t;
      const lon = lon0 + (lon1 - lon0) * t;
      pts.push(...latLonToPoint(lat, lon, radius));
    }
  }
  const [lonStart, latStart] = ringLonLat[0];
  pts.push(...latLonToPoint(latStart, lonStart, radius));
  return new Float32Array(pts);
}

export function computeSearchCenter(discovery: EarthDiscovery): { lat: number; lon: number } {
  const ring = discovery.domain.footprint.slice(0, -1);
  let sumLon = 0;
  let sumLat = 0;
  for (const [lon, lat] of ring) {
    sumLon += lon;
    sumLat += lat;
  }
  return { lat: sumLat / ring.length, lon: sumLon / ring.length };
}

export function createEarthSphereGeometry(): THREE.BufferGeometry {
  const data = planetGeometryData();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export interface GlobeOverlays {
  updateSelected: (cand: DiscoveryCandidate | null) => void;
  updateMarkerScale: (camera: THREE.PerspectiveCamera, height: number) => void;
}

export function attachGlobeOverlays(
  scene: THREE.Scene,
  discovery: EarthDiscovery,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
): GlobeOverlays {
  const domainRing = discovery.domain.footprint;
  const domainGeom = new THREE.BufferGeometry();
  domainGeom.setAttribute(
    'position',
    new THREE.BufferAttribute(ringToSpherePositions(domainRing, 1.003, 5), 3),
  );
  const domainMat = new THREE.LineBasicMaterial({ color: '#f59e0b', depthTest: true });
  geometries.push(domainGeom);
  materials.push(domainMat);
  scene.add(new THREE.Line(domainGeom, domainMat));

  const candidateGeom = new THREE.BufferGeometry();
  const candidateMat = new THREE.LineBasicMaterial({ color: '#38bdf8', depthTest: true });
  const beaconGeom = new THREE.RingGeometry(0.016, 0.02, 64);
  const outlineGeom = new THREE.RingGeometry(0.014, 0.022, 64);
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide, depthTest: true });
  const outlineMat = new THREE.MeshBasicMaterial({
    color: '#08090c',
    side: THREE.DoubleSide,
    depthTest: true,
  });
  geometries.push(candidateGeom, beaconGeom, outlineGeom);
  materials.push(candidateMat, beaconMat, outlineMat);

  const candidateLine = new THREE.Line(candidateGeom, candidateMat);
  const beaconMesh = new THREE.Mesh(beaconGeom, beaconMat);
  const outline = new THREE.Mesh(outlineGeom, outlineMat);
  outline.position.z = -0.0002;
  beaconMesh.add(outline);
  beaconMesh.visible = false;
  scene.add(candidateLine, beaconMesh);

  return {
    updateMarkerScale: (camera, height) => {
      const worldPerPixel = 2 * camera.position.distanceTo(beaconMesh.position) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, height);
      beaconMesh.scale.setScalar(12 * worldPerPixel / 0.02);
    },
    updateSelected: (cand) => {
      if (!cand) {
        candidateLine.visible = false;
        beaconMesh.visible = false;
        return;
      }
      const ring = cand.footprint;
      const pos = ringToSpherePositions(ring, 1.005, 3);
      const position = candidateGeom.getAttribute('position');
      if (position && position.array.length === pos.length) {
        position.array.set(pos);
        position.needsUpdate = true;
      } else {
        candidateGeom.dispose();
        candidateGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      }
      candidateGeom.computeBoundingSphere();
      candidateLine.visible = pos.length > 0;
      beaconMesh.position.set(...latLonToPoint(cand.latitude, cand.longitude, 1.004));
      beaconMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), beaconMesh.position.clone().normalize());
      beaconMesh.visible = true;
    },
  };
}
