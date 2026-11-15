import * as THREE from 'three';
import type { ResearchRegion } from '../../data/globalAnalogs';
import { latLonToPoint } from '../../terrain/planetGeometry';

export function researchGlobeMarkers(scene: THREE.Scene, regions: ResearchRegion[]) {
  const geometry = new THREE.SphereGeometry(1, 12, 8);
  const material = new THREE.MeshBasicMaterial({ color: '#8ae0f5' });
  const pins = regions.map(region => {
    const pin = new THREE.Mesh(geometry, material);
    pin.position.set(...latLonToPoint(region.latitude, region.longitude, 1.006));
    pin.userData.region = region;
    scene.add(pin);
    return pin;
  });
  return {
    update(camera: THREE.PerspectiveCamera, height: number) {
      for (const pin of pins) {
        const scale = 6 * camera.position.distanceTo(pin.position) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(height, 1);
        pin.scale.setScalar(Math.min(0.025, scale));
      }
    },
    pick(ray: THREE.Raycaster, earthDistance: number): ResearchRegion | undefined {
      const hit = ray.intersectObjects(pins)[0];
      return hit && hit.distance <= earthDistance + 0.015 ? hit.object.userData.region as ResearchRegion : undefined;
    },
    dispose() { pins.forEach(pin => scene.remove(pin)); geometry.dispose(); material.dispose(); },
  };
}
