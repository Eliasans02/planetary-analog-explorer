# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Offline-mode tests monkeypatching all HTTP/network entry points to raise."""

from __future__ import annotations

import json
import pathlib
import socket
import sys
import urllib.request

import numpy as np
import pytest
import rasterio
import requests
from rasterio.transform import from_origin

PIPELINE_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

import fetch_and_score  # noqa: E402
from pae_pipeline.export import atomic_write_bytes, atomic_write_json, sha256_file  # noqa: E402
from pae_pipeline.sources import (  # noqa: E402
    OfflineCacheMissError,
    SourceVerificationError,
    UnsupportedUnitError,
    _power_cache_key,
    _build_power_url,
    fetch_power,
)

SCHEMA_PATH = PIPELINE_ROOT / "schemas" / "analog_location.schema.json"


@pytest.fixture
def block_all_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def _deny(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("Network access attempted during offline test")

    monkeypatch.setattr(requests, "get", _deny)
    monkeypatch.setattr(requests, "post", _deny)
    monkeypatch.setattr(requests, "request", _deny)
    monkeypatch.setattr(requests.Session, "get", _deny)
    monkeypatch.setattr(requests.Session, "request", _deny)
    monkeypatch.setattr(urllib.request, "urlopen", _deny)
    monkeypatch.setattr(socket, "create_connection", _deny)


def _seed_power_cache(
    cache_dir: pathlib.Path,
    *,
    lat: float,
    lon: float,
    start: str,
    end: str,
    sw_unit: str = "MJ/m^2/day",
    sw_values: dict[str, float] | None = None,
) -> pathlib.Path:
    power_dir = cache_dir / "power"
    power_dir.mkdir(parents=True, exist_ok=True)
    key = _power_cache_key(lat, lon, start, end)
    data_path = power_dir / f"power_{key}.json"
    meta_path = power_dir / f"power_{key}.meta.json"

    sw_series = sw_values or {"20250101": 18.0, "20250102": -999.0}
    payload = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat, 1200.0]},
        "header": {
            "fill_value": -999.0,
            "api": {"version": "v2.5.14"},
        },
        "parameters": {
            "T2M_MIN": {"units": "C"},
            "T2M_MAX": {"units": "C"},
            "ALLSKY_SFC_SW_DWN": {"units": sw_unit},
            "RH2M": {"units": "%"},
        },
        "properties": {
            "parameter": {
                "T2M_MIN": {"20250101": -5.0, "20250102": -999.0},
                "T2M_MAX": {"20250101": 15.0, "20250102": 18.0},
                "ALLSKY_SFC_SW_DWN": sw_series,
                "RH2M": {"20250101": 22.0, "20250102": 24.0},
            }
        },
    }
    raw_bytes = json.dumps(payload).encode("utf-8")
    sha, _ = atomic_write_bytes(data_path, raw_bytes)
    atomic_write_json(
        meta_path,
        {
            "query_url": _build_power_url(lat, lon, start, end),
            "sha256": sha,
            "retrieved_at": "2026-01-10T00:00:00Z",
            "api_version": "v2.5.14",
            "start": start,
            "end": end,
            "latitude_deg": lat,
            "longitude_deg": lon,
        },
    )
    return data_path


def test_offline_power_cache_hit_and_mj_conversion(
    tmp_path: pathlib.Path, block_all_network: None
) -> None:
    cache_dir = tmp_path / "cache"
    _seed_power_cache(
        cache_dir,
        lat=-23.5,
        lon=-68.25,
        start="20250101",
        end="20250102",
        sw_unit="MJ/m^2/day",
        sw_values={"20250101": 18.0, "20250102": -999.0},
    )
    res = fetch_power(-23.5, -68.25, "20250101", "20250102", cache_dir, offline=True)
    assert res["temp_min_c"] == -5.0
    assert res["temp_max_c"] == 18.0
    # 18.0 MJ/m2/day / 3.6 == 5.0 kWh/m2/day; -999 fill_value ignored
    assert res["solar_irradiance_kwh_m2"] == pytest.approx(5.0)
    assert res["solar_conversion_method"] == "converted_mj_m2_day_div_3.6"
    assert res["contextual_metadata"]["RH2M_mean_pct"] == pytest.approx(23.0)


def test_offline_power_unknown_unit_and_cache_miss_and_tamper(
    tmp_path: pathlib.Path, block_all_network: None
) -> None:
    cache_dir = tmp_path / "cache"
    with pytest.raises(OfflineCacheMissError):
        fetch_power(10.0, 20.0, "20250101", "20250102", cache_dir, offline=True)

    # Unknown radiation unit fails loudly
    bad_unit_cache = tmp_path / "cache_bad_unit"
    _seed_power_cache(
        bad_unit_cache,
        lat=10.0,
        lon=20.0,
        start="20250101",
        end="20250102",
        sw_unit="BTU/ft2/day",
    )
    with pytest.raises(UnsupportedUnitError):
        fetch_power(10.0, 20.0, "20250101", "20250102", bad_unit_cache, offline=True)

    # Tampered cache file fails SHA-256 check
    tamper_cache = tmp_path / "cache_tamper"
    data_path = _seed_power_cache(
        tamper_cache,
        lat=12.0,
        lon=22.0,
        start="20250101",
        end="20250102",
    )
    data_path.write_bytes(b"{}")
    with pytest.raises(SourceVerificationError):
        fetch_power(12.0, 22.0, "20250101", "20250102", tamper_cache, offline=True)


@pytest.mark.parametrize("mode", ["prepare", "offline"])
@pytest.mark.parametrize("prior_output", [False, True])
@pytest.mark.parametrize("require_demo_ready", [False, True])
def test_contract_blocked_pipeline_cannot_publish_or_overwrite(
    tmp_path: pathlib.Path,
    block_all_network: None,
    capsys: pytest.CaptureFixture[str],
    mode: str,
    prior_output: bool,
    require_demo_ready: bool,
) -> None:
    # Build a self-contained offline test workspace with 1 Moon target + 1 Earth analog
    raw_dir = tmp_path / "raw_inputs"
    raw_dir.mkdir(parents=True)
    pub_data = tmp_path / "web-client" / "public" / "data" / "locations_dataset.json"

    def _create_site_files(site_id: str, crs_proj4: str, slope_x: float, slope_y: float) -> tuple[str, str, str, str, str, str]:
        nx, ny, pix = 40, 40, 5.0
        xs = (np.arange(nx) - nx / 2.0 + 0.5) * pix
        ys = (ny / 2.0 - 0.5 - np.arange(ny)) * pix
        xg, yg = np.meshgrid(xs, ys)
        z = 500.0 + slope_x * xg + slope_y * yg

        dem_file = raw_dir / f"{site_id}_dem.tif"
        half_w = 0.5 * nx * pix
        half_h = 0.5 * ny * pix
        with rasterio.open(
            dem_file,
            "w",
            driver="GTiff",
            height=ny,
            width=nx,
            count=1,
            dtype="float32",
            crs=crs_proj4,
            transform=from_origin(-half_w, half_h, pix, pix),
            nodata=-9999.0,
        ) as dst:
            dst.write(z.astype(np.float32), 1)
            dst.units = ("m",)

        lbl_file = raw_dir / f"{site_id}_dem.lbl"
        lbl_file.write_text(f"OBJECT = IMAGE\nSITE = {site_id}\nEND\n", encoding="utf-8")

        aoi_file = raw_dir / f"{site_id}_aoi.geojson"
        d = 0.01
        aoi_file.write_text(
            json.dumps(
                {
                    "type": "Feature",
                    "properties": {"id": site_id},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[-d, -d], [d, -d], [d, d], [-d, d], [-d, -d]]],
                    },
                }
            ),
            encoding="utf-8",
        )
        return (
            f"raw_inputs/{site_id}_dem.tif",
            sha256_file(dem_file),
            f"raw_inputs/{site_id}_dem.lbl",
            sha256_file(lbl_file),
            f"raw_inputs/{site_id}_aoi.geojson",
            sha256_file(aoi_file),
        )

    moon_crs = "+proj=aeqd +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs"
    earth_crs = "+proj=aeqd +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=6378137 +b=6356752.314245179 +units=m +no_defs"

    m_dem, m_dem_sha, m_lbl, m_lbl_sha, m_aoi, m_aoi_sha = _create_site_files(
        "moon_target_1", moon_crs, 0.12, 0.04
    )
    e_dem, e_dem_sha, e_lbl, e_lbl_sha, e_aoi, e_aoi_sha = _create_site_files(
        "earth_analog_1", earth_crs, 0.10, 0.05
    )

    manifest = {
        "schema_version": "1.0.0",
        "sites": [
            {
                "id": "moon_target_1",
                "name": "Shackleton Study Window",
                "body": "moon",
                "missions": ["LRO"],
                "coordinates": {
                    "latitude_deg": 0.0,
                    "longitude_deg": 0.0,
                    "frame": "moon_iau_planetocentric",
                    "source_ids": ["src_moon_dem"],
                },
                "aoi": {
                    "local_path": m_aoi,
                    "sha256": m_aoi_sha,
                    "access_url": "https://example.org/moon_aoi.geojson",
                    "frame": "moon_iau_planetocentric",
                    "source_ids": ["src_moon_aoi"],
                },
                "dem": {
                    "local_path": m_dem,
                    "sha256": m_dem_sha,
                    "vertical_datum": "Moon LOLA 1737400 m sphere",
                    "vertical_units": "m",
                    "label_path": m_lbl,
                    "label_sha256": m_lbl_sha,
                    "source_ids": ["src_moon_dem"],
                },
                "sources": [
                    {
                        "id": "src_moon_dem",
                        "provider": "TestPDS",
                        "product_id": "MOON_DEM_TEST",
                        "product_url": "https://example.org/moon_dem",
                        "mission": "LRO",
                        "access_url": "https://example.org/moon_dem.tif",
                        "retrieved_at": "2026-01-01T00:00:00Z",
                        "sha256": m_dem_sha,
                        "license": "NASA Open Data",
                        "local_path": m_dem,
                        "sidecar_path": m_lbl,
                        "sidecar_sha256": m_lbl_sha,
                    },
                    {
                        "id": "src_moon_aoi",
                        "provider": "TestAOI",
                        "product_id": "MOON_AOI_TEST",
                        "product_url": "https://example.org/moon_aoi",
                        "mission": None,
                        "access_url": "https://example.org/moon_aoi.geojson",
                        "retrieved_at": "2026-01-01T00:00:00Z",
                        "sha256": m_aoi_sha,
                        "license": "CC0-1.0",
                        "local_path": m_aoi,
                    },
                ],
            },
            {
                "id": "earth_analog_1",
                "name": "Earth Study Window",
                "body": "earth",
                "missions": ["SRTM"],
                "coordinates": {
                    "latitude_deg": 0.0,
                    "longitude_deg": 0.0,
                    "frame": "earth_wgs84",
                    "source_ids": ["src_earth_dem"],
                },
                "aoi": {
                    "local_path": e_aoi,
                    "sha256": e_aoi_sha,
                    "access_url": "https://example.org/earth_aoi.geojson",
                    "frame": "earth_wgs84",
                    "source_ids": ["src_earth_aoi"],
                },
                "dem": {
                    "local_path": e_dem,
                    "sha256": e_dem_sha,
                    "vertical_datum": "WGS84",
                    "vertical_units": "m",
                    "label_path": e_lbl,
                    "label_sha256": e_lbl_sha,
                    "source_ids": ["src_earth_dem"],
                },
                "sources": [
                    {
                        "id": "src_earth_dem",
                        "provider": "TestEarth",
                        "product_id": "EARTH_DEM_TEST",
                        "product_url": "https://example.org/earth_dem",
                        "mission": "SRTM",
                        "access_url": "https://example.org/earth_dem.tif",
                        "retrieved_at": "2026-01-01T00:00:00Z",
                        "sha256": e_dem_sha,
                        "license": "Public Domain",
                        "local_path": e_dem,
                        "sidecar_path": e_lbl,
                        "sidecar_sha256": e_lbl_sha,
                    },
                    {
                        "id": "src_earth_aoi",
                        "provider": "TestAOI",
                        "product_id": "EARTH_AOI_TEST",
                        "product_url": "https://example.org/earth_aoi",
                        "mission": None,
                        "access_url": "https://example.org/earth_aoi.geojson",
                        "retrieved_at": "2026-01-01T00:00:00Z",
                        "sha256": e_aoi_sha,
                        "license": "CC0-1.0",
                        "local_path": e_aoi,
                    },
                ],
            },
        ],
    }

    profiles = {
        "profiles": [
            {
                "id": "topography_only",
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
                        "quantity": "terrain_slope_mean",
                        "weight": 1.0,
                        "lower": 0.0,
                        "upper": 90.0,
                        "calibration_source_ids": ["src_moon_dem"],
                        "calibration_method": "physical_angle_range",
                    },
                    {
                        "key": "slope_max_deg",
                        "unit": "deg",
                        "quantity": "terrain_slope_max",
                        "weight": 1.0,
                        "lower": 0.0,
                        "upper": 90.0,
                        "calibration_source_ids": ["src_moon_dem"],
                        "calibration_method": "physical_angle_range",
                    },
                    {
                        "key": "roughness_index",
                        "unit": "1",
                        "quantity": "detrended_plane_rms_roughness_over_support_window",
                        "weight": 1.0,
                        "lower": 0.0,
                        "upper": 1.0,
                        "calibration_source_ids": ["src_moon_dem"],
                        "calibration_method": "dimensionless_plane_residual_ratio",
                    },
                    {
                        "key": "elevation_delta_m",
                        "unit": "m",
                        "quantity": "terrain_relief_max_minus_min",
                        "weight": 1.0,
                        "lower": 0.0,
                        "upper": 500.0,
                        "calibration_source_ids": ["src_moon_dem"],
                        "calibration_method": "test_relief_range",
                    },
                ],
            }
        ]
    }

    manifest_path = tmp_path / "manifest.json"
    profiles_path = tmp_path / "profiles.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    profiles_path.write_text(json.dumps(profiles), encoding="utf-8")

    # Valid prior empty dataset plus unrelated published asset must survive exactly.
    public_root = pub_data.parents[1]
    if prior_output:
        pub_data.parent.mkdir(parents=True)
        atomic_write_json(pub_data, {
            "schema_version": "1.0.0", "generated_at": "2026-01-01T00:00:00Z",
            "sources": [], "profiles": [], "comparisons": [],
        })
        retained_asset = public_root / "assets" / "retained.bin"
        retained_asset.parent.mkdir(parents=True)
        retained_asset.write_bytes(b"existing published bytes")
    def snapshot() -> dict[str, bytes]:
        return {str(p.relative_to(public_root)): p.read_bytes()
                for p in public_root.rglob("*") if p.is_file()}
    before = snapshot()
    args = ["--mode", mode, "--manifest", str(manifest_path),
            "--profiles", str(profiles_path), "--output", str(pub_data),
            "--schema", str(SCHEMA_PATH)]
    if require_demo_ready:
        args.append("--require-demo-ready")
    assert fetch_and_score.main(args) == 1
    captured = capsys.readouterr()
    assert "TERRAIN_CONTRACT_BLOCKED" in captured.err
    assert "EXPORTED_VALIDATED" not in captured.out
    assert snapshot() == before
    assert pub_data.exists() == prior_output


def test_geometry_guard_and_unsafe_profile_preserve_existing_output(
    tmp_path: pathlib.Path,
    block_all_network: None,
) -> None:
    raw_dir = tmp_path / "raw_inputs"
    raw_dir.mkdir(parents=True)
    pub_data = tmp_path / "web-client" / "public" / "data" / "locations_dataset.json"

    def _make_site(site_id: str, crs_proj4: str, add_corner_nodata: bool) -> tuple[str, str, str, str, str, str]:
        nx, ny, pix = 40, 40, 5.0
        xs = (np.arange(nx) - nx / 2.0 + 0.5) * pix
        ys = (ny / 2.0 - 0.5 - np.arange(ny)) * pix
        xg, yg = np.meshgrid(xs, ys)
        z = 500.0 + 0.1 * xg + 0.04 * yg
        if add_corner_nodata:
            z[:3, :3] = -9999.0  # different valid_fraction / slope_sample_count while remaining >= 0.90

        dem_file = raw_dir / f"{site_id}_dem.tif"
        with rasterio.open(
            dem_file,
            "w",
            driver="GTiff",
            height=ny,
            width=nx,
            count=1,
            dtype="float32",
            crs=crs_proj4,
            transform=from_origin(-0.5 * nx * pix, 0.5 * ny * pix, pix, pix),
            nodata=-9999.0,
        ) as dst:
            dst.write(z.astype(np.float32), 1)
            dst.units = ("m",)

        lbl_file = raw_dir / f"{site_id}_dem.lbl"
        lbl_file.write_text(f"SITE={site_id}\n", encoding="utf-8")

        aoi_file = raw_dir / f"{site_id}_aoi.geojson"
        d = 0.01
        aoi_file.write_text(
            json.dumps(
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [[[-d, -d], [d, -d], [d, d], [-d, d], [-d, -d]]]},
                }
            ),
            encoding="utf-8",
        )
        return (
            f"raw_inputs/{site_id}_dem.tif",
            sha256_file(dem_file),
            f"raw_inputs/{site_id}_dem.lbl",
            sha256_file(lbl_file),
            f"raw_inputs/{site_id}_aoi.geojson",
            sha256_file(aoi_file),
        )

    moon_crs = "+proj=aeqd +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs"
    earth_crs = "+proj=aeqd +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +a=6378137 +b=6356752.314245179 +units=m +no_defs"
    m_dem, m_dem_sha, m_lbl, m_lbl_sha, m_aoi, m_aoi_sha = _make_site("moon_partial", moon_crs, True)
    e_dem, e_dem_sha, e_lbl, e_lbl_sha, e_aoi, e_aoi_sha = _make_site("earth_full", earth_crs, False)

    manifest = {
        "schema_version": "1.0.0",
        "sites": [
            {
                "id": "moon_partial",
                "name": "Moon Partial",
                "body": "moon",
                "missions": ["LRO"],
                "coordinates": {"latitude_deg": 0.0, "longitude_deg": 0.0, "frame": "moon_iau_planetocentric", "source_ids": ["s_m"]},
                "aoi": {"local_path": m_aoi, "sha256": m_aoi_sha, "access_url": "https://example.org/m_aoi", "frame": "moon_iau_planetocentric", "source_ids": ["s_m"]},
                "dem": {"local_path": m_dem, "sha256": m_dem_sha, "vertical_datum": "LOLA", "vertical_units": "m", "label_path": m_lbl, "label_sha256": m_lbl_sha, "source_ids": ["s_m"]},
                "sources": [{"id": "s_m", "provider": "PDS", "product_id": "M1", "product_url": "https://example.org/m", "mission": "LRO", "access_url": "https://example.org/m.tif", "retrieved_at": "2026-01-01T00:00:00Z", "sha256": m_dem_sha, "license": "NASA Open Data", "local_path": m_dem, "sidecar_path": m_lbl, "sidecar_sha256": m_lbl_sha}],
            },
            {
                "id": "earth_full",
                "name": "Earth Full",
                "body": "earth",
                "missions": ["SRTM"],
                "coordinates": {"latitude_deg": 0.0, "longitude_deg": 0.0, "frame": "earth_wgs84", "source_ids": ["s_e"]},
                "aoi": {"local_path": e_aoi, "sha256": e_aoi_sha, "access_url": "https://example.org/e_aoi", "frame": "earth_wgs84", "source_ids": ["s_e"]},
                "dem": {"local_path": e_dem, "sha256": e_dem_sha, "vertical_datum": "WGS84", "vertical_units": "m", "label_path": e_lbl, "label_sha256": e_lbl_sha, "source_ids": ["s_e"]},
                "sources": [{"id": "s_e", "provider": "NASA", "product_id": "E1", "product_url": "https://example.org/e", "mission": "SRTM", "access_url": "https://example.org/e.tif", "retrieved_at": "2026-01-01T00:00:00Z", "sha256": e_dem_sha, "license": "Public Domain", "local_path": e_dem, "sidecar_path": e_lbl, "sidecar_sha256": e_lbl_sha}],
            },
        ],
    }
    profiles = {
        "profiles": [
            {
                "id": "topography_only",
                "version": "1.0.0",
                "algorithm": "weighted_cosine_euclidean_v1",
                "alpha": 0.5,
                "comparison_resolution_m": 10.0,
                "window_m": 100.0,
                "min_valid_area_fraction": 0.85,
                "features": [
                    {"key": "slope_mean_deg", "unit": "deg", "quantity": "terrain_slope_mean", "weight": 1.0, "lower": 0.0, "upper": 90.0, "calibration_source_ids": ["s_m"], "calibration_method": "fixture"},
                    {"key": "slope_max_deg", "unit": "deg", "quantity": "terrain_slope_max", "weight": 1.0, "lower": 0.0, "upper": 90.0, "calibration_source_ids": ["s_m"], "calibration_method": "fixture"},
                    {"key": "roughness_index", "unit": "1", "quantity": "detrended_plane_rms_roughness_over_support_window", "weight": 1.0, "lower": 0.0, "upper": 1.0, "calibration_source_ids": ["s_m"], "calibration_method": "fixture"},
                    {"key": "elevation_delta_m", "unit": "m", "quantity": "terrain_relief_max_minus_min", "weight": 1.0, "lower": 0.0, "upper": 500.0, "calibration_source_ids": ["s_m"], "calibration_method": "fixture"},
                ],
            }
        ]
    }
    manifest_path = tmp_path / "manifest.json"
    profiles_path = tmp_path / "profiles.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    profiles_path.write_text(json.dumps(profiles), encoding="utf-8")

    pub_data.parent.mkdir(parents=True)
    pub_data.write_bytes(b"prior output sentinel")
    published_bytes_before = pub_data.read_bytes()
    rc_blocked = fetch_and_score.main(
        ["--mode", "offline", "--manifest", str(manifest_path), "--profiles", str(profiles_path), "--output", str(pub_data), "--schema", str(SCHEMA_PATH), "--require-demo-ready"]
    )
    assert rc_blocked == 1
    assert pub_data.read_bytes() == published_bytes_before

    # Subsequent failing run (unsafe profile traversal id -> SEC-001) leaves previously valid output & assets intact (CR-009)
    bad_profiles = {"profiles": [{**profiles["profiles"][0], "id": "../escape"}]}
    bad_profiles_path = tmp_path / "bad_profiles.json"
    bad_profiles_path.write_text(json.dumps(bad_profiles), encoding="utf-8")
    rc_fail = fetch_and_score.main(
        ["--mode", "offline", "--manifest", str(manifest_path), "--profiles", str(bad_profiles_path), "--output", str(pub_data), "--schema", str(SCHEMA_PATH), "--require-demo-ready"]
    )
    assert rc_fail != 0
    assert pub_data.read_bytes() == published_bytes_before
    assert not (tmp_path / "web-client" / "public" / "escape").exists()


def test_offline_power_zero_mkdir_and_exact_coordinate_isolation_cr008(
    tmp_path: pathlib.Path, block_all_network: None
) -> None:
    # Offline cache miss must not create cache_dir/power
    empty_cache = tmp_path / "never_created_cache"
    with pytest.raises(OfflineCacheMissError):
        fetch_power(10.0, 20.0, "20250101", "20250102", empty_cache, offline=True)
    assert not (empty_cache / "power").exists()

    # Exact-coordinate cache isolation: nearby point in same coarse cell must NOT reuse other point's cache
    isolated_cache = tmp_path / "isolated_cache"
    _seed_power_cache(isolated_cache, lat=10.10, lon=20.10, start="20250101", end="20250102")
    with pytest.raises(OfflineCacheMissError):
        fetch_power(10.12, 20.12, "20250101", "20250102", isolated_cache, offline=True)


def test_https_ssrf_redirect_and_byte_quota_enforcement_cr007_sec002_sec003(
    tmp_path: pathlib.Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from pae_pipeline.sources import (
        DataReadinessError,
        ManifestValidationError,
        ensure_verified_local_file,
        validate_https_url,
    )

    for bad_url in (
        "http://example.org/file.tif",
        "https://user:secret@example.org/file.tif",
        "https://localhost/file.tif",
        "https://127.0.0.1/file.tif",
        "https://169.254.169.254/latest/meta-data",
        "https://10.0.0.1/internal",
    ):
        with pytest.raises(ManifestValidationError):
            validate_https_url(bad_url)

    # Unsafe redirect target must abort BEFORE requesting the redirect destination
    requested_urls: list[str] = []

    class _FakeResp:
        def __init__(self, status_code: int, headers: dict[str, str], chunks: list[bytes], url: str) -> None:
            self.status_code = status_code
            self.headers = headers
            self._chunks = chunks
            self.url = url

        def iter_content(self, chunk_size: int = 65536):
            for ch in self._chunks:
                yield ch

        def raise_for_status(self) -> None:
            if self.status_code >= 400:
                raise requests.HTTPError(f"HTTP {self.status_code}")

        def close(self) -> None:
            pass

    def _redirect_to_loopback(self, url: str, **kwargs: object) -> _FakeResp:
        assert kwargs.get("allow_redirects") is False
        requested_urls.append(url)
        return _FakeResp(302, {"Location": "http://127.0.0.1/secret"}, [], url)

    monkeypatch.setattr(requests.Session, "get", _redirect_to_loopback)
    with pytest.raises(ManifestValidationError, match="https://"):
        ensure_verified_local_file(
            local_path="data/test.bin",
            expected_sha256="a" * 64,
            access_url="https://example.org/file.bin",
            repo_root=tmp_path,
            offline=False,
        )
    assert requested_urls == ["https://example.org/file.bin"]

    # Stream byte quota aborts oversized download before writing final destination
    def _oversized_stream(self, url: str, **kwargs: object) -> _FakeResp:
        return _FakeResp(200, {}, [b"X" * 64, b"Y" * 64], url)

    monkeypatch.setattr(requests.Session, "get", _oversized_stream)
    with pytest.raises(SourceVerificationError, match="byte quota"):
        ensure_verified_local_file(
            local_path="data/huge.bin",
            expected_sha256="a" * 64,
            access_url="https://example.org/huge.bin",
            repo_root=tmp_path,
            offline=False,
            max_bytes=100,
        )
    assert not (tmp_path / "data" / "huge.bin").exists()

    # Error message sanitizer strips query/userinfo secrets if POWER fails
    def _oversized_power(self, url: str, **kwargs: object) -> _FakeResp:
        return _FakeResp(200, {"Content-Length": "99999999"}, [b"{}"], url)

    monkeypatch.setattr(requests.Session, "get", _oversized_power)
    monkeypatch.setattr("pae_pipeline.sources.time.sleep", lambda _s: None)
    with pytest.raises(DataReadinessError, match="byte quota"):
        fetch_power(
            -23.5,
            -68.25,
            "20250101",
            "20250102",
            tmp_path / "cache_quota",
            offline=False,
            max_bytes=100,
        )

