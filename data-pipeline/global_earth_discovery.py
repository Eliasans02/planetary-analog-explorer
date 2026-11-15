"""Build bounded terrain-comparison datasets for seven Earth analog regions."""
from __future__ import annotations

import datetime as dt
from concurrent.futures import ThreadPoolExecutor
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

from earth_discovery import (
    add_comparisons,
    load_targets,
    polygon,
    receipt_for,
    source_record,
)
from earth_discovery_core import canonical_hash, relative_heights, sha256, terrain_metrics


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data-pipeline/cache/raw/global-earth"
OUTPUT = ROOT / "web-client/public/data/earth-regions"
EVIDENCE = ROOT / "evidence/global_earth"
S3_ROOT = "https://copernicus-dem-30m.s3.amazonaws.com"

REGIONS = [
    {
        "id": "atacama",
        "name": "Yungay Salar, Atacama",
        "country": "Chile",
        "latitude": -24.08679,
        "longitude": -69.91321,
        "anchor_context": "Yungay Salar literature-context anchor",
    },
    {
        "id": "rio-tinto",
        "name": "Peña de Hierro, Rio Tinto",
        "country": "Spain",
        "latitude": 37.725275,
        "longitude": -6.5597,
        "anchor_context": "Peña de Hierro literature-context anchor",
    },
    {
        "id": "haughton",
        "name": "Rhinoceros Creek, Haughton",
        "country": "Canada",
        "latitude": 75.415,
        "longitude": -89.635,
        "anchor_context": "Rhinoceros Creek literature-context anchor",
    },
    {
        "id": "hawaii",
        "name": "Mauna Ulu regional anchor",
        "country": "United States",
        "latitude": 19.367,
        "longitude": -155.201,
        "anchor_context": "Mauna Ulu regional literature-context anchor",
    },
    {
        "id": "lanzarote",
        "name": "La Corona system anchor",
        "country": "Spain",
        "latitude": 29.184656,
        "longitude": -13.483496,
        "anchor_context": "La Corona system literature-context anchor",
    },
    {
        "id": "pilbara",
        "name": "Strelley Pool formation anchor",
        "country": "Australia",
        "latitude": -21.11094,
        "longitude": 119.13709,
        "anchor_context": "Strelley Pool formation literature-context anchor",
    },
    {
        "id": "dry-valleys",
        "name": "University Valley regional anchor",
        "country": "Antarctica",
        "latitude": -77.861133,
        "longitude": 160.712267,
        "anchor_context": "University Valley regional literature-context anchor",
    },
]

COPERNICUS_LICENSE = (
    "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and "
    "© Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS "
    "by the European Union and ESA; all rights reserved."
)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def region_crs(latitude: float, longitude: float) -> str:
    zone = int((longitude + 180) // 6) + 1
    zone = min(max(zone, 1), 60)
    base = 32700 if latitude < 0 else 32600
    return f"EPSG:{base + zone}"


def tile_key(latitude: float, longitude: float) -> str:
    south = math.floor(latitude)
    west = math.floor(longitude)
    latitude_token = f"{'N' if south >= 0 else 'S'}{abs(south):02d}"
    longitude_token = f"{'E' if west >= 0 else 'W'}{abs(west):03d}"
    return f"{latitude_token}_00_{longitude_token}_00"


def domain_geometry(region: dict) -> tuple[str, object, tuple[float, float]]:
    crs = region_crs(region["latitude"], region["longitude"])
    to_utm = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    center = to_utm.transform(region["longitude"], region["latitude"])
    transform = from_origin(center[0] - 3_000, center[1] + 3_000, 60, 60)
    return crs, transform, center


def required_tile_keys(region: dict) -> list[str]:
    crs, _, center = domain_geometry(region)
    to_wgs84 = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    offsets = np.linspace(-3_000, 3_000, 13)
    perimeter = []
    for offset in offsets:
        perimeter.extend(
            [
                (center[0] + offset, center[1] - 3_000),
                (center[0] + offset, center[1] + 3_000),
                (center[0] - 3_000, center[1] + offset),
                (center[0] + 3_000, center[1] + offset),
            ]
        )
    return sorted({tile_key(lat, lon) for lon, lat in (to_wgs84.transform(x, y) for x, y in perimeter)})


def asset_spec(region_id: str, key: str, kind: str) -> dict:
    base = f"Copernicus_DSM_COG_10_{key}_DEM"
    if kind == "dem":
        filename = f"{base}.tif"
    elif kind == "water":
        filename = f"Copernicus_DSM_COG_10_{key}_WBM.tif"
    else:
        raise ValueError(f"Unknown asset kind: {kind}")
    suffix = filename if kind == "dem" else f"AUXFILES/{filename}"
    return {
        "region_id": region_id,
        "tile_key": key,
        "kind": kind,
        "url": f"{S3_ROOT}/{base}/{suffix}",
        "path": RAW / region_id / filename,
    }


def download_assets(specs: list[dict]) -> dict[tuple[str, str, str], dict]:
    def fetch(spec: dict):
        spec["path"].parent.mkdir(parents=True, exist_ok=True)
        return spec, receipt_for(spec["path"], spec["url"])

    receipts = {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        for spec, receipt in pool.map(fetch, specs):
            receipts[(spec["region_id"], spec["tile_key"], spec["kind"])] = receipt
    return receipts


def domain_grid(
    dem_paths: list[Path],
    water_paths: list[Path],
    transform,
    crs: str,
):
    if not water_paths or any(not path.exists() for path in water_paths):
        raise FileNotFoundError("Every required Copernicus DEM tile needs a water body mask")
    if len(dem_paths) != len(water_paths) or any(not path.exists() for path in dem_paths):
        raise FileNotFoundError("Every required Copernicus tile needs both DEM and water assets")

    shape = (100, 100)
    values = np.full(shape, np.nan, dtype=np.float64)
    coverage = np.zeros(shape, dtype=np.float32)
    water = np.zeros(shape, dtype=np.uint8)
    water_coverage = np.zeros(shape, dtype=np.float32)

    for dem_path in dem_paths:
        tile_values = np.full(shape, np.nan, dtype=np.float64)
        tile_coverage = np.zeros(shape, dtype=np.float32)
        with rasterio.open(dem_path) as source:
            source_values = source.read(1)
            source_valid = np.isfinite(source_values)
            if source.nodata is not None:
                source_valid &= source_values != source.nodata
            reproject(
                source_values,
                tile_values,
                src_transform=source.transform,
                src_crs=source.crs,
                src_nodata=source.nodata,
                dst_transform=transform,
                dst_crs=crs,
                dst_nodata=np.nan,
                resampling=Resampling.average,
            )
            reproject(
                source_valid.astype(np.float32),
                tile_coverage,
                src_nodata=-1,
                src_transform=source.transform,
                src_crs=source.crs,
                dst_transform=transform,
                dst_crs=crs,
                dst_nodata=0,
                resampling=Resampling.average,
            )
        use_tile = tile_coverage > coverage
        values[use_tile] = tile_values[use_tile]
        coverage[use_tile] = tile_coverage[use_tile]

    for water_path in water_paths:
        tile_water = np.zeros(shape, dtype=np.uint8)
        tile_coverage = np.zeros(shape, dtype=np.float32)
        with rasterio.open(water_path) as source:
            source_values = source.read(1)
            source_known = np.isfinite(source_values) & (source_values != 255)
            if source.nodata is not None:
                source_known &= source_values != source.nodata
            source_water = np.where(source_known, np.where(source_values != 0, 2, 1), 0).astype(np.uint8)
            reproject(
                source_water,
                tile_water,
                src_nodata=255,
                src_transform=source.transform,
                src_crs=source.crs,
                dst_transform=transform,
                dst_crs=crs,
                resampling=Resampling.max,
            )
            reproject(
                source_known.astype(np.float32),
                tile_coverage,
                src_nodata=-1,
                src_transform=source.transform,
                src_crs=source.crs,
                dst_transform=transform,
                dst_crs=crs,
                resampling=Resampling.average,
            )
        water = np.maximum(water, (tile_water > 1).astype(np.uint8))
        water_coverage = np.maximum(water_coverage, tile_coverage)

    complete = np.isclose(coverage, 1.0, atol=1e-6) & np.isclose(water_coverage, 1.0, atol=1e-6)
    return values, complete, water.astype(bool)


def make_candidates(region: dict, values, complete, water, transform, crs: str):
    to_wgs84 = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    candidates = []
    centers = []
    reasons = {"missing_coverage": 0, "water": 0, "nodata": 0}
    for row in range(10):
        for col in range(10):
            row_start, col_start = row * 10, col * 10
            cell_values = values[row_start : row_start + 10, col_start : col_start + 10]
            cell_complete = complete[row_start : row_start + 10, col_start : col_start + 10]
            cell_water = water[row_start : row_start + 10, col_start : col_start + 10]
            if cell_water.any():
                reasons["water"] += 1
                continue
            if not cell_complete.all():
                reasons["missing_coverage"] += 1
                continue
            if not np.isfinite(cell_values).all():
                reasons["nodata"] += 1
                continue

            x0 = transform.c + col * 600
            y1 = transform.f - row * 600
            x1, y0 = x0 + 600, y1 - 600
            center = ((x0 + x1) / 2, (y0 + y1) / 2)
            longitude, latitude = to_wgs84.transform(*center)
            footprint = polygon(to_wgs84, [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)])
            candidates.append(
                {
                    "id": f"{region['id']}-r{row:02d}-c{col:02d}",
                    "name": f"{region['name']} systematic window {row + 1:02d}-{col + 1:02d}",
                    "latitude": round(latitude, 7),
                    "longitude": round(longitude, 7),
                    "footprint": footprint,
                    "metrics": terrain_metrics(cell_values, np.ones((10, 10), dtype=bool)),
                    "heights_m": relative_heights(cell_values),
                    "comparisons": {},
                    "novelty": "unresolved",
                }
            )
            centers.append(center)
    return candidates, centers, reasons


def earth_sources(region: dict, keys: list[str], receipts: dict) -> list[dict]:
    sources = []
    for key in keys:
        dem = asset_spec(region["id"], key, "dem")
        water = asset_spec(region["id"], key, "water")
        key_id = key.replace("_00_", "").replace("_00", "").lower()
        sources.extend(
            [
                source_record(
                    f"copernicus-dem-{key_id}",
                    f"Copernicus DEM GLO-30 {key} DSM",
                    "European Union/ESA",
                    dem["url"],
                    "Earth elevation",
                    receipts[(region["id"], key, "dem")],
                    COPERNICUS_LICENSE,
                ),
                source_record(
                    f"copernicus-wbm-{key_id}",
                    f"Copernicus DEM GLO-30 {key} water body mask",
                    "European Union/ESA",
                    water["url"],
                    "Earth water exclusion",
                    receipts[(region["id"], key, "water")],
                    COPERNICUS_LICENSE,
                ),
            ]
        )
    return sources


def profile_for(region: dict, crs: str, keys: list[str]) -> dict:
    return {
        "profile_version": "global-earth-discovery-1.0.1",
        "region_id": region["id"],
        "domain_center_wgs84": [region["longitude"], region["latitude"]],
        "domain_crs": crs,
        "domain_size_m": 6_000,
        "candidate_window_m": 600,
        "candidate_step_m": 600,
        "analysis_spacing_m": 60,
        "analysis_grid": [10, 10],
        "slope_bins_deg": [0, 5, 10, 20, 30, 90],
        "distance_weights": [0.7, 0.3],
        "sensitivity_weights": [0.5, 0.5],
        "shortlist_count": 12,
        "shortlist_separation_m": 1_800,
        "required_copernicus_tiles": keys,
        "earth_mask": "exclude any nonzero WBM, source nodata, nonfinite, or incomplete coverage",
    }


def build_region(region: dict, targets: list[dict], target_sources: list[dict], receipts: dict) -> dict:
    keys = required_tile_keys(region)
    crs, transform, _ = domain_geometry(region)
    dem_paths = [asset_spec(region["id"], key, "dem")["path"] for key in keys]
    water_paths = [asset_spec(region["id"], key, "water")["path"] for key in keys]
    values, complete, water = domain_grid(dem_paths, water_paths, transform, crs)
    candidates, centers, reasons = make_candidates(region, values, complete, water, transform, crs)
    add_comparisons(candidates, centers, targets)

    to_wgs84 = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    left, top = transform.c, transform.f
    footprint = polygon(
        to_wgs84,
        [(left, top - 6_000), (left + 6_000, top - 6_000), (left + 6_000, top), (left, top), (left, top - 6_000)],
    )
    sources = earth_sources(region, keys, receipts) + target_sources
    source_hashes = {source["id"]: source["sha256"] for source in sources}
    profile = profile_for(region, crs, keys)
    profile_hash = canonical_hash(profile)
    run_hash = canonical_hash({"profile": profile_hash, "sources": source_hashes})
    earth_receipts = [receipts[(region["id"], key, kind)] for key in keys for kind in ("dem", "water")]

    result = {
        "schema_version": "1.0.0",
        "run_id": f"earth-discovery-{region['id']}-{run_hash[:16]}",
        "generated_at": max(receipt["retrieved_at"] for receipt in earth_receipts),
        "method": {
            "name": "Bounded systematic regional Earth terrain comparison",
            "description": "A predeclared 10 by 10 non-overlapping window census. Copernicus DSM and water-mask samples are area-aggregated in the region's local UTM CRS to a 60 m grid.",
            "grid_spacing_m": 60,
            "window_size_m": 600,
            "grid_size": 10,
            "slope_bins_deg": profile["slope_bins_deg"],
            "distance_formula": "0.7 * total_variation(slope_histogram) + 0.3 * abs(relief_a-relief_b)/max(relief_a,relief_b,1m)",
            "sensitivity": "Ranks recomputed independently with weights 0.5 and 0.5.",
            "shortlist_separation_m": 1_800,
            "profile_sha256": profile_hash,
            "uncertainty": "Exploratory distance on common support and grid only; it is neither a calibrated probability nor a suitability or safety score.",
        },
        "domain": {
            "name": f"{region['name']} · {region['country']}",
            "description": "A fixed 6 km square around a frozen literature-context coordinate. The anchor does not reproduce an exact paper sampling or survey footprint.",
            "footprint": footprint,
            "crs": crs,
            "area_km2": 36,
            "generated_count": 100,
            "eligible_count": len(candidates),
            "excluded_count": 100 - len(candidates),
            "exclusion_reasons": reasons,
        },
        "baseline": {
            "description": "Published analog region selected for a local terrain survey. No novelty baseline is asserted; candidate novelty remains unresolved.",
            "sha256": canonical_hash([]),
            "sites": [],
        },
        "sources": sources,
        "targets": targets,
        "candidates": candidates,
        "limitations": [
            "The frozen coordinate is a literature-context anchor for a 6 km regional census, not a claim that an exact paper sampling or survey footprint was reproduced.",
            "The Earth source is Copernicus GLO-30 DSM, not bare-earth DTM; relative heights can include vegetation and structures and use the EGM2008 vertical datum.",
            "The source is pixel-is-point, while 60 m cells are an explicit area-aggregation operation; no missing samples are filled and any water, nodata, or incomplete coverage excludes the full 600 m window.",
            "Common 60 m output spacing and 600 m support do not make source sensor resolutions or error distributions equivalent across bodies.",
            "Relative heights remove absolute vertical offsets; comparison uses only slope histograms and relief, with no cross-body datum transformation.",
            "No geochemical, mineralogical, biological, climate, accessibility, or operational inference is supported by these terrain-only results.",
            "Novelty is unresolved. Ranks are computed only among eligible windows inside this region and do not establish global novelty or superiority.",
        ],
    }
    return {"result": result, "profile": profile, "source_hashes": source_hashes}


def export() -> list[dict]:
    RAW.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)

    region_keys = {region["id"]: required_tile_keys(region) for region in REGIONS}
    specs = [
        asset_spec(region["id"], key, kind)
        for region in REGIONS
        for key in region_keys[region["id"]]
        for kind in ("dem", "water")
    ]
    receipts = download_assets(specs)
    targets, target_sources = load_targets()

    summaries = []
    for region in REGIONS:
        built = build_region(region, targets, target_sources, receipts)
        result = built["result"]
        output_path = OUTPUT / f"{region['id']}.json"
        write_json(output_path, result)
        summary = {
            "id": region["id"],
            "path": output_path.relative_to(ROOT).as_posix(),
            "run_id": result["run_id"],
            "eligible": result["domain"]["eligible_count"],
            "excluded": result["domain"]["excluded_count"],
            "output_sha256": sha256(output_path),
            "profile": built["profile"],
            "profile_sha256": result["method"]["profile_sha256"],
            "source_sha256": built["source_hashes"],
        }
        summaries.append(summary)
        write_json(EVIDENCE / f"{region['id']}.json", summary)

    receipt_records = [json.loads(path.read_text()) for path in sorted(RAW.glob("**/*.receipt.json"))]
    write_json(
        EVIDENCE / "source_receipts.json",
        {
            "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "earth_receipts": receipt_records,
            "target_sources": target_sources,
        },
    )
    write_json(EVIDENCE / "run_summary.json", {"schema_version": "1.0.0", "regions": summaries})
    print(json.dumps(summaries, indent=2))
    return summaries


if __name__ == "__main__":
    export()
