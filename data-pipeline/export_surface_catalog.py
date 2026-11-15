"""Offline, source-identity-checked native DEM relief export; never computes scores/ENU.

Run with previews/a04/.venv/Scripts/python.exe data-pipeline/export_surface_catalog.py.
Binary grids use native raster row order; row-major little-endian Float32 / UInt8 validity.
"""
import datetime
import hashlib
import json
import math
from pathlib import Path
import struct
import tarfile

import jsonschema
import numpy as np
from pyproj import CRS, Transformer
import rasterio
from rasterio.windows import Window
from shapely.geometry import Point, Polygon

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data-pipeline/cache/raw/fast-path'
PUBLIC = ROOT / 'web-client/public'
EVIDENCE = ROOT / 'evidence/real_surface_export'
SIZE = 129


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1048576), b''):
            h.update(chunk)
    return h.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    temporary.replace(path)


def verify_receipt(receipt):
    path = ROOT / receipt['local_path']
    if not (sha(path) == receipt['sha256']):
        raise ValueError(f'Source hash mismatch: {path}')
    expected = receipt.get('actual_bytes', receipt.get('bytes'))
    if not (path.stat().st_size == expected):
        raise ValueError(f'Source byte count mismatch: {path}')
    return path


def load_roi(path):
    """Only four exact regular members; ignore links without following or extracting."""
    allow = {f'Site04_ROIs.{suffix}' for suffix in ('shp', 'shx', 'dbf', 'prj')}
    members = {}
    ignored_links = []
    with tarfile.open(path, 'r:gz') as archive:
        for member in archive.getmembers():
            if member.name in allow:
                if not (member.isfile() and 0 < member.size < 1048576):
                    raise ValueError('Native surface validation failed: member.isfile() and 0 < member.size < 1048576')
                if not (member.name not in members):
                    raise ValueError('Native surface validation failed: member.name not in members')
                members[member.name] = archive.extractfile(member).read()
            elif member.issym():
                ignored_links.append(member.name)
            else:
                raise ValueError(f'Unexpected archive member: {member.name}')
    if not (set(members) == allow):
        raise ValueError('Native surface validation failed: set(members) == allow')
    shp = members['Site04_ROIs.shp']
    pos, selected, index = 100, None, []
    while pos < len(shp):
        number, words = struct.unpack_from('>ii', shp, pos)
        index.append((pos // 2, words))
        pos += 8
        payload = shp[pos:pos + words * 2]
        pos += words * 2
        if not (struct.unpack_from('<i', payload)[0] == 5):
            raise ValueError("Native surface validation failed: struct.unpack_from('<i', payload)[0] == 5")
        parts, points = struct.unpack_from('<ii', payload, 36)
        if not (parts == 1):
            raise ValueError('Native surface validation failed: parts == 1')
        coords = [struct.unpack_from('<dd', payload, 48 + 16 * i) for i in range(points)]
        if not (all((math.isfinite(x) for point in coords for x in point))):
            raise ValueError('Native surface validation failed: all((math.isfinite(x) for point in coords for x in point))')
        if number == 3:
            selected = Polygon(coords)
    if not (pos == len(shp) and selected is not None and selected.is_valid):
        raise ValueError('Native surface validation failed: pos == len(shp) and selected is not None and selected.is_valid')
    shx = members['Site04_ROIs.shx']
    if not (index == [struct.unpack_from('>ii', shx, p) for p in range(100, len(shx), 8)]):
        raise ValueError("Native surface validation failed: index == [struct.unpack_from('>ii', shx, p) for p in range(100, len(shx), 8)]")
    return selected, {'member_sha256': {k: hashlib.sha256(v).hexdigest() for k, v in members.items()},
                      'projection_wkt': members['Site04_ROIs.prj'].decode(),
                      'dbf_hex': members['Site04_ROIs.dbf'].hex(),
                      'ignored_links': ignored_links, 'extracted_or_followed_links': False}


def highest_pixel(ds):
    """Scan native blocks, resolve equal elevations by smallest row-major index."""
    best = None
    valid_total = 0
    for _, window in ds.block_windows(1):
        raw = ds.read(1, window=window)
        valid = (ds.read_masks(1, window=window) > 0) & np.isfinite(raw)
        values = raw.astype('float64') * ds.scales[0] + ds.offsets[0]
        valid &= np.isfinite(values)
        valid_total += int(valid.sum())
        if not valid.any():
            continue
        maximum = values[valid].max()
        rr, cc = np.where(valid & (values == maximum))
        indices = (rr + int(window.row_off)) * ds.width + cc + int(window.col_off)
        index = int(indices.min())
        candidate = (float(maximum), -index)
        if best is None or candidate > best:
            best = candidate
    if not (best is not None):
        raise ValueError('Native surface validation failed: best is not None')
    row, col = divmod(-best[1], ds.width)
    return row, col, {'selection': 'PROJECT_SELECTED highest finite GDAL-valid native elevation in complete tile; ties smallest row-major index',
                      'tile_valid_samples': valid_total, 'maximum_height_m': best[0], 'native_row_col': [row, col]}


def crop(ds, row, col):
    if not (64 <= row < ds.height - 64 and 64 <= col < ds.width - 64):
        raise ValueError('Native surface validation failed: 64 <= row < ds.height - 64 and 64 <= col < ds.width - 64')
    win = Window(col - 64, row - 64, SIZE, SIZE)
    raw = ds.read(1, window=win)
    valid = (ds.read_masks(1, window=win) > 0) & np.isfinite(raw)
    values = raw.astype('float64') * ds.scales[0] + ds.offsets[0]
    valid &= np.isfinite(values)
    if not (valid.any()):
        raise ValueError('Native surface validation failed: valid.any()')
    minimum, maximum = float(values[valid].min()), float(values[valid].max())
    heights = np.zeros(raw.shape, dtype='<f4')
    heights[valid] = (values[valid] - minimum).astype('<f4')
    return win, values, valid, heights, minimum, maximum


def asset(path):
    return {'path': '/' + path.relative_to(PUBLIC).as_posix(), 'sha256': sha(path), 'bytes': path.stat().st_size}


def export():
    acquisition = read_json(ROOT / 'docs/research/acquisition_status.json')
    receipts = {r['id']: r for r in acquisition['records']}
    earth = read_json(ROOT / 'docs/research/LOCAL_DEM_EARTH_ACQUISITION.json')
    roi_receipt = read_json(ROOT / 'docs/research/LOCAL_DEM_ROI_ACQUISITION.json')
    for key in ('lola_site04_surface', 'lola_site04_return_count', 'lola_site04_readme'):
        verify_receipt(receipts[key])
    verify_receipt(earth)
    verify_receipt(earth['public_companion_metadata'])
    polygon, archive_meta = load_roi(verify_receipt(roi_receipt))
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    catalog = {'schema_version': '1.0.0', 'generated_at': now, 'sources': [], 'surfaces': []}
    comparisons = []
    for moon in (True, False):
        ident = 'lola-site04-roi3' if moon else 'usgs-hawaii-summit'
        receipt = receipts['lola_site04_surface'] if moon else earth
        source_id = 'nasa-lola-site04' if moon else 'usgs-3dep-n20w156'
        out = PUBLIC / 'assets/surfaces' / ident
        out.mkdir(parents=True, exist_ok=True)
        with rasterio.open(ROOT / receipt['local_path']) as ds:
            crs = CRS(ds.crs)
            if moon:
                point = polygon.representative_point()
                row, col = ds.index(point.x, point.y)
                inverse = Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)
                lon, lat = inverse.transform(point.x, point.y)
                selection = {'selection': 'Project chose valid published ROI record 3; native pixel containing its Shapely representative point is crop center',
                             'representative_point_xy_m': [point.x, point.y], 'native_row_col': [row, col]}
            else:
                row, col, selection = highest_pixel(ds)
                lon, lat = ds.xy(row, col)
            win, values, valid, heights, minimum, maximum = crop(ds, row, col)
            origin = list(ds.xy(int(win.row_off), int(win.col_off)))
            center = list(ds.xy(row, col))
            native_spacing = [ds.transform.a, ds.transform.e]
            if moon:
                spacing = [abs(ds.transform.a), abs(ds.transform.e)]
                method = 'Exact native south polar stereographic sample spacing; display axes follow raster columns/rows. This is projected relief, not ENU.'
                outline = [[(x - origin[0]) / native_spacing[0], (y - origin[1]) / native_spacing[1]] for x, y in polygon.exterior.coords]
                with rasterio.open(ROOT / receipts['lola_site04_return_count']['local_path']) as ldec:
                    if not ((ldec.crs, ldec.transform, ldec.width, ldec.height) == (ds.crs, ds.transform, ds.width, ds.height)):
                        raise ValueError('Native surface validation failed: (ldec.crs, ldec.transform, ldec.width, ldec.height) == (ds.crs, ds.transform, ds.width, ds.height)')
                    counts = ldec.read(1, window=win)
                    count_valid = (ldec.read_masks(1, window=win) > 0) & np.isfinite(counts)
                    direct = int((valid & count_valid & (counts > 0)).sum())
                    inside = np.array([[polygon.covers(Point(*ds.xy(int(win.row_off)+r, int(win.col_off)+c))) for c in range(SIZE)] for r in range(SIZE)])
                    returns = {'direct_return_samples_in_crop': direct, 'zero_return_valid_surface_samples_in_crop': int((valid & count_valid & (counts == 0)).sum()),
                               'invalid_return_count_samples_in_crop': int((~count_valid).sum()), 'maximum_returns_per_crop_pixel': float(counts[count_valid].max()),
                               'published_roi_sample_centers': int(inside.sum()), 'published_roi_valid_surface_samples': int((inside & valid).sum()),
                               'published_roi_zero_return_samples': int((inside & valid & count_valid & (counts == 0)).sum())}
            else:
                geod = crs.get_geod()
                spacing = [abs(geod.inv(lon, lat, lon + ds.transform.a, lat)[2]), abs(geod.inv(lon, lat, lon, lat + ds.transform.e)[2])]
                method = 'Approximate horizontal display: constant X/Y metre distances from Geod on native NAD83 GRS80 ellipsoid at crop center, one native longitude/latitude increment each. Native degree sample centers retained; no reprojection or datum transformation, not ENU.'
                outline = [[0, 0], [128, 0], [128, 128], [0, 128], [0, 0]]
                direct, returns = None, None
            (out / 'heights.f32').write_bytes(heights.tobytes(order='C'))
            (out / 'valid-mask.u8').write_bytes(valid.astype('uint8').tobytes(order='C'))
            limitations = ['Unranked source relief; no terrain similarity, suitability, profile, or landing recommendation.',
                           'Native surface minus crop minimum; vertical display is relative, with no absolute ENU or datum conversion.',
                           'Context crop is separate from the published ROI.' if moon else 'Window is project-selected, not a NASA-recommended analog.',
                           'Surface includes interpolation; valid surface does not imply direct LOLA laser returns.' if moon else 'NAD83 retained; coordinates are not asserted to be WGS84.',
                           'Absolute height zero remains unverified.' if moon else 'XML declares NAVD88 but abstract says vertical reference varies outside CONUS; Hawaii datum applicability remains unverified.']
            provenance = {'generated_at': now, 'raw_source_receipt': receipt, 'raw_receipt_file': 'docs/research/acquisition_status.json' if moon else 'docs/research/LOCAL_DEM_EARTH_ACQUISITION.json',
                          'source_hash_verified': True, 'source_metadata': {'crs_wkt': ds.crs.to_wkt(), 'transform': list(ds.transform)[:6], 'width': ds.width, 'height': ds.height,
                          'dtype': ds.dtypes[0], 'nodata': str(ds.nodata), 'scale': ds.scales[0], 'offset': ds.offsets[0], 'tags': ds.tags(), 'band_tags': ds.tags(1)},
                          'selection': selection, 'window_col_row_width_height': [int(win.col_off), int(win.row_off), SIZE, SIZE], 'crop_center_native': center,
                          'native_origin_semantics': 'center of sample [row=0,column=0]; native_spacing signed per column/row',
                          'processing': ['Native pixels only; no resampling, smoothing, terrain synthesis or hole filling by this exporter.', 'Mask GDAL validity and finite raw values before scale/offset; then require finite scaled values.',
                                         'Subtract minimum valid scaled source height in float64, then cast little-endian Float32; invalid samples exactly zero with separate UInt8 mask.',
                                         'Row-major, rows follow native raster order; outline coordinates are fractional [column,row] sample indices.'],
                          'horizontal_method': method, 'limitations': limitations, 'return_count_diagnostics': returns}
            if moon:
                provenance.update({'source_readme_text': (ROOT / receipts['lola_site04_readme']['local_path']).read_text(), 'readme_receipt': receipts['lola_site04_readme'],
                                   'roi_receipt': roi_receipt, 'roi_archive': archive_meta, 'return_count_receipt': receipts['lola_site04_return_count'],
                                   'published_roi_native_outline': list(map(list, polygon.exterior.coords)),
                                   'frame': 'MOON_ME reference frame of ephemeris DE421 per README; planetocentric latitude and east longitude via native projection inversion only; no IAU/WGS84 transform'})
            else:
                provenance.update({'source_xml_text': (ROOT / earth['public_companion_metadata']['local_path']).read_text(), 'frame': 'EPSG:4269 NAD83; no datum transformation'})
            write_json(out / 'provenance.json', provenance)
            source = {'id': source_id, 'provider': 'NASA GSFC / LOLA' if moon else earth['provider'], 'product': 'LOLA Site04 Shackleton rim 5 m/pixel adjusted surface' if moon else earth['product_title'],
                      'product_url': 'https://pgda.gsfc.nasa.gov/products/78' if moon else 'https://www.sciencebase.gov/catalog/item/684a3701d4be026f96d9de35',
                      'access_url': receipt['canonical_url'], 'retrieved_at': receipt.get('retrieved_at', receipt.get('retrieved_at_utc')),
                      'sha256': receipt['sha256'], 'license': 'NASA public scientific data; retain source attribution' if moon else 'Public domain (source XML)',
                      'local_path': '/' + (out / 'provenance.json').relative_to(PUBLIC).as_posix()}
            record = {'id': ident, 'name': 'Shackleton rim · LOLA Site04 ROI 3' if moon else 'Hawaii 3DEP summit window', 'body': 'moon' if moon else 'earth',
                      'description': 'Actual NASA LOLA native 5 m surface around published ROI record 3.' if moon else 'Actual USGS 1 arc-second DEM around the highest valid native sample in n20w156; selected by this project.',
                      'coordinates': {'latitude_deg': lat, 'longitude_deg': lon, 'frame': 'MOON_ME_DE421' if moon else 'NAD83', 'provenance': provenance['frame']},
                      'source_ids': [source_id], 'grid': {'width': SIZE, 'height': SIZE, 'spacing_m': spacing, 'display_frame': 'native_projected_relief', 'horizontal_method': method,
                      'heights': asset(out / 'heights.f32'), 'valid_mask': asset(out / 'valid-mask.u8'), 'vertical_zero_m': minimum, 'vertical_datum': None if moon else 'Source XML declares NAVD88; Hawaii applicability unverified',
                      'vertical_datum_status': 'unverified', 'native_crs_wkt': ds.crs.to_wkt(), 'native_origin': origin, 'native_spacing': native_spacing, 'native_units': 'm' if moon else 'deg'},
                      'stats': {'min_source_height_m': minimum, 'max_source_height_m': maximum, 'relief_m': maximum-minimum, 'valid_samples': int(valid.sum()), 'total_samples': SIZE*SIZE, 'direct_return_samples': direct},
                      'roi': {'label': 'Published Site04 ROI record 3' if moon else 'PROJECT_SELECTED context window', 'kind': 'published_source_polygon' if moon else 'project_selected_window', 'outline_grid': outline, 'source_record': 3 if moon else None},
                      'limitations': limitations, 'provenance': asset(out / 'provenance.json')}
            catalog['sources'].append(source)
            catalog['surfaces'].append(record)
            # Independent direct single-pixel reads at center, corners and valid extremes.
            samples = {(0, 0), (0, 128), (128, 0), (128, 128), (64, 64)}
            for flat in (np.argmin(np.where(valid, values, np.inf)), np.argmax(np.where(valid, values, -np.inf))):
                samples.add(tuple(map(int, np.unravel_index(flat, valid.shape))))
            for r, c in sorted(samples):
                pixel = Window(int(win.col_off)+c, int(win.row_off)+r, 1, 1)
                raw_value = float(ds.read(1, window=pixel)[0, 0])
                direct_valid = bool(ds.read_masks(1, window=pixel)[0, 0] > 0 and math.isfinite(raw_value))
                expected = np.float32(raw_value*ds.scales[0]+ds.offsets[0]-minimum) if direct_valid else np.float32(0)
                if not (direct_valid == bool(valid[r, c]) and expected == heights[r, c]):
                    raise ValueError('Native surface validation failed: direct_valid == bool(valid[r, c]) and expected == heights[r, c]')
                comparisons.append({'id': ident, 'crop_row_col': [r, c], 'raw_height_m': raw_value if direct_valid else None, 'display_height_m': float(heights[r, c]), 'valid': direct_valid, 'exact_float32_match': True})
    write_json(PUBLIC / 'data/surface_catalog.json', catalog)
    report = validate(catalog)
    report.update({'generated_at': now, 'direct_source_sample_comparisons': comparisons, 'surfaces': [{'id': s['id'], 'stats': s['stats']} for s in catalog['surfaces']]})
    write_json(EVIDENCE / 'validation.json', report)
    print(json.dumps(report, indent=2))
    return catalog


def validate(catalog):
    jsonschema.Draft202012Validator(read_json(ROOT / 'shared/schemas/surface_catalog.schema.json')).validate(catalog)
    ids = {s['id'] for s in catalog['sources']}
    if not (len(ids) == len(catalog['sources'])):
        raise ValueError("Native surface validation failed: len(ids) == len(catalog['sources'])")
    total = 0
    for source in catalog['sources']:
        if not ((PUBLIC / source['local_path'].lstrip('/')).is_file()):
            raise ValueError("Native surface validation failed: (PUBLIC / source['local_path'].lstrip('/')).is_file()")
        provenance = read_json(PUBLIC / source['local_path'].lstrip('/'))
        if not (source['sha256'] == provenance['raw_source_receipt']['sha256']):
            raise ValueError("Native surface validation failed: source['sha256'] == provenance['raw_source_receipt']['sha256']")
    for s in catalog['surfaces']:
        if not (set(s['source_ids']) <= ids):
            raise ValueError("Native surface validation failed: set(s['source_ids']) <= ids")
        grid, stats = s['grid'], s['stats']
        for a in (grid['heights'], grid['valid_mask'], s['provenance']):
            p = PUBLIC / a['path'].lstrip('/')
            if not (p.stat().st_size == a['bytes'] and sha(p) == a['sha256']):
                raise ValueError("Native surface validation failed: p.stat().st_size == a['bytes'] and sha(p) == a['sha256']")
            total += a['bytes']
        n = grid['width'] * grid['height']
        h = np.fromfile(PUBLIC / grid['heights']['path'].lstrip('/'), dtype='<f4')
        m = np.fromfile(PUBLIC / grid['valid_mask']['path'].lstrip('/'), dtype='uint8')
        if not (h.size == m.size == n and np.isfinite(h).all() and np.isin(m, [0, 1]).all()):
            raise ValueError('Native surface validation failed: h.size == m.size == n and np.isfinite(h).all() and np.isin(m, [0, 1]).all()')
        if not (np.all(h[m == 0] == 0) and np.all(h[m == 1] >= 0)):
            raise ValueError('Native surface validation failed: np.all(h[m == 0] == 0) and np.all(h[m == 1] >= 0)')
        if not (int(m.sum()) == stats['valid_samples'] and n == stats['total_samples']):
            raise ValueError("Native surface validation failed: int(m.sum()) == stats['valid_samples'] and n == stats['total_samples']")
        if not (float(h[m == 1].min()) == 0 and np.isclose(h.max(), stats['relief_m'], rtol=1e-06)):
            raise ValueError("Native surface validation failed: float(h[m == 1].min()) == 0 and np.isclose(h.max(), stats['relief_m'], rtol=1e-06)")
        if not (grid['vertical_zero_m'] == stats['min_source_height_m']):
            raise ValueError("Native surface validation failed: grid['vertical_zero_m'] == stats['min_source_height_m']")
        if not (stats['direct_return_samples'] is None or stats['direct_return_samples'] <= stats['valid_samples']):
            raise ValueError("Native surface validation failed: stats['direct_return_samples'] is None or stats['direct_return_samples'] <= stats['valid_samples']")
        if not (s['roi']['outline_grid'][0] == s['roi']['outline_grid'][-1]):
            raise ValueError("Native surface validation failed: s['roi']['outline_grid'][0] == s['roi']['outline_grid'][-1]")
    if not (total < 1048576):
        raise ValueError('Native surface validation failed: total < 1048576')
    return {'schema_validation': 'passed', 'semantic_and_output_hash_byte_mask_checks': 'passed', 'surface_asset_bytes': total, 'catalog_bytes': (PUBLIC / 'data/surface_catalog.json').stat().st_size,
            'raster_sample_count': sum(s['stats']['total_samples'] for s in catalog['surfaces']), 'scientific_scores_computed': False, 'source_datum_transformations': False}


if __name__ == '__main__':
    export()
