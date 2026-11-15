import * as THREE from 'three';
import { buildContourSegments, buildElevationColors, buildScientificAxes, buildTerrainIndices, buildTerrainPositions, comparisonGrid, contourLevels } from './terrainComparisonMath';

export interface SceneResources {
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

export interface TerrainSurface {
  geometry: THREE.BufferGeometry;
  positions: THREE.BufferAttribute;
  colors: THREE.BufferAttribute;
  profileGeometry: THREE.BufferGeometry;
  profilePositions: THREE.BufferAttribute;
  contours: THREE.LineSegments;
  contourPositions: THREE.BufferAttribute;
  wireframe: THREE.Mesh;
  axes: THREE.LineSegments;
  labels: THREE.Group;
}

export function terrainScene(profileColor: string, resources: SceneResources) {
  const scene = new THREE.Scene();
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(buildTerrainPositions(Array(100).fill(0), 1), 3).setUsage(THREE.DynamicDrawUsage);
  const colors = new THREE.BufferAttribute(new Float32Array(300), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('color', colors);
  geometry.setIndex(new THREE.BufferAttribute(buildTerrainIndices(), 1));
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(geometry, material));
  const wireMaterial = new THREE.MeshBasicMaterial({ color: '#162b48', wireframe: true, transparent: true, opacity: 0.45 });
  const wireframe = new THREE.Mesh(geometry, wireMaterial);
  wireframe.position.y = 0.05;
  scene.add(wireframe);

  const contourGeometry = new THREE.BufferGeometry();
  const contourPositions = new THREE.BufferAttribute(new Float32Array(comparisonGrid.maximumContourFloats), 3).setUsage(THREE.DynamicDrawUsage);
  contourGeometry.setAttribute('position', contourPositions);
  contourGeometry.setDrawRange(0, 0);
  const contourMaterial = new THREE.LineBasicMaterial({ color: '#183049', transparent: true, opacity: 0.86 });
  const contours = new THREE.LineSegments(contourGeometry, contourMaterial);
  contours.frustumCulled = false;
  scene.add(contours);

  const axesGeometry = new THREE.BufferGeometry();
  const axesMaterial = new THREE.LineBasicMaterial({ color: '#87a2bb', transparent: true, opacity: 0.5 });
  const axes = new THREE.LineSegments(axesGeometry, axesMaterial);
  const labels = new THREE.Group();
  scene.add(axes, labels);

  const profileGeometry = new THREE.BufferGeometry();
  const profilePositions = new THREE.BufferAttribute(new Float32Array(30), 3).setUsage(THREE.DynamicDrawUsage);
  profileGeometry.setAttribute('position', profilePositions);
  const profileMaterial = new THREE.LineBasicMaterial({ color: profileColor });
  scene.add(new THREE.Line(profileGeometry, profileMaterial));
  resources.geometries.push(geometry, contourGeometry, axesGeometry, profileGeometry);
  resources.materials.push(material, wireMaterial, contourMaterial, axesMaterial, profileMaterial);
  return { scene, surface: { geometry, positions, colors, profileGeometry, profilePositions, contours, contourPositions, wireframe, axes, labels } };
}

function label(text: string, x: number, y: number, z: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 96;
  const context = canvas.getContext('2d')!;
  context.font = '500 38px ui-sans-serif, system-ui';
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillStyle = '#cbdce9';
  context.fillText(text, 192, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, y, z);
  sprite.scale.set(120, 30, 1);
  return sprite;
}

export function disposeAxisLabels(labels: THREE.Group) {
  for (const child of labels.children) {
    const sprite = child as THREE.Sprite;
    const material = sprite.material as THREE.SpriteMaterial;
    material.map?.dispose(); material.dispose();
  }
  labels.clear();
}

export function scaleAxisLabels(labels: THREE.Group, camera: THREE.PerspectiveCamera, viewportHeight: number) {
  for (const sprite of labels.children) {
    const worldPerPixel = 2 * camera.position.distanceTo(sprite.position) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, viewportHeight);
    const height = 32 * worldPerPixel;
    sprite.scale.set(height * 4, height, 1);
  }
}

export function updateSurface(surface: TerrainSurface, heights: number[], exaggeration: number, maximum: number) {
  surface.positions.copyArray(buildTerrainPositions(heights, exaggeration));
  surface.positions.needsUpdate = true;
  const colors = buildElevationColors(heights, maximum);
  const color = new THREE.Color();
  for (let index = 0; index < 100; index++) {
    color.setRGB(colors[index * 3], colors[index * 3 + 1], colors[index * 3 + 2], THREE.SRGBColorSpace);
    surface.colors.setXYZ(index, color.r, color.g, color.b);
  }
  surface.colors.needsUpdate = true;
  surface.geometry.computeVertexNormals();
  surface.geometry.computeBoundingSphere();
  const contours = buildContourSegments(heights, contourLevels(maximum), exaggeration);
  surface.contourPositions.copyArray(contours);
  surface.contourPositions.needsUpdate = true;
  surface.contours.geometry.setDrawRange(0, contours.length / 3);
  surface.axes.geometry.dispose();
  surface.axes.geometry.setAttribute('position', new THREE.BufferAttribute(buildScientificAxes(maximum, exaggeration), 3));
  surface.axes.geometry.computeBoundingSphere();
  disposeAxisLabels(surface.labels);
  for (const tick of [0, 180, 360, 540]) {
    surface.labels.add(label(String(tick), tick - 270, -16, 320));
    if (tick !== 540) surface.labels.add(label(String(tick), -345, -16, tick - 270));
  }
  for (const tick of [maximum / 2, maximum]) {
    surface.labels.add(label(tick.toFixed(tick < 10 ? 1 : 0), -310, tick * exaggeration, 270));
  }
  surface.labels.add(label('X (m)', 0, -24, 425));
  surface.labels.add(label('Y (m)', -445, -24, -70));
  surface.labels.add(label('Z (m)', -270, maximum * exaggeration + 100, 270));
}
