import { describe, it, expect } from 'vitest';
import { latLonToPoint, pointToLatLon, latLonToUV, planetGeometryData, globalDemSampleIndex } from './planetGeometry';
describe('NASA map orientation', () => {
  it('places zero longitude at map centre and east toward negative Z', () => { expect(latLonToUV(0, 0)).toEqual([.5,.5]); expect(latLonToUV(90,-180)).toEqual([0,1]); expect(latLonToPoint(0,90)[2]).toBeCloseTo(-1); });
  it('round trips positive east and west coordinates', () => { for (const [lat, lon] of [[20,70],[-35,-120],[89,179]]) { const p = pointToLatLon(...latLonToPoint(lat,lon)); expect(p.latitude_deg).toBeCloseTo(lat); expect(p.longitude_deg).toBeCloseTo(lon); } });
  it('uses pixel-center registration and wraps the repeated meridian', () => {
    expect(globalDemSampleIndex(-45, 90, 8, 4)).toBe(3 * 8 + 6);
    expect(globalDemSampleIndex(-22.5, 22.5, 8, 4)).toBe(2 * 8 + 4);
    expect(globalDemSampleIndex(0, -180, 8, 4)).toBe(globalDemSampleIndex(0, 180, 8, 4));
  });
  it('keeps repeated pole and seam vertices at one source-derived radius', () => {
    const d = planetGeometryData({ heights: Float32Array.from({length:32},(_,i)=>i*100),width:8,height:4,radius_m:1737400 });
    const radius = (row:number,col:number) => Math.hypot(...d.positions.slice((row*257+col)*3,(row*257+col)*3+3));
    for (const row of [0,32,64,96,128]) expect(radius(row,0)).toBeCloseTo(radius(row,256),6);
    for (const row of [0,128]) for (const col of [0,64,128,192,256]) expect(radius(row,col)).toBeCloseTo(radius(row,0),6);
  });
  it('has outward-facing source sphere triangles', () => { const d=planetGeometryData(); const [a,b,c]=Array.from(d.indices.slice(256*6*30,256*6*30+3)); const p=(i:number)=>Array.from(d.positions.slice(i*3,i*3+3)); const A=p(a),B=p(b),C=p(c); const u=B.map((v,i)=>v-A[i]),v=C.map((v,i)=>v-A[i]); const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]; expect(cross.reduce((s,x,i)=>s+x*A[i],0)).toBeGreaterThan(0); });
});
