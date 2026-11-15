import type { PlanetRecord, PlanetTexture } from '@shared/types/planet-catalog';

/** Select an available asset; a quality request must never imply invented pixels. */
export function planetResolution(planet: PlanetRecord, requested: PlanetTexture['label']): PlanetTexture['label'] {
  const exact = planet.textures.find(texture => texture.label === requested);
  if (exact) return exact.label;
  const native = planet.textures.find(texture => texture.label === 'Native');
  if (native) return native.label;
  const largest = [...planet.textures].sort((a, b) => b.width - a.width)[0];
  if (!largest) throw new Error('No verified texture is available for this planet.');
  return largest.label;
}
