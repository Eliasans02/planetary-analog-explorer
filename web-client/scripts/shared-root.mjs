// Astra/Sol 6.1 medium — one contract-root policy for every frontend tool.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const files = ['schemas/analog_location.schema.json', 'types/analog-location.ts'];
export function resolveSharedRoot(projectRoot) {
  const canonical = path.resolve(projectRoot, '../shared');
  const bundled = path.resolve(projectRoot, 'shared');
  const roots = [canonical, bundled].filter(root => fs.existsSync(root));
  if (!roots.length) throw new Error('Missing shared contract root');
  for (const root of roots) for (const file of files) {
    if (!fs.statSync(path.join(root, file), {throwIfNoEntry: false})?.isFile()) {
      throw new Error(`Missing shared contract file: ${path.join(root, file)}`);
    }
  }
  if (roots.length === 2) for (const file of files) {
    const digest = root => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    if (digest(canonical) !== digest(bundled)) throw new Error(`Shared contract copies mismatch: ${file}`);
  }
  return fs.realpathSync(roots[0]);
}
export function writeSharedPaths(projectRoot) {
  const root = resolveSharedRoot(projectRoot);
  const relative = path.relative(projectRoot, root).split(path.sep).join('/');
  const config = {compilerOptions: {paths: {'@/*': ['./*'], '@shared/*': [`${relative}/*`]}}};
  const output = path.join(projectRoot, 'tsconfig.shared.generated.json');
  const content = JSON.stringify(config, null, 2) + '\n';
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== content) fs.writeFileSync(output, content);
  return root;
}
