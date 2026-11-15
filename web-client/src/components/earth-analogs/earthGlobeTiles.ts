import * as THREE from 'three';
import { latLonToPoint, pointToLatLon } from '../../terrain/planetGeometry';
import { earthTileAt, earthTileBounds, earthTileLevel, earthTileUrl, tileGrid, type EarthTile } from './earthTileGrid';

export type EarthImageryStatus = 'overview' | 'loading' | 'detail' | 'fallback';
type TileEntry = { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>; bitmap: ImageBitmap };
const tileKey = (tile: EarthTile) => `${tile.level}/${tile.row}/${tile.col}`;

function tileGeometry(tile: EarthTile) {
  const bounds = earthTileBounds(tile), segments = 32;
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row <= segments; row++) for (let col = 0; col <= segments; col++) {
    const latitude = bounds.north + (bounds.south - bounds.north) * row / segments;
    const longitude = bounds.west + (bounds.east - bounds.west) * col / segments;
    positions.push(...latLonToPoint(latitude, longitude, 1.0005));
    uv.push((longitude - bounds.west) / bounds.span, 1 - (bounds.north - latitude) / bounds.span);
    if (row < segments && col < segments) {
      const a = row * (segments + 1) + col, c = a + segments + 1;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function visibleTiles(camera: THREE.PerspectiveCamera, heightPixels: number) {
  const level = earthTileLevel(camera.position.length(), heightPixels, camera.fov);
  const grid = tileGrid(level), tiles = new Map<string, EarthTile>();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const ray = new THREE.Raycaster(), point = new THREE.Vector3();
  camera.updateMatrixWorld();
  // Sampling the visible sphere also handles the poles and longitude seam.
  for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
    ray.setFromCamera(new THREE.Vector2(x / 6, y / 6), camera);
    if (!ray.ray.intersectSphere(sphere, point)) continue;
    const coord = pointToLatLon(point.x, point.y, point.z);
    const tile = earthTileAt(coord.latitude_deg, coord.longitude_deg, level);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const row = tile.row + dy;
      if (row < 0 || row >= grid.rows) continue;
      const neighbor = { level, row, col: (tile.col + dx + grid.columns) % grid.columns };
      tiles.set(tileKey(neighbor), neighbor);
    }
  }
  const facing = camera.position.clone().normalize();
  const priority = (tile: EarthTile) => {
    const b = earthTileBounds(tile);
    return new THREE.Vector3(...latLonToPoint((b.north + b.south) / 2, (b.west + b.east) / 2)).dot(facing);
  };
  return [...tiles.values()].sort((a, b) => priority(b) - priority(a)).slice(0, 48);
}

export function createEarthGlobeTiles(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer,
  invalidate: () => void, onStatus: (status: EarthImageryStatus) => void) {
  const cache = new Map<string, TileEntry>();
  const pending = new Map<string, AbortController>();
  const failed = new Set<string>();
  let wanted = new Map<string, EarthTile>();
  let disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
  let lastStatus: EarthImageryStatus | undefined;
  const report = () => {
    const keys = [...wanted.keys()];
    const status: EarthImageryStatus = keys.length === 0 ? 'overview'
      : keys.some(key => !cache.has(key) && !failed.has(key)) ? 'loading'
      : keys.some(key => failed.has(key)) ? 'fallback' : 'detail';
    if (status !== lastStatus) { lastStatus = status; onStatus(status); }
    renderer.domElement.dataset.imageryTiles = String(keys.filter(key => cache.has(key)).length);
    renderer.domElement.dataset.imageryLevel = String(wanted.values().next().value?.level ?? 0);
  };
  const disposeEntry = (entry: TileEntry) => {
    scene.remove(entry.mesh);
    entry.mesh.geometry.dispose(); entry.mesh.material.map?.dispose(); entry.mesh.material.dispose(); entry.bitmap.close();
  };
  const prune = () => {
    for (const [key, entry] of cache) {
      entry.mesh.visible = wanted.has(key);
      if (cache.size > 56 && !wanted.has(key)) { disposeEntry(entry); cache.delete(key); }
    }
  };
  const fetchTile = async (tile: EarthTile, signal: AbortSignal) => {
    const response = await fetch(earthTileUrl(tile), { signal, credentials: 'omit', redirect: 'error' });
    if (!response.ok || !response.headers.get('content-type')?.includes('image/jpeg')) throw new Error('Earth imagery tile unavailable.');
    const blob = await response.blob();
    if (blob.size > 1024 * 1024) throw new Error('Earth imagery tile too large.');
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
    if (bitmap.width !== 512 || bitmap.height !== 512 || signal.aborted || disposed) {
      bitmap.close(); throw new Error('Invalid Earth imagery tile.');
    }
    return bitmap;
  };
  const pump = () => {
    if (disposed) return;
    for (const [key, tile] of wanted) {
      if (pending.size >= 4) break;
      if (cache.has(key) || pending.has(key) || failed.has(key)) continue;
      const controller = new AbortController();
      pending.set(key, controller);
      const timeout = setTimeout(() => controller.abort(), 12_000);
      void fetchTile(tile, controller.signal).then(bitmap => {
        if (disposed || !wanted.has(key)) { bitmap.close(); return; }
        const texture = new THREE.Texture(bitmap);
        texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        const material = new THREE.MeshLambertMaterial({ map: texture });
        const mesh = new THREE.Mesh(tileGeometry(tile), material);
        cache.set(key, { mesh, bitmap }); scene.add(mesh); prune(); invalidate();
      }).catch(() => {
        if (!disposed && wanted.has(key)) failed.add(key);
      }).finally(() => {
        clearTimeout(timeout); pending.delete(key);
        if (!disposed) { report(); pump(); }
      });
    }
    report();
  };
  const refresh = () => {
    if (disposed) return;
    const tiles = camera.position.length() < 3 ? visibleTiles(camera, renderer.domElement.height) : [];
    wanted = new Map(tiles.map(tile => [tileKey(tile), tile]));
    for (const [key, controller] of pending) if (!wanted.has(key)) controller.abort();
    prune(); invalidate(); pump();
  };
  return {
    update() { clearTimeout(timer); timer = setTimeout(refresh, 180); },
    retry() { failed.clear(); refresh(); },
    dispose() {
      disposed = true; clearTimeout(timer);
      pending.forEach(controller => controller.abort()); cache.forEach(disposeEntry); cache.clear();
    },
  };
}
