import * as THREE from 'three';

export type SurfaceLighting = 'relief-light' | 'original';

// Three r170 Lambert divides irradiance by PI. White surfaces therefore retain
// 38% brightness in fill and at most 100% when facing the key, with no clipping.
export const surfaceLightIntensities = { fill: Math.PI * 0.38, key: Math.PI * 0.62 };

/** Image pixels supply every hue; DEM vertex colors never enter either material. */
export function createSurfaceImageMaterials() {
  return {
    lit: new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: false, side: THREE.DoubleSide, toneMapped: false }),
    original: new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: false, side: THREE.DoubleSide, toneMapped: false }),
  };
}

/** Both materials share the resource owned by latestResource, never its ownership. */
export function setSurfaceImageTexture(materials: ReturnType<typeof createSurfaceImageMaterials>, texture: THREE.Texture | null) {
  for (const material of Object.values(materials)) {
    material.map = texture;
    material.needsUpdate = true;
  }
}

/** Local native-grid direction only; this is deliberately not a Sun ephemeris. */
export function surfaceLightPosition(directionDegrees: number, extent: number, midpoint: number): [number, number, number] {
  const angle = THREE.MathUtils.degToRad(directionDegrees);
  const elevation = THREE.MathUtils.degToRad(30);
  return [extent * Math.cos(angle), midpoint + extent * Math.tan(elevation), extent * Math.sin(angle)];
}
