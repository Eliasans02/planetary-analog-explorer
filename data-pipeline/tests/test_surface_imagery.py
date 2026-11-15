"""Source-pixel/color preservation, georeferencing and frozen-input checks."""
import hashlib
import json
from pathlib import Path
import sys
import unittest
import numpy as np
from PIL import Image
import rasterio
from pyproj import CRS,Transformer
sys.path.insert(0,str(Path(__file__).parents[1]))
import texture_surfaces as t


class SurfaceImageryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog_bytes=(t.PUBLIC/'data/surface_catalog.json').read_bytes()
        cls.catalog=json.loads(cls.catalog_bytes)
        cls.manifest=json.loads((t.PUBLIC/'data/surface_imagery.json').read_text())

    def test_manifest_binds_frozen_catalog_geometry_and_source_buffers(self):
        self.assertEqual(self.manifest['catalog_sha256'],hashlib.sha256(self.catalog_bytes).hexdigest())
        expected=[s for s in self.catalog['surfaces'] if s['body'] in ('moon','mars')]
        self.assertEqual({r['surface_id'] for r in self.manifest['records']},{s['id'] for s in expected})
        for record in self.manifest['records']:
            s=next(s for s in expected if s['id']==record['surface_id']);g=s['grid'];i=record['inputs']
            self.assertEqual(i,{k:g[k] for k in ('width','height','native_origin','native_spacing','native_crs_wkt')}|
                             {'heights_sha256':g['heights']['sha256'],'valid_mask_sha256':g['valid_mask']['sha256']})
            self.assertEqual(record['layers'][0]['id'],'orbital-color')
            for layer in record['layers']:
                prov=json.loads((t.PUBLIC/layer['provenance']['path'].lstrip('/')).read_text())
                self.assertIn('UV at ((col+0.5)/width,(row+0.5)/height)',prov['output_pixel_registration'])
                self.assertIn('flipY false',prov['output_pixel_registration'])
                for key in ('image','provenance'):
                    t.read_verified(t.PUBLIC/layer[key]['path'].lstrip('/'),layer[key])
                p=t.PUBLIC/layer['image']['path'].lstrip('/')
                with Image.open(p) as im:
                    self.assertEqual((im.mode,im.size),('RGB',(g['width'],g['height'])))
                self.assertTrue(layer['limitations'])

    def test_global_nearest_seam_poles_and_no_interpolated_color(self):
        image=np.arange(4*8*3,dtype='u1').reshape(4,8,3)
        rgb,row,col=t.global_pixels(image,np.array([-180,0,180,179.999]),np.array([90,0,-90,-90]))
        np.testing.assert_array_equal(row,[0,2,3,3]);np.testing.assert_array_equal(col,[0,4,0,7])
        np.testing.assert_array_equal(rgb,image[row,col])

    def test_every_orbital_pixel_equals_same_verified_globe_image(self):
        for record in self.manifest['records']:
            s=next(s for s in self.catalog['surfaces'] if s['id']==record['surface_id'])
            layer=record['layers'][0]
            prov=json.loads((t.PUBLIC/layer['provenance']['path'].lstrip('/')).read_text())
            source=t.read_verified(t.PUBLIC/prov['source_asset']['path'].lstrip('/'),prov['source_asset'])
            with Image.open(source) as im:original=np.asarray(im.convert('RGB'))
            rows,cols=np.indices((129,129));g=s['grid']
            x=g['native_origin'][0]+cols*g['native_spacing'][0];y=g['native_origin'][1]+rows*g['native_spacing'][1]
            crs=CRS(g['native_crs_wkt']);lon,lat=Transformer.from_crs(crs,crs.geodetic_crs,always_xy=True).transform(x,y)
            source_col=np.floor((((lon+180)%360)/360)*original.shape[1]).astype(int)%original.shape[1]
            source_row=np.clip(np.floor((90-lat)/180*original.shape[0]).astype(int),0,original.shape[0]-1)
            with Image.open(t.PUBLIC/layer['image']['path'].lstrip('/')) as im:actual=np.asarray(im)
            np.testing.assert_array_equal(actual,original[source_row,source_col])

    def test_every_ortho_pixel_matches_original_jp2_without_color_stretch(self):
        for record in self.manifest['records']:
            layers=[l for l in record['layers'] if l['id']=='local-ortho']
            if not layers:continue
            s=next(s for s in self.catalog['surfaces'] if s['id']==record['surface_id']);g=s['grid'];layer=layers[0]
            path,receipt=t.ortho_source(s['id']);label,lr=t.ortho_label(path,receipt)
            with rasterio.open(path) as ds:
                t.check_label_mapping(ds,label,t.label_crs(label))
                # Verified matching map coordinates; use GDAL row/col indexing,
                # independently of the producer's inverse-affine vector formula.
                x,y=t.grid_xy(g);rr,cc=rasterio.transform.rowcol(ds.transform,x.flatten(),y.flatten(),op=lambda v:np.floor(v+1e-7))
                rr=np.asarray(rr,dtype=int).reshape(129,129);cc=np.asarray(cc,dtype=int).reshape(129,129)
                window=rasterio.windows.Window(int(cc.min()),int(rr.min()),int(cc.max()-cc.min()+1),int(rr.max()-rr.min()+1))
                raw=ds.read(window=window)
                expected=np.moveaxis(raw[:,rr-int(rr.min()),cc-int(cc.min())],0,-1)
                if ds.count==1:expected=np.repeat(expected,3,axis=2)
            with Image.open(t.PUBLIC/layer['image']['path'].lstrip('/')) as im:actual=np.asarray(im)
            np.testing.assert_array_equal(actual,expected)
            self.assertGreater(int(actual.max()),int(actual.min()))

    def test_pds_mapping_rejects_wrong_standard_parallel_and_affine(self):
        path,r=t.ortho_source('mars-jezero-hirise');label,_=t.ortho_label(path,r)
        with rasterio.open(path) as ds:
            # Embedded wrong lat_0 interpretation fails geographic-bound check.
            with self.assertRaisesRegex(ValueError,'geographic coverage'):
                t.check_label_mapping(ds,label,CRS(ds.crs))
            wrong=label.replace('1.0096633268711 <METERS/PIXEL>','1.1096633268711 <METERS/PIXEL>')
            with self.assertRaisesRegex(ValueError,'affine disagree'):
                t.check_label_mapping(ds,wrong,t.label_crs(wrong))


if __name__=='__main__':unittest.main()
