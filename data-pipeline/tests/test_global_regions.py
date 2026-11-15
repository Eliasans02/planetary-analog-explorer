"""Verify actual public global and regional terrain without the excluded raw cache."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest

import numpy as np
from PIL import Image

PIPELINE = Path(__file__).parents[1]
sys.path.insert(0, str(PIPELINE))
spec = importlib.util.spec_from_file_location('export_global_regions', PIPELINE/'export_global_regions.py')
regions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(regions)
PUBLIC = regions.PUBLIC


def read(name):
    return json.loads((PUBLIC/'data'/name).read_text())


def buffer(asset, dtype, shape):
    path = PUBLIC/asset['path'].lstrip('/')
    raw = path.read_bytes()
    if len(raw) != asset['bytes'] or hashlib.sha256(raw).hexdigest() != asset['sha256']:
        raise AssertionError('Public asset identity mismatch: '+asset['path'])
    return np.frombuffer(raw,dtype=dtype).reshape(shape)


class GlobalRegionTests(unittest.TestCase):
    def test_all_global_mars_nodes_reproduce_complete_download_hash(self):
        planet = next(p for p in read('planet_catalog.json')['planets'] if p['id']=='mars')
        provenance = json.loads((PUBLIC/planet['provenance']['path'].lstrip('/')).read_text())['global_relief']
        receipts = {Path(r['local_path']).name:r for r in provenance['raw_source_receipts']}
        for name,filename in [('megr90n000cb','global-heights-m.f32'),('megt90n000cb','global-topography-m.f32')]:
            grid = np.fromfile(PUBLIC/'assets/planets/mars'/filename,dtype='<f4').reshape(720,1440)
            self.assertTrue(np.isfinite(grid).all())
            self.assertTrue(np.array_equal(grid,np.round(grid)))
            original = np.roll(grid,-720,axis=1).astype('>i2').tobytes()
            self.assertEqual(len(original),receipts[name+'.img']['bytes'])
            self.assertEqual(hashlib.sha256(original).hexdigest(),receipts[name+'.img']['sha256'])
        self.assertEqual(planet['displacement']['radius_m'],3396000)
        self.assertEqual(provenance['topography_min_m'],-8068)
        self.assertEqual(provenance['topography_max_m'],21134)

    def test_every_regional_sample_is_an_exact_original_global_node(self):
        catalog = read('regional_catalog.json')
        globals = {body['body']:body for body in read('global_relief_catalog.json')['bodies']}
        self.assertEqual(len(catalog['surfaces']),14)
        self.assertEqual(sum(surface['body']=='moon' for surface in catalog['surfaces']),6)
        for surface in catalog['surfaces']:
            grid = surface['grid']
            source = globals[surface['body']]
            values = buffer(source['heights'],'<f4',(source['height'],source['width']))
            site = next(site for site in regions.SITES if surface['id']=='regional-'+site[0]+'-'+site[1])
            expected,origin,center,_ = regions.crop_global(values,site[3],site[4],site[5])
            actual = buffer(grid['heights'],'<f4',(grid['height'],grid['width']))
            self.assertTrue(np.array_equal(actual,expected))
            self.assertEqual(grid['native_origin'],origin)
            self.assertEqual(grid['native_spacing'],[.25,-.25])
            self.assertEqual(grid['vertical_zero_m'],0)
            self.assertEqual(surface['coordinates']['latitude_deg'],center[1])
            self.assertIsNone(surface['stats']['direct_return_samples'])
            self.assertTrue(np.all(buffer(grid['valid_mask'],'u1',actual.shape)==1))

    def test_regional_imagery_uses_only_published_global_pixels(self):
        imagery = read('regional_imagery.json')
        catalog = read('regional_catalog.json')
        planets = {p['id']:p for p in read('planet_catalog.json')['planets']}
        self.assertEqual(imagery['catalog_sha256'],regions.sha(PUBLIC/'data/regional_catalog.json'))
        for surface,record in zip(catalog['surfaces'],imagery['records']):
            self.assertEqual(surface['id'],record['surface_id'])
            grid = surface['grid']
            texture = max(planets[surface['body']]['textures'],key=lambda t:t['width'])
            with Image.open(PUBLIC/texture['path'].lstrip('/')) as image:
                expected = regions.image_drape(image,grid['native_origin'],grid['width'])
            with Image.open(PUBLIC/record['layers'][0]['image']['path'].lstrip('/')) as image:
                self.assertTrue(np.array_equal(np.asarray(image),expected))
            self.assertEqual(record['inputs']['heights_sha256'],grid['heights']['sha256'])

    def test_regional_analysis_recomputes_from_exact_published_inputs(self):
        expected = regions.build_analysis(PUBLIC/'data/regional_catalog.json')
        self.assertEqual(read('regional_analysis.json'),expected)
        for record in expected['surfaces']:
            self.assertGreater(record['metrics']['relief_m'],0)
            self.assertEqual(sum(bin['samples'] for bin in record['slope_histogram']),record['coverage']['analyzed_centers'])

    def test_seam_crop_wraps_columns_without_reflection_and_poles_stay_bounded(self):
        # TEST_ONLY integer row/column encoding checks registration mechanics.
        rows,columns=np.indices((720,1440))
        values=(rows*10000+columns).astype('<f4')
        for latitude in [-90,0,90]:
            crop,origin,center,window=regions.crop_global(values,latitude,-179.9,33)
            left,top,size,_=window
            self.assertEqual(crop[0,0],values[top,left%1440])
            self.assertEqual(crop[-1,-1],values[top+size-1,(left+size-1)%1440])
            self.assertGreaterEqual(top,0)
            self.assertLessEqual(top+size,720)
            self.assertTrue(-90<center[1]<90)
            self.assertEqual(origin[1],89.875-top*.25)

    def test_previous_native_catalogs_are_byte_identical(self):
        expected = {'surface_catalog.json':'d3da33af6e1eb8ac8fb92f7aeee351d890849efbd752fbe110492e0c5671d539',
                    'surface_analysis.json':'71264c8ef2f15e1d364b38ca6957048d96a04ddeffe0ad11556c9c57d1519db0',
                    'surface_imagery.json':'df1e1b07bfd58b1462099aea5c04fea38be20d7f0f0c0e3023dac76ea6dbf25c'}
        for name,digest in expected.items():
            self.assertEqual(regions.sha(PUBLIC/'data'/name),digest)


if __name__=='__main__':
    unittest.main()
