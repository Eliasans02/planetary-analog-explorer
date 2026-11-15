import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createSurfaceImageMaterials, setSurfaceImageTexture, surfaceLightPosition, surfaceLightIntensities } from './surfaceAppearance';

it('lights source hues without an elevation tint and retains an unlit source display', () => {
  const materials = createSurfaceImageMaterials();
  const texture = new THREE.Texture();
  setSurfaceImageTexture(materials, texture);
  expect(materials.lit).toBeInstanceOf(THREE.MeshLambertMaterial);
  expect(materials.original).toBeInstanceOf(THREE.MeshBasicMaterial);
  for (const material of Object.values(materials)) {
    expect(material.map).toBe(texture);
    expect(material.vertexColors).toBe(false);
    expect(material.toneMapped).toBe(false);
    expect(material.color.getHexString()).toBe('ffffff');
  }
  setSurfaceImageTexture(materials, null);
  expect(materials.lit.map).toBeNull();
  expect(materials.original.map).toBeNull();
  Object.values(materials).forEach(material => material.dispose());
  texture.dispose();
});

it('bounds neutral Lambert lighting without clipping source highlights or losing dark slopes', () => {
  const response = (cosine: number) => (surfaceLightIntensities.fill + surfaceLightIntensities.key * cosine) / Math.PI;
  expect(response(0)).toBeCloseTo(0.38);
  expect(response(1)).toBeCloseTo(1);
  // A horizontal source surface under the 30-degree key remains readable.
  expect(response(Math.sin(Math.PI / 6))).toBeCloseTo(0.69);
});

it('rotates the visualization key around the native grid at a fixed modest elevation', () => {
  const east = surfaceLightPosition(0, 100, 12);
  const opposite = surfaceLightPosition(180, 100, 12);
  expect(east[0]).toBe(100);
  expect(opposite[0]).toBeCloseTo(-100);
  expect(east[1]).toBeCloseTo(12 + 100 * Math.tan(Math.PI / 6));
  expect(east[1]).toBe(opposite[1]);
  expect(east[2]).toBe(0);
  expect(opposite[2]).toBeCloseTo(0);
});
