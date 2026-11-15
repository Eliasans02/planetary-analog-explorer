"""Export coarse regional relief from complete NASA LOLA and MOLA global grids."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.request

import numpy as np
from PIL import Image

from analyze_surfaces import build_analysis, atomic_export

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'web-client/public'
RAW = ROOT / 'data-pipeline/cache/raw/global-relief'
MOLA = 'https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/'
MOLA_PAGE = 'https://pds-geosciences.wustl.edu/missions/mgs/megdr.html'
GAZETTEER = 'https://planetarynames.wr.usgs.gov/'
MOON_MARIA = GAZETTEER + 'SearchResults?Feature+Type=25_Mare%2C+maria&Target=16_Moon'
SITES = [
    ('moon', 'tycho', 'Tycho', -43.30, -11.22, 33, GAZETTEER+'Feature/6163', 'Crater and surrounding highlands'),
    ('moon', 'aristarchus', 'Aristarchus', 23.73, -47.49, 33, GAZETTEER+'Feature/380', 'Crater and surrounding plateau'),
    ('moon', 'imbrium', 'Mare Imbrium', 34.72, -14.91, 129, GAZETTEER+'Feature/3678', 'Broad lunar mare and basin margins'),
    ('moon', 'orientale', 'Mare Orientale', -19.87, -94.67, 65, MOON_MARIA, 'Mare and surrounding ring terrain'),
    ('moon', 'tranquillitatis', 'Mare Tranquillitatis', 8.35, 30.83, 129, MOON_MARIA, 'Nearside mare landscape'),
    ('moon', 'moscoviense', 'Mare Moscoviense', 27.28, 148.12, 65, MOON_MARIA, 'Farside mare and basin terrain'),
    ('mars', 'olympus', 'Olympus Mons', 18.65, -133.80, 65, GAZETTEER+'Feature/4453', 'Volcanic edifice and surrounding plains'),
    ('mars', 'valles', 'Valles Marineris', -13.74, -59.20, 129, GAZETTEER+'Feature/6288', 'Central canyon system and surrounding plateau'),
    ('mars', 'hellas', 'Hellas Planitia', -42.66, 70.00, 129, GAZETTEER+'Feature/2432', 'Basin floor and regional relief'),
    ('mars', 'korolev', 'Korolev', 72.77, 164.58, 33, GAZETTEER+'Feature/3091', 'Northern crater and surrounding plains'),
    ('mars', 'arsia', 'Arsia Mons', -8.26, -120.09, 65, GAZETTEER+'Feature/394', 'Tharsis volcanic edifice'),
    ('mars', 'elysium', 'Elysium Mons', 25.02, 147.21, 65, GAZETTEER+'Feature/1783', 'Volcanic edifice and surrounding terrain'),
    ('mars', 'utopia', 'Utopia Planitia', 46.74, 117.52, 129, GAZETTEER+'Feature/6260', 'Northern lowland regional window'),
    ('mars', 'mawrth', 'Mawrth Vallis', 22.43, -16.97, 65, GAZETTEER+'SearchResults?Target=20_Mars', 'Valley region and surrounding plateau'),
]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False)+'\n'
    if path in [PUBLIC/'data/planet_catalog.json', PUBLIC/'assets/planets/mars/provenance.json']:
        path.write_bytes(content.replace('\n','\r\n').encode('utf-8'))
    else:
        path.write_text(content, encoding='utf-8')


def asset(path):
    return dict(path='/'+path.relative_to(PUBLIC).as_posix(), sha256=sha(path), bytes=path.stat().st_size)


def acquire(name, limit, enabled):
    target = RAW / name
    receipt = target.with_name(name+'.receipt.json')
    if not target.exists():
        if not enabled:
            raise FileNotFoundError(f'{target}; rerun with --acquire')
        request = urllib.request.Request(MOLA+name, headers={'User-Agent':'PlanetaryAnalogExplorer source research'})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read(limit+1)
            if len(data) > limit:
                raise ValueError('Global source exceeds acquisition bound')
            declared = response.headers.get('Content-Length')
            if declared and int(declared) != len(data):
                raise ValueError('Truncated global source')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    if not receipt.exists():
        write_json(receipt, dict(canonical_url=MOLA+name, local_path=target.relative_to(ROOT).as_posix(),
            bytes=target.stat().st_size, sha256=sha(target), complete_product=True,
            retrieved_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            identity_scope='Locally computed SHA-256 of complete downloaded bytes; no independent publisher checksum was supplied.'))
    record = json.loads(receipt.read_text())
    if target.stat().st_size > limit or record['bytes'] != target.stat().st_size or record['sha256'] != sha(target):
        raise ValueError('Global source cache identity mismatch')
    return record


def mola_grid(name):
    label = (RAW/(name+'.lbl')).read_text()
    required = {'LINES':'720', 'LINE_SAMPLES':'1440', 'SAMPLE_BITS':'16', 'SAMPLE_TYPE':'MSB_INTEGER',
                'UNIT':'METER', 'MAP_RESOLUTION':'4.0', 'CENTER_LONGITUDE':'180.0'}
    for key, value in required.items():
        if not re.search(r'\b'+key+r'\s*=\s*'+re.escape(value)+r'\b', label):
            raise ValueError('Unexpected MOLA label field '+key)
    if (RAW/(name+'.img')).stat().st_size != 720*1440*2:
        raise ValueError('Unexpected MOLA image size')
    values = np.fromfile(RAW/(name+'.img'), dtype='>i2').reshape(720,1440)
    if np.any(values == -32768):
        raise ValueError('Unexpected MOLA null sentinel')
    return np.roll(values, 720, axis=1).astype('<f4')


def crop_global(values, latitude, longitude, size):
    if values.shape != (720,1440) or size not in (33,65,129):
        raise ValueError('Unsupported global grid or crop dimension')
    row = int(math.floor((89.875-latitude)*4+.5))
    col = int(math.floor((longitude+179.875)*4+.5)) % 1440
    top = min(max(0, row-size//2), 720-size)
    left = col-size//2
    columns = np.arange(left, left+size) % 1440
    crop = values[top:top+size, columns].copy()
    origin = [-179.875+left*.25, 89.875-top*.25]
    center = [origin[0]+size//2*.25, origin[1]-size//2*.25]
    center[0] = (center[0]+180)%360-180
    return crop, origin, center, [left,top,size,size]


def image_drape(image, origin, size):
    pixels = np.asarray(image.convert('RGB'))
    longitude = origin[0]+np.arange(size)*.25
    latitude = origin[1]-np.arange(size)*.25
    columns = np.floor(((longitude+180)%360)/360*pixels.shape[1]).astype(int) % pixels.shape[1]
    rows = np.clip(np.floor((90-latitude)/180*pixels.shape[0]).astype(int), 0, pixels.shape[0]-1)
    return pixels[rows[:,None], columns[None,:]]


def export(acquire_sources=False):
    names = ['megr90n000cb.img','megr90n000cb.lbl','megt90n000cb.img','megt90n000cb.lbl']
    with ThreadPoolExecutor(max_workers=4) as pool:
        receipts = list(pool.map(lambda name:acquire(name,3_000_000,acquire_sources), names))
    timestamp = max(record['retrieved_at'] for record in receipts)
    planet_path = PUBLIC/'data/planet_catalog.json'
    planets = json.loads(planet_path.read_text())
    planet_map = {planet['id']:planet for planet in planets['planets']}
    radial, topography = mola_grid('megr90n000cb'), mola_grid('megt90n000cb')
    out = PUBLIC/'assets/planets/mars'
    radial.tofile(out/'global-heights-m.f32')
    topography.tofile(out/'global-topography-m.f32')
    for name in ['megr90n000cb.lbl','megt90n000cb.lbl']:
        (out/name).write_bytes((RAW/name).read_bytes())
    limits = [
        'Global 0.25-degree binned MOLA product; about 14.8 km north-south spacing, with finer east-west spacing toward the poles.',
        'Provider interpolation fills cells without direct altimetry returns. Valid grid coverage is not direct measurement coverage.',
        'MOLA IAU2000 elevation and Viking display imagery are approximately co-located; independent tie-point registration is unverified.',
    ]
    reference = ('MOLA MEGR90N000CB signed big-endian Int16 DN is radius minus 3396000 m; conversion to little-endian Float32 preserves each integer DN. '
                 'Columns rolled by 720 from source 0..360 east to -180..180. Pixel centers: lon=-179.875+0.25*c, lat=89.875-0.25*r. IAU2000 planetocentric.')
    displacement = dict(asset=asset(out/'global-heights-m.f32'), width=1440, height=720, radius_m=3396000,
        height_unit='m', source_url=MOLA+'megr90n000cb.img', reference=reference)
    provenance = json.loads((out/'provenance.json').read_text())
    provenance['global_relief'] = dict(raw_source_receipts=receipts, displacement=displacement,
        source_labels=[asset(out/'megr90n000cb.lbl'),asset(out/'megt90n000cb.lbl')],
        radial_offset_min_m=float(radial.min()),radial_offset_max_m=float(radial.max()),
        topography_min_m=float(topography.min()),topography_max_m=float(topography.max()),
        reference=reference, topographic_reference='Goddard Mars potential model GMM3 (mgm1025), degree/order 50 areoid per source label.',
        limitations=limits, primary_documentation=MOLA_PAGE)
    write_json(out/'provenance.json',provenance)
    mars = planet_map['mars']
    mars['displacement'] = displacement
    mars['provenance'] = asset(out/'provenance.json')
    mars['limitations'] = list(dict.fromkeys([line for line in mars['limitations'] if 'no global Mars displacement' not in line]+limits))
    planets['generated_at'] = timestamp
    write_json(planet_path,planets)
    moon = planet_map['moon']
    moon_path = PUBLIC/moon['displacement']['asset']['path'].lstrip('/')
    if sha(moon_path) != moon['displacement']['asset']['sha256']:
        raise ValueError('Existing lunar global buffer identity mismatch')
    moon_grid = np.fromfile(moon_path,dtype='<f4').reshape(720,1440)
    images = {body:Image.open(PUBLIC/max(planet['textures'],key=lambda t:t['width'])['path'].lstrip('/')) for body,planet in planet_map.items()}
    moon_receipt = json.loads((PUBLIC/'assets/planets/moon/provenance.json').read_text())['displacement']['raw_source_receipt']
    sources = [
        dict(id='lola-global-4ppd', provider='NASA / LRO / LOLA', product='Global lunar radial elevation, 4 pixels per degree',
             product_url='https://svs.gsfc.nasa.gov/4720/',access_url=moon['displacement']['source_url'],
             retrieved_at=moon_receipt['retrieved_at'],sha256=moon_receipt['sha256'],license='NASA public data; retain source credit',
             local_path=moon_receipt['local_path']),
        dict(id='mola-global-4ppd', provider='NASA / MGS / MOLA', product='MEGT90N000CB global topography v2.0, 4 pixels per degree',
             product_url=MOLA_PAGE,access_url=MOLA+'megt90n000cb.img',retrieved_at=timestamp,
             sha256=sha(RAW/'megt90n000cb.img'),license='NASA PDS publicly archived mission data; retain source credit',
             local_path=(RAW/'megt90n000cb.img').relative_to(ROOT).as_posix()),
    ]
    catalog = dict(schema_version='1.2.0',generated_at=timestamp,sources=sources,surfaces=[])
    imagery_records = []
    verification = []
    for body,slug,name,lat,lon,size,feature_url,description in SITES:
        values = moon_grid if body=='moon' else topography
        grid, origin, center, window = crop_global(values,lat,lon,size)
        minimum, maximum = float(grid.min()),float(grid.max())
        heights = grid.astype('<f4')
        mask = np.ones(grid.shape,dtype='uint8')
        ident = 'regional-'+body+'-'+slug
        region = PUBLIC/'assets/regions'/ident
        region.mkdir(parents=True,exist_ok=True)
        heights.tofile(region/'heights.f32')
        mask.tofile(region/'valid-mask.u8')
        Image.fromarray(image_drape(images[body],origin,size)).save(region/'orbital-color.png')
        radius = 1737400 if body=='moon' else 3396000
        north_spacing = math.radians(.25)*radius
        spacing = [north_spacing*math.cos(math.radians(center[1])),north_spacing]
        frame = 'MOON_ME_DE421' if body=='moon' else 'MARS_IAU2000_PLANETOCENTRIC'
        wkt = f'GEOGCS["{frame}",DATUM["{frame}",SPHEROID["Reference sphere",{radius},0]],PRIMEM["Reference meridian",0],UNIT["degree",0.0174532925199433]]'
        region_limits = [
            'Coarse regional orbit view from a 0.25-degree global DEM; no metre-scale terrain detail or ground-walking coverage is implied.',
            'Project-selected window around the named feature; the window is not its official boundary or a landing recommendation.',
            'Grid heights preserve exact source nodes; source provider modeling/interpolation remains present.',
            'Flat display uses east-west spacing at the window-center latitude and north-south spherical arc spacing. It is approximate over this broad region, not exact ENU.',
            'USGS feature coordinates are approximate locators; no transformation between the feature control network and source DEM realization is claimed.',
            *([] if body=='moon' else limits),
        ]
        binding = dict(width=size,height=size,native_origin=origin,native_spacing=[.25,-.25],native_crs_wkt=wkt,
            heights_sha256=sha(region/'heights.f32'),valid_mask_sha256=sha(region/'valid-mask.u8'))
        region_provenance = dict(body=body,feature_name=name,feature_reference_url=feature_url,
            feature_reference_coordinates=dict(latitude_deg=lat,longitude_deg=lon),
            source_grid=dict(width=1440,height=720,spacing_deg=.25,source_window_unwrapped=window),
            input_asset=moon['displacement']['asset'] if body=='moon' else asset(out/'global-topography-m.f32'),
            vertical_reference='1737.4 km reference sphere' if body=='moon' else 'GMM3 (mgm1025) degree/order 50 areoid',
            processing='Exact original global grid nodes as little-endian Float32 source heights, vertical_zero_m=0. No resampling or hole filling.',
            imagery_processing='Nearest published orbital image pixel at each DEM node; approximate display drape only, no generative pixels.',
            imagery_source=planet_map[body]['provenance'],inputs=binding,limitations=region_limits)
        write_json(region/'provenance.json',region_provenance)
        surface = dict(id=ident,name=name+' · regional relief',body=body,description=description+' in a source-backed coarse global DEM window.',
            coordinates=dict(latitude_deg=center[1],longitude_deg=center[0],frame=frame,
                provenance='Window center is an actual DEM node. Named-feature locator: '+feature_url+'; source frame retained without a tie-point transformation.'),
            source_ids=['lola-global-4ppd' if body=='moon' else 'mola-global-4ppd'],
            grid=dict(width=size,height=size,spacing_m=spacing,display_frame='native_projected_relief',
                horizontal_method='Original 0.25-degree source nodes, flattened using spherical meters at window center; coarse regional visualization.',
                heights=asset(region/'heights.f32'),valid_mask=asset(region/'valid-mask.u8'),vertical_zero_m=0,
                vertical_datum='1737.4 km radius sphere' if body=='moon' else 'GMM3 (mgm1025) degree/order 50 areoid',
                vertical_datum_status='source_declared',native_crs_wkt=wkt,native_origin=origin,native_spacing=[.25,-.25],native_units='deg'),
            stats=dict(min_source_height_m=minimum,max_source_height_m=maximum,relief_m=maximum-minimum,
                valid_samples=size*size,total_samples=size*size,direct_return_samples=None),
            roi=dict(label=f'Project regional window · {size} × {size} original samples',kind='project_selected_window',
                outline_grid=[[0,0],[size-1,0],[size-1,size-1],[0,size-1],[0,0]],source_record=None),
            limitations=region_limits,provenance=asset(region/'provenance.json'))
        catalog['surfaces'].append(surface)
        image_asset = dict(asset(region/'orbital-color.png'),width=size,height=size)
        imagery_records.append(dict(surface_id=ident,inputs=binding,layers=[dict(id='orbital-color',label='Orbital display mosaic · coarse regional drape',
            color_mode='global_display_mosaic',registration='approximate_global_mosaic',source_url=planet_map[body]['source_url'],
            image=image_asset,provenance=asset(region/'provenance.json'),limitations=region_limits)]))
        if not np.array_equal(heights,grid):
            raise ValueError('Regional pixel reproduction failed')
        verification.append(dict(id=ident,samples=size*size,all_source_nodes_match=True,source_window=window,
            relief_m=maximum-minimum,spacing_m=spacing))
    catalog_path = PUBLIC/'data/regional_catalog.json'
    write_json(catalog_path,catalog)
    write_json(PUBLIC/'data/regional_imagery.json',dict(schema_version='1.0.0',generated_at=timestamp,catalog_sha256=sha(catalog_path),records=imagery_records))
    analysis = build_analysis(catalog_path)
    atomic_export(PUBLIC/'data/regional_analysis.json',analysis)
    write_json(PUBLIC/'data/global_relief_catalog.json',dict(schema_version='1.0.0',generated_at=timestamp,bodies=[
        dict(body='moon',width=1440,height=720,longitude_origin_deg=-179.875,latitude_origin_deg=89.875,spacing_deg=.25,
             heights=moon['displacement']['asset'],reference='1737.4 km sphere',frame='MOON_ME_DE421',radius_m=1737400,provenance=moon['provenance']),
        dict(body='mars',width=1440,height=720,longitude_origin_deg=-179.875,latitude_origin_deg=89.875,spacing_deg=.25,
             heights=asset(out/'global-topography-m.f32'),reference='GMM3 (mgm1025) degree/order 50 areoid',frame='MARS_IAU2000_PLANETOCENTRIC',radius_m=3396000,provenance=mars['provenance']),
    ]))
    evidence = dict(recorded_at=timestamp,source_receipts=receipts,regional_windows=verification,
        total_samples_verified=sum(record['samples'] for record in verification),
        global_mars_radial_nodes_verified=int(radial.size),existing_native_catalog_changed=False,
        global_radial_range_m=[float(radial.min()),float(radial.max())],
        global_topographic_range_m=[float(topography.min()),float(topography.max())],
        limitations=limits)
    write_json(ROOT/'evidence/global_regions/verification.json',evidence)
    print(json.dumps(dict(regions=len(verification),source_nodes_verified=evidence['total_samples_verified'],
        global_radial_nodes_verified=int(radial.size),regional_catalog_sha256=sha(catalog_path)),indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--acquire',action='store_true')
    export(parser.parse_args().acquire)
