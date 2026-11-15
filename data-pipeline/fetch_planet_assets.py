"""Bounded official-source acquisition and deterministic global texture exports.

Run using previews/a04/.venv/Scripts/python.exe. No AI imagery or upsampling.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import datetime
import hashlib
import json
import urllib.request
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data-pipeline/cache/raw/planet-explorer'
PUBLIC = ROOT / 'web-client/public'
RESEARCH = ROOT / 'docs/research'
SVS = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/'
ASU = 'https://www.mars.asu.edu/data/mdim_color/'
NASA_MARS_PAGE='https://science.nasa.gov/3d-resources/mars/'
NASA_MARS='https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/mars/Mars.jpg'
HIRISE = 'https://www.uahirise.org/PDS/DTM/ESP/ORB_045900_045999/ESP_045994_1985_ESP_046060_1985/DTEEC_045994_1985_046060_1985_U01.IMG'
LOLA='https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/'

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1048576), b''): h.update(chunk)
    return h.hexdigest()

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False)+'\n', encoding='utf-8')

def download(name, url, limit):
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / name
    receipt_path = RAW / (name+'.receipt.json')
    if path.exists() and receipt_path.exists():
        receipt = json.loads(receipt_path.read_text())
        if path.stat().st_size != receipt['bytes'] or sha(path) != receipt['sha256']:
            raise ValueError('Cached source identity mismatch: '+name)
        return receipt
    tmp = path.with_suffix(path.suffix+'.part')
    request = urllib.request.Request(url, headers={'User-Agent':'PlanetaryAnalogExplorer/1.0 research asset acquisition'})
    if name.startswith('mars45'):
        # Server closes long responses; retrieve exact bounded byte ranges and
        # concatenate only after validating every Content-Range and byte count.
        with urllib.request.urlopen(urllib.request.Request(url,method='HEAD'),timeout=60) as response:
            declared=int(response.headers['Content-Length']); headers=dict(response.headers); final_url=response.url
        if not 0<declared<=limit: raise ValueError('Source exceeds byte bound')
        ranges=[(s,min(s+1048575,declared-1)) for s in range(0,declared,1048576)]
        def chunk_range(bounds):
            s,e=bounds; chunkpath=RAW/f'{name}.range-{s}-{e}'
            if chunkpath.exists() and chunkpath.stat().st_size==e-s+1: return chunkpath
            for attempt in range(3):
                try:
                    req=urllib.request.Request(url,headers={'Range':f'bytes={s}-{e}'})
                    with urllib.request.urlopen(req,timeout=90) as r:
                        if r.status!=206 or r.headers.get('Content-Range')!=f'bytes {s}-{e}/{declared}': raise ValueError('Wrong chunk response')
                        data=r.read(e-s+2)
                        if len(data)!=e-s+1: raise ValueError('Truncated range')
                    chunkpath.write_bytes(data); return chunkpath
                except Exception:
                    if attempt==2: raise
        with ThreadPoolExecutor(max_workers=4) as executor: chunks=list(executor.map(chunk_range,ranges))
        with tmp.open('wb') as out:
            for cp in chunks: out.write(cp.read_bytes())
        size=tmp.stat().st_size
    else:
      with urllib.request.urlopen(request, timeout=120) as response, tmp.open('wb') as out:
        declared = int(response.headers.get('Content-Length', 0))
        if declared > limit: raise ValueError('Source exceeds byte bound')
        size = 0
        while chunk := response.read(1048576):
            size += len(chunk)
            if size > limit: raise ValueError('Source exceeds byte bound')
            out.write(chunk)
        if declared and declared != size: raise ValueError('Truncated source')
        headers = dict(response.headers)
        final_url = response.url
    tmp.replace(path)
    receipt = {'canonical_url':url, 'final_url':final_url, 'local_path':path.relative_to(ROOT).as_posix(),
               'bytes':size, 'sha256':sha(path), 'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'http_headers':headers, 'complete_product':True, 'download_bound_bytes':limit}
    write_json(receipt_path, receipt)
    print(name, size, flush=True)
    return receipt

def asset(path):
    return {'path':'/'+path.relative_to(PUBLIC).as_posix(), 'sha256':sha(path), 'bytes':path.stat().st_size}

def verify_mars_display_orientation(image):
    """Empirical image registration to independently documented ASU global layout."""
    from PIL import Image,ImageFilter
    reference=Image.new('RGB',(1440,720))
    for row,hemisphere in enumerate(('n','s')):
        for col,longitude in enumerate(('225','315','045','135')):
            with Image.open(RAW/f'mars45{hemisphere}{longitude}.png') as tile:
                reference.paste(tile.resize((360,360),Image.Resampling.LANCZOS),(col*360,row*360))
    def highpass(im):
        gray=im.convert('L')
        return np.asarray(gray,dtype=float)-np.asarray(gray.filter(ImageFilter.GaussianBlur(3)),dtype=float)
    a,b=highpass(reference),highpass(image)
    def correlation(x,y):return float(np.corrcoef(x[60:-60].ravel(),y[60:-60].ravel())[0,1])
    values={'same_orientation':correlation(a,b),'row_flip':correlation(a,b[::-1]),
            'column_flip':correlation(a,b[:,::-1]),'longitude_half_turn':correlation(a,np.roll(b,720,axis=1))}
    shifts={str(n):correlation(a,np.roll(b,n,axis=1)) for n in range(-5,6)}
    if values['same_orientation']<.9 or max(shifts,key=shifts.get)!='0':raise ValueError('NASA/ASU display registration failed')
    return {'reference_source_url':ASU,'reference_layout':'ASU provider tile geographic bounds: columns225,315,045,135; rows north,south',
            'method':'Native1440 NASA grayscale minus GaussianBlur3 compared with ASU tiles downsampled to matching1440; exclude60 polar rows at each edge. No fitted warp or color transform.',
            'correlations':values,'horizontal_shift_pixel_correlations':shifts,
            'result':'Same north-up, longitude -180..180 display pixel arrangement; empirical display correspondence only, not a datum or independent local registration certification.'}


def export():
    from PIL import Image
    import PIL
    Image.MAX_IMAGE_PIXELS = 300_000_000
    jobs = [('nasa_mars_display.jpg',NASA_MARS,2_000_000),('lroc_color_poles_4k.tif',SVS+'lroc_color_poles_4k.tif',20_000_000),
            ('ldem_4.tif',SVS+'ldem_4.tif',8_000_000),
            ('lola_ldem_4.lbl',LOLA+'ldem_4.lbl',20_000),
            ('lola_ldem_4.img',LOLA+'ldem_4.img',3_000_000)]
    for hemisphere in ('n','s'):
        for longitude in ('225','315','045','135'):
            name=f'mars45{hemisphere}{longitude}.png'
            jobs.append((name,ASU+'large/'+name,45_000_000))
    with ThreadPoolExecutor(max_workers=4) as executor:
        receipts = list(executor.map(lambda job:download(*job),jobs))
    by_name = {Path(r['local_path']).name:r for r in receipts}
    # Validate PNG chunk CRCs and complete decoding after assembly. SHA256 is a
    # local retrieved-product identity; ASU supplies no independent checksum here.
    for name,receipt in by_name.items():
        if name.endswith('.png'):
            with Image.open(RAW/name) as checked: checked.verify()
            with Image.open(RAW/name) as checked: checked.load()
    # Preserve the provider's explicit tile layout and geographic titles as evidence.
    page = download('asu_mdim_color.html', ASU, 1_000_000)
    svs_page = download('nasa_svs_4720.html','https://svs.gsfc.nasa.gov/4720/',2_000_000)
    nasa_page=download('nasa_mars_display.html',NASA_MARS_PAGE,2_000_000)
    catalog = {'schema_version':'1.0.0','generated_at':max(r['retrieved_at'] for r in receipts),'planets':[]}
    for body in ('moon','mars'):
        out=PUBLIC/'assets/planets'/body
        out.mkdir(parents=True, exist_ok=True)
        if body=='moon':
            image=Image.open(RAW/'lroc_color_poles_4k.tif').convert('RGB')
            used=[by_name['lroc_color_poles_4k.tif']]
            limitations=['NASA visualization color map optimized for aesthetics, not science; exposure/white balance adjusted and high-latitude gaps inpainted.',
                         'LROC color covers 70 N to 70 S; polar regions use lower resolution monochromatic LOLA albedo fill.',
                         'JPEG derivatives are display imagery, not scientific feature or similarity evidence.']
            source_url='https://svs.gsfc.nasa.gov/4720/'
            credit="NASA Scientific Visualization Studio / Ernie Wright; LRO LROC and LOLA teams"
        else:
            image=Image.open(RAW/'nasa_mars_display.jpg').convert('RGB')
            if image.size!=(1440,720):raise ValueError('Unexpected NASA native Mars texture dimensions')
            used=[by_name['nasa_mars_display.jpg']]
            limitations=['NASA published Viking/USGS/JPL-Caltech visualization texture; not certified natural/true color or calibrated photometry.',
                         'Native source is 1440 by 720 pixels; coarse global display only, no metre-scale surface detail.',
                         'Display orientation empirically matched to ASU planetocentric -180..180 north-up mosaic; no independent datum transformation or local tie-point registration.',
                         'Historical mosaic illumination and seams remain; no global Mars displacement supplied.']
            source_url=NASA_MARS_PAGE
            credit='NASA/Jet Propulsion Laboratory & Caltech; Viking images processed at USGS'
        textures=[]
        for width in ((1024,2048,4096) if body=='moon' else (1024,1440)):
            path=out/f'color-{width}.jpg'
            if body=='mars' and width==1440:path.write_bytes((RAW/'nasa_mars_display.jpg').read_bytes())
            else:image.resize((width,width//2),Image.Resampling.LANCZOS).save(path,quality=92,subsampling=0,optimize=False)
            textures.append(dict(asset(path),width=width,height=width//2,label='Native' if width==1440 else f'{width//1024}K'))
        # Retain ordered receipts for audit; source identity hashes complete image bytes.
        manifest=json.dumps([{'name':Path(x['local_path']).name,'sha256':x['sha256']} for x in used],separators=(',',':')).encode()
        (out/'source-image-manifest.json').write_bytes(manifest)
        source_hash=used[0]['sha256']
        provenance={'raw_source_receipts':used, 'source_sha256':source_hash,
                    'software_versions':{'Pillow':PIL.__version__,'numpy':np.__version__},
                    'source_identity_semantics':'SHA256 of complete raw TIFF' if body=='moon' else 'SHA256 of complete NASA published source JPEG bytes; Native derivative is byte-identical',
                    'source_image_manifest':asset(out/'source-image-manifest.json'),
                    'integrity_status':'Complete NASA JPEG decoding and locally computed SHA256 identify retrieved bytes. No publisher-provided independent checksum was available.' if body=='mars' else 'Locally computed SHA256 identifies retrieved TIFF bytes; no publisher-provided independent checksum was available.',
                    'source_page_receipt':svs_page if body=='moon' else nasa_page,
                    'projection':'simple cylindrical; longitude -180 to +180 east; row 0 north 90, last row south -90; pixel centers',
                    'processing':'Pillow LANCZOS downsampling of source RGB pixels; JPEG quality 92, no upsampling. Mars Native JPEG preserves complete source bytes; no application hue/saturation/gamma alteration.',
                    'source_dimensions':[4096,2048] if body=='moon' else [1440,720], 'credit':credit,'limitations':limitations}
        if body=='mars':
            provenance['display_orientation_verification']=verify_mars_display_orientation(image)
            provenance['historical_asu_source_page']=page
        displacement=None
        if body=='moon':
            values=np.array(Image.open(RAW/'ldem_4.tif'),dtype='<f4')
            if values.shape!=(720,1440) or not np.isfinite(values).all(): raise ValueError('Invalid lunar DEM')
            pds_samples=np.roll(np.fromfile(RAW/'lola_ldem_4.img',dtype='<i2').reshape(720,1440),720,axis=1)
            if not np.array_equal(np.rint(values*2000).astype('<i2'),pds_samples): raise ValueError('Lunar orientation/source sample mismatch')
            values=(values*1000).astype('<f4')
            path=out/'global-heights-m.f32'; values.tofile(path)
            displacement={'asset':asset(path),'width':1440,'height':720,'radius_m':1737400,'height_unit':'m','source_url':SVS+'ldem_4.tif','reference':'LOLA radial elevation relative to 1737.4 km sphere; source Float32 km multiplied by 1000. Pixel-center lon=-179.875+0.25*c, lat=89.875-0.25*r.'}
            provenance['displacement']={'raw_source_receipt':by_name['ldem_4.tif'],'reference':displacement['reference'],'minimum_m':float(values.min()),'maximum_m':float(values.max()),'source_documentation':'https://svs.gsfc.nasa.gov/4720/ displacement section'}
            provenance['displacement']['georeference_status']='Source TIFF has no embedded CRS/geotransform. Pixel-center coordinates are derived from documented global simple-cylindrical centered-zero rendering convention, north at top, longitude edges -180,+180 and latitude edges +90,-90; not read as embedded geospatial metadata.'
            provenance['displacement']['pds_orientation_verification']={'label_receipt':by_name['lola_ldem_4.lbl'],'image_receipt':by_name['lola_ldem_4.img'],
                'label_text':(RAW/'lola_ldem_4.lbl').read_text(),
                'method':'Every SVS Float32 km sample multiplied by 2000 and rounded reproduces the original PDS signed integer sample after rolling columns by exactly 720 (180 degrees); all 1,036,800 samples match, no row flip. PDS label states pixel registration, 4 ppd, bounds north90 south-90 east0..360 and ME/PA DE421 frame.',
                'matching_samples':int(values.size),'maximum_float_conversion_error_source_DN':float(np.max(np.abs(np.array(Image.open(RAW/'ldem_4.tif'),dtype='float64')*2000-pds_samples)))}
        write_json(out/'provenance.json',provenance)
        catalog['planets'].append({'id':body,'name':body.title(),'textures':textures,'projection':'equirectangular','longitude_center_deg':0,
                                  'source_url':source_url,'source_credit':credit,'source_sha256':source_hash,'provenance':asset(out/'provenance.json'),'limitations':limitations,'displacement':displacement})
    write_json(PUBLIC/'data/planet_catalog.json',catalog)
    write_json(RESEARCH/'PLANET_ASSETS_ACQUISITION.json',{'records':receipts,'page_receipts':[page,svs_page]})
    print('Exported planet_catalog.json',flush=True)

if __name__=='__main__': export()
