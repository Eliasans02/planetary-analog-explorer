import path from 'node:path';
import {writeSharedPaths} from './shared-root.mjs';
console.log(`Shared contract: ${writeSharedPaths(path.resolve(import.meta.dirname, '..'))}`);
