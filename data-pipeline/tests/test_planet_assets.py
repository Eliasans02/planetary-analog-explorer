"""Real-source asset checks, independent of renderer implementation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import numpy as np
import jsonschema

ROOT=Path(__file__).resolve().parents[2]
PUBLIC=ROOT/'web-client/public'

def read(path): return json.loads(path.read_text(encoding='utf-8'))

def verify_asset(a):
    p=PUBLIC/a['path'].lstrip('/')
    assert p.stat().st_size==a['bytes']
    assert hashlib.sha256(p.read_bytes()).hexdigest()==a['sha256']
    return p

def test_global_source_derivatives_and_hashes():
    from PIL import Image
    catalog=read(PUBLIC/'data/planet_catalog.json')
    jsonschema.Draft202012Validator(read(ROOT/'shared/schemas/planet_catalog.schema.json')).validate(catalog)
    assert {x['id'] for x in catalog['planets']}=={'moon','mars'}
    for planet in catalog['planets']:
        provenance=read(verify_asset(planet['provenance']))
        for image in planet['textures']:
            p=verify_asset(image)
            with Image.open(p) as im: assert im.size==(image['width'],image['height']) and im.mode=='RGB'
        for receipt in provenance['raw_source_receipts']:
            p=ROOT/receipt['local_path']
            assert hashlib.sha256(p.read_bytes()).hexdigest()==receipt['sha256']
        manifest=verify_asset(provenance['source_image_manifest'])
        if planet['id']=='mars':
            assert provenance['raw_source_receipts'][0]['sha256']==planet['source_sha256']
            assert [(t['width'],t['height'],t['label']) for t in planet['textures']]==[(1024,512,'1K'),(1440,720,'Native')]
            native=verify_asset(planet['textures'][-1])
            assert native.read_bytes()==(ROOT/provenance['raw_source_receipts'][0]['local_path']).read_bytes()
            mapping=provenance['display_orientation_verification']
            assert mapping['correlations']['same_orientation']>.9
            assert abs(mapping['correlations']['row_flip'])<.1
        else:
            d=planet['displacement']; values=np.fromfile(verify_asset(d['asset']),dtype='<f4').reshape(d['height'],d['width'])
            from PIL import Image
            raw=np.array(Image.open(ROOT/'data-pipeline/cache/raw/planet-explorer/ldem_4.tif'),dtype='<f4')
            np.testing.assert_array_equal(values,raw*1000)
            # Independent archived source grid proves centered-zero column roll
            # and north-to-south row order, beyond a same-file unit conversion.
            pds=np.fromfile(ROOT/'data-pipeline/cache/raw/planet-explorer/lola_ldem_4.img',dtype='<i2').reshape(720,1440)
            np.testing.assert_array_equal(np.rint(raw*2000).astype('<i2'),np.roll(pds,720,axis=1))
            assert d['radius_m']==1737400 and np.isfinite(values).all()

def test_mars_native_range_crop_matches_exact_source_samples():
    catalog=read(PUBLIC/'data/surface_catalog.json')
    jsonschema.Draft202012Validator(read(ROOT/'shared/schemas/surface_catalog.schema.json')).validate(catalog)
    mars=next(x for x in catalog['surfaces'] if x['body']=='mars')
    p=read(verify_asset(mars['provenance']))
    grid=mars['grid']; heights=np.fromfile(verify_asset(grid['heights']),dtype='<f4').reshape(129,129)
    mask=np.fromfile(verify_asset(grid['valid_mask']),dtype='uint8').reshape(129,129)
    assert np.isfinite(heights).all() and set(np.unique(mask))<={0,1}
    assert np.all(heights[mask==0]==0)
    assert mars['coordinates']['frame']=='MARS_HIRISE_PLANETOCENTRIC'
    assert grid['vertical_datum_status']=='source_declared'
    if p['range_receipts']:
        assert not p['raw_source_receipt']['complete_product']
        for r in p['range_receipts']:
            assert hashlib.sha256((ROOT/r['local_path']).read_bytes()).hexdigest()==r['sha256']
        r=p['range_receipts'][-1]
        raw=np.fromfile(ROOT/r['local_path'],dtype='<f4').reshape(129,6673)
        col=p['window_col_row_width_height'][0]
        actual=raw[:,col:col+129]
        expected=(actual.astype('float64')-grid['vertical_zero_m']).astype('<f4')
        np.testing.assert_array_equal(heights[mask==1],expected[mask==1])
    assert all(x['exact_float32_match'] for x in p['source_sample_comparisons'])


def test_mars_source_registration_against_published_asu_layout():
    import sys
    from PIL import Image
    sys.path.insert(0,str(ROOT/'data-pipeline'))
    import fetch_planet_assets as f
    result=f.verify_mars_display_orientation(Image.open(f.RAW/'nasa_mars_display.jpg').convert('RGB'))
    assert result['correlations']['same_orientation']>.9
    assert max(result['horizontal_shift_pixel_correlations'],key=result['horizontal_shift_pixel_correlations'].get)=='0'
