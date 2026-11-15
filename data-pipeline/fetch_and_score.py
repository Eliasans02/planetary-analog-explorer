#!/usr/bin/env python3
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Planetary Analog Explorer — Dev_A offline data pipeline CLI entry point.

Delegates ingestion, terrain extraction, analog scoring, validation, and atomic
JSON/binary export to ``pae_pipeline`` modules.
"""

from __future__ import annotations

import argparse
import pathlib
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from typing import Any

# Ensure src/ is importable when running directly without editable install
_PIPELINE_ROOT = pathlib.Path(__file__).resolve().parent
_SRC_DIR = _PIPELINE_ROOT / "src"
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))

from pae_pipeline.export import (  # noqa: E402
    atomic_copy_file,
    atomic_write_bytes,
    atomic_write_json,
    sha256_bytes,
    sha256_file,
)
from pae_pipeline.scoring import (  # noqa: E402
    CANONICAL_UNITS,
    FEATURE_KEYS,
    SAFE_ID_RE,
    ScoringValidationError,
    load_scoring_profiles,
    rank_analogs,
)
from pae_pipeline.sources import (  # noqa: E402
    DataReadinessError,
    ManifestValidationError,
    convert_coordinates_to_output_frame,
    ensure_verified_local_file,
    fetch_power,
    load_manifest,
    resolve_safe_path,
    validate_aoi_geojson,
)
from pae_pipeline.terrain import (  # noqa: E402
    TerrainValidationError, extract_terrain, require_exact_enu_contract,
)
from pae_pipeline.validation import DatasetValidationError, validate_dataset  # noqa: E402

_DEFAULT_REPO_ROOT = _PIPELINE_ROOT.parent


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _resolve_default_schema_path(repo_root: pathlib.Path) -> pathlib.Path:
    shared_schema = repo_root / "shared" / "schemas" / "analog_location.schema.json"
    if shared_schema.is_file():
        return shared_schema
    return _PIPELINE_ROOT / "schemas" / "analog_location.schema.json"


def _infer_public_and_repo_roots(
    output_path: pathlib.Path,
    explicit_public_root: pathlib.Path | None,
) -> tuple[pathlib.Path, pathlib.Path]:
    if explicit_public_root is not None:
        pub_root = explicit_public_root.resolve()
    elif output_path.parent.name == "data":
        pub_root = output_path.parent.parent.resolve()
    else:
        pub_root = (output_path.parent / "public").resolve()

    if pub_root.name == "public" and pub_root.parent.name == "web-client":
        repo_root = pub_root.parent.parent.resolve()
    else:
        repo_root = pub_root.parent.resolve()
    return pub_root, repo_root


def _empty_feature(key: str, *, method: str, missing_reason: str) -> dict[str, Any]:
    return {
        "value": None,
        "unit": CANONICAL_UNITS[key],
        "quantity": f"unavailable_{key}",
        "method": method,
        "spatial_resolution_m": None,
        "support_window_m": None,
        "period": None,
        "source_ids": [],
        "missing_reason": missing_reason,
    }


def _build_non_terrain_features(
    site: dict[str, Any],
    power_parsed: dict[str, object] | None,
    power_source_id: str | None,
) -> dict[str, dict[str, Any]]:
    """Construct the 5 non-terrain features strictly from sourced data or explicit null+reason."""
    obs = site.get("observations") or {}
    body = site["body"]
    result: dict[str, dict[str, Any]] = {}

    for key in (
        "temp_min_c",
        "temp_max_c",
        "solar_irradiance_kwh_m2",
        "aridity_index",
        "albedo",
    ):
        if key in obs:
            entry = dict(obs[key])
            entry.setdefault("spatial_resolution_m", None)
            entry.setdefault("support_window_m", None)
            entry.setdefault("period", None)
            entry.setdefault("source_ids", [])
            if entry.get("value") is not None:
                entry["missing_reason"] = None
            else:
                entry["missing_reason"] = entry.get("missing_reason") or f"No {key} measurement provided"
            result[key] = entry
            continue

        if power_parsed is not None and power_source_id is not None and key in {
            "temp_min_c",
            "temp_max_c",
            "solar_irradiance_kwh_m2",
        }:
            pval = power_parsed.get(key)
            period = power_parsed["period"]
            if pval is not None:
                if key == "temp_min_c":
                    qty = "air_2m_temperature_daily_min"
                    method = "nasa_power_daily_point_min_over_period;point_sampling_coarse_grid_context"
                elif key == "temp_max_c":
                    qty = "air_2m_temperature_daily_max"
                    method = "nasa_power_daily_point_max_over_period;point_sampling_coarse_grid_context"
                else:
                    qty = "all_sky_surface_shortwave_daily_mean_irradiation"
                    method = "nasa_power_daily_point_mean;point_sampling_coarse_grid_context"
                result[key] = {
                    "value": float(pval),
                    "unit": CANONICAL_UNITS[key],
                    "quantity": qty,
                    "method": method,
                    "spatial_resolution_m": None,
                    "support_window_m": None,
                    "period": period,
                    "source_ids": [power_source_id],
                    "missing_reason": None,
                }
            else:
                result[key] = _empty_feature(
                    key,
                    method="nasa_power_daily_point",
                    missing_reason=f"NASA POWER returned only fill values for {key}",
                )
            continue

        if key == "aridity_index":
            reason = (
                "Aridity index (P/PET) is not applicable on the Moon"
                if body == "moon"
                else f"No real P and PET dataset declared for site '{site['id']}' over matching period"
            )
            result[key] = _empty_feature(key, method="p_over_pet_unavailable", missing_reason=reason)
        else:
            result[key] = _empty_feature(
                key,
                method="manifest_observation_absent",
                missing_reason=f"No sourced {key} observation declared for site '{site['id']}'",
            )

    return result


def _build_geology(site: dict[str, Any]) -> dict[str, Any]:
    geo = site.get("geology")
    if isinstance(geo, dict):
        classes = list(geo.get("classes", []))
        return {
            "classes": classes,
            "method": str(geo.get("method", "manifest_geologic_dataset")),
            "source_ids": list(geo.get("source_ids", [])),
            "missing_reason": None if classes else str(geo.get("missing_reason") or "No geologic classes available"),
        }
    return {
        "classes": [],
        "method": "no_geologic_dataset_declared",
        "source_ids": [],
        "missing_reason": f"No supported geologic/mineralogy dataset declared for site '{site['id']}'",
    }


def _report_dataset_summary(dataset: dict[str, Any], label: str) -> None:
    comparisons = dataset.get("comparisons", [])
    total_targets = len(comparisons)
    ranked_targets = sum(1 for c in comparisons if len(c.get("analogs", [])) > 0)
    top3_available = bool(comparisons) and any(len(c.get("analogs", [])) == 3 for c in comparisons)
    splat_available = any(
        c["target"]["assets"]["splat"] is not None
        or any(a["location"]["assets"]["splat"] is not None for a in c.get("analogs", []))
        for c in comparisons
    )
    print(
        f"{label} targets={total_targets} ranked_targets={ranked_targets} "
        f"top3_available={str(top3_available).lower()} "
        f"splat_available={str(splat_available).lower()}"
    )


def _run_prepare_or_offline(
    *,
    manifest_path: pathlib.Path,
    profiles_path: pathlib.Path,
    output_path: pathlib.Path,
    schema_path: pathlib.Path,
    public_root: pathlib.Path,
    repo_root: pathlib.Path,
    cache_dir: pathlib.Path,
    offline: bool,
    require_demo_ready: bool,
) -> int:
    require_exact_enu_contract()
    manifest = load_manifest(manifest_path)
    profiles_cfg = load_scoring_profiles(profiles_path)

    sites: list[dict[str, Any]] = list(manifest["sites"])
    profiles: list[dict[str, Any]] = list(profiles_cfg["profiles"])

    if not sites:
        raise DataReadinessError(
            "DATA_BLOCKER: sites_manifest.json has no sites. Populate sourced AOIs, "
            "coordinates, DEMs, and companion labels before running prepare/offline."
        )
    if not profiles:
        raise DataReadinessError(
            "DATA_BLOCKER: scoring_profiles.json has no profiles. Populate calibrated "
            "scoring profiles before running prepare/offline."
        )

    effective_cache = cache_dir.resolve()
    if any(site.get("power_query") is not None for site in sites):
        if not effective_cache.is_relative_to(repo_root):
            raise DataReadinessError(
                f"--cache-dir ({effective_cache}) must resolve inside repository root ({repo_root})"
            )

    sources_registry: dict[str, dict[str, Any]] = {}
    site_prepared: dict[str, dict[str, Any]] = {}
    staged_assets: list[tuple[str, str]] = []

    staging_root = pathlib.Path(tempfile.mkdtemp(prefix="pae_assets_stage_"))
    try:
        for site in sites:
            sid = str(site["id"])
            if not SAFE_ID_RE.match(sid):
                raise ManifestValidationError(
                    f"Site id must match [A-Za-z0-9_-]+, got {sid!r}"
                )
            # Verify/ingest declared raw sources
            for raw_src in site["sources"]:
                ensure_verified_local_file(
                    local_path=raw_src["local_path"],
                    expected_sha256=raw_src["sha256"],
                    access_url=raw_src["access_url"],
                    repo_root=repo_root,
                    offline=offline,
                )
                if raw_src.get("sidecar_path"):
                    ensure_verified_local_file(
                        local_path=raw_src["sidecar_path"],
                        expected_sha256=raw_src["sidecar_sha256"],
                        access_url=None,
                        repo_root=repo_root,
                        offline=True,
                    )
                clean_src = {
                    k: raw_src[k]
                    for k in (
                        "id",
                        "provider",
                        "product_id",
                        "product_url",
                        "mission",
                        "access_url",
                        "retrieved_at",
                        "sha256",
                        "license",
                        "local_path",
                    )
                }
                existing = sources_registry.get(clean_src["id"])
                if existing is not None and existing != clean_src:
                    raise ManifestValidationError(
                        f"Conflicting definitions for source id {clean_src['id']!r}"
                    )
                sources_registry[clean_src["id"]] = clean_src

            # Convert coordinates mathematically to body's output frame
            converted_coords = convert_coordinates_to_output_frame(site["coordinates"], site["body"])
            out_coords = {
                "latitude_deg": converted_coords["latitude_deg"],
                "longitude_deg": converted_coords["longitude_deg"],
                "frame": converted_coords["frame"],
                "source_ids": converted_coords["source_ids"],
            }

            # Verify & validate AOI GeoJSON, then stage content-addressed copy
            aoi_cfg = site["aoi"]
            aoi_src_file = ensure_verified_local_file(
                local_path=aoi_cfg["local_path"],
                expected_sha256=aoi_cfg["sha256"],
                access_url=aoi_cfg["access_url"],
                repo_root=repo_root,
                offline=offline,
            )
            validate_aoi_geojson(
                aoi_src_file,
                expected_lat_deg=out_coords["latitude_deg"],
                expected_lon_deg=out_coords["longitude_deg"],
            )
            aoi_sha = sha256_file(aoi_src_file)
            aoi_pub_rel = f"assets/aoi/{sid}_{aoi_sha[:12]}.geojson"
            aoi_stage_dest = resolve_safe_path(aoi_pub_rel, staging_root)
            resolve_safe_path(aoi_pub_rel, public_root)
            aoi_copied_sha, _ = atomic_copy_file(aoi_src_file, aoi_stage_dest)
            staged_assets.append((aoi_pub_rel, aoi_copied_sha))

            # Verify raw DEM + companion label/sidecar, stage streamed content-addressed copy
            dem_cfg = site["dem"]
            dem_src_file = ensure_verified_local_file(
                local_path=dem_cfg["local_path"],
                expected_sha256=dem_cfg["sha256"],
                access_url=None,
                repo_root=repo_root,
                offline=True,
            )
            ensure_verified_local_file(
                local_path=dem_cfg["label_path"],
                expected_sha256=dem_cfg["label_sha256"],
                access_url=None,
                repo_root=repo_root,
                offline=True,
            )
            dem_sha = sha256_file(dem_src_file)
            dem_pub_rel = f"assets/dem/{sid}_{dem_sha[:12]}_{dem_src_file.name}"
            dem_stage_dest = resolve_safe_path(dem_pub_rel, staging_root)
            resolve_safe_path(dem_pub_rel, public_root)
            dem_copied_sha, dem_bytes = atomic_copy_file(dem_src_file, dem_stage_dest)
            staged_assets.append((dem_pub_rel, dem_copied_sha))
            dem_asset = {
                "path": f"/{dem_pub_rel}",
                "sha256": dem_copied_sha,
                "bytes": dem_bytes,
                "source_ids": list(dem_cfg["source_ids"]),
            }

            # Optional NASA POWER ingestion for Earth sites
            power_parsed: dict[str, object] | None = None
            power_source_id: str | None = None
            if site.get("power_query") is not None:
                pq = site["power_query"]
                power_parsed = fetch_power(
                    float(pq["latitude_deg"]),
                    float(pq["longitude_deg"]),
                    str(pq["start"]),
                    str(pq["end"]),
                    effective_cache,
                    offline=offline,
                )
                power_source_id = f"nasa_power_{sid}_{pq['start']}_{pq['end']}"
                power_rel_path = pathlib.Path(str(power_parsed["local_path"])).resolve().relative_to(
                    repo_root
                ).as_posix()
                sources_registry[power_source_id] = {
                    "id": power_source_id,
                    "provider": "NASA POWER",
                    "product_id": f"POWER_Daily_Point_{pq['start']}_{pq['end']}",
                    "product_url": "https://power.larc.nasa.gov/docs/services/api/temporal/daily/",
                    "mission": "MERRA-2 / CERES",
                    "access_url": str(power_parsed["query_url"]),
                    "retrieved_at": str(power_parsed["retrieved_at"]),
                    "sha256": str(power_parsed["sha256"]),
                    "license": "NASA Open Data / Public Domain",
                    "local_path": power_rel_path,
                }

            # Optional Splat verification (remains null unless real verified splat declared)
            splat_obj: dict[str, Any] | None = None
            if site.get("splat") is not None:
                sp = site["splat"]
                sp_src = ensure_verified_local_file(
                    local_path=sp["local_path"],
                    expected_sha256=sp["sha256"],
                    access_url=None,
                    repo_root=repo_root,
                    offline=True,
                )
                sp_sha = sha256_file(sp_src)
                sp_pub_rel = f"assets/splats/{sid}_{sp_sha[:12]}_{sp_src.name}"
                sp_stage_dest = resolve_safe_path(sp_pub_rel, staging_root)
                resolve_safe_path(sp_pub_rel, public_root)
                sp_copied_sha, sp_bytes = atomic_copy_file(sp_src, sp_stage_dest)
                staged_assets.append((sp_pub_rel, sp_copied_sha))
                splat_obj = {
                    "asset": {
                        "path": f"/{sp_pub_rel}",
                        "sha256": sp_copied_sha,
                        "bytes": sp_bytes,
                        "source_ids": list(sp["source_ids"]),
                    },
                    "format": sp["format"],
                    "gaussian_count": int(sp["gaussian_count"]),
                    "scale_is_metric": bool(sp["scale_is_metric"]),
                    "world_from_asset": list(sp["world_from_asset"]),
                    "reconstruction_method": str(sp["reconstruction_method"]),
                    "geometry_provenance": str(sp["geometry_provenance"]),
                }

            site_prepared[sid] = {
                "site": site,
                "coordinates": out_coords,
                "aoi_src_file": aoi_src_file,
                "aoi_pub_url": f"/{aoi_pub_rel}",
                "dem_src_file": dem_src_file,
                "dem_asset": dem_asset,
                "splat_obj": splat_obj,
                "non_terrain_features": _build_non_terrain_features(
                    site, power_parsed, power_source_id
                ),
                "geology": _build_geology(site),
            }

        # Build comparisons for every (target, profile)
        comparisons: list[dict[str, Any]] = []
        target_ids = [s["id"] for s in sites if s["body"] in {"moon", "mars"}]
        earth_ids = [s["id"] for s in sites if s["body"] == "earth"]

        for profile in profiles:
            pid = str(profile["id"])
            if not SAFE_ID_RE.match(pid):
                raise ScoringValidationError(
                    f"Profile 'id' must match [A-Za-z0-9_-]+, got {pid!r}"
                )
            locations_for_profile: dict[str, dict[str, Any]] = {}
            terrain_errors: dict[str, str] = {}

            for sid, prep in site_prepared.items():
                site = prep["site"]
                dem_cfg = site["dem"]
                try:
                    terrain_res = extract_terrain(
                        prep["dem_src_file"],
                        prep["aoi_src_file"],
                        {**profile, "vertical_units": dem_cfg["vertical_units"]},
                        aoi_frame=str(site["aoi"]["frame"]),
                    )
                except TerrainValidationError as exc:
                    terrain_errors[sid] = str(exc)
                    features: dict[str, Any] = {}
                    for tkey in ("slope_mean_deg", "slope_max_deg", "roughness_index", "elevation_delta_m"):
                        features[tkey] = _empty_feature(
                            tkey,
                            method="terrain_extraction_rejected",
                            missing_reason=str(exc),
                        )
                    for nkey, nval in prep["non_terrain_features"].items():
                        features[nkey] = nval
                    locations_for_profile[sid] = {
                        "id": sid,
                        "name": site["name"],
                        "body": site["body"],
                        "coordinates": prep["coordinates"],
                        "aoi": {
                            "local_path": prep["aoi_pub_url"],
                            "source_ids": list(site["aoi"]["source_ids"]),
                        },
                        "missions": list(site["missions"]),
                        "features": features,
                        "geology": prep["geology"],
                        "assets": {
                            "dem": prep["dem_asset"],
                            "heightmap": None,
                            "splat": prep["splat_obj"],
                        },
                        "camera": None,
                    }
                    continue

                # Stage derived heightmap + mask binaries (content-addressed)
                hm_data = terrain_res["heightmap_data"]
                h_digest = sha256_bytes(hm_data["heights_bytes"])
                m_digest = sha256_bytes(hm_data["mask_bytes"])
                h_rel = f"assets/heightmaps/{pid}/{sid}_{h_digest[:12]}_height.bin"
                m_rel = f"assets/heightmaps/{pid}/{sid}_{m_digest[:12]}_mask.bin"
                h_stage_dest = resolve_safe_path(h_rel, staging_root)
                m_stage_dest = resolve_safe_path(m_rel, staging_root)
                resolve_safe_path(h_rel, public_root)
                resolve_safe_path(m_rel, public_root)
                h_sha, h_bytes = atomic_write_bytes(h_stage_dest, hm_data["heights_bytes"])
                m_sha, m_bytes = atomic_write_bytes(m_stage_dest, hm_data["mask_bytes"])
                staged_assets.append((h_rel, h_sha))
                staged_assets.append((m_rel, m_sha))

                heightmap_obj = {
                    "asset": {
                        "path": f"/{h_rel}",
                        "sha256": h_sha,
                        "bytes": h_bytes,
                        "source_ids": list(dem_cfg["source_ids"]),
                    },
                    "valid_mask": {
                        "path": f"/{m_rel}",
                        "sha256": m_sha,
                        "bytes": m_bytes,
                        "source_ids": list(dem_cfg["source_ids"]),
                    },
                    "width": int(hm_data["width"]),
                    "height": int(hm_data["height"]),
                    "encoding": "float32_le",
                    "nodata": None,
                    "row_order": "north_to_south",
                    "col_order": "west_to_east",
                    "samples": "grid_nodes",
                    "height_reference": "offset_from_origin_elevation_m",
                    "extent_m": list(hm_data["extent_m"]),
                    "origin": dict(hm_data["origin"]),
                    "frame": "local_enu_x_east_y_up_z_south",
                    "vertical_datum": str(dem_cfg["vertical_datum"]),
                    "meters_per_unit": 1,
                }

                features_all: dict[str, Any] = {}
                for tkey, tfeat in terrain_res["features"].items():
                    features_all[tkey] = {
                        "value": float(tfeat["value"]),
                        "unit": tfeat["unit"],
                        "quantity": tfeat["quantity"],
                        "method": tfeat["method"],
                        "spatial_resolution_m": float(tfeat["spatial_resolution_m"]),
                        "support_window_m": float(tfeat["support_window_m"]),
                        "period": None,
                        "source_ids": list(dem_cfg["source_ids"]),
                        "missing_reason": None,
                    }
                for nkey, nval in prep["non_terrain_features"].items():
                    features_all[nkey] = nval

                ordered_features = {k: features_all[k] for k in FEATURE_KEYS}

                camera_obj = site.get("camera") or terrain_res["default_camera"]
                locations_for_profile[sid] = {
                    "id": sid,
                    "name": site["name"],
                    "body": site["body"],
                    "coordinates": prep["coordinates"],
                    "aoi": {
                        "local_path": prep["aoi_pub_url"],
                        "source_ids": list(site["aoi"]["source_ids"]),
                    },
                    "missions": list(site["missions"]),
                    "features": ordered_features,
                    "geology": prep["geology"],
                    "assets": {
                        "dem": prep["dem_asset"],
                        "heightmap": heightmap_obj,
                        "splat": prep["splat_obj"],
                    },
                    "camera": camera_obj,
                }

            earth_candidates = [locations_for_profile[eid] for eid in earth_ids]
            for tid in target_ids:
                target_loc = locations_for_profile[tid]
                analogs, excluded = rank_analogs(target_loc, earth_candidates, profile, batch_size=64)
                comparisons.append(
                    {
                        "target": target_loc,
                        "profile_id": pid,
                        "analogs": analogs,
                        "excluded": excluded,
                    }
                )

        dataset: dict[str, object] = {
            "schema_version": "1.0.0",
            "generated_at": _utc_now_iso(),
            "sources": [sources_registry[k] for k in sorted(sources_registry)],
            "profiles": profiles,
            "comparisons": comparisons,
        }

        # Validate dataset against staged assets BEFORE publishing anything to public_root or output_path
        validate_dataset(
            dataset,
            schema_path,
            staging_root,
            require_demo_ready=require_demo_ready,
            repo_root=repo_root,
        )

        # Publish validated content-addressed assets transactionally, then commit dataset JSON last
        newly_published: list[pathlib.Path] = []
        try:
            for rel_path, expected_sha in staged_assets:
                src_staged = resolve_safe_path(rel_path, staging_root)
                dest_pub = resolve_safe_path(rel_path, public_root)
                if dest_pub.is_file() and sha256_file(dest_pub) == expected_sha:
                    continue
                atomic_copy_file(src_staged, dest_pub)
                newly_published.append(dest_pub)
            atomic_write_json(output_path, dataset)
        except Exception:
            for created in newly_published:
                try:
                    if created.exists():
                        created.unlink()
                except OSError:
                    pass
            raise

        _report_dataset_summary(dataset, "EXPORTED_VALIDATED")
        return 0
    finally:
        shutil.rmtree(staging_root, ignore_errors=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="fetch_and_score.py",
        description="Planetary Analog Explorer offline data ingestion, terrain extraction, and scoring CLI",
    )
    parser.add_argument(
        "--mode",
        required=True,
        choices=["prepare", "offline", "validate", "empty"],
        help="Pipeline execution mode",
    )
    parser.add_argument(
        "--manifest",
        type=pathlib.Path,
        default=_DEFAULT_REPO_ROOT / "data-pipeline" / "config" / "sites_manifest.json",
        help="Path to sites_manifest.json",
    )
    parser.add_argument(
        "--profiles",
        type=pathlib.Path,
        default=_DEFAULT_REPO_ROOT / "data-pipeline" / "config" / "scoring_profiles.json",
        help="Path to scoring_profiles.json",
    )
    parser.add_argument(
        "--output",
        type=pathlib.Path,
        default=_DEFAULT_REPO_ROOT / "web-client" / "public" / "data" / "locations_dataset.json",
        help="Output JSON dataset path",
    )
    parser.add_argument(
        "--schema",
        type=pathlib.Path,
        default=None,
        help="Path to analog_location.schema.json",
    )
    parser.add_argument(
        "--public-root",
        type=pathlib.Path,
        default=None,
        help="Public assets root directory (defaults from --output)",
    )
    parser.add_argument(
        "--cache-dir",
        type=pathlib.Path,
        default=None,
        help="Cache directory for verified external responses (defaults to <repo_root>/data-pipeline/cache)",
    )
    parser.add_argument(
        "--require-demo-ready",
        action="store_true",
        help="Require >=1 supported target, >=1 ranked Earth analog, and validated terrain assets",
    )

    args = parser.parse_args(argv)
    output_path = args.output.expanduser().resolve()
    public_root, repo_root = _infer_public_and_repo_roots(output_path, args.public_root)
    schema_path = (
        args.schema.expanduser().resolve()
        if args.schema is not None
        else _resolve_default_schema_path(repo_root)
    )
    cache_dir = (
        args.cache_dir.expanduser().resolve()
        if args.cache_dir is not None
        else (repo_root / "data-pipeline" / "cache").resolve()
    )

    try:
        if args.mode == "empty":
            empty_dataset: dict[str, object] = {
                "schema_version": "1.0.0",
                "generated_at": _utc_now_iso(),
                "sources": [],
                "profiles": [],
                "comparisons": [],
            }
            validate_dataset(
                empty_dataset,
                schema_path,
                public_root,
                require_demo_ready=args.require_demo_ready,
            )
            atomic_write_json(output_path, empty_dataset)
            print("EMPTY_NOT_SCIENCE_VALIDATED")
            return 0

        if args.mode == "validate":
            if not output_path.is_file():
                raise FileNotFoundError(f"Output dataset file does not exist: {output_path}")
            import json

            dataset = json.loads(output_path.read_text(encoding="utf-8"))
            validate_dataset(
                dataset,
                schema_path,
                public_root,
                require_demo_ready=args.require_demo_ready,
            )
            _report_dataset_summary(dataset, "VALIDATED_SCHEMA_AND_INVARIANTS")
            return 0

        return _run_prepare_or_offline(
            manifest_path=args.manifest.expanduser().resolve(),
            profiles_path=args.profiles.expanduser().resolve(),
            output_path=output_path,
            schema_path=schema_path,
            public_root=public_root,
            repo_root=repo_root,
            cache_dir=cache_dir,
            offline=(args.mode == "offline"),
            require_demo_ready=args.require_demo_ready,
        )
    except (
        DataReadinessError,
        ManifestValidationError,
        ScoringValidationError,
        DatasetValidationError,
        TerrainValidationError,
        ValueError,
        FileNotFoundError,
        OSError,
    ) as exc:
        print(f"ERROR [{args.mode}]: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
