import * as THREE from 'three';

export type GlobeDisplayMode = 'relief' | 'source';

/** Neutral display illumination only; this is not an astronomical Sun model. */
export function createGlobeAppearance() {
  const reliefMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const sourceMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  // Lambert divides irradiance by PI. These weights keep the brightest surface
  // at the source brightness, with a soft neutral fill on the unlit hemisphere.
  const fill = new THREE.AmbientLight(0xffffff, Math.PI * .38);
  const light = new THREE.DirectionalLight(0xffffff, Math.PI * .62);
  const direction = new THREE.Vector3();
  return {
    reliefMaterial, sourceMaterial, fill, light,
    material(mode: GlobeDisplayMode) { return mode === 'source' ? sourceMaterial : reliefMaterial; },
    setMap(texture: THREE.Texture) {
      for (const material of [reliefMaterial, sourceMaterial]) {
        material.map = texture;
        material.needsUpdate = true;
      }
    },
    updateLight(camera: THREE.Camera, angle: number) {
      const azimuth = THREE.MathUtils.degToRad(angle);
      const elevation = THREE.MathUtils.degToRad(25);
      direction.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
      light.position.copy(direction.applyQuaternion(camera.quaternion)).multiplyScalar(5);
    },
  };
}
