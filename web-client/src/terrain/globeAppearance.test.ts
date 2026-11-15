import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGlobeAppearance } from './globeAppearance';

describe('globe display illumination', () => {
  it('shares the unchanged source texture between shaded and original-image materials', () => {
    const appearance = createGlobeAppearance();
    const sourcePixels = new Uint8Array([173, 119, 88, 255]);
    const texture = new THREE.DataTexture(sourcePixels, 1, 1);
    texture.colorSpace = THREE.SRGBColorSpace;
    const original = sourcePixels.slice();
    appearance.setMap(texture);
    expect(appearance.material('source')).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(appearance.material('relief')).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(appearance.sourceMaterial.map).toBe(texture);
    expect(appearance.reliefMaterial.map).toBe(texture);
    expect(sourcePixels).toEqual(original);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(appearance.sourceMaterial.color.getHex()).toBe(0xffffff);
    expect(appearance.reliefMaterial.color.getHex()).toBe(0xffffff);
    // Texture quality changes update both display modes without new materials.
    const replacement = new THREE.Texture();
    const originalMaterial = appearance.material('source');
    appearance.setMap(replacement);
    expect(appearance.material('source')).toBe(originalMaterial);
    expect(appearance.sourceMaterial.map).toBe(replacement);
    expect(appearance.reliefMaterial.map).toBe(replacement);
  });

  it('keeps lighting neutral and its maximum diffuse response at source brightness', () => {
    const appearance = createGlobeAppearance();
    expect(appearance.fill.color.getHex()).toBe(0xffffff);
    expect(appearance.light.color.getHex()).toBe(0xffffff);
    expect((appearance.fill.intensity + appearance.light.intensity) / Math.PI).toBeCloseTo(1);
    expect(appearance.fill.intensity / Math.PI).toBeGreaterThan(.3);
  });

  it('moves display lighting around the view without changing camera pose or texture', () => {
    const appearance = createGlobeAppearance();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(2, 1, 3);
    camera.lookAt(0, 0, 0);
    const position = camera.position.clone();
    const quaternion = camera.quaternion.clone();
    const texture = new THREE.Texture();
    appearance.setMap(texture);
    appearance.updateLight(camera, -50);
    const left = appearance.light.position.clone();
    appearance.updateLight(camera, 50);
    expect(appearance.light.position.equals(left)).toBe(false);
    expect(appearance.light.position.length()).toBeCloseTo(5);
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.equals(quaternion)).toBe(true);
    expect(appearance.reliefMaterial.map).toBe(texture);
    // Orbiting the view carries the light direction with the camera.
    const viewDirection = appearance.light.position.clone().applyQuaternion(camera.quaternion.clone().invert());
    camera.position.set(-3, 2, -1);
    camera.lookAt(0, 0, 0);
    appearance.updateLight(camera, 50);
    const rotatedDirection = appearance.light.position.clone().applyQuaternion(camera.quaternion.clone().invert());
    expect(rotatedDirection.distanceTo(viewDirection)).toBeLessThan(1e-10);
  });
});
