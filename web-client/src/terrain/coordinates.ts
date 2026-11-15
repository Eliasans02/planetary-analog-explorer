import type { Body, CoordinateFrame } from '@shared/types/analog-location';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Wraps longitude visually into [-180, 180] degrees while keeping +180 distinct from -180 when exact.
 */
export function normalizeLongitudeDeg(longitudeDeg: number): number {
  if (!Number.isFinite(longitudeDeg)) {
    throw new RangeError(`Expected finite longitude, got ${longitudeDeg}`);
  }
  if (longitudeDeg >= -180 && longitudeDeg <= 180) {
    return longitudeDeg;
  }
  const wrapped = ((((longitudeDeg + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && longitudeDeg > 0 ? 180 : wrapped;
}

/**
 * Converts planetocentric / WGS84 (latitude_deg in [-90, 90], east-positive longitude_deg in [-180, 180])
 * onto a right-handed Three.js sphere of given radius:
 *   +Y = North pole (+90 deg)
 *   +X = Prime meridian (0 lat, 0 lon)
 *   -Z = 90 deg East (counter-clockwise East around +Y from North pole)
 *   -X = Antimeridian (+/-180 deg)
 */
export function latLonToUnitSphere(
  latitudeDeg: number,
  longitudeDeg: number,
  radius = 1,
): [number, number, number] {
  if (!Number.isFinite(latitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90) {
    throw new RangeError(`Latitude out of [-90, 90]: ${latitudeDeg}`);
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError(`Sphere radius must be positive: ${radius}`);
  }
  const wrappedLon = normalizeLongitudeDeg(longitudeDeg);
  const latRad = latitudeDeg * DEG_TO_RAD;
  const lonRad = wrappedLon * DEG_TO_RAD;
  const cosLat = Math.cos(latRad);

  const x = radius * cosLat * Math.cos(lonRad);
  const y = radius * Math.sin(latRad);
  const z = -radius * cosLat * Math.sin(lonRad);
  return [x, y, z];
}

export function expectedFrameForBody(body: Body): CoordinateFrame {
  switch (body) {
    case 'earth':
      return 'earth_wgs84';
    case 'moon':
      return 'moon_iau_planetocentric';
    case 'mars':
      return 'mars_iau_planetocentric';
  }
}

export function formatCoordinateFrame(frame: CoordinateFrame): string {
  switch (frame) {
    case 'earth_wgs84':
      return 'Earth WGS84 (east-positive)';
    case 'moon_iau_planetocentric':
      return 'Moon IAU Planetocentric (east-positive)';
    case 'mars_iau_planetocentric':
      return 'Mars IAU Planetocentric (east-positive)';
  }
}

export function formatBodyName(body: Body): string {
  switch (body) {
    case 'earth':
      return 'Earth';
    case 'moon':
      return 'Moon';
    case 'mars':
      return 'Mars';
  }
}
