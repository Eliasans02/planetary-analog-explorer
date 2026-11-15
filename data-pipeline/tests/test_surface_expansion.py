"""Exact source-pixel, preserved-record, and hostile range response checks."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest
import numpy as np

PIPELINE=Path(__file__).parents[1]
sys.path.insert(0,str(PIPELINE))
import expand_surface_sites as expansion
from export_surface_catalog import validate


class SurfaceExpansionTests(unittest.TestCase):
    def test_range_response_rejects_whole_file_wrong_offset_total_and_truncation(self):
        self.assertEqual(expansion.validate_range(206,'bytes 10-13/100',b'abcd',10,13,100),100)
        for args in [(200,'bytes 10-13/100',b'abcd',10,13,100),
                     (206,'bytes 0-3/100',b'abcd',10,13,100),
                     (206,'bytes 10-13/101',b'abcd',10,13,100),
                     (206,'bytes 10-13/100',b'abc',10,13,100)]:
            with self.assertRaises(ValueError): expansion.validate_range(*args)

    def test_original_three_records_unchanged(self):
        catalog=json.loads((expansion.PUBLIC/'data/surface_catalog.json').read_text())
        expected={'lola-site04-roi3':'4be8164688dfbc419458d5bf65f2cb2fbb78ef8ae5faed64d902cff8e55eb146',
                  'usgs-hawaii-summit':'53d6aa250c029a445a47e0db08b70fcfbd1ec7cbc0b2581128359cd08e371a6f',
                  'mars-jezero-hirise':'26dc200cb95362adfd40197207921063074a6e446c064a6d6328c24312467b81',
                  'nasa-lola-site04':'8b91302955bd93d4bcaeba3ec48a458c9b8f1b258e76dfbc36d857a640b7c550',
                  'usgs-3dep-n20w156':'99d7d96bcba3db1d3e7035cf019ff5b6b1d1aa9bd7cef83dea4fc6b8ac706079',
                  'nasa-hirise-jezero-dtm':'b463c2ced8011fb33d4700669b407dc1a5f576b3c70e6792905d3b1e08dacb05'}
        for record in catalog['surfaces']+catalog['sources']:
            if record['id'] in expected:
                self.assertEqual(hashlib.sha256(json.dumps(record,sort_keys=True).encode()).hexdigest(),expected.pop(record['id']))
        self.assertFalse(expected)

    def test_every_added_pixel_matches_verified_source_and_native_geometry(self):
        catalog=json.loads((expansion.PUBLIC/'data/surface_catalog.json').read_text())
        validate(catalog)
        for site in expansion.SITES:
            raw,valid,meta,identity,receipts,label,window=expansion.source_pixels(site,False)
            surface=next(r for r in catalog['surfaces'] if r['id']==site[0])
            grid=surface['grid']
            h=np.fromfile(expansion.PUBLIC/grid['heights']['path'].lstrip('/'),dtype='<f4').reshape(129,129)
            m=np.fromfile(expansion.PUBLIC/grid['valid_mask']['path'].lstrip('/'),dtype='uint8').reshape(129,129)
            expected=np.zeros((129,129),dtype='<f4')
            expected[valid]=(raw[valid].astype('float64')-float(raw[valid].min())).astype('<f4')
            np.testing.assert_array_equal(h,expected)
            np.testing.assert_array_equal(m,valid.astype('uint8'))
            self.assertEqual(grid['native_origin'],meta['crop_origin'])
            self.assertEqual(grid['native_spacing'],meta['spacing'])
            self.assertEqual(surface['coordinates']['longitude_deg'],meta['coordinates'][0])
            self.assertEqual(surface['coordinates']['latitude_deg'],meta['coordinates'][1])
            self.assertEqual(identity['complete_product'],site[2]=='moon')
            if site[2]=='mars':
                self.assertIn('byte range',identity['identity_scope'])
                self.assertIsNotNone(label)


if __name__=='__main__': unittest.main()
