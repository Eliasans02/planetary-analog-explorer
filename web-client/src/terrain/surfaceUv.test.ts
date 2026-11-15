import { expect, it } from 'vitest';
import { surfaceImageUvs } from './surfaceUv';
import { gridToSurface } from './surfaceGeometry';

it('preserves an asymmetric image orientation at all four native-grid vertices',()=>{
  const uv=surfaceImageUvs(2,2), pixels=['red-NW','green-NE','blue-SW','gold-SE'];
  const sampled=[];
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){
    const i=(row*2+col)*2, x=Math.floor(uv[i]*2),y=Math.floor(uv[i+1]*2);
    sampled.push(pixels[y*2+x]);
    const [nativeX,nativeZ]=gridToSurface({width:2,height:2,spacing_m:[3,7]},col,row);
    expect(Math.sign(uv[i]-.5)).toBe(Math.sign(nativeX));
    expect(Math.sign(uv[i+1]-.5)).toBe(Math.sign(nativeZ));
  }
  expect(sampled).toEqual(pixels);
  expect(Array.from(uv)).toEqual([.25,.25,.75,.25,.25,.75,.75,.75]);
});
it('uses separate non-square pixel-center denominators and rejects invalid grids',()=>{
  expect(Array.from(surfaceImageUvs(3,2)).slice(-2)).toEqual([expect.closeTo(5/6,6),.75]);
  expect(()=>surfaceImageUvs(0,2)).toThrow();expect(()=>surfaceImageUvs(258,2)).toThrow();
});
