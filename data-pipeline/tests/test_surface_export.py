"""Focused native export checks; run with unittest (no scoring dependencies)."""
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

import numpy as np
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
import rasterio
from rasterio.windows import Window

spec = importlib.util.spec_from_file_location('surface_export', Path(__file__).parents[1] / 'export_surface_catalog.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class NativeSurfaceTests(unittest.TestCase):
    def test_crop_masks_raw_nodata_before_scale_and_retains_centers(self):
        raw = np.arange(131 * 131, dtype='float32').reshape(131, 131)
        raw[2, 3] = -9999
        raw[3, 4] = np.nan
        with MemoryFile() as memory:
            with memory.open(driver='GTiff', width=131, height=131, count=1, dtype='float32', nodata=-9999,
                             crs='EPSG:4269', transform=from_origin(-156, 20, .001, .001)) as ds:
                ds.write(raw, 1)
                ds.scales = (2,)
                ds.offsets = (7,)
                window, values, valid, heights, minimum, maximum = exporter.crop(ds, 65, 65)
                self.assertEqual((window.col_off, window.row_off), (1, 1))
                self.assertFalse(valid[1, 2])
                self.assertFalse(valid[2, 3])
                self.assertEqual(heights[1, 2], 0)
                self.assertEqual(heights[2, 3], 0)
                self.assertEqual(heights[64, 64], np.float32(float(raw[65, 65]) * 2 + 7 - minimum))
                self.assertEqual(ds.xy(1, 1), (-155.9985, 19.9985))
                self.assertEqual(int(valid.sum()), 129 * 129 - 2)
                self.assertGreater(maximum, minimum)

    def test_highest_selection_ignores_nodata_and_ties_row_major(self):
        raw = np.ones((160, 160), dtype='float32')
        raw[0, 0] = 9999
        raw[80, 120] = raw[90, 10] = 10
        with MemoryFile() as memory:
            with memory.open(driver='GTiff', width=160, height=160, count=1, dtype='float32', nodata=9999,
                             tiled=True, blockxsize=16, blockysize=16,
                             transform=from_origin(0, 160, 1, 1)) as ds:
                ds.write(raw, 1)
                row, col, selection = exporter.highest_pixel(ds)
                self.assertEqual((row, col), (80, 120))
                self.assertEqual(selection['tile_valid_samples'], 160 * 160 - 1)

    def test_archive_rejects_unexpected_regular_path(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'bad.tgz'
            with tarfile.open(path, 'w:gz') as archive:
                member = tarfile.TarInfo('../escape.shp')
                member.size = 1
                archive.addfile(member, io.BytesIO(b'x'))
            with self.assertRaises(ValueError):
                exporter.load_roi(path)

    def test_receipt_identity_mismatch_is_explicit_error(self):
        receipt = dict(exporter.read_json(exporter.ROOT / 'docs/research/LOCAL_DEM_ROI_ACQUISITION.json'))
        receipt['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'Source hash mismatch'):
            exporter.verify_receipt(receipt)

    def test_all_published_samples_equal_direct_source_crop(self):
        catalog = exporter.read_json(exporter.PUBLIC / 'data/surface_catalog.json')
        exporter.validate(catalog)
        # This check reads complete GDAL source rasters. Exact-range HiRISE
        # acquisition is checked across every valid crop sample separately in
        # test_planet_assets.test_mars_native_range_crop_matches_exact_source_samples.
        complete_raster_surfaces = [s for s in catalog['surfaces'] if s['body'] in ('moon', 'earth')]
        self.assertEqual({s['body'] for s in complete_raster_surfaces}, {'moon', 'earth'})
        for surface in complete_raster_surfaces:
            grid = surface['grid']
            provenance = exporter.read_json(exporter.PUBLIC / surface['provenance']['path'].lstrip('/'))
            exporter.verify_receipt(provenance['raw_source_receipt'])
            with rasterio.open(exporter.ROOT / provenance['raw_source_receipt']['local_path']) as ds:
                window = Window(*provenance['window_col_row_width_height'])
                raw = ds.read(1, window=window)
                valid = (ds.read_masks(1, window=window) > 0) & np.isfinite(raw)
                scaled = raw.astype('float64') * ds.scales[0] + ds.offsets[0]
                valid &= np.isfinite(scaled)
                expected = np.zeros(raw.shape, dtype='<f4')
                expected[valid] = (scaled[valid] - scaled[valid].min()).astype('<f4')
                actual = np.fromfile(exporter.PUBLIC / grid['heights']['path'].lstrip('/'), dtype='<f4').reshape(raw.shape)
                mask = np.fromfile(exporter.PUBLIC / grid['valid_mask']['path'].lstrip('/'), dtype='uint8').reshape(raw.shape)
                np.testing.assert_array_equal(actual, expected)
                np.testing.assert_array_equal(mask, valid.astype('uint8'))
                self.assertEqual(grid['native_origin'], list(ds.xy(int(window.row_off), int(window.col_off))))
        roi, _ = exporter.load_roi(exporter.RAW / 'Site04_ROIs.tgz')
        lunar = catalog['surfaces'][0]
        origin, step = lunar['grid']['native_origin'], lunar['grid']['native_spacing']
        reconstructed = [(origin[0] + col*step[0], origin[1] + row*step[1]) for col, row in lunar['roi']['outline_grid']]
        np.testing.assert_allclose(reconstructed, list(roi.exterior.coords), rtol=0, atol=1e-9)


if __name__ == '__main__':
    unittest.main(verbosity=2)
