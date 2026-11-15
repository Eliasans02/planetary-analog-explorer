import * as THREE from 'three';
import type { Mat4, Splat } from '@shared/types/analog-location';

export const MAX_SPLATS_BUDGET = 250_000;
export const MAX_SCENE_ASSET_BYTES_BUDGET = 64 * 1024 * 1024; // 64 MiB

export interface DecomposedSplatTransform {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
}

export type SplatValidationResult =
  | { ok: true; transform: DecomposedSplatTransform }
  | { ok: false; reason: string };

/**
 * Validates a column-major 4x4 affine matrix (Three.js Matrix4 order) and decomposes it into
 * position, quaternion (XYZW), and positive scale. Rejects non-finite entries, singular matrices,
 * reflections (negative scale/determinant), projective bottom row, and unsupported shear.
 */
export function validateAndDecomposeSplatMatrix(worldFromAsset: Mat4): SplatValidationResult {
  if (worldFromAsset.length !== 16) {
    return { ok: false, reason: 'world_from_asset must contain 16 elements.' };
  }
  for (let i = 0; i < 16; i += 1) {
    if (!Number.isFinite(worldFromAsset[i])) {
      return { ok: false, reason: `world_from_asset[${i}] is not finite.` };
    }
  }

  // Column-major affine check: elements [3], [7], [11] are bottom row x/y/z, [15] is bottom-right w.
  if (
    Math.abs(worldFromAsset[3]) > 1e-6 ||
    Math.abs(worldFromAsset[7]) > 1e-6 ||
    Math.abs(worldFromAsset[11]) > 1e-6 ||
    Math.abs(worldFromAsset[15] - 1) > 1e-6
  ) {
    return {
      ok: false,
      reason: 'world_from_asset must be an affine transform with bottom row [0, 0, 0, 1].',
    };
  }

  const matrix = new THREE.Matrix4().fromArray(worldFromAsset);
  const det = matrix.determinant();
  if (!Number.isFinite(det) || Math.abs(det) <= 1e-9) {
    return { ok: false, reason: 'world_from_asset is singular (determinant near zero).' };
  }
  if (det < 0) {
    return {
      ok: false,
      reason: 'world_from_asset has negative determinant (reflection is unsupported).',
    };
  }

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);

  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z) ||
    !Number.isFinite(quaternion.x) ||
    !Number.isFinite(quaternion.y) ||
    !Number.isFinite(quaternion.z) ||
    !Number.isFinite(quaternion.w) ||
    !Number.isFinite(scale.x) ||
    !Number.isFinite(scale.y) ||
    !Number.isFinite(scale.z)
  ) {
    return { ok: false, reason: 'Decomposed splat transform produced non-finite values.' };
  }

  if (scale.x <= 1e-9 || scale.y <= 1e-9 || scale.z <= 1e-9) {
    return {
      ok: false,
      reason: 'world_from_asset must have strictly positive scale components.',
    };
  }

  const recomposed = new THREE.Matrix4().compose(position, quaternion, scale);
  let maxResidual = 0;
  for (let i = 0; i < 16; i += 1) {
    const diff = Math.abs(recomposed.elements[i] - worldFromAsset[i]);
    if (diff > maxResidual) maxResidual = diff;
  }
  const scaleNorm = Math.max(1, scale.x, scale.y, scale.z);
  if (maxResidual > 1e-3 * scaleNorm) {
    return {
      ok: false,
      reason: 'world_from_asset contains unsupported shear or skew; cannot decompose losslessly.',
    };
  }

  return {
    ok: true,
    transform: {
      position: [position.x, position.y, position.z],
      quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
      scale: [scale.x, scale.y, scale.z],
    },
  };
}

/**
 * Checks whether a splat asset is scientifically eligible and within engineering budgets
 * to be overlaid on top of a metric DEM heightfield.
 */
export function canRenderSplatOnMetricTerrain(
  splat: Splat,
  otherSceneAssetBytes = 0,
): SplatValidationResult {
  if (splat.format !== 'splat' && splat.format !== 'ply') {
    return { ok: false, reason: `Unsupported splat format: ${String(splat.format)}.` };
  }
  if (!splat.scale_is_metric) {
    return {
      ok: false,
      reason: 'Splat reconstruction has scale_is_metric=false; cannot overlay on metric terrain.',
    };
  }
  if (splat.geometry_provenance !== 'photogrammetric') {
    return {
      ok: false,
      reason: `Splat geometry provenance is "${splat.geometry_provenance}" (model-derived visualization only, not metric terrain).`,
    };
  }
  if (splat.gaussian_count > MAX_SPLATS_BUDGET) {
    return {
      ok: false,
      reason: `Splat count (${splat.gaussian_count.toLocaleString()}) exceeds engineering budget (${MAX_SPLATS_BUDGET.toLocaleString()}).`,
    };
  }
  const totalBytes = splat.asset.bytes + otherSceneAssetBytes;
  if (totalBytes > MAX_SCENE_ASSET_BYTES_BUDGET) {
    return {
      ok: false,
      reason: `Total ground scene asset size (${(totalBytes / (1024 * 1024)).toFixed(1)} MiB) exceeds 64 MiB budget.`,
    };
  }

  return validateAndDecomposeSplatMatrix(splat.world_from_asset);
}
