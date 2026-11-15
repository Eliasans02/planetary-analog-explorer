import { describe, it, expect } from 'vitest';
import { terrainTriangleHeightAt, walkSurfaceStep, surfaceWalkEntry } from './surfaceGeometry';
const grid={width:3,height:3,spacing_m:[1,1] as [number,number]},heights=new Float32Array([0,0,0,0,10,0,0,0,0]);
describe('native terrain walking',()=>{
 it('enters a lone valid second triangle and rejects a grid with no floor',()=>{const g={width:2,height:2,spacing_m:[1,1] as [number,number]},h=new Float32Array([0,2,4,6]),m=new Uint8Array([0,1,1,1]);const p=surfaceWalkEntry(g,h,m,[.5,.5]);expect(p).not.toBeNull();expect(terrainTriangleHeightAt(g,h,m,...p!)).toBe(4.5);expect(surfaceWalkEntry(g,h,new Uint8Array(4),[.5,.5])).toBeNull();});
 it('samples actual triangles rather than curved bilinear cells',()=>{expect(terrainTriangleHeightAt(grid,heights,new Uint8Array(9).fill(1),.5,.5)).toBe(0);expect(terrainTriangleHeightAt(grid,heights,new Uint8Array(9).fill(1),.75,.75)).toBe(5);});
 it('blocks edges and swept movement across missing data',()=>{const mask=new Uint8Array(9).fill(1);const edge=walkSurfaceStep(grid,heights,mask,[.2,.2],[-4,0]);expect(edge[0]).toBeGreaterThanOrEqual(0);mask[4]=0;const p=walkSurfaceStep(grid,heights,mask,[.1,.1],[1.8,1.8]);expect(p[0]).toBeLessThan(.6);expect(terrainTriangleHeightAt(grid,heights,mask,...p)).not.toBeNull();});
});
