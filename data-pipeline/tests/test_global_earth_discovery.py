import json
from pathlib import Path
import sys

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin


PIPELINE = Path(__file__).resolve().parents[1]
ROOT = PIPELINE.parent
sys.path.insert(0, str(PIPELINE))

from global_earth_discovery import REGIONS, domain_grid, region_crs, required_tile_keys  # noqa: E402


EXPECTED_CRS = {
    "atacama": "EPSG:32719",
    "rio-tinto": "EPSG:32629",
    "haughton": "EPSG:32616",
    "hawaii": "EPSG:32605",
    "lanzarote": "EPSG:32628",
    "pilbara": "EPSG:32750",
    "dry-valleys": "EPSG:32757",
}


def test_region_hemispheres_use_the_expected_local_utm_crs():
    assert {
        region["id"]: region_crs(region["latitude"], region["longitude"])
        for region in REGIONS
    } == EXPECTED_CRS


def test_each_fixed_extent_is_covered_by_one_copernicus_tile():
    assert {region["id"]: required_tile_keys(region) for region in REGIONS} == {
        "atacama": ["S25_00_W070_00"],
        "rio-tinto": ["N37_00_W007_00"],
        "haughton": ["N75_00_W090_00"],
        "hawaii": ["N19_00_W156_00"],
        "lanzarote": ["N29_00_W014_00"],
        "pilbara": ["S22_00_E119_00"],
        "dry-valleys": ["S78_00_E160_00"],
    }


def test_missing_water_mask_is_never_treated_as_land(tmp_path):
    with pytest.raises(FileNotFoundError, match="water body mask"):
        domain_grid(
            [tmp_path / "dem.tif"],
            [tmp_path / "missing-water.tif"],
            from_origin(0, 6_000, 60, 60),
            "EPSG:32631",
        )


def test_unknown_water_pixels_are_incomplete_coverage(tmp_path):
    transform = from_origin(500_000, 6_000, 60, 60)
    profile = {
        "driver": "GTiff",
        "width": 100,
        "height": 100,
        "count": 1,
        "crs": "EPSG:32631",
        "transform": transform,
    }
    dem_path = tmp_path / "dem.tif"
    water_path = tmp_path / "water.tif"
    with rasterio.open(dem_path, "w", dtype="float32", **profile) as destination:
        destination.write(np.ones((100, 100), dtype=np.float32), 1)
    water_values = np.zeros((100, 100), dtype=np.uint8)
    water_values[:10, :10] = 255
    with rasterio.open(water_path, "w", dtype="uint8", **profile) as destination:
        destination.write(water_values, 1)

    _, complete, water = domain_grid([dem_path], [water_path], transform, "EPSG:32631")

    assert complete.sum() == 9_900
    assert not complete[:10, :10].any()
    assert not water.any()


def test_exported_regions_have_100_windows_and_region_local_ranks():
    target_ids = {"moon-shackleton-lola-600m", "mars-jezero-hirise-600m"}
    for region in REGIONS:
        path = ROOT / "web-client/public/data/earth-regions" / f"{region['id']}.json"
        assert path.exists(), f"Run global_earth_discovery.py first: {path}"
        data = json.loads(path.read_text())
        domain = data["domain"]
        assert data["schema_version"] == "1.0.0"
        assert domain["generated_count"] == 100
        assert domain["eligible_count"] == len(data["candidates"])
        assert domain["eligible_count"] + domain["excluded_count"] == 100
        assert sum(domain["exclusion_reasons"].values()) == domain["excluded_count"]
        assert domain["crs"] == EXPECTED_CRS[region["id"]]
        assert {target["id"] for target in data["targets"]} == target_ids
        assert all(candidate["novelty"] == "unresolved" for candidate in data["candidates"])
        assert all(len(candidate["heights_m"]) == 100 for candidate in data["candidates"])
        for target_id in target_ids:
            ranks = sorted(candidate["comparisons"][target_id]["rank"] for candidate in data["candidates"])
            sensitivity_ranks = sorted(
                candidate["comparisons"][target_id]["sensitivity_rank"] for candidate in data["candidates"]
            )
            assert ranks == list(range(1, domain["eligible_count"] + 1))
            assert sensitivity_ranks == ranks
