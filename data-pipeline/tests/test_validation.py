# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Validation and synthetic projected-relief diagnostics (not production ENU)."""

from __future__ import annotations

import copy
import json
import pathlib
import sys

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

PIPELINE_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

import fetch_and_score  # noqa: E402
from pae_pipeline.export import atomic_write_bytes, sha256_file  # noqa: E402
from pae_pipeline.sources import (  # noqa: E402
    ManifestValidationError,
    UnsupportedUnitError,
    convert_coordinates_to_output_frame,
    load_manifest,
)
from pae_pipeline.terrain import (  # noqa: E402
    InsufficientCoverageError,
    InsufficientResolutionError,
    TerrainValidationError,
    _extract_projected_relief_for_tests,
)
from pae_pipeline.validation import DatasetValidationError, validate_dataset  # noqa: E402

SCHEMA_PATH = PIPELINE_ROOT / "schemas" / "analog_location.schema.json"


def _write_test_geotiff(
    path: pathlib.Path,
    elev: np.ndarray,
    *,
    pixel_size_m: float = 5.0,
    crs_proj4: str = "+proj=aeqd +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=6378137 +b=6356752.314245179 +units=m +no_defs",
    nodata: float | None = -9999.0,
    units: str = "m",
) -> None:
    h, w = elev.shape
    half_w = 0.5 * w * pixel_size_m
    half_h = 0.5 * h * pixel_size_m
    transform = from_origin(-half_w, half_h, pixel_size_m, pixel_size_m)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=1,
        dtype="float32",
        crs=crs_proj4,
        transform=transform,
        nodata=nodata,
    ) as dst:
        dst.write(elev.astype(np.float32), 1)
        dst.units = (units,)


def _write_test_aoi(path: pathlib.Path, half_deg: float = 0.002) -> None:
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"id": "test_aoi"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-half_deg, -half_deg],
                            [half_deg, -half_deg],
                            [half_deg, half_deg],
                            [-half_deg, half_deg],
                            [-half_deg, -half_deg],
                        ]
                    ],
                },
            }
        ],
    }
    path.write_text(json.dumps(geojson), encoding="utf-8")


def test_empty_mode_succeeds_and_require_demo_ready_fails_without_overwrite(
    tmp_path: pathlib.Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    out_file = tmp_path / "web-client" / "public" / "data" / "locations_dataset.json"
    rc = fetch_and_score.main(
        [
            "--mode",
            "empty",
            "--output",
            str(out_file),
            "--schema",
            str(SCHEMA_PATH),
        ]
    )
    assert rc == 0
    captured = capsys.readouterr()
    assert "EMPTY_NOT_SCIENCE_VALIDATED" in captured.out
    assert "PASS" not in captured.out
    assert "demo-ready" not in captured.out.lower()
    assert out_file.is_file()

    # Validating empty succeeds without --require-demo-ready
    rc_val = fetch_and_score.main(
        [
            "--mode",
            "validate",
            "--output",
            str(out_file),
            "--schema",
            str(SCHEMA_PATH),
        ]
    )
    assert rc_val == 0

    # Validating empty WITH --require-demo-ready fails and preserves existing file
    before_bytes = out_file.read_bytes()
    rc_demo = fetch_and_score.main(
        [
            "--mode",
            "validate",
            "--output",
            str(out_file),
            "--schema",
            str(SCHEMA_PATH),
            "--require-demo-ready",
        ]
    )
    assert rc_demo != 0
    assert out_file.read_bytes() == before_bytes


def test_prepare_failure_leaves_existing_output_untouched(tmp_path: pathlib.Path) -> None:
    out_file = tmp_path / "web-client" / "public" / "data" / "locations_dataset.json"
    assert fetch_and_score.main(["--mode", "empty", "--output", str(out_file), "--schema", str(SCHEMA_PATH)]) == 0
    sentinel_bytes = out_file.read_bytes()

    empty_manifest = tmp_path / "sites_manifest.json"
    empty_profiles = tmp_path / "scoring_profiles.json"
    empty_manifest.write_text('{"schema_version":"1.0.0","sites":[]}', encoding="utf-8")
    empty_profiles.write_text('{"profiles":[]}', encoding="utf-8")

    rc_fail = fetch_and_score.main(
        [
            "--mode",
            "offline",
            "--manifest",
            str(empty_manifest),
            "--profiles",
            str(empty_profiles),
            "--output",
            str(out_file),
            "--schema",
            str(SCHEMA_PATH),
        ]
    )
    assert rc_fail != 0
    assert out_file.read_bytes() == sentinel_bytes


def test_terrain_extraction_plane_roughness_and_rejections(tmp_path: pathlib.Path) -> None:
    # Tilted plane z = 0.1*x + 0.05*y_north -> zero detrended residual, non-zero slope!
    nx, ny = 50, 50
    pix = 5.0
    xs = (np.arange(nx) - nx / 2.0 + 0.5) * pix
    ys = (ny / 2.0 - 0.5 - np.arange(ny)) * pix
    xg, yg = np.meshgrid(xs, ys)
    z_plane = 100.0 + 0.1 * xg + 0.05 * yg

    dem_path = tmp_path / "plane_dem.tif"
    aoi_path = tmp_path / "aoi.geojson"
    _write_test_geotiff(dem_path, z_plane, pixel_size_m=pix)
    _write_test_aoi(aoi_path, half_deg=0.002)

    profile = {
        "comparison_resolution_m": 10.0,
        "window_m": 100.0,
        "min_valid_area_fraction": 0.9,
    }
    res = _extract_projected_relief_for_tests(dem_path, aoi_path, profile)
    feats = res["features"]
    expected_slope_deg = np.degrees(np.arctan(np.hypot(0.1, 0.05)))
    assert np.isclose(feats["slope_mean_deg"]["value"], expected_slope_deg, atol=0.1)
    assert np.isclose(feats["slope_max_deg"]["value"], expected_slope_deg, atol=0.1)
    assert feats["roughness_index"]["value"] < 1e-5
    assert feats["elevation_delta_m"]["value"] > 10.0

    hm = res["heightmap_data"]
    assert len(hm["heights_bytes"]) == hm["width"] * hm["height"] * 4
    assert len(hm["mask_bytes"]) == hm["width"] * hm["height"]

    # Reject upsampling finer than coarsest source pixel size (5m source vs 2m profile)
    with pytest.raises(InsufficientResolutionError):
        _extract_projected_relief_for_tests(
            dem_path,
            aoi_path,
            {"comparison_resolution_m": 2.0, "window_m": 100.0, "min_valid_area_fraction": 0.9},
        )

    # Reject DEM with large nodata hole below min_valid_area_fraction
    z_holed = z_plane.copy()
    z_holed[:35, :] = -9999.0
    holed_path = tmp_path / "holed_dem.tif"
    _write_test_geotiff(holed_path, z_holed, pixel_size_m=pix, nodata=-9999.0)
    with pytest.raises(InsufficientCoverageError):
        _extract_projected_relief_for_tests(holed_path, aoi_path, profile)

    # Reject unsupported vertical units
    bad_unit_path = tmp_path / "feet_dem.tif"
    _write_test_geotiff(bad_unit_path, z_plane, pixel_size_m=pix, units="ft")
    with pytest.raises(TerrainValidationError, match="unit"):
        _extract_projected_relief_for_tests(bad_unit_path, aoi_path, profile)


def test_planetographic_to_planetocentric_conversion_and_soilgrids_rejection(tmp_path: pathlib.Path) -> None:
    converted = convert_coordinates_to_output_frame(
        {
            "latitude_deg": 18.0,
            "longitude_deg": 282.5,
            "frame": "mars_iau_planetographic",
            "longitude_domain": "0_to_360",
            "east_positive": True,
            "ellipsoid": {"semi_major_m": 3396190.0, "semi_minor_m": 3376200.0},
            "source_ids": ["mola_src"],
        },
        "mars",
    )
    assert converted["frame"] == "mars_iau_planetocentric"
    assert converted["latitude_deg"] < 18.0  # oblate ellipsoid shifts planetocentric < planetographic
    assert np.isclose(converted["longitude_deg"], -77.5, atol=1e-9)

    # Manifest rejecting SoilGrids populated as geology.classes
    bad_manifest = {
        "schema_version": "1.0.0",
        "sites": [
            {
                "id": "earth_site",
                "name": "Atacama",
                "body": "earth",
                "missions": [],
                "coordinates": {
                    "latitude_deg": -24.0,
                    "longitude_deg": -69.5,
                    "frame": "earth_wgs84",
                    "source_ids": ["sg_src"],
                },
                "aoi": {
                    "local_path": "data/aoi.geojson",
                    "sha256": "a" * 64,
                    "access_url": "https://example.org/aoi.geojson",
                    "frame": "earth_wgs84",
                    "source_ids": ["sg_src"],
                },
                "dem": {
                    "local_path": "data/dem.tif",
                    "sha256": "b" * 64,
                    "vertical_datum": "EGM96",
                    "vertical_units": "m",
                    "label_path": "data/dem.json",
                    "label_sha256": "c" * 64,
                    "source_ids": ["sg_src"],
                },
                "geology": {
                    "classes": ["clay"],
                    "method": "soilgrids_guess",
                    "source_ids": ["sg_src"],
                    "missing_reason": None,
                },
                "sources": [
                    {
                        "id": "sg_src",
                        "provider": "ISRIC SoilGrids",
                        "product_id": "soilgrids_v2",
                        "product_url": "https://isric.org/explore/soilgrids/",
                        "mission": None,
                        "access_url": "https://isric.org/explore/soilgrids/",
                        "retrieved_at": "2026-01-01T00:00:00Z",
                        "sha256": "d" * 64,
                        "license": "CC-BY-4.0",
                        "local_path": "data/sg.tif",
                    }
                ],
            }
        ],
    }
    mpath = tmp_path / "manifest_sg.json"
    mpath.write_text(json.dumps(bad_manifest), encoding="utf-8")
    with pytest.raises(ManifestValidationError, match="SoilGrids"):
        load_manifest(mpath)


def test_missing_or_hash_mismatched_source_blocks_validation(tmp_path: pathlib.Path) -> None:
    pub_root = tmp_path / "web-client" / "public"
    pub_root.mkdir(parents=True)
    src_file = tmp_path / "data" / "raw.txt"
    sha, _ = atomic_write_bytes(src_file, b"verified bytes")

    dataset = {
        "schema_version": "1.0.0",
        "generated_at": "2026-01-01T00:00:00Z",
        "sources": [
            {
                "id": "s1",
                "provider": "Test",
                "product_id": "P1",
                "product_url": "https://example.org/p1",
                "mission": None,
                "access_url": "https://example.org/p1.bin",
                "retrieved_at": "2026-01-01T00:00:00Z",
                "sha256": sha,
                "license": "CC0-1.0",
                "local_path": "data/raw.txt",
            }
        ],
        "profiles": [],
        "comparisons": [],
    }
    validate_dataset(dataset, SCHEMA_PATH, pub_root, require_demo_ready=False)

    # Tamper file -> SHA mismatch blocks publication
    src_file.write_bytes(b"tampered bytes")
    with pytest.raises(DatasetValidationError, match="SHA-256 mismatch"):
        validate_dataset(dataset, SCHEMA_PATH, pub_root, require_demo_ready=False)

    # Missing file blocks publication
    src_file.unlink()
    with pytest.raises(DatasetValidationError, match="does not exist"):
        validate_dataset(dataset, SCHEMA_PATH, pub_root, require_demo_ready=False)

    # Path escape rejected
    escaped = copy.deepcopy(dataset)
    escaped["sources"][0]["local_path"] = "../outside.txt"
    with pytest.raises(DatasetValidationError, match="Schema violation"):
        validate_dataset(escaped, SCHEMA_PATH, pub_root, require_demo_ready=False)


def test_oblate_planetocentric_aoi_and_pole_handling_cr002(tmp_path: pathlib.Path) -> None:
    import math
    import pyproj

    a_mars, b_mars = 3396190.0, 3376200.0
    lat_c = 45.0
    lat_g = math.degrees(math.atan(((a_mars / b_mars) ** 2) * math.tan(math.radians(lat_c))))
    mars_crs = f"+proj=aeqd +lat_0={lat_g} +lon_0=10.0 +x_0=0 +y_0=0 +a={a_mars} +b={b_mars} +units=m +no_defs"

    nx, ny, pix = 40, 40, 5.0
    xs = (np.arange(nx) - nx / 2.0 + 0.5) * pix
    ys = (ny / 2.0 - 0.5 - np.arange(ny)) * pix
    xg, yg = np.meshgrid(xs, ys)
    # Linear ramp centered at local (0, 0) where height == 123.0 m
    z = 123.0 + 0.05 * xg + 0.02 * yg
    dem_path = tmp_path / "mars_oblate_dem.tif"
    _write_test_geotiff(dem_path, z, pixel_size_m=pix, crs_proj4=mars_crs)

    half_d = 0.002
    aoi_path = tmp_path / "mars_planetocentric_aoi.geojson"
    aoi_path.write_text(
        json.dumps(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [10.0 - half_d, lat_c - half_d],
                            [10.0 + half_d, lat_c - half_d],
                            [10.0 + half_d, lat_c + half_d],
                            [10.0 - half_d, lat_c + half_d],
                            [10.0 - half_d, lat_c - half_d],
                        ]
                    ],
                },
            }
        ),
        encoding="utf-8",
    )

    profile = {
        "comparison_resolution_m": 10.0,
        "window_m": 100.0,
        "min_valid_area_fraction": 0.9,
    }
    res = _extract_projected_relief_for_tests(dem_path, aoi_path, profile, aoi_frame="mars_iau_planetocentric")
    origin = res["heightmap_data"]["origin"]
    assert math.isclose(origin["latitude_deg"], lat_c, abs_tol=1e-6)
    assert math.isclose(origin["longitude_deg"], 10.0, abs_tol=1e-6)
    # If planetocentric 45 deg had been misinterpreted as geodetic (~10 km south), mean elevation would drift by ~500m
    assert math.isclose(origin["elevation_m"], 123.0, abs_tol=1.0)

    # Exact south/north poles must map to exact +/-90 deg without tangent blowup
    from pae_pipeline.terrain import _planetocentric_to_geodetic_coords, _planetocentric_to_geodetic_deg

    assert _planetocentric_to_geodetic_deg(90.0, a_mars, b_mars) == 90.0
    assert _planetocentric_to_geodetic_deg(-90.0, a_mars, b_mars) == -90.0
    px, py = _planetocentric_to_geodetic_coords(
        np.array([0.0, 0.0]), np.array([-90.0, 90.0]), a_m=a_mars, b_m=b_mars
    )
    assert np.allclose(py, [-90.0, 90.0])
    assert pyproj.CRS.from_user_input(res["source_crs_wkt"]).ellipsoid.semi_major_metre == pytest.approx(a_mars)


def test_temperature_family_invariant_in_validation_cr003(tmp_path: pathlib.Path) -> None:
    pub_root = tmp_path / "web-client" / "public"
    pub_root.mkdir(parents=True)
    aoi_path = pub_root / "assets" / "aoi" / "site.geojson"
    aoi_path.parent.mkdir(parents=True)
    _write_test_aoi(aoi_path, half_deg=0.002)
    aoi_sha = sha256_file(aoi_path)

    raw_src = tmp_path / "data" / "power.json"
    raw_src.parent.mkdir(parents=True)
    src_sha, _ = atomic_write_bytes(raw_src, b"{}")

    base_feats = {
        k: {
            "value": None,
            "unit": "1" if k in {"roughness_index", "aridity_index", "albedo"} else ("m" if k == "elevation_delta_m" else ("kWh/m2/day" if k == "solar_irradiance_kwh_m2" else "deg")),
            "quantity": f"q_{k}",
            "method": "m",
            "spatial_resolution_m": None,
            "support_window_m": None,
            "period": None,
            "source_ids": [],
            "missing_reason": "omitted",
        }
        for k in (
            "slope_mean_deg",
            "slope_max_deg",
            "roughness_index",
            "elevation_delta_m",
            "solar_irradiance_kwh_m2",
            "aridity_index",
            "albedo",
        )
    }
    base_feats["slope_mean_deg"]["value"] = 5.0
    base_feats["slope_mean_deg"]["unit"] = "deg"
    base_feats["slope_mean_deg"]["source_ids"] = ["s1"]
    base_feats["slope_mean_deg"]["missing_reason"] = None
    base_feats["temp_min_c"] = {
        "value": 25.0,
        "unit": "degC",
        "quantity": "air_2m_temperature_daily_min",
        "method": "power",
        "spatial_resolution_m": None,
        "support_window_m": None,
        "period": {"start": "2025-01-01T00:00:00Z", "end": "2025-01-31T23:59:59Z"},
        "source_ids": ["s1"],
        "missing_reason": None,
    }
    base_feats["temp_max_c"] = {
        "value": 10.0,
        "unit": "degC",
        "quantity": "air_2m_temperature_daily_max",
        "method": "power",
        "spatial_resolution_m": None,
        "support_window_m": None,
        "period": {"start": "2025-01-01T00:00:00Z", "end": "2025-01-31T23:59:59Z"},
        "source_ids": ["s1"],
        "missing_reason": None,
    }

    dataset = {
        "schema_version": "1.0.0",
        "generated_at": "2026-01-01T00:00:00Z",
        "sources": [
            {
                "id": "s1",
                "provider": "NASA POWER",
                "product_id": "POWER_DAILY",
                "product_url": "https://power.larc.nasa.gov/",
                "mission": None,
                "access_url": "https://power.larc.nasa.gov/api/temporal/daily/point",
                "retrieved_at": "2026-01-01T00:00:00Z",
                "sha256": src_sha,
                "license": "NASA Open Data",
                "local_path": "data/power.json",
            }
        ],
        "profiles": [
            {
                "id": "topo",
                "version": "1.0.0",
                "algorithm": "weighted_cosine_euclidean_v1",
                "alpha": 0.5,
                "comparison_resolution_m": 10.0,
                "window_m": 100.0,
                "min_valid_area_fraction": 0.9,
                "features": [
                    {
                        "key": "slope_mean_deg",
                        "unit": "deg",
                        "quantity": "q_slope_mean_deg",
                        "weight": 1.0,
                        "lower": 0.0,
                        "upper": 45.0,
                        "calibration_source_ids": ["s1"],
                        "calibration_method": "fixture",
                    }
                ],
            }
        ],
        "comparisons": [
            {
                "profile_id": "topo",
                "target": {
                    "id": "site_a",
                    "name": "Site A",
                    "body": "moon",
                    "coordinates": {
                        "latitude_deg": 0.0,
                        "longitude_deg": 0.0,
                        "frame": "moon_iau_planetocentric",
                        "source_ids": ["s1"],
                    },
                    "aoi": {"local_path": "/assets/aoi/site.geojson", "source_ids": ["s1"]},
                    "missions": [],
                    "features": base_feats,
                    "geology": {
                        "classes": [],
                        "method": "none",
                        "source_ids": [],
                        "missing_reason": "omitted",
                    },
                    "assets": {"dem": None, "heightmap": None, "splat": None},
                    "camera": None,
                },
                "analogs": [],
                "excluded": [],
            }
        ],
    }

    with pytest.raises(DatasetValidationError, match="temp_min_c.*> temp_max_c"):
        validate_dataset(dataset, SCHEMA_PATH, pub_root, require_demo_ready=False, repo_root=tmp_path)


def test_antimeridian_multipolygon_and_wide_span_rejection_cr004(tmp_path: pathlib.Path) -> None:
    # Split MultiPolygon straddling +/-180 deg with 360-degree geographic DEM
    w, h = 720, 360
    dx = 360.0 / w
    dy = 180.0 / h
    geog_elev = np.full((h, w), 250.0, dtype=np.float32)
    geog_dem = tmp_path / "global_geog_dem.tif"
    with rasterio.open(
        geog_dem,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=1,
        dtype="float32",
        crs="+proj=longlat +a=1737400 +b=1737400 +no_defs",
        transform=from_origin(-180.0, 90.0, dx, dy),
        nodata=-9999.0,
    ) as dst:
        dst.write(geog_elev, 1)
        dst.units = ("m",)

    antimeridian_aoi = tmp_path / "antimeridian_aoi.geojson"
    antimeridian_aoi.write_text(
        json.dumps(
            {
                "type": "Feature",
                "geometry": {
                    "type": "MultiPolygon",
                    "coordinates": [
                        [[[179.0, -1.0], [180.0, -1.0], [180.0, 1.0], [179.0, 1.0], [179.0, -1.0]]],
                        [[[-180.0, -1.0], [-179.0, -1.0], [-179.0, 1.0], [-180.0, 1.0], [-180.0, -1.0]]],
                    ],
                },
            }
        ),
        encoding="utf-8",
    )

    profile = {
        "comparison_resolution_m": 20000.0,
        "window_m": 40000.0,
        "min_valid_area_fraction": 0.9,
    }
    res = _extract_projected_relief_for_tests(geog_dem, antimeridian_aoi, profile)
    assert abs(res["heightmap_data"]["origin"]["longitude_deg"]) == pytest.approx(180.0, abs=1e-6)
    assert res["heightmap_data"]["origin"]["elevation_m"] == pytest.approx(250.0, abs=1e-3)

    # Reject AOI spanning > 180 degrees even after unwrapping
    wide_aoi = tmp_path / "wide_aoi.geojson"
    wide_aoi.write_text(
        json.dumps(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[-120.0, -1.0], [120.0, -1.0], [120.0, 1.0], [-120.0, 1.0], [-120.0, -1.0]]],
                },
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(TerrainValidationError, match="> 180 degrees"):
        _extract_projected_relief_for_tests(geog_dem, wide_aoi, profile)


def test_west_positive_longitude_domain_validated_before_negation_cr005() -> None:
    # Valid west-positive 0_to_360: 282.5 deg W == -282.5 deg E == +77.5 deg E
    converted = convert_coordinates_to_output_frame(
        {
            "latitude_deg": 0.0,
            "longitude_deg": 282.5,
            "frame": "moon_iau_planetocentric",
            "longitude_domain": "0_to_360",
            "east_positive": False,
            "source_ids": ["lola_src"],
        },
        "moon",
    )
    assert converted["longitude_deg"] == pytest.approx(77.5, abs=1e-9)

    # Negative value under 0_to_360 must raise rather than silently flipping sign before domain check
    with pytest.raises(ManifestValidationError, match="out of declared 0_to_360 domain"):
        convert_coordinates_to_output_frame(
            {
                "latitude_deg": 0.0,
                "longitude_deg": -10.0,
                "frame": "moon_iau_planetocentric",
                "longitude_domain": "0_to_360",
                "east_positive": False,
                "source_ids": ["lola_src"],
            },
            "moon",
        )


def test_scaled_int16_dem_masks_nodata_before_scaling_cr006(tmp_path: pathlib.Path) -> None:
    nx, ny, pix = 50, 50, 5.0
    xs = (np.arange(nx) - nx / 2.0 + 0.5) * pix
    ys = (ny / 2.0 - 0.5 - np.arange(ny)) * pix
    xg, yg = np.meshgrid(xs, ys)
    # Physical elevation values exact at 0.5 m steps: 1000.0 + 0.5 * raw_dn
    raw_dn = np.round((0.1 * xg + 0.05 * yg) / 0.5).astype(np.int16)
    physical_z = 1000.0 + 0.5 * raw_dn.astype(np.float32)

    crs_proj4 = "+proj=aeqd +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=6378137 +b=6356752.314245179 +units=m +no_defs"
    transform = from_origin(-0.5 * nx * pix, 0.5 * ny * pix, pix, pix)

    # Set one corner to nodata (raw_dn=-32768) outside central AOI window so coverage stays >= 0.9
    raw_dn[0, 0] = -32768
    physical_z[0, 0] = -9999.0

    scaled_dem = tmp_path / "scaled_int16.tif"
    with rasterio.open(
        scaled_dem,
        "w",
        driver="GTiff",
        height=ny,
        width=nx,
        count=1,
        dtype="int16",
        crs=crs_proj4,
        transform=transform,
        nodata=-32768,
    ) as dst:
        dst.scales = (0.5,)
        dst.offsets = (1000.0,)
        dst.units = ("m",)
        dst.write(raw_dn, 1)

    unscaled_dem = tmp_path / "unscaled_f32.tif"
    _write_test_geotiff(unscaled_dem, physical_z, pixel_size_m=pix, crs_proj4=crs_proj4, nodata=-9999.0)

    aoi_path = tmp_path / "aoi.geojson"
    _write_test_aoi(aoi_path, half_deg=0.002)
    profile = {"comparison_resolution_m": 10.0, "window_m": 100.0, "min_valid_area_fraction": 0.9}

    res_scaled = _extract_projected_relief_for_tests(scaled_dem, aoi_path, profile)
    res_unscaled = _extract_projected_relief_for_tests(unscaled_dem, aoi_path, profile)
    for k in ("slope_mean_deg", "slope_max_deg", "roughness_index", "elevation_delta_m"):
        assert res_scaled["features"][k]["value"] == pytest.approx(
            res_unscaled["features"][k]["value"], abs=1e-6
        )
    assert res_scaled["heightmap_data"]["origin"]["elevation_m"] == pytest.approx(
        res_unscaled["heightmap_data"]["origin"]["elevation_m"], abs=1e-3
    )


def test_bounded_allocations_and_streaming_atomic_copy_sec004(
    tmp_path: pathlib.Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import pae_pipeline.terrain as terrain_mod
    from pae_pipeline.export import atomic_copy_file

    nx, ny, pix = 40, 40, 5.0
    dem_path = tmp_path / "dem.tif"
    _write_test_geotiff(dem_path, np.full((ny, nx), 100.0, dtype=np.float32), pixel_size_m=pix)
    aoi_path = tmp_path / "aoi.geojson"
    _write_test_aoi(aoi_path, half_deg=0.002)

    # Grid node quota guard triggers before grid allocation
    with pytest.raises(TerrainValidationError, match="MAX_OUTPUT_GRID_NODES"):
        _extract_projected_relief_for_tests(
            dem_path,
            aoi_path,
            {"comparison_resolution_m": 1.0, "window_m": 2500.0, "min_valid_area_fraction": 0.9},
        )

    # Read window pixel quota guard triggers before rasterio.read
    monkeypatch.setattr(terrain_mod, "MAX_READ_WINDOW_PIXELS", 25)
    with pytest.raises(TerrainValidationError, match="MAX_READ_WINDOW_PIXELS"):
        _extract_projected_relief_for_tests(
            dem_path,
            aoi_path,
            {"comparison_resolution_m": 10.0, "window_m": 100.0, "min_valid_area_fraction": 0.9},
        )

    # Streaming atomic_copy_file copies >2 MiB cleanly across small chunks with exact SHA-256
    src_bin = tmp_path / "large.bin"
    payload = b"PAE_STREAM_CHUNK_" * 80_000
    expected_sha, expected_bytes = atomic_write_bytes(src_bin, payload)
    dst_bin = tmp_path / "nested" / "copied.bin"
    copied_sha, copied_bytes = atomic_copy_file(src_bin, dst_bin, chunk_size=4096)
    assert copied_sha == expected_sha
    assert copied_bytes == expected_bytes
    assert sha256_file(dst_bin) == expected_sha


def test_splat_and_ply_binary_header_validation_sec005(tmp_path: pathlib.Path) -> None:
    import struct

    pub_root = tmp_path / "web-client" / "public"
    pub_root.mkdir(parents=True)
    raw_src = tmp_path / "data" / "splat_src.txt"
    raw_src.parent.mkdir(parents=True)
    src_sha, _ = atomic_write_bytes(raw_src, b"splat provenance")

    aoi_path = pub_root / "assets" / "aoi" / "site.geojson"
    aoi_path.parent.mkdir(parents=True)
    _write_test_aoi(aoi_path, half_deg=0.002)

    splat_dir = pub_root / "assets" / "splats"
    splat_dir.mkdir(parents=True)

    def _base_dataset(splat_asset_path: str, splat_sha: str, splat_bytes: int, fmt: str, g_count: int) -> dict[str, object]:
        feats = {
            k: {
                "value": 5.0 if k == "slope_mean_deg" else None,
                "unit": "1" if k in {"roughness_index", "aridity_index", "albedo"} else ("m" if k == "elevation_delta_m" else ("kWh/m2/day" if k == "solar_irradiance_kwh_m2" else ("degC" if "temp" in k else "deg"))),
                "quantity": f"q_{k}",
                "method": "m",
                "spatial_resolution_m": None,
                "support_window_m": None,
                "period": None,
                "source_ids": ["s1"] if k == "slope_mean_deg" else [],
                "missing_reason": None if k == "slope_mean_deg" else "omitted",
            }
            for k in (
                "slope_mean_deg",
                "slope_max_deg",
                "roughness_index",
                "elevation_delta_m",
                "temp_min_c",
                "temp_max_c",
                "solar_irradiance_kwh_m2",
                "aridity_index",
                "albedo",
            )
        }
        return {
            "schema_version": "1.0.0",
            "generated_at": "2026-01-01T00:00:00Z",
            "sources": [
                {
                    "id": "s1",
                    "provider": "Test",
                    "product_id": "P1",
                    "product_url": "https://example.org/p1",
                    "mission": None,
                    "access_url": "https://example.org/p1.bin",
                    "retrieved_at": "2026-01-01T00:00:00Z",
                    "sha256": src_sha,
                    "license": "CC0-1.0",
                    "local_path": "data/splat_src.txt",
                }
            ],
            "profiles": [
                {
                    "id": "topo",
                    "version": "1.0.0",
                    "algorithm": "weighted_cosine_euclidean_v1",
                    "alpha": 0.5,
                    "comparison_resolution_m": 10.0,
                    "window_m": 100.0,
                    "min_valid_area_fraction": 0.9,
                    "features": [
                        {
                            "key": "slope_mean_deg",
                            "unit": "deg",
                            "quantity": "q_slope_mean_deg",
                            "weight": 1.0,
                            "lower": 0.0,
                            "upper": 45.0,
                            "calibration_source_ids": ["s1"],
                            "calibration_method": "fixture",
                        }
                    ],
                }
            ],
            "comparisons": [
                {
                    "profile_id": "topo",
                    "target": {
                        "id": "site_splat",
                        "name": "Site Splat",
                        "body": "moon",
                        "coordinates": {"latitude_deg": 0.0, "longitude_deg": 0.0, "frame": "moon_iau_planetocentric", "source_ids": ["s1"]},
                        "aoi": {"local_path": "/assets/aoi/site.geojson", "source_ids": ["s1"]},
                        "missions": [],
                        "features": feats,
                        "geology": {"classes": [], "method": "none", "source_ids": [], "missing_reason": "omitted"},
                        "assets": {
                            "dem": None,
                            "heightmap": None,
                            "splat": {
                                "asset": {"path": splat_asset_path, "sha256": splat_sha, "bytes": splat_bytes, "source_ids": ["s1"]},
                                "format": fmt,
                                "gaussian_count": g_count,
                                "world_from_asset": [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0],
                                "scale_is_metric": False,
                                "reconstruction_method": "isolated synthetic binary validation fixture",
                                "geometry_provenance": "inferred",
                            },
                        },
                        "camera": None,
                    },
                    "analogs": [],
                    "excluded": [],
                }
            ],
        }

    # Valid .splat (2 records * 32B = 64B)
    rec = struct.pack("<ffffffBBBBBBBB", 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 255, 255, 255, 255, 255, 128, 128, 128)
    valid_splat = splat_dir / "valid.splat"
    s_sha, s_bytes = atomic_write_bytes(valid_splat, rec * 2)
    validate_dataset(_base_dataset("/assets/splats/valid.splat", s_sha, s_bytes, "splat", 2), SCHEMA_PATH, pub_root, require_demo_ready=False, repo_root=tmp_path)

    # Wrong size .splat rejected
    bad_splat = splat_dir / "bad.splat"
    bs_sha, bs_bytes = atomic_write_bytes(bad_splat, rec)
    with pytest.raises(DatasetValidationError, match="gaussian_count\\*32"):
        validate_dataset(_base_dataset("/assets/splats/bad.splat", bs_sha, bs_bytes, "splat", 2), SCHEMA_PATH, pub_root, require_demo_ready=False, repo_root=tmp_path)

    # Valid binary_little_endian Gaussian .ply
    ply_hdr = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        "element vertex 1\n"
        "property float x\nproperty float y\nproperty float z\n"
        "property float opacity\nproperty float scale_0\nproperty float rot_0\n"
        "end_header\n"
    ).encode("ascii")
    ply_body = struct.pack("<6f", 0.0, 0.0, 0.0, 0.5, 1.0, 1.0)
    valid_ply = splat_dir / "valid.ply"
    p_sha, p_bytes = atomic_write_bytes(valid_ply, ply_hdr + ply_body)
    validate_dataset(_base_dataset("/assets/splats/valid.ply", p_sha, p_bytes, "ply", 1), SCHEMA_PATH, pub_root, require_demo_ready=False, repo_root=tmp_path)

    # PLY missing Gaussian properties rejected
    bad_ply_bytes = b"ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty float x\nend_header\n" + struct.pack("<f", 0.0)
    bad_ply = splat_dir / "missing_props.ply"
    bp_sha, bp_bytes = atomic_write_bytes(bad_ply, bad_ply_bytes)
    with pytest.raises(DatasetValidationError, match="missing Gaussian splat properties"):
        validate_dataset(_base_dataset("/assets/splats/missing_props.ply", bp_sha, bp_bytes, "ply", 1), SCHEMA_PATH, pub_root, require_demo_ready=False, repo_root=tmp_path)

