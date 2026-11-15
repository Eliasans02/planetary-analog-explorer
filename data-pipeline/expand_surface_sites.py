"""Acquire four published DEM sites and export deterministic native 129-square crops.

Default is OFFLINE. Use --acquire once to retrieve bounded, identity-checked sources.
Never replaces the three original catalog records. No resampling or synthetic terrain.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import re
import urllib.request

import jsonschema
import numpy as np
from pyproj import CRS, Transformer
import rasterio
from rasterio.windows import Window
from export_surface_catalog import ROOT, PUBLIC, asset, sha, write_json

RAW = ROOT / 'data-pipeline/cache/raw/surface-expansion'
SIZE = 129
SITES = [
    ('lola-site01-center', 'Connecting ridge · LOLA Site01', 'moon', 'Site01'),
    ('lola-site06-center', 'Nobile rim 1 · LOLA Site06', 'moon', 'Site06'),
    ('mars-gale-hirise', 'Gale crater · HiRISE native DTM', 'mars', '023957_1755_024023_1755'),
    ('mars-eberswalde-hirise', 'Eberswalde crater · HiRISE native DTM', 'mars', '016065_1560_016210_1560'),
]


def urls(body, product):
    if body == 'moon':
        return (f'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/{product}/{product}_final_adj_5mpp_surf.tif',
                'https://pgda.gsfc.nasa.gov/products/78')
    a, b, c, d = product.split('_')
    orbit = f'{int(a)//100*100:06d}_{int(a)//100*100+99:06d}'
    return (f'https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_{orbit}/ESP_{a}_{b}_ESP_{c}_{d}/DTEEC_{product}_U01.IMG',
            f'https://www.uahirise.org/dtm/dtm.php?ID=ESP_{a}_{b}')


def validate_range(status, content_range, data, start, end, total=None):
    match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', content_range or '')
    if status != 206 or not match:
        raise ValueError('Source did not return an exact HTTP range')
    lo, hi, length = map(int, match.groups())
    if (lo, hi) != (start, end) or len(data) != end-start+1 or (total is not None and length != total):
        raise ValueError('Source range identity/length mismatch')
    return length


def retrieve(url, name, start, end, acquire, total=None):
    path = RAW / name
    rp = path.with_name(path.name+'.receipt.json')
    if rp.exists():
        r = json.loads(rp.read_text())
        if (r['canonical_url'], r['range_start_inclusive'], r['range_end_inclusive']) != (url, start, end):
            raise ValueError('Cached range request mismatch')
        if sha(path) != r['sha256'] or path.stat().st_size != end-start+1:
            raise ValueError('Cached range bytes changed')
        if total is not None and r['complete_product_bytes'] != total:
            raise ValueError('Cached complete-product length mismatch')
        return path, r
    if not acquire:
        raise FileNotFoundError(f'Missing offline source {path}; run --acquire')
    req = urllib.request.Request(url, headers={'Range':f'bytes={start}-{end}', 'User-Agent':'PlanetaryAnalogExplorer source research'})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read(end-start+2)
        length = validate_range(response.status, response.headers.get('Content-Range'), data, start, end, total)
        headers = dict(response.headers)
        final_url = response.url
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    r = {'canonical_url':url, 'final_url':final_url, 'local_path':path.relative_to(ROOT).as_posix(),
         'range_start_inclusive':start, 'range_end_inclusive':end, 'complete_product_bytes':length,
         'bytes':len(data), 'sha256':sha(path), 'complete_product':False,
         'identity_scope':'SHA256 identifies this exact byte range only, not the complete product.',
         'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'http_headers':headers}
    write_json(rp, r)
    return path, r


def source_pixels(site, acquire):
    ident, _, body, product = site
    url, page = urls(body, product)
    header, hr = retrieve(url, ident+'-header.bin', 0, 65535, acquire)
    receipts = [hr]
    if body == 'moon':
        total = hr['complete_product_bytes']
        if total > 128*1024*1024:
            raise ValueError('Moon source exceeds acquisition budget')
        full = RAW / (ident+'.tif')
        # Fixed exact ranges allow interrupted acquisition to resume and validate.
        bounds = [(s, min(s+4194303, total-1)) for s in range(0,total,4194304)]
        def chunk(pair):
            s,e=pair
            return retrieve(url,f'{ident}-{s}-{e}.bin',s,e,acquire,total)
        with ThreadPoolExecutor(max_workers=4) as pool:
            pieces = list(pool.map(chunk,bounds))
        receipts += [r for _,r in pieces]
        expected = hashlib.sha256()
        for p,_ in pieces: expected.update(p.read_bytes())
        if not full.exists() or sha(full) != expected.hexdigest():
            with full.open('wb') as stream:
                for p,_ in pieces: stream.write(p.read_bytes())
        complete_receipt = dict(hr, local_path=full.relative_to(ROOT).as_posix(), bytes=total,
                                sha256=sha(full),complete_product=True,
                                identity_scope='SHA256 of complete TIFF assembled from verified exact ranges.')
        complete_receipt.pop('range_start_inclusive'); complete_receipt.pop('range_end_inclusive')
        header = full
    with rasterio.open(header) as ds:
        if ds.dtypes[0] != 'float32' or ds.width < SIZE or ds.height < SIZE:
            raise ValueError('Unexpected source raster')
        if ds.count != 1 or ds.scales != (1.0,) or ds.offsets != (0.0,) or ds.transform.b or ds.transform.d:
            raise ValueError('Unsupported bands, scaling, offset, or rotated source grid')
        row,col = ds.height//2, ds.width//2
        win = Window(col-64,row-64,SIZE,SIZE)
        label = None
        if body == 'moon':
            raw = ds.read(1,window=win)
            valid = ds.read_masks(1,window=win)>0
            identity = complete_receipt
        else:
            label = header.read_bytes().decode('ascii',errors='ignore').split('\nEND\r')[0]
            record = int(re.search(r'\bRECORD_BYTES\s*=\s*(\d+)',label)[1])
            pointer = int(re.search(r'\^IMAGE\s*=\s*(\d+)',label)[1])
            if not re.search(r'SAMPLE_TYPE\s*=\s*PC_REAL',label) or not re.search(r'SAMPLE_BITS\s*=\s*32\b',label):
                raise ValueError('Unsupported source byte order/sample type')
            if record != ds.width*4:
                raise ValueError('Unsupported source row layout')
            start = (pointer-1)*record + int(win.row_off)*record
            pixels, rr = retrieve(url,ident+'-rows.bin',start,start+SIZE*record-1,acquire,hr['complete_product_bytes'])
            receipts.append(rr)
            raw = np.fromfile(pixels,dtype='<f4').reshape(SIZE,ds.width)[:,int(win.col_off):int(win.col_off)+SIZE].copy()
            low = float(re.search(r'VALID_MINIMUM\s*=\s*([-+\d.Ee]+)',label)[1])
            high = float(re.search(r'VALID_MAXIMUM\s*=\s*([-+\d.Ee]+)',label)[1])
            valid = (raw>=low)&(raw<=high)
            identity = rr
        valid &= np.isfinite(raw)
        if ds.nodata is not None: valid &= raw != ds.nodata
        if not valid[64,64] or valid.sum() < SIZE*SIZE*.8:
            raise ValueError('Center crop requires a valid center and >=80% valid native samples')
        crs = CRS(ds.crs)
        if not crs.is_projected or any(axis.unit_conversion_factor != 1 or axis.unit_name.lower() not in ('metre','meter') for axis in crs.axis_info):
            raise ValueError('Source must use projected metre axes')
        if not ds.transform.a > 0 or not ds.transform.e < 0:
            raise ValueError('Unsupported source raster orientation')
        lon,lat = Transformer.from_crs(crs,crs.geodetic_crs,always_xy=True).transform(*ds.xy(row,col))
        lon = (lon+180)%360-180
        metadata = {'crs_wkt':ds.crs.to_wkt(),'transform':list(ds.transform)[:6], 'width':ds.width,'height':ds.height,
                    'nodata':str(ds.nodata),'dtype':ds.dtypes[0], 'crop_origin':list(ds.xy(row-64,col-64)),
                    'spacing':[ds.transform.a,ds.transform.e], 'coordinates':[lon,lat]}
    return raw, valid, metadata, identity, receipts, label, [col-64,row-64,SIZE,SIZE]


def export_site(site, acquire=False):
    ident,name,body,product = site
    raw,valid,meta,identity,receipts,label,window = source_pixels(site,acquire)
    minimum, maximum = float(raw[valid].min()),float(raw[valid].max())
    heights=np.zeros(raw.shape,dtype='<f4')
    heights[valid]=(raw[valid].astype('float64')-minimum).astype('<f4')
    out=PUBLIC/'assets/surfaces'/ident
    out.mkdir(parents=True,exist_ok=True)
    heights.tofile(out/'heights.f32'); valid.astype('uint8').tofile(out/'valid-mask.u8')
    comparisons=[]
    for r,c in [(0,0),(0,128),(64,64),(128,0),(128,128)]:
        comparisons.append({'crop_row_col':[r,c], 'source_height_m':float(raw[r,c]) if valid[r,c] else None,
                            'height_offset_m':float(heights[r,c]), 'valid':bool(valid[r,c]),
                            'exact_float32_match':bool(heights[r,c] == (np.float32(float(raw[r,c])-minimum) if valid[r,c] else 0))})
    moon=body=='moon'
    frame='MOON_ME_DE421' if moon else 'MARS_HIRISE_PLANETOCENTRIC'
    frame_note=('MOON_ME reference frame of ephemeris DE421 per NASA PGDA product page and README; inverse native projection only.' if moon else
                'Source PDS planetocentric east-longitude native equirectangular CRS; source local-radius sphere preserved in WKT; no IAU realization transformation.')
    datum=None if moon else 'Meters above martian equipotential surface (Mars 2000 Datum), declared in source PDS label.'
    normalized_label=' '.join(label.split()) if label else ''
    if not moon and ('Mars 2000' not in normalized_label or 'equipotential' not in normalized_label):
        raise ValueError('Mars vertical-datum declaration missing')
    limitations=['Project-selected native center crop; no landing recommendation, terrain ranking or suitability claim.',
                 'No smoothing, resampling, generated terrain or hole filling; native source gaps stay masked.',
                 'Relative source heights and projected raster axes; not exact ENU or body-fixed reconstruction.',
                 'LOLA surface includes interpolated pixels; direct laser-return counts not acquired.' if moon else
                 'Stereo-derived source DEM; only exact byte ranges acquired, complete IMG checksum unavailable.',
                 'Absolute lunar vertical datum remains unverified.' if moon else 'Source Mars mapping realization retained without IAU frame transformation.']
    provenance={'raw_source_receipt':identity,'range_receipts':receipts,'source_metadata':meta,'source_label_text':label,
                'window_col_row_width_height':window,'selection':'129 native pixels centered at floor(width/2),floor(height/2); project selection, not a published ROI.',
                'processing':'Valid finite source samples minus valid crop minimum in float64 then little-endian Float32; invalid zero with UInt8 mask. No interpolation.',
                'native_origin_semantics':'Pixel center row0,col0; signed native spacing follows raster columns/rows.',
                'frame':frame_note,'vertical_datum':datum,'source_sample_comparisons':comparisons,'limitations':limitations,
                'source_hash_scope':identity['identity_scope']}
    write_json(out/'provenance.json',provenance)
    url,page=urls(body,product)
    source={'id':'nasa-'+ident,'provider':'NASA GSFC / LOLA' if moon else 'NASA/JPL-Caltech/UArizona',
            'product':f'{product} native 5 m/pixel LOLA surface' if moon else f'HiRISE DTEEC_{product}_U01 (exact source rows only)',
            'product_url':page,'access_url':url,'retrieved_at':identity['retrieved_at'],'sha256':identity['sha256'],
            'license':'NASA public scientific data; retain attribution' if moon else 'Public domain per https://www.uahirise.org/media/usage.php; credit NASA/JPL/University of Arizona',
            'local_path':asset(out/'provenance.json')['path']}
    record={'id':ident,'name':name,'body':body,'description':f'Actual published {"LOLA 5 m/pixel" if moon else "HiRISE stereo"} DEM, project-selected 129 by 129 native sample window.',
            'coordinates':{'longitude_deg':meta['coordinates'][0],'latitude_deg':meta['coordinates'][1],'frame':frame,'provenance':frame_note},'source_ids':[source['id']],
            'grid':{'width':SIZE,'height':SIZE,'spacing_m':list(map(abs,meta['spacing'])),'display_frame':'native_projected_relief',
                    'horizontal_method':'Native projected raster metre spacing; X/Z follow source columns/rows. Projected spacing is not exact ground distance; no reprojection, not ENU.',
                    'heights':asset(out/'heights.f32'),'valid_mask':asset(out/'valid-mask.u8'),'vertical_zero_m':minimum,'vertical_datum':datum,
                    'vertical_datum_status':'unverified' if moon else 'source_declared','native_crs_wkt':meta['crs_wkt'],'native_origin':meta['crop_origin'],'native_spacing':meta['spacing'],'native_units':'m'},
            'stats':{'min_source_height_m':minimum,'max_source_height_m':maximum,'relief_m':maximum-minimum,'valid_samples':int(valid.sum()),'total_samples':SIZE*SIZE,'direct_return_samples':None},
            'roi':{'label':'PROJECT_SELECTED native center window','kind':'project_selected_window','outline_grid':[[0,0],[128,0],[128,128],[0,128],[0,0]],'source_record':None},
            'limitations':limitations,'provenance':asset(out/'provenance.json')}
    return source,record,comparisons


def export(acquire=False):
    catalog_path=PUBLIC/'data/surface_catalog.json'
    catalog=json.loads(catalog_path.read_text())
    baseline=json.loads(json.dumps(catalog))
    results=[export_site(site,acquire) for site in SITES]
    ids={site[0] for site in SITES}; sources={s['id'] for s,_,_ in results}
    catalog['sources']=[s for s in catalog['sources'] if s['id'] not in sources]+[s for s,_,_ in results]
    catalog['surfaces']=[s for s in catalog['surfaces'] if s['id'] not in ids]+[r for _,r,_ in results]
    for key in ('sources','surfaces'):
        for original in baseline[key]:
            if original['id'] not in (sources if key=='sources' else ids):
                assert original==next(x for x in catalog[key] if x['id']==original['id'])
    jsonschema.Draft202012Validator(json.loads((ROOT/'shared/schemas/surface_catalog.schema.json').read_text())).validate(catalog)
    write_json(catalog_path,catalog)
    write_json(ROOT/'evidence/surface_expansion/assets_report.json',{'added_sites':[r for _,r,_ in results],
                'source_sample_comparisons':{r['id']:c for _,r,c in results}, 'original_records_preserved':True})
    print(json.dumps({r['id']:{'coordinates':r['coordinates'],'stats':r['stats']} for _,r,_ in results},indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--acquire',action='store_true')
    export(parser.parse_args().acquire)
