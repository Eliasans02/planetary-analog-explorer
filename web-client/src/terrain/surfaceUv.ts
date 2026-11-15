/** The imagery exporter samples the DEM's native pixel centers. Row zero is decoded image row zero.
 * With ImageBitmap imageOrientation:none and Texture.flipY=false, row increases with v and native Z. */
export function surfaceImageUvs(width: number, height: number): Float32Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width > 257 || height > 257) throw new Error('Invalid surface imagery grid.');
  const uv = new Float32Array(width * height * 2);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) uv.set([(col + .5) / width, (row + .5) / height], (row * width + col) * 2);
  return uv;
}
