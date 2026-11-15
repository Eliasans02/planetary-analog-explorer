"""Analytic terrain checks and fail-closed input/output binding checks."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location('analyze_surfaces', Path(__file__).parents[1] / 'analyze_surfaces.py')
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)


class SurfaceAnalysisTests(unittest.TestCase):
    def test_planar_anisotropic_gradient_and_riley_tri(self):
        row, col = np.indices((7, 8))
        # dx=2,dy=5; dz/dx=3/4,dz/dy=1: gradient magnitude=1.25.
        z = (col * 1.5 + row * 5).astype('<f4')
        result = analysis.analyze_grid(z, np.ones(z.shape), [2, 5])
        metrics = result['metrics']
        expected = float(np.degrees(np.arctan(1.25)))
        self.assertAlmostEqual(metrics['mean_slope_deg'], expected, places=12)
        self.assertAlmostEqual(metrics['p95_slope_deg'], expected, places=12)
        self.assertAlmostEqual(metrics['max_slope_deg'], expected, places=12)
        self.assertEqual(metrics['mean_roughness_m'], 13)
        self.assertAlmostEqual(metrics['mean_tri_m'], np.sqrt(6 * (1.5 ** 2 + 5 ** 2)))
        self.assertEqual(metrics['relief_m'], 40.5)
        self.assertEqual(result['coverage']['analyzed_centers'], 30)

    def test_offset_invariance(self):
        z = (np.arange(49).reshape(7, 7) ** 2).astype('<f4')
        mask = np.ones(z.shape)
        self.assertEqual(analysis.analyze_grid(z, mask, [3, 5]),
                         analysis.analyze_grid(z + 100000, mask, [3, 5]))

    def test_nodata_excludes_exact_nine_neighborhoods_without_filling(self):
        z = np.zeros((7, 7), dtype='<f4')
        mask = np.ones(z.shape, dtype='u1')
        z[3, 3] = np.nan
        mask[3, 3] = 0
        result = analysis.analyze_grid(z, mask, [1, 1])
        self.assertEqual(result['coverage'], dict(valid_height_samples=48, total_samples=49,
                                                analyzed_centers=16, possible_interior_centers=25))
        self.assertEqual(result['metrics']['mean_slope_deg'], 0)
        self.assertEqual(result['metrics']['mean_tri_m'], 0)

    def test_outer_edges_excluded_and_relief_includes_valid_edges(self):
        z = np.zeros((3, 3))
        z[0, 0] = 100
        result = analysis.analyze_grid(z, np.ones(z.shape), [1, 1])
        self.assertEqual(result['coverage']['analyzed_centers'], 1)
        self.assertEqual(result['metrics']['relief_m'], 100)
        self.assertEqual(result['metrics']['max_roughness_m'], 100)

    def test_no_eligible_centers_has_null_local_metrics(self):
        for shape in ((1, 5), (2, 2), (3, 3)):
            z = np.arange(np.prod(shape)).reshape(shape)
            mask = np.ones(shape)
            mask[0, 0] = 0
            result = analysis.analyze_grid(z, mask, [1, 1])
            self.assertEqual(result['coverage']['analyzed_centers'], 0)
            self.assertTrue(all(v is None for k, v in result['metrics'].items() if k != 'relief_m'))
            self.assertTrue(all(b['fraction_pct'] is None and b['samples'] == 0 for b in result['slope_histogram']))

    def test_histogram_exact_boundaries_and_percentage_denominator(self):
        histogram = analysis.slope_histogram([0, 4.99, 5, 10, 20, 30, 90])
        self.assertEqual([b['samples'] for b in histogram], [2, 1, 1, 1, 2])
        self.assertAlmostEqual(sum(b['fraction_pct'] for b in histogram), 100)
        self.assertAlmostEqual(histogram[0]['fraction_pct'], 200 / 7)

    def test_p95_uses_linear_interpolation(self):
        # Independent explicit row-wise plane: z=x^2 yields central gradients 2,4,6,8.
        z = np.tile(np.arange(6, dtype=float) ** 2, (3, 1))
        result = analysis.analyze_grid(z, np.ones(z.shape), [1, 1])
        slopes = np.degrees(np.arctan([2, 4, 6, 8]))
        expected = slopes[2] + .85 * (slopes[3] - slopes[2])
        self.assertAlmostEqual(result['metrics']['p95_slope_deg'], expected, places=12)

    def test_reject_invalid_scientific_inputs(self):
        z = np.ones((3, 3))
        cases = [(z, np.zeros(z.shape), [1, 1]),
                 (z, np.full(z.shape, 255), [1, 1]),
                 (z, np.ones((2, 2)), [1, 1]),
                 (z * np.nan, np.ones(z.shape), [1, 1]),
                 (z, np.ones(z.shape), [0, 1]),
                 (z, np.ones(z.shape), [float('inf'), 1])]
        for heights, mask, spacing in cases:
            with self.subTest(spacing=spacing), self.assertRaises(ValueError):
                analysis.analyze_grid(heights, mask, spacing)

    def test_current_catalog_recomputes_and_schema_validates(self):
        result = analysis.build_analysis()
        analysis.validate(result)
        self.assertEqual(result, analysis.build_analysis())
        self.assertGreaterEqual(len(result['surfaces']), 3)
        for record in result['surfaces']:
            self.assertEqual(sum(b['samples'] for b in record['slope_histogram']), record['coverage']['analyzed_centers'])

    def test_hash_dimensions_mask_and_nonfinite_rejections(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'assets').mkdir()
            raw = np.ones((3, 3), dtype='<f4').tobytes()
            mask = bytes([1] * 9)
            (root / 'assets/heights.f32').write_bytes(raw)
            (root / 'assets/mask.u8').write_bytes(mask)
            surface = dict(id='test', stats=dict(valid_samples=9, total_samples=9, relief_m=0), grid=dict(width=3, height=3, spacing_m=[1, 1], horizontal_method='test meters',
                heights=dict(path='/assets/heights.f32', sha256=analysis.sha256(raw), bytes=36),
                valid_mask=dict(path='/assets/mask.u8', sha256=analysis.sha256(mask), bytes=9)))
            analysis.analyze_surface(surface, root)
            for mutation in ('valid_count', 'relief', 'path', 'dimensions'):
                bad = copy.deepcopy(surface)
                if mutation == 'valid_count':
                    bad['stats']['valid_samples'] = 8
                elif mutation == 'relief':
                    bad['stats']['relief_m'] = 10
                elif mutation == 'path':
                    bad['grid']['heights']['path'] = '/assets/../assets/heights.f32'
                else:
                    bad['grid']['width'] = 258
                with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                    analysis.analyze_surface(bad, root)
            bad = copy.deepcopy(surface)
            bad['grid']['heights']['sha256'] = '0' * 64
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                analysis.analyze_surface(bad, root)
            bad = copy.deepcopy(surface)
            bad['grid']['width'] = 4
            with self.assertRaisesRegex(ValueError, 'dimensions'):
                analysis.analyze_surface(bad, root)
            (root / 'assets/mask.u8').write_bytes(bytes([2] * 9))
            bad = copy.deepcopy(surface)
            bad['grid']['valid_mask']['sha256'] = analysis.sha256(bytes([2] * 9))
            with self.assertRaisesRegex(ValueError, 'only 0 and 1'):
                analysis.analyze_surface(bad, root)
            (root / 'assets/mask.u8').write_bytes(mask)
            raw = np.full((3, 3), np.inf, dtype='<f4').tobytes()
            (root / 'assets/heights.f32').write_bytes(raw)
            bad = copy.deepcopy(surface)
            bad['grid']['heights']['sha256'] = analysis.sha256(raw)
            with self.assertRaisesRegex(ValueError, 'finite'):
                analysis.analyze_surface(bad, root)

    def test_catalog_rejects_schema_duplicate_and_unknown_source(self):
        original = analysis.read_json(analysis.PUBLIC / 'data/surface_catalog.json')
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'catalog.json'
            for mutation in ('schema', 'duplicate_surface', 'duplicate_source', 'unknown_source'):
                bad = copy.deepcopy(original)
                if mutation == 'schema':
                    bad['surfaces'][0]['grid']['width'] = '129'
                elif mutation == 'duplicate_surface':
                    bad['surfaces'].append(copy.deepcopy(bad['surfaces'][0]))
                elif mutation == 'duplicate_source':
                    bad['sources'].append(copy.deepcopy(bad['sources'][0]))
                else:
                    bad['surfaces'][0]['source_ids'] = ['unknown']
                path.write_text(json.dumps(bad), encoding='utf-8')
                with self.subTest(mutation=mutation), self.assertRaises(Exception):
                    analysis.build_analysis(path)

    def test_readonly_check_detects_changed_metric_missing_id_and_catalog_hash(self):
        expected = analysis.build_analysis()
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'analysis.json'
            analysis.atomic_export(path, expected)
            before = path.read_bytes()
            analysis.check_published(path, expected)
            self.assertEqual(path.read_bytes(), before)
            for mutate in ('metric', 'missing', 'hash'):
                bad = copy.deepcopy(expected)
                if mutate == 'metric':
                    bad['surfaces'][0]['metrics']['relief_m'] += 1
                elif mutate == 'missing':
                    bad['surfaces'].pop()
                else:
                    bad['catalog_sha256'] = '0' * 64
                analysis.atomic_export(path, bad)
                with self.assertRaisesRegex(ValueError, 'stale'):
                    analysis.check_published(path, expected)

    def test_atomic_export_rejects_nonfinite_without_touching_existing_output(self):
        result = analysis.build_analysis()
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'analysis.json'
            analysis.atomic_export(path, result)
            before = path.read_bytes()
            result['surfaces'][0]['metrics']['relief_m'] = float('nan')
            with self.assertRaises(ValueError):
                analysis.atomic_export(path, result)
            self.assertEqual(before, path.read_bytes())


if __name__ == '__main__':
    unittest.main()
