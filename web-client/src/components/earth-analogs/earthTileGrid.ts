export const EARTH_TILE_SOURCE = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/500m';
export const MAX_EARTH_TILE_LEVEL = 7;
export interface EarthTile { level: number; row: number; col: number }

export function tileGrid(level: number) {
  if (!Number.isInteger(level) || level < 0 || level > MAX_EARTH_TILE_LEVEL) throw new Error('Invalid Earth imagery level.');
  const span = 288 / 2 ** level;
  return { span, columns: Math.ceil(360 / span), rows: Math.ceil(180 / span) };
}

export function earthTileAt(latitude: number, longitude: number, level: number): EarthTile {
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude)) throw new Error('Invalid Earth imagery coordinate.');
  const grid = tileGrid(level);
  const wrapped = ((longitude + 180) % 360 + 360) % 360;
  return { level, row: Math.min(grid.rows - 1, Math.floor((90 - latitude) / grid.span)), col: Math.floor(wrapped / grid.span) };
}

export function earthTileBounds(tile: EarthTile) {
  const grid = tileGrid(tile.level);
  if (!Number.isInteger(tile.row) || !Number.isInteger(tile.col) || tile.row < 0 || tile.row >= grid.rows || tile.col < 0 || tile.col >= grid.columns) throw new Error('Invalid Earth imagery tile.');
  const west = -180 + tile.col * grid.span, north = 90 - tile.row * grid.span;
  return { west, north, east: Math.min(180, west + grid.span), south: Math.max(-90, north - grid.span), span: grid.span };
}

export function earthTileUrl(tile: EarthTile) {
  earthTileBounds(tile);
  return `${EARTH_TILE_SOURCE}/${tile.level}/${tile.row}/${tile.col}.jpeg`;
}

export function earthTileLevel(distance: number, heightPixels: number, fovDegrees: number) {
  const radiansPerPixel = 2 * Math.max(0.01, distance - 1) * Math.tan(fovDegrees * Math.PI / 360) / Math.max(1, heightPixels);
  return Math.max(3, Math.min(MAX_EARTH_TILE_LEVEL, Math.ceil(Math.log2(288 * Math.PI / 180 / (512 * radiansPerPixel)))));
}
