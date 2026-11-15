"""Run the frozen, bounded Ustyurt Earth terrain discovery experiment."""
from __future__ import annotations

import datetime as dt
from concurrent.futures import ThreadPoolExecutor
import json
import math
import re
import time
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

from earth_discovery_core import (
    area_average,
    block_mean,
    canonical_hash,
    ranked_indices,
    relative_heights,
    separated_shortlist,
    sha256,
    terrain_metrics,
)

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data-pipeline/cache/raw/earth-discovery"
OUTPUT = ROOT / "web-client/public/data/earth_discovery.json"
EVIDENCE = ROOT / "evidence/earth_discovery"
SURFACES = ROOT / "web-client/public/assets/surfaces"

DEM_URL = "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N43_00_E054_00_DEM/Copernicus_DSM_COG_10_N43_00_E054_00_DEM.tif"
XML_URL = "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N43_00_E054_00_DEM/Copernicus_DSM_10_N43_00_E054_00.xml"
WBM_URL = "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N43_00_E054_00_DEM/AUXFILES/Copernicus_DSM_COG_10_N43_00_E054_00_WBM.tif"
MARS_URL = "https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_045900_045999/ESP_045994_1985_ESP_046060_1985/DTEEC_045994_1985_046060_1985_U01.IMG"
MARS_TOTAL_BYTES = 380_814_764
MARS_HEADER_BYTES = 26_692
MARS_ROW_BYTES = 26_692
MARS_WIDTH = 6_673
MARS_HEIGHT = 14_266
MARS_CENTER_ROW = 7_133
MARS_CENTER_COL = 3_336
MARS_ROWS = 620
MAP_SCALE = 1.0096633268711

PROFILE = {
    "profile_version": "earth-discovery-1.0.0",
    "domain_center_wgs84": [54.5, 43.5],
    "domain_crs": "EPSG:32640",
    "domain_size_m": 24_000,
    "candidate_window_m": 600,
    "candidate_step_m": 600,
    "analysis_spacing_m": 60,
    "analysis_grid": [10, 10],
    "slope_bins_deg": [0, 5, 10, 20, 30, 90],
    "distance_weights": [0.7, 0.3],
    "sensitivity_weights": [0.5, 0.5],
    "shortlist_count": 12,
    "shortlist_separation_m": 1_800,
    "earth_mask": "exclude any nonzero WBM, source nodata, nonfinite, or incomplete coverage",
    "moon_crop": "central 120x120 native cells; 12x12 arithmetic block means",
    "mars_support": "600x600 local metric metres; exact overlap-weighted area means",
}

BASELINE_SITES = [
    {"name": "Haughton crater", "latitude": 75.3667, "longitude": -89.6833, "radius_km": 30, "url": "https://landsat.gsfc.nasa.gov/wp-content/uploads/2022/03/Craters.pdf"},
    {"name": "Atacama broad reference region", "latitude": -24.0, "longitude": -69.0, "radius_km": 400, "url": "https://science.nasa.gov/solar-system/planetary-analogs/"},
    {"name": "Mauna Loa", "latitude": 19.48, "longitude": -155.6, "radius_km": 60, "url": "https://science.nasa.gov/earth/earth-observatory/living-the-lava-life-on-mauna-loa-150697/"},
]


def write_json(path: Path, value: object):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def receipt_for(path: Path, url: str, expected_bytes: int | None = None) -> dict:
    receipt_path = path.with_suffix(path.suffix + ".receipt.json")
    if not path.exists():
        request = urllib.request.Request(url, headers={"User-Agent": "planetary-analog-explorer/1.0"})
        with urllib.request.urlopen(request, timeout=180) as response:
            data = response.read()
            headers = dict(response.headers.items())
        path.write_bytes(data)
        retrieved_at = dt.datetime.now(dt.timezone.utc).isoformat()
    else:
        headers = {}
        retrieved_at = "2026-11-15T00:00:00+00:00"
        if receipt_path.exists():
            retrieved_at = json.loads(receipt_path.read_text())["retrieved_at"]
    if expected_bytes is not None and path.stat().st_size != expected_bytes:
        raise ValueError(f"Unexpected byte count for {path.name}")
    receipt = {
        "canonical_url": url,
        "local_path": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "retrieved_at": retrieved_at,
        "http_headers": headers,
        "identity_scope": "SHA256 identifies the complete downloaded object.",
    }
    write_json(receipt_path, receipt)
    return receipt


def fetch_range(path: Path, start: int, end: int) -> dict:
    receipt_path = path.with_suffix(path.suffix + ".receipt.json")
    if path.exists() and path.stat().st_size != end - start + 1:
        path.unlink()
    if not path.exists():
        temporary = path.with_suffix(path.suffix + ".part")
        chunks = [(chunk_start, min(end, chunk_start + 799_999)) for chunk_start in range(start, end + 1, 800_000)]
        requests = [{"start": chunk_start, "end": chunk_end, "content_range": f"bytes {chunk_start}-{chunk_end}/{MARS_TOTAL_BYTES}"} for chunk_start, chunk_end in chunks]
        complete_chunks = 0
        if temporary.exists() and temporary.stat().st_size % 800_000 == 0:
            complete_chunks = temporary.stat().st_size // 800_000
        elif temporary.exists():
            temporary.unlink()

        def download_chunk(bounds):
            chunk_start, chunk_end = bounds
            expected = f"bytes {chunk_start}-{chunk_end}/{MARS_TOTAL_BYTES}"
            for attempt in range(5):
                try:
                    request = urllib.request.Request(MARS_URL, headers={"Range": f"bytes={chunk_start}-{chunk_end}"})
                    with urllib.request.urlopen(request, timeout=180) as response:
                        if response.status != 206 or response.headers.get("Content-Range") != expected:
                            raise ValueError("HiRISE server did not honor the exact byte range")
                        data = response.read(chunk_end - chunk_start + 2)
                        response_headers = dict(response.headers.items())
                    if len(data) != chunk_end - chunk_start + 1:
                        raise ValueError("Incomplete HiRISE byte-range chunk")
                    return data, response_headers
                except (OSError, ValueError):
                    if attempt == 4:
                        raise
                    time.sleep(attempt + 1)

        remaining = chunks[complete_chunks:]
        with ThreadPoolExecutor(max_workers=4) as pool:
            downloaded = list(pool.map(download_chunk, remaining))
        mode = "ab" if complete_chunks else "wb"
        with temporary.open(mode) as output:
            for data, headers in downloaded:
                output.write(data)
        temporary.replace(path)
        retrieved_at = dt.datetime.now(dt.timezone.utc).isoformat()
    else:
        chunks = [(chunk_start, min(end, chunk_start + 799_999)) for chunk_start in range(start, end + 1, 800_000)]
        requests = [{"start": chunk_start, "end": chunk_end, "content_range": f"bytes {chunk_start}-{chunk_end}/{MARS_TOTAL_BYTES}"} for chunk_start, chunk_end in chunks]
        headers = {}
        retrieved_at = "2026-11-15T00:00:00+00:00"
        if receipt_path.exists():
            previous = json.loads(receipt_path.read_text())
            retrieved_at = previous["retrieved_at"]
            headers = previous.get("http_headers", {})
    if path.stat().st_size != end - start + 1:
        raise ValueError("Cached HiRISE range has the wrong size")
    receipt = {
        "canonical_url": MARS_URL,
        "local_path": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "retrieved_at": retrieved_at,
        "http_headers": headers,
        "complete_product": False,
        "range_start_inclusive": start,
        "range_end_inclusive": end,
        "complete_product_bytes": MARS_TOTAL_BYTES,
        "range_requests": requests,
        "identity_scope": "SHA256 identifies this exact contiguous source byte interval assembled from validated HTTP 206 range responses, not the complete IMG.",
    }
    write_json(receipt_path, receipt)
    return receipt


def source_record(source_id: str, title: str, provider: str, url: str, role: str, receipt: dict, license_text: str):
    return {
        "id": source_id,
        "title": title,
        "provider": provider,
        "url": url,
        "role": role,
        "sha256": receipt["sha256"],
        "bytes": receipt["bytes"],
        "license": license_text,
        "hash_scope": receipt["identity_scope"],
    }


def load_targets():
    catalog = json.loads((ROOT / "web-client/public/data/surface_catalog.json").read_text())
    records = {surface["id"]: surface for surface in catalog["surfaces"]}
    sources = []

    moon_record = records["lola-site04-roi3"]
    moon_dir = SURFACES / "lola-site04-roi3"
    moon_height_path = moon_dir / "heights.f32"
    moon_mask_path = moon_dir / "valid-mask.u8"
    moon_values = np.fromfile(moon_height_path, dtype="<f4").reshape(129, 129).astype(np.float64)
    moon_valid = np.fromfile(moon_mask_path, dtype="u1").reshape(129, 129).astype(bool)
    moon_values, moon_valid = block_mean(moon_values[4:124, 4:124], 12, moon_valid[4:124, 4:124])
    moon_receipts = []
    for path in (moon_height_path, moon_mask_path):
        moon_receipts.append({"sha256": sha256(path), "bytes": path.stat().st_size, "identity_scope": "SHA256 identifies the complete local asset."})
    sources.extend([
        source_record("moon-lola-heights", "LOLA Site04 ROI 3 height crop", "NASA GSFC", "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif", "Moon target heights", moon_receipts[0], "NASA public scientific data; retain source attribution."),
        source_record("moon-lola-valid-mask", "LOLA Site04 ROI 3 valid mask", "NASA GSFC", "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif", "Moon target validity", moon_receipts[1], "NASA public scientific data; retain source attribution."),
    ])

    header_receipt = fetch_range(RAW / "hirise-label-range.bin", 0, MARS_HEADER_BYTES - 1)
    first_row = MARS_CENTER_ROW - MARS_ROWS // 2
    start = MARS_HEADER_BYTES + first_row * MARS_ROW_BYTES
    rows_receipt = fetch_range(RAW / "hirise-center-620-rows.bin", start, start + MARS_ROWS * MARS_ROW_BYTES - 1)
    label = (RAW / "hirise-label-range.bin").read_bytes().decode("ascii", errors="strict").rstrip("\x00 ")
    for pattern in (r"LINE_SAMPLES\s*=\s*6673", r"LINES\s*=\s*14266", r"SAMPLE_TYPE\s*=\s*PC_REAL"):
        if not re.search(pattern, label):
            raise ValueError(f"Unexpected HiRISE label: missing {pattern}")
    rows = np.fromfile(RAW / "hirise-center-620-rows.bin", dtype="<f4").reshape(MARS_ROWS, MARS_WIDTH)
    mars_values = rows[:, MARS_CENTER_COL - 310 : MARS_CENTER_COL + 310].astype(np.float64)
    mars_valid = np.isfinite(mars_values) & (mars_values >= -2679.20) & (mars_values <= -2388.31)
    latitude = records["mars-jezero-hirise"]["coordinates"]["latitude_deg"]
    ground_x = MAP_SCALE * math.cos(math.radians(latitude)) / math.cos(math.radians(15.0))
    mars_values, mars_valid = area_average(mars_values, mars_valid, 600 / MAP_SCALE, 600 / ground_x)
    sources.extend([
        source_record("mars-hirise-label-range", "HiRISE DTM PDS label range", "NASA/JPL/UArizona", MARS_URL, "Mars target metadata", header_receipt, "Public domain per HiRISE image usage policy; credit NASA/JPL/University of Arizona."),
        source_record("mars-hirise-analysis-range", "HiRISE DTM 620-row analysis range", "NASA/JPL/UArizona", MARS_URL, "Mars target heights", rows_receipt, "Public domain per HiRISE image usage policy; credit NASA/JPL/University of Arizona."),
    ])
    targets = [
        {
            "id": "moon-shackleton-lola-600m",
            "name": "Shackleton rim LOLA 600 m analysis support",
            "body": "moon",
            "surface_id": "lola-site04-roi3",
            "latitude": moon_record["coordinates"]["latitude_deg"],
            "longitude": moon_record["coordinates"]["longitude_deg"],
            "source_ids": ["moon-lola-heights", "moon-lola-valid-mask"],
            "metrics": terrain_metrics(moon_values, moon_valid),
            "heights_m": relative_heights(moon_values),
            "limitations": [
                "The 600 m analysis support is a derived central subset of the linked 129 by 129 display surface.",
                "LOLA interpolation and the source frame limitations remain; this is terrain comparison, not landing safety.",
            ],
        },
        {
            "id": "mars-jezero-hirise-600m",
            "name": "Jezero HiRISE 600 m local-metric analysis support",
            "body": "mars",
            "surface_id": "mars-jezero-hirise",
            "latitude": latitude,
            "longitude": records["mars-jezero-hirise"]["coordinates"]["longitude_deg"],
            "source_ids": ["mars-hirise-label-range", "mars-hirise-analysis-range"],
            "metrics": terrain_metrics(mars_values, mars_valid),
            "heights_m": relative_heights(mars_values),
            "limitations": [
                "The 600 m analysis support uses a larger exact source range than the linked 129 by 129 display surface.",
                "Easting was corrected by cos(18.4269°)/cos(15°); output cells cover 60 m local metric support.",
                "Stereo DTM and Mars frame limitations remain; this is terrain comparison, not landing safety.",
            ],
        },
    ]
    return targets, sources


def domain_grid(dem_path: Path, water_path: Path):
    to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32640", always_xy=True)
    center_x, center_y = to_utm.transform(54.5, 43.5)
    left, top = center_x - 12_000, center_y + 12_000
    transform = from_origin(left, top, 60, 60)
    shape = (400, 400)
    values = np.full(shape, np.nan, dtype=np.float64)
    coverage = np.zeros(shape, dtype=np.float32)
    water = np.ones(shape, dtype=np.uint8)
    with rasterio.open(dem_path) as source:
        source_values = source.read(1)
        source_valid = np.isfinite(source_values)
        if source.nodata is not None:
            source_valid &= source_values != source.nodata
        reproject(source_values, values, src_transform=source.transform, src_crs=source.crs,
                  src_nodata=source.nodata, dst_transform=transform, dst_crs="EPSG:32640",
                  dst_nodata=np.nan, resampling=Resampling.average)
        reproject(source_valid.astype(np.uint8), coverage, src_transform=source.transform, src_crs=source.crs,
                  dst_transform=transform, dst_crs="EPSG:32640", dst_nodata=0, resampling=Resampling.average)
    with rasterio.open(water_path) as source:
        source_water = (source.read(1) != 0).astype(np.uint8)
        reproject(source_water, water, src_transform=source.transform, src_crs=source.crs,
                  dst_transform=transform, dst_crs="EPSG:32640", dst_nodata=1, resampling=Resampling.max)
    valid = np.isfinite(values) & np.isclose(coverage, 1.0, atol=1e-6)
    return values, valid, water.astype(bool), transform, (center_x, center_y)


def polygon(transformer, points):
    return [[round(lon, 7), round(lat, 7)] for lon, lat in (transformer.transform(x, y) for x, y in points)]


def make_candidates(values, valid, water, transform):
    to_wgs84 = Transformer.from_crs("EPSG:32640", "EPSG:4326", always_xy=True)
    candidates, centers = [], []
    reasons = {"missing_coverage": 0, "water": 0, "nodata": 0}
    for row in range(40):
        for col in range(40):
            cell_values = values[row * 10 : row * 10 + 10, col * 10 : col * 10 + 10]
            cell_valid = valid[row * 10 : row * 10 + 10, col * 10 : col * 10 + 10]
            cell_water = water[row * 10 : row * 10 + 10, col * 10 : col * 10 + 10]
            if cell_water.any():
                reasons["water"] += 1
                continue
            if not cell_valid.all():
                reasons["missing_coverage"] += 1
                continue
            if not np.isfinite(cell_values).all():
                reasons["nodata"] += 1
                continue
            x0 = transform.c + col * 600
            y1 = transform.f - row * 600
            x1, y0 = x0 + 600, y1 - 600
            center = ((x0 + x1) / 2, (y0 + y1) / 2)
            lon, lat = to_wgs84.transform(*center)
            footprint = polygon(to_wgs84, [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)])
            candidates.append({
                "id": f"ustyurt-r{row:02d}-c{col:02d}",
                "name": f"Ustyurt systematic window {row + 1:02d}-{col + 1:02d}",
                "latitude": round(lat, 7),
                "longitude": round(lon, 7),
                "footprint": footprint,
                "metrics": terrain_metrics(cell_values, cell_valid),
                "heights_m": relative_heights(cell_values),
                "comparisons": {},
                "novelty": "outside_reference_baseline",
            })
            centers.append(center)
    return candidates, centers, reasons


def add_comparisons(candidates, centers, targets):
    for target in targets:
        ranking = ranked_indices(candidates, target["metrics"], (0.7, 0.3))
        sensitivity = ranked_indices(candidates, target["metrics"], (0.5, 0.5))
        ranks = {index: rank for rank, (_, _, index) in enumerate(ranking, 1)}
        sensitivity_ranks = {index: rank for rank, (_, _, index) in enumerate(sensitivity, 1)}
        distances = {index: distance for distance, _, index in ranking}
        shortlisted = separated_shortlist(ranking, centers)
        for index, candidate in enumerate(candidates):
            candidate["comparisons"][target["id"]] = {
                "distance": distances[index],
                "rank": ranks[index],
                "sensitivity_rank": sensitivity_ranks[index],
                "shortlisted": index in shortlisted,
            }


def export():
    RAW.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    dem = receipt_for(RAW / "Copernicus_DSM_COG_10_N43_00_E054_00_DEM.tif", DEM_URL, 42_162_962)
    xml = receipt_for(RAW / "Copernicus_DSM_10_N43_00_E054_00.xml", XML_URL, 44_715)
    water = receipt_for(RAW / "Copernicus_DSM_COG_10_N43_00_E054_00_WBM.tif", WBM_URL, 36_049)
    targets, sources = load_targets()
    copernicus_license = "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved."
    sources[:0] = [
        source_record("copernicus-dem-n43e054", "Copernicus DEM GLO-30 N43E054 DSM", "European Union/ESA", DEM_URL, "Earth elevation", dem, copernicus_license),
        source_record("copernicus-wbm-n43e054", "Copernicus DEM GLO-30 N43E054 water body mask", "European Union/ESA", WBM_URL, "Earth water exclusion", water, copernicus_license),
        source_record("copernicus-metadata-n43e054", "Copernicus DEM N43E054 product metadata", "European Union/ESA", XML_URL, "Earth product semantics", xml, copernicus_license),
    ]
    values, valid, water_grid, transform, _ = domain_grid(RAW / Path(DEM_URL).name, RAW / Path(WBM_URL).name)
    candidates, centers, reasons = make_candidates(values, valid, water_grid, transform)
    add_comparisons(candidates, centers, targets)
    to_wgs84 = Transformer.from_crs("EPSG:32640", "EPSG:4326", always_xy=True)
    left, top = transform.c, transform.f
    domain_footprint = polygon(to_wgs84, [(left, top - 24_000), (left + 24_000, top - 24_000), (left + 24_000, top), (left, top), (left, top - 24_000)])
    profile_hash = canonical_hash(PROFILE)
    source_hashes = {source["id"]: source["sha256"] for source in sources}
    run_hash = canonical_hash({"profile": profile_hash, "sources": source_hashes})
    result = {
        "schema_version": "1.0.0",
        "run_id": f"earth-discovery-{run_hash[:16]}",
        "generated_at": max(dem["retrieved_at"], water["retrieved_at"], xml["retrieved_at"]),
        "method": {
            "name": "Bounded systematic Ustyurt terrain comparison",
            "description": "A predeclared 40 by 40 non-overlapping window census. Copernicus DSM and water-mask samples are area-aggregated in UTM zone 40N to a common 60 m output grid.",
            "grid_spacing_m": 60,
            "window_size_m": 600,
            "grid_size": 10,
            "slope_bins_deg": PROFILE["slope_bins_deg"],
            "distance_formula": "0.7 * total_variation(slope_histogram) + 0.3 * abs(relief_a-relief_b)/max(relief_a,relief_b,1m)",
            "sensitivity": "Ranks recomputed independently with weights 0.5 and 0.5.",
            "shortlist_separation_m": 1800,
            "profile_sha256": profile_hash,
            "uncertainty": "Exploratory distance on common support and grid only; it is neither a calibrated probability nor a suitability or safety score.",
        },
        "domain": {
            "name": "Kazakhstan Ustyurt N43E054 bounded search",
            "description": "Frozen 24 km square centered at 54.5°E, 43.5°N. This complete bounded census does not establish global novelty.",
            "footprint": domain_footprint,
            "crs": "EPSG:32640",
            "area_km2": 576,
            "generated_count": 1600,
            "eligible_count": len(candidates),
            "excluded_count": 1600 - len(candidates),
            "exclusion_reasons": reasons,
        },
        "baseline": {
            "description": "Frozen reference-only buffers around three NASA-described analog areas. Coordinates/radii are approximate; outside means outside this baseline only, not globally new.",
            "sha256": canonical_hash(BASELINE_SITES),
            "sites": BASELINE_SITES,
        },
        "sources": sources,
        "targets": targets,
        "candidates": candidates,
        "limitations": [
            "The Earth source is Copernicus GLO-30 DSM, complementary to the NASA Moon and Mars targets; DSM elevations can include vegetation and structures and use the EGM2008 vertical datum.",
            "The source is pixel-is-point, while 60 m cells are an explicit area-aggregation operation; no missing samples are filled and any water, nodata, or incomplete coverage excludes the full 600 m window.",
            "Common 60 m output spacing and 600 m support do not make source sensor resolutions or error distributions equivalent across bodies.",
            "Relative heights remove absolute vertical offsets; comparison uses only slope histograms and relief, with no cross-body datum transformation.",
            "Outside-reference-baseline labels only mean outside the three approximate frozen buffers. Literature review and global novelty remain unresolved.",
            "Results characterize terrain resemblance inside one predeclared 576 km² domain and are not landing, traverse, habitability, or mission-suitability recommendations.",
        ],
    }
    write_json(OUTPUT, result)
    receipts = [json.loads(path.read_text()) for path in sorted(RAW.glob("*.receipt.json"))]
    write_json(EVIDENCE / "source_receipts.json", {"receipts": receipts})
    write_json(EVIDENCE / "run_summary.json", {
        "run_id": result["run_id"],
        "profile": PROFILE,
        "profile_sha256": profile_hash,
        "source_sha256": source_hashes,
        "domain": result["domain"],
        "targets": [{"id": target["id"], "metrics": target["metrics"]} for target in targets],
        "shortlists": {target["id"]: [candidate["id"] for candidate in candidates if candidate["comparisons"][target["id"]]["shortlisted"]] for target in targets},
        "output_sha256": sha256(OUTPUT),
    })
    print(json.dumps({"output": str(OUTPUT), "run_id": result["run_id"], "eligible": len(candidates), "excluded": 1600 - len(candidates), "targets": [target["id"] for target in targets], "bytes": OUTPUT.stat().st_size}, indent=2))


if __name__ == "__main__":
    export()
