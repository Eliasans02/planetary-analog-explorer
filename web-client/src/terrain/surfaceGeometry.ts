export interface SurfaceGrid { width: number; height: number; spacing_m: [number, number] }

/** Raster rows increase along display Z. These are native projection axes, not ENU. */
export function gridToSurface(grid: SurfaceGrid, col: number, row: number): [number, number] {
  return [(col - (grid.width - 1) / 2) * grid.spacing_m[0], (row - (grid.height - 1) / 2) * grid.spacing_m[1]];
}

export function buildSurfaceGeometryData(grid: SurfaceGrid, heights: Float32Array, mask: Uint8Array) {
  const { width, height, spacing_m: spacing } = grid;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 ||
      spacing.some(value => !Number.isFinite(value) || value <= 0) || heights.length !== width * height || mask.length !== heights.length) {
    throw new Error('The relief grid dimensions or metre spacing are invalid.');
  }
  let min = Infinity, max = -Infinity, count = 0;
  const valid = (index: number) => mask[index] !== 0 && Number.isFinite(heights[index]);
  for (let i = 0; i < heights.length; i++) if (valid(i)) { min = Math.min(min, heights[i]); max = Math.max(max, heights[i]); count++; }
  if (!count) throw new Error('This relief grid has no valid height samples.');
  const positions = new Float32Array(heights.length * 3);
  const colors = new Float32Array(positions.length);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const i = row * width + col;
    const [x, z] = gridToSurface(grid, col, row);
    positions.set([x, valid(i) ? heights[i] : min, z], i * 3);
    // A restrained scientific height ramp. No inferred optical surface texture.
    const t = valid(i) && max > min ? (heights[i] - min) / (max - min) : 0;
    const low = [0.12, 0.23, 0.28], mid = [0.42, 0.53, 0.52], high = [0.86, 0.79, 0.61];
    const a = t < 0.5 ? low : mid, b = t < 0.5 ? mid : high, blend = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    colors.set(a.map((value, channel) => value + (b[channel] - value) * blend), i * 3);
  }
  const indices: number[] = [];
  for (let row = 0; row < height - 1; row++) for (let col = 0; col < width - 1; col++) {
    const a = row * width + col, b = a + 1, c = a + width, d = c + 1;
    if (valid(a) && valid(c) && valid(b)) indices.push(a, c, b);
    if (valid(b) && valid(c) && valid(d)) indices.push(b, c, d);
  }
  if (!indices.length) throw new Error('This relief grid has no connected valid terrain triangles.');
  return { positions, colors, indices: new Uint32Array(indices), min, max, count,
    extentX: (width - 1) * spacing[0], extentZ: (height - 1) * spacing[1] };
}

/** Sample only fully valid cells so a polygon overlay cannot span a data hole. */
export function surfaceHeightAt(grid: SurfaceGrid, heights: Float32Array, mask: Uint8Array, col: number, row: number): number | null {
  if (col < 0 || row < 0 || col > grid.width - 1 || row > grid.height - 1) return null;
  const x = Math.min(Math.floor(col), grid.width - 2), y = Math.min(Math.floor(row), grid.height - 2);
  const ids = [y * grid.width + x, y * grid.width + x + 1, (y + 1) * grid.width + x, (y + 1) * grid.width + x + 1];
  if (ids.some(i => !mask[i] || !Number.isFinite(heights[i]))) return null;
  const u = col - x, v = row - y;
  return (1 - v) * ((1 - u) * heights[ids[0]] + u * heights[ids[1]]) + v * ((1 - u) * heights[ids[2]] + u * heights[ids[3]]);
}
/** Exact interpolation on the same two triangles emitted by buildSurfaceGeometryData. */
export function terrainTriangleHeightAt(grid: SurfaceGrid, heights: Float32Array, mask: Uint8Array, col: number, row: number): number | null {
  if (!Number.isFinite(col) || !Number.isFinite(row) || col < 0 || row < 0 || col > grid.width - 1 || row > grid.height - 1) return null;
  const x = Math.min(Math.floor(col),grid.width-2), y = Math.min(Math.floor(row),grid.height-2), u=col-x,v=row-y;
  const a=y*grid.width+x,b=a+1,c=a+grid.width,d=c+1;
  const ids=u+v<=1?[a,b,c]:[b,c,d]; if(ids.some(i=>!mask[i]||!Number.isFinite(heights[i])))return null;
  return u+v<=1?heights[a]*(1-u-v)+heights[b]*u+heights[c]*v:heights[b]*(1-v)+heights[c]*(1-u)+heights[d]*(u+v-1);
}
/** Find a supported entry even when a cell contains only its second valid triangle. */
export function surfaceWalkEntry(grid: SurfaceGrid, heights: Float32Array, mask: Uint8Array, preferred: [number,number]): [number,number] | null {
  if (terrainTriangleHeightAt(grid,heights,mask,...preferred)!==null) return preferred;
  for(let row=0;row<grid.height-1;row++) for(let col=0;col<grid.width-1;col++) {
    for(const offset of [.25,.75]) {
      const point:[number,number]=[col+offset,row+offset];
      if(terrainTriangleHeightAt(grid,heights,mask,...point)!==null)return point;
    }
  }
  return null;
}
/** Split a swept segment at every raster edge and triangle diagonal; never jump a hole. */
export function walkSurfaceStep(grid: SurfaceGrid, heights: Float32Array, mask: Uint8Array, start: [number,number], delta: [number,number]): [number,number] {
  if (!delta.every(Number.isFinite) || terrainTriangleHeightAt(grid,heights,mask,...start)===null) return start;
  const crossings=[0,1];
  for(const [origin,distance] of [[start[0],delta[0]],[start[1],delta[1]],[start[0]+start[1],delta[0]+delta[1]]]) {
    if(!distance)continue;
    const end=origin+distance;
    for(let edge=Math.ceil(Math.min(origin,end));edge<=Math.floor(Math.max(origin,end));edge++){const t=(edge-origin)/distance;if(t>0&&t<1)crossings.push(t);}
  }
  crossings.sort((a,b)=>a-b);let position:[number,number]=start;
  const at=(t:number):[number,number]=>[start[0]+delta[0]*t,start[1]+delta[1]*t];
  for(let i=1;i<crossings.length;i++) {
    const midpoint=at((crossings[i-1]+crossings[i])/2);
    if(terrainTriangleHeightAt(grid,heights,mask,...midpoint)===null)break;
    position=midpoint;
    const next=at(crossings[i]);if(terrainTriangleHeightAt(grid,heights,mask,...next)===null)break;position=next;
  }
  return position;
}
