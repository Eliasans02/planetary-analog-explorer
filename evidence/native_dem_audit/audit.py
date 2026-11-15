"""Read-only bounded GIS inspection; outputs only within this evidence directory."""
import datetime, hashlib, json, math, pathlib, struct, tarfile
import numpy as np
import pyproj, rasterio, shapely
from rasterio.windows import Window
from shapely.geometry import Polygon, Point, box
from shapely.validation import explain_validity

ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT / 'data-pipeline/cache/raw/fast-path'
OUT = pathlib.Path(__file__).resolve().parent
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''): h.update(b)
    return h.hexdigest()
def clean(x):
    if isinstance(x,float) and not math.isfinite(x): return str(x)
    if isinstance(x,dict): return {str(k):clean(v) for k,v in x.items()}
    if isinstance(x,(tuple,list)): return [clean(v) for v in x]
    return x
result={'audit_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'versions':{'rasterio':rasterio.__version__,'shapely':shapely.__version__,'pyproj':pyproj.__version__},'method':'ordinary imports; read-only raw files; allowlisted regular tar members read into memory; only ROI bounding windows read; no terrain metrics or features', 'rasters':[], 'rois':[], 'companion_hashes':{n:digest(RAW/n) for n in ['Site04_ROIs.tgz','LOLA_README.txt']}}
members={}
allow={f'Site04_ROIs.{s}' for s in ('shp','shx','dbf','prj')}
with tarfile.open(RAW/'Site04_ROIs.tgz','r:gz') as tar:
    result['archive_members']=[]
    for m in tar.getmembers():
        result['archive_members'].append({'name':m.name,'regular':m.isfile(),'symlink':m.issym(),'linkname':m.linkname,'size':m.size})
        if m.name in allow:
            assert m.isfile() and m.size<1048576 and m.name not in members
            members[m.name]=tar.extractfile(m).read()
        elif m.issym(): pass
        else: raise ValueError('unexpected archive member')
assert set(members)==allow
result['archive_policy']='No extraction and no link following; four exact regular-file names only, unique, each <1 MiB.'
prj=members['Site04_ROIs.prj'].decode()
result['roi_prj']=prj
roi_crs=pyproj.CRS.from_wkt(prj)
shp=members['Site04_ROIs.shp']; pos=100; polygons=[]; shp_index=[]
while pos<len(shp):
    shp_index.append([pos//2,struct.unpack_from('>i',shp,pos+4)[0]])
    number,words=struct.unpack_from('>ii',shp,pos); pos+=8
    payload=shp[pos:pos+words*2]; pos+=words*2
    kind=struct.unpack_from('<i',payload)[0]; assert kind==5
    n_parts,n_points=struct.unpack_from('<ii',payload,36); assert n_parts==1
    coords=[struct.unpack_from('<dd',payload,48+16*i) for i in range(n_points)]
    assert all(math.isfinite(c) for p in coords for c in p)
    polygon=Polygon(coords); polygons.append(polygon)
    result['rois'].append({'record':number,'points':n_points,'closed':coords[0]==coords[-1],'valid':polygon.is_valid,'simple':polygon.is_simple,'validity':explain_validity(polygon),'native_bounds_m':list(polygon.bounds)})
assert pos==len(shp) and len(polygons)==4
shx=members['Site04_ROIs.shx']; shx_index=[list(struct.unpack_from('>ii',shx,p)) for p in range(100,len(shx),8)]
assert shx_index==shp_index
result['shx_matches_shp_record_offsets_and_lengths']=True
result['regular_member_sha256']={k:hashlib.sha256(v).hexdigest() for k,v in members.items()}
# Parse DBF faithfully; meanings of source X/Y fields remain unasserted.
dbf=members['Site04_ROIs.dbf']; count=struct.unpack_from('<I',dbf,4)[0]; header,length=struct.unpack_from('<HH',dbf,8); fields=[]
for p in range(32,header-1,32):
    field=dbf[p:p+32]
    if field[0]==13: break
    fields.append((field[:11].split(b'\0')[0].decode(),chr(field[11]),field[16],field[17]))
records=[]
for i in range(count):
    row=dbf[header+i*length:header+(i+1)*length]; offset=1; rec={}
    for name,typ,size,dec in fields: rec[name]=row[offset:offset+size].decode().strip(); offset+=size
    records.append(rec)
result['dbf']={'fields':fields,'records':records,'semantics':'Source attributes preserved; X/Y are not asserted to be centroids or camera coordinates.'}
baseline=None
for name in ['Site04_final_adj_5mpp_surf.tif','Site04_final_adj_5mpp_ldec.tif','Site04_final_adj_5mpp_toterr.tif','USGS_1_n20w156_20250611.tif']:
    path=RAW/name
    with rasterio.open(path) as ds:
        crs=pyproj.CRS(ds.crs)
        entry={'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':digest(path),'size':[ds.width,ds.height],'dtype':ds.dtypes,'crs_wkt':ds.crs.to_wkt(),'transform':list(ds.transform)[:6],'bounds':list(ds.bounds),'nodata':ds.nodata,'scales':ds.scales,'offsets':ds.offsets,'band_units':ds.units,'tags':ds.tags(),'band_tags':ds.tags(1),'mask_flags':[[f.name for f in flags] for flags in ds.mask_flag_enums]}
        if name.startswith('Site04'):
            key=(ds.crs,ds.transform,ds.width,ds.height)
            if baseline is None: baseline=key
            entry['registered_exactly_to_surf']=key==baseline
            entry['roi_crs_equivalent_ignoring_axis_order']=crs.equals(roi_crs,ignore_axis_order=True)
            # WKT names differ; compare actual projection numerically without rewriting either CRS.
            roi_inverse=pyproj.Transformer.from_crs(roi_crs,roi_crs.geodetic_crs,always_xy=True)
            inverse=pyproj.Transformer.from_crs(crs,crs.geodetic_crs,always_xy=True)
            forward=pyproj.Transformer.from_crs(crs.geodetic_crs,crs,always_xy=True)
            entry['roi_windows']=[]
            for i,polygon in enumerate(polygons):
                xmin,ymin,xmax,ymax=polygon.bounds
                c0=max(0,math.floor((xmin-ds.transform.c)/5)); c1=min(ds.width,math.ceil((xmax-ds.transform.c)/5))
                r0=max(0,math.floor((ds.transform.f-ymax)/5)); r1=min(ds.height,math.ceil((ds.transform.f-ymin)/5))
                win=Window(c0,r0,c1-c0,r1-r0); arr=ds.read(1,window=win); mask=ds.read_masks(1,window=win)>0
                inclusion=np.array([[polygon.covers(Point(*ds.xy(r,c))) for c in range(c0,c1)] for r in range(r0,r1)])
                valid=mask & np.isfinite(arr)
                item={'record':i+1,'within_raster_outer_bounds':box(*ds.bounds).covers(polygon),'window_col_row_width_height':[c0,r0,c1-c0,r1-r0],'boundary_rule':'Shapely covers(pixel center), boundary included; no context padding','center_points_inside':int(inclusion.sum()),'inside_gdal_valid_and_finite':int((inclusion&valid).sum()),'inside_gdal_invalid':int((inclusion&~mask).sum()),'inside_nonfinite':int((inclusion&~np.isfinite(arr)).sum())}
                if 'ldec' in name: item['inside_zero_returns']=int((inclusion&valid&(arr==0)).sum())
                entry['roi_windows'].append(item)
                if 'surf' in name:
                    p=polygon.representative_point(); lon,lat=inverse.transform(p.x,p.y); xx,yy=forward.transform(lon,lat)
                    result['rois'][i]['source_frame_representative_point']={'native_xy_m':[p.x,p.y],'longitude_east_deg':lon,'latitude_planetocentric_deg':lat,'frame':'MOON_ME_DE421 (README realization; projection inversion only)','roundtrip_error_m':math.hypot(xx-p.x,yy-p.y),'purpose':'Diagnostic representative point only; invalid rings do not establish approved polygon membership; not a selected camera or NASA recommended landing coordinate'}
                    vertices=[inverse.transform(x,y) for x,y in polygon.exterior.coords]
                    roi_vertices=[roi_inverse.transform(x,y) for x,y in polygon.exterior.coords]
                    result['rois'][i]['roi_vs_raster_inverse_projection_max_abs_difference_deg']=max(abs(a-b) for p,q in zip(vertices,roi_vertices) for a,b in zip(p,q))
                    result['rois'][i]['source_frame_lonlat_bounds_deg']=[min(x for x,y in vertices),min(y for x,y in vertices),max(x for x,y in vertices),max(y for x,y in vertices)]
        result['rasters'].append(entry)
result['prohibitions_observed']=['No full raster-array reads','No terrain slope/roughness/features/scores/calibration','No source/cache/shared-contract mutation','No publish assets','No synthetic terrain','No security-policy changes','No Human PASS']
(OUT/'observations.json').write_text(json.dumps(clean(result),indent=2,allow_nan=False)+'\n')
print(json.dumps({'versions':result['versions'],'rois':result['rois'],'rasters':[{'file':r['file'],'units':r['band_units'],'scale':r['scales'],'offset':r['offsets'],'roi_windows':r.get('roi_windows'),'roi_crs_equal':r.get('roi_crs_equivalent_ignoring_axis_order')} for r in result['rasters']]},indent=2))
