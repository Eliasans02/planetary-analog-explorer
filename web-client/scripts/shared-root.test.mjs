import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {resolveSharedRoot,writeSharedPaths} from './shared-root.mjs';
test('TEST_ONLY canonical, standalone, mismatch and missing contract layouts',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pae-shared-test-'));
 try{const project=path.join(temp,'web');fs.mkdirSync(project);
 const install=root=>{for(const file of ['schemas/analog_location.schema.json','types/analog-location.ts']){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'TEST_ONLY');}};
 const bundled=path.join(project,'shared'),canonical=path.join(temp,'shared');
 install(bundled);assert.equal(resolveSharedRoot(project),fs.realpathSync(bundled));
 install(canonical);assert.equal(writeSharedPaths(project),fs.realpathSync(canonical));
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project,'tsconfig.shared.generated.json'))).compilerOptions.paths['@shared/*'],['../shared/*']);
 const links=path.join(temp,'links');fs.mkdirSync(links);
 const linkedProject=path.join(links,'web');fs.symlinkSync(project,linkedProject,'junction');
 assert.equal(writeSharedPaths(linkedProject),fs.realpathSync(canonical));
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project,'tsconfig.shared.generated.json'))).compilerOptions.paths['@shared/*'],['../shared/*']);
 fs.writeFileSync(path.join(bundled,'types/analog-location.ts'),'CORRUPTED');assert.throws(()=>resolveSharedRoot(project),/mismatch/);
 fs.unlinkSync(path.join(bundled,'types/analog-location.ts'));assert.throws(()=>resolveSharedRoot(project),/Missing/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
