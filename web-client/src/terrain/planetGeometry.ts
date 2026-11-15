/** NASA equirectangular maps: left edge -180°, centre 0°, right edge +180°; row zero north. */
export function latLonToPoint(latitude: number, longitude: number, radius = 1): [number, number, number] {
  const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
  return [radius * Math.cos(lat) * Math.cos(lon), radius * Math.sin(lat), -radius * Math.cos(lat) * Math.sin(lon)];
}
export function pointToLatLon(x: number, y: number, z: number) {
  const radius = Math.hypot(x, y, z);
  return { latitude_deg: Math.asin(Math.max(-1, Math.min(1, y / radius))) * 180 / Math.PI, longitude_deg: Math.atan2(-z, x) * 180 / Math.PI };
}
export function latLonToUV(latitude: number, longitude: number): [number, number] { return [(longitude + 180) / 360, (latitude + 90) / 180]; }
/** Nearest pixel-center sample of a global cylindrical raster; repeated seam vertices share a sample.
 * At a geometric pole all longitudes coincide. Choose column zero deterministically rather than
 * producing a stack of different radii at the same point from the adjacent polar raster row.
 */
export function globalDemSampleIndex(latitude: number, longitude: number, width: number, height: number): number {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || !Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) throw new Error('Invalid global sample coordinate or dimensions.');
  const row = Math.min(height - 1, Math.floor((90 - latitude) / 180 * height));
  const u = (((longitude + 180) % 360) + 360) % 360 / 360;
  const col = Math.abs(latitude) === 90 ? 0 : Math.min(width - 1, Math.floor(u * width));
  return row * width + col;
}
export function planetGeometryData(dem?: { heights: Float32Array; width: number; height: number; radius_m: number }) {
  const width = 256, height = 128, positions: number[] = [], uv: number[] = [], indices: number[] = [];
  if (dem && (dem.heights.length !== dem.width * dem.height || dem.radius_m <= 0 || dem.heights.some(h => !Number.isFinite(h)))) throw new Error('Invalid source global elevation grid.');
  for (let row = 0; row <= height; row++) for (let col = 0; col <= width; col++) {
    const lat = 90 - row / height * 180, lon = col / width * 360 - 180;
    // Nearest source sample; no invented subpixel relief or vertical exaggeration.
    const h = dem ? dem.heights[globalDemSampleIndex(lat, lon, dem.width, dem.height)] : 0;
    positions.push(...latLonToPoint(lat, lon, dem ? 1 + h / dem.radius_m : 1)); uv.push(...latLonToUV(lat, lon));
    if (row < height && col < width) { const a = row * (width + 1) + col, b = a + 1, c = a + width + 1; indices.push(a, c, b, b, c, c + 1); }
  }
  return { positions: new Float32Array(positions), uv: new Float32Array(uv), indices: new Uint32Array(indices) };
}
