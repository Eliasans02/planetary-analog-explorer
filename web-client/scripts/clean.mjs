import fs from 'node:fs';
import path from 'node:path';
const project = fs.realpathSync(path.resolve(import.meta.dirname, '..'));
const target = path.resolve(project, 'dist');
if (path.dirname(target) !== project || path.basename(target) !== 'dist') throw new Error('Unsafe clean target');
if (fs.existsSync(target) && (fs.lstatSync(target).isSymbolicLink() || fs.realpathSync(target) !== target)) throw new Error('Redirected clean target');
fs.rmSync(target, {recursive: true, force: true});
