"""Deterministic offline terrain summaries of verified native relief buffers.

No fetching, resampling, hole filling, scoring, or source asset mutation occurs.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile

import jsonschema
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'web-client/public'
SCHEMA = ROOT / 'shared/schemas/surface_analysis.schema.json'
REFERENCES = [
    'https://gdal.org/en/stable/programs/gdaldem.html',
    'https://github.com/OSGeo/gdal/blob/v3.11.0/apps/gdaldem_lib.cpp',
    'https://pgda.gsfc.nasa.gov/products/78',
    'https://pubs.usgs.gov/publication/tm11B9',
    'https://www.uahirise.org/dtm/howto.php',
]
BINS = (0, 5, 10, 20, 30, 90)


def parse_json(data):
    def invalid(value):
        raise ValueError(f'Non-finite JSON token: {value}')
    return json.loads(data.decode('utf-8'), parse_constant=invalid)


def read_json(path):
    return parse_json(Path(path).read_bytes())


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def verified_asset(asset, public, expected_bytes):
    root = Path(public).resolve()
    relative = asset['path']
    if (not isinstance(relative, str) or not relative.startswith('/assets/')
            or '\\' in relative or any(part in ('', '.', '..') for part in relative[1:].split('/'))):
        raise ValueError('Expected a public /assets/ path')
    path = (root / relative.lstrip('/')).resolve()
    if not path.is_relative_to(root):
        raise ValueError('Asset path escapes public directory')
    if path.stat().st_size != expected_bytes or asset['bytes'] != expected_bytes:
        raise ValueError(f'Asset dimensions/byte length mismatch: {relative}')
    data = path.read_bytes()
    if len(data) != expected_bytes:
        raise ValueError(f'Asset changed during read: {relative}')
    if sha256(data) != asset['sha256']:
        raise ValueError(f'Asset SHA-256 mismatch: {relative}')
    return data


def slope_histogram(slopes):
    slopes = np.asarray(slopes, dtype=np.float64)
    if np.any(~np.isfinite(slopes)) or np.any((slopes < 0) | (slopes > 90)):
        raise ValueError('Slope histogram expects finite degrees in [0, 90]')
    counts, _ = np.histogram(slopes, bins=BINS)
    return [dict(min_deg=low, max_deg=high, samples=int(count),
                 fraction_pct=100.0 * int(count) / slopes.size if slopes.size else None)
            for low, high, count in zip(BINS[:-1], BINS[1:], counts)]


def analyze_grid(heights, valid_mask, spacing_m):
    """Float64 arithmetic; every local statistic requires all nine valid samples."""
    z = np.asarray(heights, dtype=np.float64)
    mask = np.asarray(valid_mask)
    if z.ndim != 2 or mask.shape != z.shape or min(z.shape) < 1:
        raise ValueError('Height and mask dimensions must match a nonempty 2D grid')
    if np.any((mask != 0) & (mask != 1)):
        raise ValueError('Validity mask must contain only 0 and 1')
    if len(spacing_m) != 2 or any(isinstance(v, bool) or not math.isfinite(v) or v <= 0 for v in spacing_m):
        raise ValueError('Grid spacing must contain two finite positive meter values')
    mask = mask.astype(bool)
    if not mask.any() or not np.isfinite(z[mask]).all():
        raise ValueError('Need at least one valid height; all valid heights must be finite')
    possible = max(0, z.shape[0] - 2) * max(0, z.shape[1] - 2)
    slopes = roughness = tri = np.empty(0, dtype=np.float64)
    if possible:
        neighborhoods = np.lib.stride_tricks.sliding_window_view(mask, (3, 3)).all(axis=(-1, -2))
        windows = np.lib.stride_tricks.sliding_window_view(z, (3, 3))[neighborhoods]
        if windows.size:
            a, b, c = windows[:, 0, :].T
            d, e, f = windows[:, 1, :].T
            g, h, i = windows[:, 2, :].T
            # Subtract before weighting to preserve offset invariance numerically.
            gx = ((c - a) + 2 * (f - d) + (i - g)) / (8 * spacing_m[0])
            gy = ((g - a) + 2 * (h - b) + (i - c)) / (8 * spacing_m[1])
            slopes = np.degrees(np.arctan(np.hypot(gx, gy)))
            roughness = np.ptp(windows, axis=(1, 2))
            tri = np.sqrt(np.sum((windows - e[:, None, None]) ** 2, axis=(1, 2)))
    count = int(slopes.size)
    coverage = dict(valid_height_samples=int(mask.sum()), total_samples=int(z.size),
                    analyzed_centers=count, possible_interior_centers=possible)
    metrics = dict(relief_m=float(np.ptp(z[mask])),
                   mean_slope_deg=float(slopes.mean()) if count else None,
                   p95_slope_deg=float(np.percentile(slopes, 95, method='linear')) if count else None,
                   max_slope_deg=float(slopes.max()) if count else None,
                   mean_roughness_m=float(roughness.mean()) if count else None,
                   max_roughness_m=float(roughness.max()) if count else None,
                   mean_tri_m=float(tri.mean()) if count else None)
    return dict(coverage=coverage, metrics=metrics, slope_histogram=slope_histogram(slopes))


def analyze_surface(surface, public=PUBLIC):
    grid = surface['grid']
    width, height = grid['width'], grid['height']
    if any(type(v) is not int or not 1 <= v <= 257 for v in (width, height)):
        raise ValueError('Grid dimensions must be integers between 1 and 257')
    raw = verified_asset(grid['heights'], public, width * height * 4)
    mask_raw = verified_asset(grid['valid_mask'], public, width * height)
    heights = np.frombuffer(raw, dtype='<f4').reshape(height, width)
    mask = np.frombuffer(mask_raw, dtype='u1').reshape(height, width)
    if not np.isfinite(heights).all() or np.any(heights[mask == 0] != 0):
        raise ValueError('Published native buffers require finite heights and zero invalid samples')
    result = analyze_grid(heights, mask, grid['spacing_m'])
    stats = surface['stats']
    if (stats['valid_samples'] != result['coverage']['valid_height_samples']
            or stats['total_samples'] != width * height):
        raise ValueError('Catalog sample counts differ from verified native buffers')
    # Exported Float32 relief may round the source Float64 range once.
    tolerance = max(1e-6, abs(stats['relief_m']) * float(np.finfo(np.float32).eps) * 2)
    if abs(stats['relief_m'] - result['metrics']['relief_m']) > tolerance:
        raise ValueError('Catalog relief differs from native buffer beyond Float32 tolerance')
    result.update(surface_id=surface['id'], inputs=dict(
        heights_sha256=sha256(raw), valid_mask_sha256=sha256(mask_raw),
        width=width, height=height, spacing_m=grid['spacing_m']))
    result['limitations'] = list(dict.fromkeys([
        *surface.get('limitations', []),
        'Catalog horizontal method: ' + grid['horizontal_method'],
        'Computed from stored Float32 heights using Float64 arithmetic; constant vertical zero does not affect gradients or relief.',
        'Kernel is 3 by 3 native source samples; no resampling or interpolation. Outer edges and any neighborhood with invalid heights are excluded.',
        'Spacing uses catalog meters along raster axes. Projected distances and local metric approximations are not an exact ground-distance or ENU solution.',
        'Slope extrema, percentiles, roughness and TRI depend on grid spacing, DEM resolution, source error and window extent; cross-scale equality is not implied.',
        'Roughness range and Riley TRI include the local terrain gradient; they are not detrended rockiness measurements.',
        'A valid DEM height may be interpolated or filled by the source provider; validity does not establish a direct instrument return.',
        'These descriptive metrics do not establish traversability, landing suitability, terrain similarity or confidence.',
    ]))
    return result


def build_analysis(catalog_path=PUBLIC / 'data/surface_catalog.json', public=PUBLIC):
    catalog_path = Path(catalog_path)
    data = catalog_path.read_bytes()
    catalog = parse_json(data)
    jsonschema.Draft202012Validator(read_json(ROOT / 'shared/schemas/surface_catalog.schema.json')).validate(catalog)
    ids = [s['id'] for s in catalog['surfaces']]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate surface identifiers')
    source_ids = [s['id'] for s in catalog['sources']]
    if len(source_ids) != len(set(source_ids)):
        raise ValueError('Duplicate source identifiers')
    for surface in catalog['surfaces']:
        if not set(surface['source_ids']) <= set(source_ids):
            raise ValueError('Unknown source reference')
    # Use the input publication timestamp so identical inputs produce identical bytes.
    result = dict(schema_version='1.0.0', generated_at=catalog['generated_at'],
                  catalog_sha256=sha256(data), method=dict(id='horn_3x3_v1', references=REFERENCES),
                  surfaces=[analyze_surface(s, public) for s in catalog['surfaces']])
    validate(result)
    return result


def validate(result):
    json.dumps(result, allow_nan=False)
    jsonschema.Draft202012Validator(read_json(SCHEMA), format_checker=jsonschema.FormatChecker()).validate(result)


def atomic_export(path, value):
    validate(value)
    data = json.dumps(value, indent=2, allow_nan=False) + '\n'
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='\n', dir=path.parent,
                                         prefix=path.name + '.', suffix='.tmp', delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def check_published(path, expected):
    """Read-only exact check: both documents arise from deterministic Float64 work."""
    published = read_json(path)
    validate(published)
    actual = {key: value for key, value in published.items() if key != 'generated_at'}
    wanted = {key: value for key, value in expected.items() if key != 'generated_at'}
    if actual != wanted:
        raise ValueError('Published analysis is stale or differs from verified native-grid recomputation')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, default=PUBLIC / 'data/surface_catalog.json')
    parser.add_argument('--public', type=Path, default=PUBLIC)
    parser.add_argument('--output', type=Path, default=PUBLIC / 'data/surface_analysis.json')
    parser.add_argument('--check', action='store_true', help='Read-only exact recomputation check of published output')
    args = parser.parse_args()
    result = build_analysis(args.catalog, args.public)
    if args.check:
        check_published(args.output, result)
        print(f'Verified published analysis for {len(result["surfaces"])} surfaces; no files changed')
        return
    atomic_export(args.output, result)
    print(f'Analyzed {len(result["surfaces"])} verified native surface grids -> {args.output}')


if __name__ == '__main__':
    main()
