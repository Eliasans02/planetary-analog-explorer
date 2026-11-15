"""Source-pixel imagery for native terrain. Offline by default; --acquire for JP2s.

No change to frozen surface catalog, DEMs, or analysis. No elevation colorization.
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
from PIL import Image
from pyproj import CRS, Transformer
import rasterio
from rasterio.windows import Window
from expand_surface_sites import validate_range, urls
from export_surface_catalog import ROOT, PUBLIC, sha, write_json, asset

RAW=ROOT/'data-pipeline/cache/raw/surface-imagery'
OUT=PUBLIC/'assets/surface-imagery'
ORTHOS={
    'mars-gale-hirise':('023957_1755_024023_1755','ESP_023957_1755_IRB_C_01_ORTHO.JP2'),
    'mars-jezero-hirise':('045994_1985_046060_1985','ESP_045994_1985_RED_C_01_ORTHO.JP2'),
    'mars-eberswalde-hirise':('016065_1560_016210_1560','ESP_016065_1560_RED_C_01_ORTHO.JP2'),
}


def read_verified(path, expected):
    if path.stat().st_size!=expected['bytes'] or sha(path)!=expected['sha256']:
        raise ValueError('Imagery source bytes/hash mismatch: '+str(path))
    return path


def fetch_range(url,name,start,end,acquire,total=None):
    p=RAW/name; rp=p.with_name(name+'.receipt.json')
    if rp.exists():
        r=json.loads(rp.read_text())
        if (r['canonical_url'],r['range_start_inclusive'],r['range_end_inclusive'])!=(url,start,end):
            raise ValueError('Cached imagery range request mismatch')
        read_verified(p,r)
        if r['bytes']!=end-start+1 or (total is not None and r['complete_product_bytes']!=total):
            raise ValueError('Cached imagery range length mismatch')
        return p,r
    if not acquire: raise FileNotFoundError('Missing offline imagery cache; run --acquire: '+str(p))
    req=urllib.request.Request(url,headers={'Range':f'bytes={start}-{end}'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req,timeout=60) as response:
                data=response.read(end-start+2)
                length=validate_range(response.status,response.headers.get('Content-Range'),data,start,end,total)
                headers=dict(response.headers); final=response.url
            break
        except Exception:
            if attempt==2:raise
    RAW.mkdir(parents=True,exist_ok=True); p.write_bytes(data)
    r={'canonical_url':url,'final_url':final,'local_path':p.relative_to(ROOT).as_posix(),'bytes':len(data),'sha256':sha(p),
       'range_start_inclusive':start,'range_end_inclusive':end,'complete_product_bytes':length,'complete_product':False,
       'identity_scope':'SHA256 identifies this exact byte range only, not the complete product.',
       'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'http_headers':headers}
    write_json(rp,r);return p,r


def ortho_source(surface_id,acquire=False):
    product,name=ORTHOS[surface_id]
    url=urls('mars',product)[0].rsplit('/',1)[0]+'/'+name
    p=RAW/name; rp=p.with_name(name+'.receipt.json')
    if rp.exists():
        r=json.loads(rp.read_text());read_verified(p,r)
        if not r['complete_product'] or r['canonical_url']!=url: raise ValueError('Unexpected full ortho identity')
        return p,r
    _,probe=fetch_range(url,name+'-probe.bin',0,65535,acquire)
    total=probe['complete_product_bytes']
    if not 0<total<=128*1024*1024:raise ValueError('Ortho exceeds acquisition budget')
    bounds=[(s,min(s+1048575,total-1)) for s in range(0,total,1048576)]
    def chunk(pair):
        s,e=pair;return fetch_range(url,name+f'-{s}-{e}.bin',s,e,acquire,total)
    with ThreadPoolExecutor(6) as pool:pieces=list(pool.map(chunk,bounds))
    with p.open('wb') as stream:
        for piece,_ in pieces:stream.write(piece.read_bytes())
    r=dict(probe,bytes=total,sha256=sha(p),complete_product=True,local_path=p.relative_to(ROOT).as_posix(),
           identity_scope='Complete source JP2 assembled from verified exact HTTP ranges.',range_receipts=[r for _,r in pieces])
    r.pop('range_start_inclusive');r.pop('range_end_inclusive');write_json(rp,r)
    return p,r


def grid_xy(grid):
    rows,cols=np.indices((grid['height'],grid['width']),dtype='float64')
    return grid['native_origin'][0]+cols*grid['native_spacing'][0],grid['native_origin'][1]+rows*grid['native_spacing'][1]


def ortho_label(path,receipt,acquire=False):
    p=path.with_suffix('.LBL');rp=p.with_name(p.name+'.receipt.json');url=receipt['canonical_url'].replace('.JP2','.LBL')
    if rp.exists():
        r=json.loads(rp.read_text());read_verified(p,r)
        if r['canonical_url']!=url:raise ValueError('Label source URL mismatch')
    else:
        if not acquire:raise FileNotFoundError('Missing verified offline ortho PDS label: '+str(p))
        with urllib.request.urlopen(url,timeout=60) as response:
            data=response.read(262145)
            if response.status!=200 or not 0<len(data)<=262144:raise ValueError('Unexpected PDS label size/status')
            headers=dict(response.headers)
        data.decode('ascii',errors='strict');p.write_bytes(data)
        r={'canonical_url':url,'local_path':p.relative_to(ROOT).as_posix(),'bytes':len(data),'sha256':sha(p),'complete_product':True,
           'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'http_headers':headers,'identity_scope':'Complete companion PDS label bytes.'}
        write_json(rp,r)
    return p.read_text(encoding='ascii'),r


def label_crs(label):
    def value(key):return float(re.search(r'\b'+key+r'\s*=\s*([-+\d.Ee]+)',label)[1])
    if not re.search(r'MAP_PROJECTION_TYPE\s*=\s*"EQUIRECTANGULAR"',label) or not re.search(r'POSITIVE_LONGITUDE_DIRECTION\s*=\s*EAST',label):
        raise ValueError('Unsupported PDS ortho mapping')
    radius=value('A_AXIS_RADIUS')*1000
    if radius!=value('B_AXIS_RADIUS')*1000 or radius!=value('C_AXIS_RADIUS')*1000 or value('MAP_PROJECTION_ROTATION')!=0:
        raise ValueError('Unsupported PDS ortho sphere/rotation')
    # PDS CENTER_LATITUDE is the true-scale latitude for this eqc sphere, not
    # the northing origin. Some embedded GeoJP2 WKT incorrectly uses lat_0.
    return CRS.from_proj4(f'+proj=eqc +lat_ts={value("CENTER_LATITUDE")} +lat_0=0 +lon_0={value("CENTER_LONGITUDE")} +R={radius} +units=m +no_defs')


def check_label_mapping(ds,label,target):
    def value(key):return float(re.search(r'\b'+key+r'\s*=\s*([-+\d.Ee]+)',label)[1])
    if (ds.width,ds.height,ds.count)!=(int(value('LINE_SAMPLES')),int(value('LINES')),int(value('BANDS'))):
        raise ValueError('PDS label/image dimensions or bands disagree')
    scale=value('MAP_SCALE')
    expected=[scale,0,-(value('SAMPLE_PROJECTION_OFFSET')-1)*scale,0,-scale,(value('LINE_PROJECTION_OFFSET')-1)*scale]
    if not np.allclose(list(ds.transform)[:6],expected,rtol=0,atol=1e-6):
        raise ValueError('PDS label/embedded raster affine disagree')
    # Independently check the projection interpretation against PDS geographic
    # coverage. Allow two source pixels because bounds use source edge conventions.
    corners=[ds.transform*(c,r) for c,r in [(0,0),(ds.width,0),(0,ds.height),(ds.width,ds.height)]]
    lon,lat=Transformer.from_crs(target,target.geodetic_crs,always_xy=True).transform(*zip(*corners))
    lon=np.asarray(lon)%360;lat=np.asarray(lat)
    tolerance=3*scale/(value('A_AXIS_RADIUS')*1000)*180/np.pi/max(.01,np.cos(np.deg2rad(value('CENTER_LATITUDE'))))
    actual=[float(lon.min()),float(lon.max()),float(lat.min()),float(lat.max())]
    bounds=[value('WESTERNMOST_LONGITUDE')%360,value('EASTERNMOST_LONGITUDE')%360,value('MINIMUM_LATITUDE'),value('MAXIMUM_LATITUDE')]
    if not np.allclose(actual,bounds,rtol=0,atol=tolerance):
        raise ValueError(f'PDS geographic coverage disagrees with interpreted mapping: {actual} vs {bounds}')
    return {'label_derived_affine':expected,'affine_max_error_m':float(np.max(np.abs(np.array(expected)-list(ds.transform)[:6]))),
            'projected_corner_geographic_bounds':actual,'published_geographic_bounds':bounds,'bounds_tolerance_deg':tolerance}


def global_pixels(image,longitude,latitude):
    """Nearest equirectangular pixel: floor(edge-normalized UV times dimensions)."""
    height,width=image.shape[:2]
    lon=(np.asarray(longitude)+180)%360-180
    lat=np.asarray(latitude)
    if not np.isfinite(lon).all() or not np.isfinite(lat).all() or np.any(abs(lat)>90):raise ValueError('Invalid global sample coordinates')
    cols=np.floor((lon+180)/360*width).astype(int)%width
    rows=np.clip(np.floor((90-lat)/180*height).astype(int),0,height-1)
    return image[rows,cols].copy(),rows,cols


def native_global_pixels(surface,image):
    grid=surface['grid']; crs=CRS(grid['native_crs_wkt'])
    lon,lat=Transformer.from_crs(crs,crs.geodetic_crs,always_xy=True).transform(*grid_xy(grid))
    return global_pixels(image,lon,lat)


def native_ortho_pixels(surface,path,label):
    grid=surface['grid'];x,y=grid_xy(grid)
    with rasterio.open(path) as ds:
        if ds.crs is None or ds.count not in (1,3) or any(dt!='uint8' for dt in ds.dtypes):
            raise ValueError('Expected georeferenced published 8-bit gray/RGB ortho')
        if ds.scales!=(1.0,)*ds.count or ds.offsets!=(0.0,)*ds.count:raise ValueError('Unexpected ortho scaling')
        if ds.transform.b or ds.transform.d:raise ValueError('Unsupported rotated ortho')
        source=CRS(grid['native_crs_wkt']);target=label_crs(label)
        mapping_check=check_label_mapping(ds,label,target)
        # All supplied orthos are from the same DTM products. Require their
        # mapping sphere and projection parameters to match native DEM geometry.
        for attr in ('semi_major_metre','semi_minor_metre'):
            if abs(getattr(source.ellipsoid,attr)-getattr(target.ellipsoid,attr))>1e-6:
                raise ValueError('DEM/ortho mapping sphere mismatch')
        if source!=target:
            mapped_x,mapped_y=Transformer.from_crs(source,target,always_xy=True).transform(x,y)
            if not np.allclose(mapped_x,x,rtol=0,atol=1e-6) or not np.allclose(mapped_y,y,rtol=0,atol=1e-6):
                raise ValueError('Same-product PDS ortho projection is incompatible with native DEM coordinates')
            x,y=mapped_x,mapped_y
        # Inverse affine produces edge coordinates; floor chooses nearest center.
        inv=~ds.transform
        def nearest_index(values):
            rounded=np.rint(values)
            # At exact source-pixel edges both centers are equally near. Snap
            # numerical noise within 1e-7 pixel and choose larger row/column.
            return np.floor(np.where(abs(values-rounded)<1e-7,rounded,values)).astype(int)
        cols=nearest_index(inv.a*x+inv.b*y+inv.c)
        rows=nearest_index(inv.d*x+inv.e*y+inv.f)
        if np.any(rows<0) or np.any(cols<0) or np.any(rows>=ds.height) or np.any(cols>=ds.width):
            raise ValueError('Native crop is outside published ortho coverage')
        r0,c0=int(rows.min()),int(cols.min());r1,c1=int(rows.max()),int(cols.max())
        win=Window(c0,r0,c1-c0+1,r1-r0+1)
        pixels=ds.read(window=win);mask=ds.read_masks(window=win)
        if not np.all(mask[:,rows-r0,cols-c0]>0):raise ValueError('Native crop includes ortho nodata')
        sampled=np.moveaxis(pixels[:,rows-r0,cols-c0],0,-1)
        null_match=re.search(r'\bCORE_NULL\s*=\s*(\d+)',label)
        if null_match and np.any(sampled==int(null_match[1])):
            raise ValueError('Native crop includes PDS-declared ortho null pixels')
        if ds.count==1:sampled=np.repeat(sampled,3,axis=2)
        meta={'embedded_crs_wkt':ds.crs.to_wkt(),'sampling_crs_wkt':target.to_wkt(),'transform':list(ds.transform)[:6],'width':ds.width,'height':ds.height,'bands':ds.count,
              'dtype':ds.dtypes[0],'color_interpretations':[i.name for i in ds.colorinterp],
              'sampled_source_window_col_row_width_height':[c0,r0,c1-c0+1,r1-r0+1],'mapping_verification':mapping_check}
    return sampled,rows,cols,meta


def save_layer(surface,layer_id,pixels,rows,cols,source_url,label,color_mode,registration,provenance,limitations):
    folder=OUT/surface['id']/layer_id;folder.mkdir(parents=True,exist_ok=True)
    Image.fromarray(pixels.astype('uint8'),'RGB').save(folder/'color.png',compress_level=9)
    comparisons=[{'grid_row_col':[r,c],'source_row_col':[int(rows[r,c]),int(cols[r,c])],'source_rgb':pixels[r,c].tolist()}
                 for r,c in [(0,0),(0,128),(64,64),(128,0),(128,128)]]
    provenance.update({'sampling':'Nearest published pixel at each DEM native pixel center; no new colors, stretch, palette, enhancement, or elevation-dependent tint.',
                       'output_pixel_registration':'PNG row0/col0 corresponds to DEM sample row0/col0; UV at ((col+0.5)/width,(row+0.5)/height), imageOrientation none and texture flipY false.',
                       'source_pixel_comparisons':comparisons,'limitations':limitations})
    write_json(folder/'provenance.json',provenance)
    image=asset(folder/'color.png');image.update(width=surface['grid']['width'],height=surface['grid']['height'])
    return {'id':layer_id,'label':label,'color_mode':color_mode,'registration':registration,'source_url':source_url,
            'image':image,'provenance':asset(folder/'provenance.json'),'limitations':limitations}


def export(acquire=False):
    catalog_path=PUBLIC/'data/surface_catalog.json';catalog_bytes=catalog_path.read_bytes();catalog=json.loads(catalog_bytes)
    planet_path=PUBLIC/'data/planet_catalog.json';planet_bytes=planet_path.read_bytes();planets=json.loads(planet_bytes)
    records=[]
    for surface in catalog['surfaces']:
        if surface['body'] not in ('moon','mars'):continue
        grid=surface['grid'];planet=next(p for p in planets['planets'] if p['id']==surface['body'])
        texture=max(planet['textures'],key=lambda t:t['width'])
        path=read_verified(PUBLIC/texture['path'].lstrip('/'),texture)
        parent_prov=read_verified(PUBLIC/planet['provenance']['path'].lstrip('/'),planet['provenance'])
        with Image.open(path) as im:image=np.asarray(im.convert('RGB'))
        pixels,rows,cols=native_global_pixels(surface,image)
        limitations=[*planet['limitations'],
                     'Coarse display mosaic sampled by source longitude/latitude; approximate registration only, no independent tie-point alignment to local DEM.',
                     'Mosaic display frame and native DEM realization have not been transformed or independently registered; this is an illustrative image drape.',
                     '129-pixel output samples the existing orbital image; output size does not add source detail or ground resolution.']
        if surface['body']=='moon':limitations.append('This south-polar location uses the published monochrome LOLA albedo fill, not a local color photograph; no color has been invented.')
        provenance={'source_asset':texture,'source_product_sha256':planet['source_sha256'],'source_url':planet['source_url'],
                    'source_credit':planet['source_credit'],'parent_provenance_asset':planet['provenance'],
                    'parent_provenance':json.loads(parent_prov.read_text()),'planet_catalog_sha256':hashlib.sha256(planet_bytes).hexdigest(),
                    'registration':'Inverse native DEM projection to its geodetic longitude/latitude, then sample same coordinates in zero-centered north-up equirectangular displayed orbital image. No datum transformation.',
                    'source_projection':'Display equirectangular: longitude -180 left, +180 right; latitude +90 top, -90 bottom.'}
        layers=[save_layer(surface,'orbital-color',pixels,rows,cols,planet['source_url'],'Orbital mosaic colors · coarse display','global_display_mosaic','approximate_global_mosaic',provenance,limitations)]
        if surface['id'] in ORTHOS:
            path,receipt=ortho_source(surface['id'],acquire)
            label,label_receipt=ortho_label(path,receipt,acquire)
            pixels,rows,cols,meta=native_ortho_pixels(surface,path,label)
            color=meta['bands']==3
            limitations=['Published HiRISE ortho pixels retain original image illumination, shadows and display processing; no new contrast stretch or colorization.',
                         'Projected ortho and DEM are mapped through their declared CRSs; no independent tie-point or photometric calibration is claimed.',
                         'IRB is enhanced infrared-red-blue false color, not human-eye natural color.' if color else 'Published RED-channel image is grayscale; RGB channels repeat its gray value without invented color.',
                         'Nearest source-pixel sampling; texture and DEM spatial resolution remain distinct.']
            provenance={'raw_source_receipt':receipt,'label_receipt':label_receipt,'source_label_text':label,'source_metadata':meta,'source_credit':'NASA/JPL-Caltech/UArizona',
                        'license':'Public domain per https://www.uahirise.org/media/usage.php; retain NASA/JPL-Caltech/UArizona credit.',
                        'registration':'Map each DEM native pixel center through declared source/PDS-label ortho CRSs, inverse embedded ortho affine and nearest source pixel; no fitted alignment.',
                        'nearest_tie_rule':'Source-pixel edge coordinates within 1e-7 pixel of an integer snap to that integer; exact equal-distance ties choose larger row/column. This only resolves floating-point edge ambiguity.',
                        'crs_interpretation':'Authoritative PDS equirectangular CENTER_LATITUDE sets standard parallel (true-scale latitude), with northing origin zero. Embedded GeoJP2 latitude_of_origin is not used; embedded raster affine is retained. See HiRISE howto caveat on mapping-keyword interpretation.'}
            layers.append(save_layer(surface,'local-ortho',pixels,rows,cols,receipt['canonical_url'],
                          'HiRISE local ortho · enhanced IRB' if color else 'HiRISE local ortho · published grayscale',
                          'published_false_color' if color else 'published_grayscale','projected_ortho',provenance,limitations))
        records.append({'surface_id':surface['id'],'inputs':{k:grid[k] for k in ('width','height','native_origin','native_spacing','native_crs_wkt')}|
                        {'heights_sha256':grid['heights']['sha256'],'valid_mask_sha256':grid['valid_mask']['sha256']},'layers':layers})
    manifest={'schema_version':'1.0.0','generated_at':catalog['generated_at'],'catalog_sha256':hashlib.sha256(catalog_bytes).hexdigest(),'records':records}
    schema=json.loads((ROOT/'shared/schemas/surface_imagery.schema.json').read_text())
    jsonschema.Draft202012Validator(schema,format_checker=jsonschema.FormatChecker()).validate(manifest)
    assert catalog_path.read_bytes()==catalog_bytes
    write_json(PUBLIC/'data/surface_imagery.json',manifest)
    write_json(ROOT/'evidence/surface_imagery/export.json',{'records':records,'catalog_sha256':manifest['catalog_sha256'],'imagery_layers':sum(len(r['layers']) for r in records)})
    print(json.dumps({'records':len(records),'layers':sum(len(r['layers']) for r in records)},indent=2))
    return manifest


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--acquire',action='store_true')
    export(parser.parse_args().acquire)
