"""Export a native HiRISE window, from complete IMG or exact HTTP byte ranges."""
from pathlib import Path
import datetime
import json
import urllib.request
import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.windows import Window
from fetch_planet_assets import ROOT, RAW, PUBLIC, HIRISE, sha, asset, write_json

MIRROR=HIRISE.replace('www.uahirise.org','hirise-pds.lpl.arizona.edu')
NAME='DTEEC_045994_1985_046060_1985_U01.IMG'

def fetch_range(name,start,end):
    path=RAW/name
    receipt_path=RAW/(name+'.receipt.json')
    if receipt_path.exists():
        r=json.loads(receipt_path.read_text())
        if sha(path)!=r['sha256'] or path.stat().st_size!=end-start+1: raise ValueError('Range cache mismatch')
        return path,r
    req=urllib.request.Request(MIRROR,headers={'Range':f'bytes={start}-{end}'})
    with urllib.request.urlopen(req,timeout=120) as response:
        expected=f'bytes {start}-{end}/380814764'
        if response.status!=206 or response.headers.get('Content-Range')!=expected: raise ValueError('Incorrect HTTP range')
        data=response.read(end-start+2)
        if len(data)!=end-start+1: raise ValueError('Incorrect range length')
        headers=dict(response.headers)
    path.write_bytes(data)
    receipt={'canonical_url':MIRROR,'discovery_url':'https://www.uahirise.org/dtm/dtm.php?ID=ESP_045994_1985',
             'local_path':path.relative_to(ROOT).as_posix(),'bytes':len(data),'sha256':sha(path),
             'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'http_headers':headers,
             'complete_product':False,'range_start_inclusive':start,'range_end_inclusive':end,'complete_product_bytes':380814764,
             'identity_scope':'This hash identifies only the retrieved exact byte range, never the complete IMG.'}
    write_json(receipt_path,receipt)
    return path,receipt

def export():
    RAW.mkdir(parents=True,exist_ok=True)
    complete=RAW/NAME
    if complete.exists():
        receipt=json.loads((RAW/(NAME+'.receipt.json')).read_text())
        if sha(complete)!=receipt['sha256']: raise ValueError('Full source identity mismatch')
        header=complete; range_receipts=[]
    else:
        header,hr=fetch_range('hirise-label-range.bin',0,26691)
        range_receipts=[hr]
    with rasterio.open(header) as ds:
        if (ds.width,ds.height)!=(6673,14266) or ds.dtypes[0]!='float32': raise ValueError('Unexpected source dimensions')
        row,col=ds.height//2,ds.width//2
        win=Window(col-64,row-64,129,129)
        if complete.exists(): raw=ds.read(1,window=win)
        else:
            start=26692+int(win.row_off)*26692
            p,rr=fetch_range('hirise-native-center-129-rows.bin',start,start+129*26692-1)
            range_receipts.append(rr)
            raw=np.fromfile(p,dtype='<f4').reshape(129,6673)[:,int(win.col_off):int(win.col_off)+129].copy()
            receipt=dict(rr,identity_scope='Exact 129 complete source rows; SHA256 is partial bytes only; full IMG checksum not obtained.')
        # PDS invalid sentinel is finite: enforce source GDAL nodata and published
        # valid range; retain all valid native source pixels without interpolation.
        valid=np.isfinite(raw)&(raw!=ds.nodata)&(raw>=-2679.20)&(raw<=-2388.31)
        if not valid.any(): raise ValueError('Center source window has no valid samples')
        minimum=float(raw[valid].min()); maximum=float(raw[valid].max())
        heights=np.zeros(raw.shape,dtype='<f4'); heights[valid]=(raw[valid].astype('float64')-minimum).astype('<f4')
        center=ds.xy(row,col); origin=list(ds.xy(int(win.row_off),int(win.col_off)))
        crs=CRS(ds.crs); lon,lat=Transformer.from_crs(crs,crs.geodetic_crs,always_xy=True).transform(*center)
        out=PUBLIC/'assets/surfaces/mars-jezero-hirise'; out.mkdir(parents=True,exist_ok=True)
        heights.tofile(out/'heights.f32'); valid.astype('uint8').tofile(out/'valid-mask.u8')
        limitations=['Project-selected native center window of the published HiRISE DTM, not a landing-site safety assessment.',
                      'Stereo-derived DTM samples are not individual laser returns; gaps remain masked.',
                      'Projected raster relief axes follow columns/rows; not exact ENU or a body-fixed reconstruction.',
                      'Source planetocentric mapping realization retained; no transformation to an IAU Mars reference realization.',
                      'Only exact source byte ranges were retrieved; the complete IMG checksum is unavailable.' if not complete.exists() else 'Complete source product checksum retained.']
        method='Native equirectangular raster spacing from PDS label; source MAP_SCALE 1.0096633268711 m/pixel, true at projection center latitude 15 degrees. Display X/Z follow raster columns/rows.'
        comparisons=[]
        for r,c in [(0,0),(0,128),(64,64),(128,0),(128,128)]:
            if complete.exists(): direct=float(ds.read(1,window=Window(int(win.col_off)+c,int(win.row_off)+r,1,1))[0,0])
            else:
                with p.open('rb') as f:
                    f.seek((r*6673+int(win.col_off)+c)*4); direct=float(np.frombuffer(f.read(4),dtype='<f4')[0])
            expected=np.float32(direct-minimum) if valid[r,c] else np.float32(0)
            assert heights[r,c]==expected
            comparisons.append({'crop_row_col':[r,c],'source_height_m':direct if valid[r,c] else None,'height_offset_m':float(heights[r,c]),'exact_float32_match':True})
        label=header.read_bytes()[:26692].decode('ascii',errors='strict').rstrip('\x00 ')
        provenance={'raw_source_receipt':receipt,'range_receipts':range_receipts,'source_label_text':label,
                    'source_metadata':{'crs_wkt':ds.crs.to_wkt(),'transform':list(ds.transform)[:6],'width':ds.width,'height':ds.height,'dtype':ds.dtypes[0],'nodata':str(ds.nodata)},
                    'window_col_row_width_height':[int(win.col_off),int(win.row_off),129,129],
                    'selection':'129 native sample centers around floor(width/2),floor(height/2); deterministic project crop',
                    'native_origin_semantics':'center of crop sample row0,col0; signed spacing per column,row',
                    'processing':'No resampling/smoothing/hole filling. Mask source nodata and finite published VALID_MINIMUM/MAXIMUM. Subtract valid crop minimum in float64, cast little-endian Float32; invalid zero plus UInt8 mask.',
                    'vertical_datum':'Meters above martian equipotential surface (Mars 2000 Datum), Smith et al. (2001), explicitly declared in source PDS label.',
                    'frame':'PDS EQUIRECTANGULAR MARS / planetocentric east longitude; local-radius sphere 3394839.8133163m from source label; no IAU realization claim.',
                    'source_sample_comparisons':comparisons,'limitations':limitations}
        write_json(out/'provenance.json',provenance)
        source={'id':'nasa-hirise-jezero-dtm','provider':'NASA/JPL-Caltech/UArizona','product':'HiRISE DTEEC_045994_1985_046060_1985_U01 native DTM (exact range window)' if not complete.exists() else 'HiRISE DTEEC_045994_1985_046060_1985_U01 native DTM',
                'product_url':'https://www.uahirise.org/dtm/dtm.php?ID=ESP_045994_1985','access_url':receipt['canonical_url'],'retrieved_at':receipt['retrieved_at'],'sha256':receipt['sha256'],
                'license':'Public domain per HiRISE image usage policy; credit NASA/JPL/University of Arizona; https://www.uahirise.org/media/usage.php','local_path':asset(out/'provenance.json')['path']}
        record={'id':'mars-jezero-hirise','name':'Jezero crater · HiRISE native DTM','body':'mars','description':'Actual native HiRISE stereo DTM: project-selected 129 by 129 sample window.',
                'coordinates':{'latitude_deg':lat,'longitude_deg':lon,'frame':'MARS_HIRISE_PLANETOCENTRIC','provenance':provenance['frame']},'source_ids':[source['id']],
                'grid':{'width':129,'height':129,'spacing_m':[abs(ds.transform.a),abs(ds.transform.e)],'display_frame':'native_projected_relief','horizontal_method':method,
                        'heights':asset(out/'heights.f32'),'valid_mask':asset(out/'valid-mask.u8'),'vertical_zero_m':minimum,'vertical_datum':provenance['vertical_datum'],'vertical_datum_status':'source_declared',
                        'native_crs_wkt':ds.crs.to_wkt(),'native_origin':origin,'native_spacing':[ds.transform.a,ds.transform.e],'native_units':'m'},
                'stats':{'min_source_height_m':minimum,'max_source_height_m':maximum,'relief_m':maximum-minimum,'valid_samples':int(valid.sum()),'total_samples':129*129,'direct_return_samples':None},
                'roi':{'label':'PROJECT_SELECTED native center window','kind':'project_selected_window','outline_grid':[[0,0],[128,0],[128,128],[0,128],[0,0]],'source_record':None},'limitations':limitations,'provenance':asset(out/'provenance.json')}
    catalog_path=PUBLIC/'data/surface_catalog.json'; catalog=json.loads(catalog_path.read_text())
    catalog['schema_version']='1.1.0'
    catalog['sources']=[x for x in catalog['sources'] if x['id']!=source['id']]+[source]
    catalog['surfaces']=[x for x in catalog['surfaces'] if x['id']!=record['id']]+[record]
    write_json(catalog_path,catalog)
    write_json(ROOT/'docs/research/PLANET_ASSETS_MARS_ACQUISITION.json',{'source':receipt,'ranges':range_receipts})
    write_json(ROOT/'evidence/planet_assets/mars_source_comparisons.json',{'record':record,'comparisons':comparisons})
    print(json.dumps({'id':record['id'],'coordinates':record['coordinates'],'stats':record['stats']},indent=2))

if __name__=='__main__': export()
