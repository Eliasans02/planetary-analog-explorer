import { resolveSharedRoot } from './shared-root.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webClientRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(webClientRoot, 'public');

const MAX_GRID_NODES = 257 * 257;
const MAX_SPLATS = 250_000;
const MAX_SCENE_BYTES = 64 * 1024 * 1024;

function resolveSchemaPath() {
  return path.join(resolveSharedRoot(webClientRoot), 'schemas/analog_location.schema.json');
}

function resolveSafePublicPath(assetUrlPath) {
  if (typeof assetUrlPath !== 'string' || !assetUrlPath.startsWith('/assets/')) {
    throw new Error(`Invalid asset URL path (must start with /assets/): ${assetUrlPath}`);
  }
  const rel = assetUrlPath.slice(1);
  const resolved = path.resolve(publicRoot, rel);
  const realPublic = fs.existsSync(publicRoot) ? fs.realpathSync(publicRoot) : publicRoot;
  if (!resolved.startsWith(realPublic + path.sep)) {
    throw new Error(`Path traversal detected for asset: ${assetUrlPath}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Missing asset file on disk: ${resolved}`);
  }
  const realTarget = fs.realpathSync(resolved);
  if (!realTarget.startsWith(realPublic + path.sep)) {
    throw new Error(`Symlink escapes public/ directory: ${assetUrlPath}`);
  }
  return realTarget;
}

function verifyFileHashAndSize(filePath, expectedBytes, expectedSha256, label) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`${label} is not a regular file: ${filePath}`);
  }
  if (typeof expectedBytes === 'number' && stat.size !== expectedBytes) {
    throw new Error(
      `${label} byte count mismatch: expected ${expectedBytes}, found ${stat.size} (${filePath})`,
    );
  }
  if (typeof expectedSha256 === 'string') {
    const buf = fs.readFileSync(filePath);
    const actualSha = crypto.createHash('sha256').update(buf).digest('hex');
    if (actualSha !== expectedSha256.toLowerCase()) {
      throw new Error(
        `${label} SHA-256 mismatch: expected ${expectedSha256}, found ${actualSha} (${filePath})`,
      );
    }
  }
}

function verifyLocationAssets(loc, label) {
  let sceneBytes = 0;

  if (!loc.aoi?.local_path) {
    throw new Error(`${label}: missing aoi.local_path`);
  }
  const aoiPath = resolveSafePublicPath(loc.aoi.local_path);
  if (!aoiPath.endsWith('.geojson') && !aoiPath.endsWith('.json')) {
    throw new Error(`${label}: unexpected AOI format ${aoiPath}`);
  }

  if (loc.assets.dem) {
    const demPath = resolveSafePublicPath(loc.assets.dem.path);
    verifyFileHashAndSize(demPath, loc.assets.dem.bytes, loc.assets.dem.sha256, `${label}.dem`);
  }

  if (loc.assets.heightmap) {
    const hm = loc.assets.heightmap;
    if (hm.width * hm.height > MAX_GRID_NODES) {
      throw new Error(
        `${label}.heightmap: ${hm.width}x${hm.height} exceeds ${MAX_GRID_NODES} node budget`,
      );
    }
    if (hm.asset.bytes !== hm.width * hm.height * 4) {
      throw new Error(`${label}.heightmap.asset.bytes != width*height*4`);
    }
    if (hm.valid_mask.bytes !== hm.width * hm.height) {
      throw new Error(`${label}.heightmap.valid_mask.bytes != width*height`);
    }
    const hPath = resolveSafePublicPath(hm.asset.path);
    const mPath = resolveSafePublicPath(hm.valid_mask.path);
    verifyFileHashAndSize(hPath, hm.asset.bytes, hm.asset.sha256, `${label}.heightmap.asset`);
    verifyFileHashAndSize(
      mPath,
      hm.valid_mask.bytes,
      hm.valid_mask.sha256,
      `${label}.heightmap.valid_mask`,
    );
    sceneBytes += hm.asset.bytes + hm.valid_mask.bytes;
  }

  if (loc.assets.splat) {
    const sp = loc.assets.splat;
    if (sp.format !== 'splat' && sp.format !== 'ply') {
      throw new Error(`${label}.splat: unsupported format "${sp.format}"`);
    }
    if (sp.gaussian_count > MAX_SPLATS) {
      throw new Error(
        `${label}.splat: gaussian_count (${sp.gaussian_count}) exceeds ${MAX_SPLATS}`,
      );
    }
    const sPath = resolveSafePublicPath(sp.asset.path);
    verifyFileHashAndSize(sPath, sp.asset.bytes, sp.asset.sha256, `${label}.splat.asset`);
    sceneBytes += sp.asset.bytes;
  }

  if (sceneBytes > MAX_SCENE_BYTES) {
    throw new Error(`${label}: combined active ground assets (${sceneBytes} B) exceed 64 MiB`);
  }
}

function main() {
  const datasetPath = path.join(publicRoot, 'data', 'locations_dataset.json');
  if (!fs.existsSync(datasetPath)) {
    console.error(
      `[verify:assets] FAIL: Missing prepared dataset at ${datasetPath}. Dev_A must publish public/data/locations_dataset.json and public/assets/ before demo verification.`,
    );
    process.exit(1);
  }

  const schemaPath = resolveSchemaPath();
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(dataset)) {
    console.error('[verify:assets] FAIL: JSON Schema validation failed:');
    for (const err of validate.errors ?? []) {
      console.error(`  - ${err.instancePath || '$'} ${err.message}`);
    }
    process.exit(1);
  }

  if (!Array.isArray(dataset.comparisons) || dataset.comparisons.length === 0) {
    console.error('[verify:assets] FAIL: Dataset contains zero comparisons.');
    process.exit(1);
  }

  let verifiedTargets = 0;
  let verifiedGroundTargets = 0;

  for (let i = 0; i < dataset.comparisons.length; i += 1) {
    const comp = dataset.comparisons[i];
    verifyLocationAssets(comp.target, `comparisons[${i}].target(${comp.target.id})`);
    verifiedTargets += 1;
    if (comp.target.assets.heightmap && comp.target.camera) {
      verifiedGroundTargets += 1;
    }
    for (let j = 0; j < comp.analogs.length; j += 1) {
      const analog = comp.analogs[j];
      verifyLocationAssets(
        analog.location,
        `comparisons[${i}].analogs[${j}](${analog.location.id})`,
      );
    }
  }

  console.log(
    `[verify:assets] PASS: Verified ${verifiedTargets} target(s) (${verifiedGroundTargets} ground-ready) against schema and SHA-256 budgets.`,
  );
}

try {
  main();
} catch (err) {
  console.error(`[verify:assets] FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
