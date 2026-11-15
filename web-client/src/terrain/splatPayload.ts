import * as THREE from 'three';
import type { Mat4, Splat } from '@shared/types/analog-location';
import { TerrainAssetError } from './heightfield';
import { MAX_SPLATS_BUDGET, validateAndDecomposeSplatMatrix } from './splatUtils';

// Confirmed against installed GaussianSplats3D 0.4.7 SceneFormat and addSplatScene.
export function splatSdkFormat(format: Splat['format']): 0 | 2 {
  return format === 'splat' ? 0 : 2;
}

/** Restrict PLY to uncompressed binary Gaussian records understood by the installed SDK. */
export function validateSplatPayload(buffer: ArrayBuffer, format: Splat['format'], count: number, worldFromAsset?: Mat4): void {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SPLATS_BUDGET) {
    throw new TerrainAssetError('Invalid or over-budget Gaussian count.');
  }
  const view = new DataView(buffer);
  // SDK 0.4.7 stores scales/centers and (by default) GPU covariances as Float32.
  // Match its exp(log-scale), quaternion normalization and C = R S S^T R^T,
  // then A C A^T conversion. These are representation checks, never clipping.
  const transform = new THREE.Matrix4();
  if (worldFromAsset) {
    const registration = validateAndDecomposeSplatMatrix(worldFromAsset);
    if (!registration.ok) throw new TerrainAssetError(registration.reason);
    // Match the exact decomposed position/rotation/scale supplied to addSplatScene.
    transform.compose(new THREE.Vector3(...registration.transform.position),
      new THREE.Quaternion(...registration.transform.quaternion), new THREE.Vector3(...registration.transform.scale));
  }
  if (transform.elements.some((value) => !Number.isFinite(Math.fround(value)))) {
    throw new TerrainAssetError('Splat transform is not representable in Float32.');
  }
  const linear = new THREE.Matrix3().setFromMatrix4(transform);
  const linearTranspose = linear.clone().transpose();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotationScale = new THREE.Matrix3();
  const covariance = new THREE.Matrix3();
  const matrix = new THREE.Matrix4();
  const checkCovariance = () => {
    if (covariance.elements.some((value) => !Number.isFinite(Math.fround(value))) ||
      [0, 4, 8].some((index) => Math.fround(covariance.elements[index]) <= 0)) {
      throw new TerrainAssetError('Splat covariance overflows or underflows Float32 storage.');
    }
  };
  const checkRecord = (x: number, y: number, z: number, sx: number, sy: number, sz: number,
    qx: number, qy: number, qz: number, qw: number) => {
    if (![x, y, z, sx, sy, sz, qx, qy, qz, qw].every(Number.isFinite)) {
      throw new TerrainAssetError('Splat contains non-finite converted position, scale or rotation.');
    }
    if ([sx, sy, sz].some((value) => value <= 0 || !Number.isFinite(Math.fround(value)) || Math.fround(value * value) <= 0 || !Number.isFinite(Math.fround(value * value)))) {
      throw new TerrainAssetError('Splat positive scale/covariance is not representable in Float32.');
    }
    quaternion.set(qx, qy, qz, qw);
    if (!(quaternion.lengthSq() > 0)) throw new TerrainAssetError('Splat rotation must have a nonzero quaternion.');
    quaternion.normalize();
    quaternion.set(Math.fround(quaternion.x), Math.fround(quaternion.y), Math.fround(quaternion.z), Math.fround(quaternion.w)).normalize();
    scale.set(Math.fround(sx), Math.fround(sy), Math.fround(sz));
    matrix.compose(position.set(0, 0, 0), quaternion, scale);
    rotationScale.setFromMatrix4(matrix);
    covariance.copy(rotationScale).transpose().premultiply(rotationScale);
    checkCovariance();
    covariance.multiply(linearTranspose).premultiply(linear);
    checkCovariance();
    position.set(x, y, z).applyMatrix4(transform);
    if (![position.x, position.y, position.z].every((value) => Number.isFinite(Math.fround(value)))) {
      throw new TerrainAssetError('Transformed splat position overflows Float32 storage.');
    }
  };
  if (format === 'splat') {
    if (buffer.byteLength !== count * 32) throw new TerrainAssetError('Splat byte length does not match 32-byte Gaussian records.');
    for (let record = 0; record < count; record += 1) {
      // Position and scale are six float32 values; colors and rotation are bytes.
      for (let field = 0; field < 6; field += 1) {
        if (!Number.isFinite(view.getFloat32(record * 32 + field * 4, true))) {
          throw new TerrainAssetError('Splat contains non-finite position or scale.');
        }
      }
      const base = record * 32;
      checkRecord(view.getFloat32(base, true), view.getFloat32(base + 4, true), view.getFloat32(base + 8, true),
        view.getFloat32(base + 12, true), view.getFloat32(base + 16, true), view.getFloat32(base + 20, true),
        (view.getUint8(base + 29) - 128) / 128, (view.getUint8(base + 30) - 128) / 128,
        (view.getUint8(base + 31) - 128) / 128, (view.getUint8(base + 28) - 128) / 128);
    }
    return;
  }
  if (format !== 'ply') throw new TerrainAssetError('Unsupported Gaussian format.');
  const prefix = new TextDecoder('ascii').decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 64 * 1024)));
  const terminator = /(?:^|\n)end_header\r?\n/.exec(prefix);
  if (!terminator) throw new TerrainAssetError('PLY header missing or exceeds 64 KiB engineering budget.');
  const headerEnd = terminator.index + terminator[0].length;
  const lines = prefix.slice(0, headerEnd).split(/\r?\n/).filter(Boolean);
  if (lines.shift() !== 'ply' || lines.shift() !== 'format binary_little_endian 1.0') {
    throw new TerrainAssetError('Only binary little-endian Gaussian PLY is supported.');
  }
  let vertexSeen = false;
  const properties: string[] = [];
  for (const line of lines) {
    if (line.startsWith('comment ') || line.startsWith('obj_info ') || line === 'end_header') continue;
    if (line.startsWith('element ')) {
      if (vertexSeen || line !== `element vertex ${count}`) throw new TerrainAssetError('PLY vertex count/element layout mismatch.');
      vertexSeen = true;
    } else {
      const property = /^property float ([A-Za-z_][A-Za-z_0-9]*)$/.exec(line);
      if (!vertexSeen || !property || properties.includes(property[1])) throw new TerrainAssetError('Unsupported PLY property layout.');
      properties.push(property[1]);
    }
  }
  const required = ['x', 'y', 'z', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3', 'opacity', 'f_dc_0', 'f_dc_1', 'f_dc_2'];
  if (!vertexSeen || required.some((name) => !properties.includes(name))) throw new TerrainAssetError('PLY lacks required Gaussian properties.');
  const stride = properties.length * 4;
  if (buffer.byteLength !== headerEnd + count * stride) throw new TerrainAssetError('PLY payload length does not match its bounded vertex layout.');
  for (let offset = headerEnd; offset < buffer.byteLength; offset += 4) {
    if (!Number.isFinite(view.getFloat32(offset, true))) throw new TerrainAssetError('PLY contains a non-finite Gaussian property.');
  }
  const offsets = required.map((name) => properties.indexOf(name) * 4);
  for (let row = 0; row < count; row += 1) {
    const base = headerEnd + row * stride;
    const value = (index: number) => view.getFloat32(base + offsets[index], true);
    checkRecord(value(0), value(1), value(2), Math.exp(value(3)), Math.exp(value(4)), Math.exp(value(5)),
      value(6), value(7), value(8), value(9));
  }
}
