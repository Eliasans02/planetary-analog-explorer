# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""JSON Schema and cross-field semantic invariant validation for PAE datasets."""

from __future__ import annotations

import json
import math
import pathlib
from datetime import datetime
from typing import Any

import jsonschema
import numpy as np

from pae_pipeline.export import sha256_file
from pae_pipeline.scoring import (
    CANONICAL_UNITS,
    FEATURE_KEYS,
    SAFE_ID_RE,
    _periods_compatible,
    _temp_family,
    check_location_feature_compatibility,
    score_matrix,
    validate_profile,
)
from pae_pipeline.sources import (
    BODY_TO_OUTPUT_FRAME,
    ManifestValidationError,
    resolve_safe_path,
    validate_aoi_geojson,
    validate_https_url,
)


class DatasetValidationError(ValueError):
    """Raised when an exported dataset fails JSON Schema or semantic invariant checks."""


def _assert_no_non_finite(obj: Any, path: str = "$") -> None:
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        if not math.isfinite(float(obj)):
            raise DatasetValidationError(f"Non-finite number {obj!r} at {path}")
        return
    if isinstance(obj, list):
        for idx, item in enumerate(obj):
            _assert_no_non_finite(item, f"{path}[{idx}]")
        return
    if isinstance(obj, dict):
        for key, val in obj.items():
            _assert_no_non_finite(val, f"{path}.{key}")


def _parse_utc_iso(value: str, field_path: str) -> datetime:
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise DatasetValidationError(f"Invalid ISO-8601 date-time {value!r} at {field_path}") from exc
    if dt.tzinfo is None:
        raise DatasetValidationError(f"Timestamp missing timezone at {field_path}: {value!r}")
    return dt


def _infer_repo_root(public_root: pathlib.Path) -> pathlib.Path:
    pub = pathlib.Path(public_root).resolve()
    if pub.name == "public" and pub.parent.name == "web-client":
        return pub.parent.parent.resolve()
    return pub.parent.resolve()


def _resolve_public_asset(asset_url: str, public_root: pathlib.Path) -> pathlib.Path:
    if not isinstance(asset_url, str) or not asset_url.startswith("/assets/"):
        raise DatasetValidationError(f"Public asset path must start with '/assets/', got {asset_url!r}")
    rel = asset_url.lstrip("/")
    resolved = resolve_safe_path(rel, public_root)
    if not resolved.is_file():
        raise DatasetValidationError(f"Referenced public asset file does not exist: {resolved}")
    return resolved


def _verify_asset_obj(
    asset: dict[str, Any],
    public_root: pathlib.Path,
    known_sources: set[str],
    label: str,
) -> pathlib.Path:
    for sid in asset["source_ids"]:
        if sid not in known_sources:
            raise DatasetValidationError(f"{label} references unknown source_id {sid!r}")
    resolved = _resolve_public_asset(asset["path"], public_root)
    actual_bytes = resolved.stat().st_size
    if actual_bytes != int(asset["bytes"]):
        raise DatasetValidationError(
            f"{label} byte size mismatch for {asset['path']}: "
            f"expected {asset['bytes']}, got {actual_bytes}"
        )
    actual_sha = sha256_file(resolved)
    if actual_sha != asset["sha256"]:
        raise DatasetValidationError(
            f"{label} SHA-256 mismatch for {asset['path']}: "
            f"expected {asset['sha256']}, got {actual_sha}"
        )
    return resolved


def _validate_heightmap_and_camera(
    loc: dict[str, Any],
    public_root: pathlib.Path,
    known_sources: set[str],
    loc_label: str,
) -> None:
    hm = loc["assets"]["heightmap"]
    camera = loc["camera"]
    if hm is not None:
        h_path = _verify_asset_obj(hm["asset"], public_root, known_sources, f"{loc_label}.heightmap.asset")
        m_path = _verify_asset_obj(hm["valid_mask"], public_root, known_sources, f"{loc_label}.heightmap.valid_mask")
        width = int(hm["width"])
        height = int(hm["height"])
        x_min, z_min, x_max, z_max = [float(v) for v in hm["extent_m"]]
        if not (x_min < x_max and z_min < z_max):
            raise DatasetValidationError(
                f"{loc_label}.heightmap.extent_m must satisfy x_min<x_max and z_min<z_max, got {hm['extent_m']}"
            )
        expected_h_bytes = width * height * 4
        expected_m_bytes = width * height
        h_raw = h_path.read_bytes()
        m_raw = m_path.read_bytes()
        if len(h_raw) != expected_h_bytes:
            raise DatasetValidationError(
                f"{loc_label}.heightmap buffer length {len(h_raw)} != width*height*4 ({expected_h_bytes})"
            )
        if len(m_raw) != expected_m_bytes:
            raise DatasetValidationError(
                f"{loc_label}.heightmap mask length {len(m_raw)} != width*height ({expected_m_bytes})"
            )
        heights = np.frombuffer(h_raw, dtype="<f4").reshape((height, width))
        mask = np.frombuffer(m_raw, dtype=np.uint8).reshape((height, width))
        if not np.all(np.isfinite(heights)):
            raise DatasetValidationError(f"{loc_label}.heightmap contains non-finite float32 values")
        if not np.all((mask == 0) | (mask == 1)):
            raise DatasetValidationError(f"{loc_label}.heightmap valid_mask contains values outside {{0, 1}}")
        if not np.any(mask == 1):
            raise DatasetValidationError(f"{loc_label}.heightmap valid_mask has zero valid nodes")
        if np.any(heights[mask == 0] != 0.0):
            raise DatasetValidationError(
                f"{loc_label}.heightmap invalid nodes (mask=0) must store 0.0 padding"
            )

        if camera is not None:
            _validate_camera_against_heightmap(camera, hm, heights, mask, loc_label)
    elif camera is not None:
        _validate_camera_basic(camera, loc_label)


def _validate_camera_basic(camera: dict[str, Any], loc_label: str) -> None:
    if float(camera["near"]) >= float(camera["far"]):
        raise DatasetValidationError(f"{loc_label}.camera requires near < far")
    pos = np.array(camera["position"], dtype=np.float64)
    look = np.array(camera["lookAt"], dtype=np.float64)
    if np.linalg.norm(pos - look) <= 1e-9:
        raise DatasetValidationError(f"{loc_label}.camera requires nonzero viewing direction (position != lookAt)")


def _validate_camera_against_heightmap(
    camera: dict[str, Any],
    hm: dict[str, Any],
    heights: np.ndarray,
    mask: np.ndarray,
    loc_label: str,
) -> None:
    _validate_camera_basic(camera, loc_label)
    px, py, pz = [float(v) for v in camera["position"]]
    x_min, z_min, x_max, z_max = [float(v) for v in hm["extent_m"]]
    if not (x_min <= px <= x_max and z_min <= pz <= z_max):
        raise DatasetValidationError(
            f"{loc_label}.camera position ({px}, {pz}) outside heightmap extent {hm['extent_m']}"
        )
    width = int(hm["width"])
    height = int(hm["height"])
    dx = (x_max - x_min) / (width - 1)
    dz = (z_max - z_min) / (height - 1)
    col_idx = min(width - 1, max(0, int(round((px - x_min) / dx))))
    row_idx = min(height - 1, max(0, int(round((pz - z_min) / dz))))
    if int(mask[row_idx, col_idx]) != 1:
        raise DatasetValidationError(
            f"{loc_label}.camera initial position ({px}, {pz}) is not over valid terrain (mask=0)"
        )
    terrain_y = float(heights[row_idx, col_idx])
    if py < terrain_y - 1e-3:
        raise DatasetValidationError(
            f"{loc_label}.camera y={py} lies below terrain height {terrain_y}"
        )


_PLY_TYPE_SIZES: dict[str, int] = {
    "char": 1,
    "uchar": 1,
    "int8": 1,
    "uint8": 1,
    "short": 2,
    "ushort": 2,
    "int16": 2,
    "uint16": 2,
    "int": 4,
    "uint": 4,
    "int32": 4,
    "uint32": 4,
    "float": 4,
    "float32": 4,
    "double": 8,
    "float64": 8,
}


def _validate_splat_binary_file(sp_path: pathlib.Path, g_count: int, loc_label: str) -> None:
    expected_size = g_count * 32
    actual_size = sp_path.stat().st_size
    if actual_size != expected_size:
        raise DatasetValidationError(
            f"{loc_label}.splat file size {actual_size} != gaussian_count*32 ({expected_size})"
        )
    chunk_records = 4096
    chunk_bytes = chunk_records * 32
    with sp_path.open("rb") as handle:
        while True:
            buf = handle.read(chunk_bytes)
            if not buf:
                break
            if len(buf) % 32 != 0:
                raise DatasetValidationError(f"{loc_label}.splat truncated 32-byte record")
            records = np.frombuffer(buf, dtype="<f4").reshape((-1, 8))
            if not np.all(np.isfinite(records[:, :6])):
                raise DatasetValidationError(
                    f"{loc_label}.splat contains non-finite position or scale floats"
                )


def _validate_ply_file(sp_path: pathlib.Path, g_count: int, loc_label: str) -> None:
    max_header_bytes = 65536
    with sp_path.open("rb") as handle:
        head = handle.read(max_header_bytes)
    marker_idx = head.find(b"end_header\n")
    marker_len = len(b"end_header\n")
    if marker_idx == -1:
        marker_idx = head.find(b"end_header\r\n")
        marker_len = len(b"end_header\r\n")
    if marker_idx == -1:
        raise DatasetValidationError(
            f"{loc_label}.splat PLY missing 'end_header' within {max_header_bytes} bytes"
        )

    header_end = marker_idx + marker_len
    try:
        header_text = head[:marker_idx].decode("ascii")
    except UnicodeDecodeError as exc:
        raise DatasetValidationError(f"{loc_label}.splat PLY header is not valid ASCII") from exc

    lines = [ln.strip() for ln in header_text.splitlines() if ln.strip()]
    if not lines or lines[0] != "ply":
        raise DatasetValidationError(f"{loc_label}.splat PLY missing 'ply' magic header")

    fmt_kind: str | None = None
    elements: list[tuple[str, int, list[tuple[str, str]]]] = []
    current_elem_idx: int | None = None

    for line in lines[1:]:
        parts = line.split()
        if parts[0] == "comment" or parts[0] == "obj_info":
            continue
        if parts[0] == "format":
            if len(parts) != 3 or parts[2] != "1.0":
                raise DatasetValidationError(f"{loc_label}.splat unsupported PLY format line: {line!r}")
            fmt_kind = parts[1]
        elif parts[0] == "element":
            if len(parts) != 3:
                raise DatasetValidationError(f"{loc_label}.splat malformed PLY element line: {line!r}")
            try:
                cnt = int(parts[2])
            except ValueError as exc:
                raise DatasetValidationError(f"{loc_label}.splat invalid PLY element count") from exc
            if cnt < 0:
                raise DatasetValidationError(f"{loc_label}.splat negative PLY element count")
            elements.append((parts[1], cnt, []))
            current_elem_idx = len(elements) - 1
        elif parts[0] == "property":
            if current_elem_idx is None:
                raise DatasetValidationError(f"{loc_label}.splat PLY property before element")
            if len(parts) == 3 and parts[1] in _PLY_TYPE_SIZES:
                elements[current_elem_idx][2].append((parts[1], parts[2]))
            else:
                raise DatasetValidationError(
                    f"{loc_label}.splat unsupported PLY property declaration: {line!r}"
                )
        else:
            raise DatasetValidationError(f"{loc_label}.splat unrecognized PLY header directive: {line!r}")

    if fmt_kind not in {"binary_little_endian", "binary_big_endian", "ascii"}:
        raise DatasetValidationError(f"{loc_label}.splat unsupported PLY format {fmt_kind!r}")

    vertex_elems = [el for el in elements if el[0] == "vertex"]
    if len(vertex_elems) != 1:
        raise DatasetValidationError(f"{loc_label}.splat PLY must declare exactly one 'vertex' element")
    _vname, v_count, v_props = vertex_elems[0]
    if v_count != g_count:
        raise DatasetValidationError(
            f"{loc_label}.splat PLY vertex count {v_count} != gaussian_count {g_count}"
        )
    prop_names = {pname for _ptype, pname in v_props}
    required_gaussian_props = {"x", "y", "z", "opacity", "scale_0", "rot_0"}
    missing_props = required_gaussian_props - prop_names
    if missing_props:
        raise DatasetValidationError(
            f"{loc_label}.splat PLY missing Gaussian splat properties: {sorted(missing_props)}"
        )

    if fmt_kind in {"binary_little_endian", "binary_big_endian"}:
        expected_payload_bytes = 0
        for _ename, ecnt, eprops in elements:
            stride = sum(_PLY_TYPE_SIZES[ptype] for ptype, _pname in eprops)
            expected_payload_bytes += ecnt * stride
        actual_size = sp_path.stat().st_size
        if actual_size != header_end + expected_payload_bytes:
            raise DatasetValidationError(
                f"{loc_label}.splat binary PLY byte length {actual_size} != expected "
                f"{header_end + expected_payload_bytes}"
            )
    else:
        expected_records = sum(ecnt for _ename, ecnt, _eprops in elements)
        actual_records = 0
        with sp_path.open("rb") as handle:
            handle.seek(header_end)
            for raw_line in handle:
                if raw_line.strip():
                    actual_records += 1
        if actual_records != expected_records:
            raise DatasetValidationError(
                f"{loc_label}.splat ASCII PLY record count {actual_records} != {expected_records}"
            )


def _validate_splat(
    splat: dict[str, Any],
    public_root: pathlib.Path,
    known_sources: set[str],
    loc_label: str,
) -> None:
    sp_path = _verify_asset_obj(splat["asset"], public_root, known_sources, f"{loc_label}.splat.asset")
    g_count = int(splat["gaussian_count"])
    fmt = splat["format"]
    if fmt == "splat":
        _validate_splat_binary_file(sp_path, g_count, loc_label)
    elif fmt == "ply":
        _validate_ply_file(sp_path, g_count, loc_label)
    else:
        raise DatasetValidationError(f"{loc_label}.splat unsupported format {fmt!r}")

    # Three.js column-major 4x4 matrix
    mat = np.array(splat["world_from_asset"], dtype=np.float64).reshape((4, 4), order="F")
    if not np.all(np.isfinite(mat)):
        raise DatasetValidationError(f"{loc_label}.splat.world_from_asset has non-finite entries")
    if not np.allclose(mat[3, :], [0.0, 0.0, 0.0, 1.0], atol=1e-6):
        raise DatasetValidationError(
            f"{loc_label}.splat.world_from_asset bottom row must be [0,0,0,1]"
        )
    linear = mat[:3, :3]
    det = float(np.linalg.det(linear))
    if not math.isfinite(det) or det <= 1e-12:
        raise DatasetValidationError(
            f"{loc_label}.splat.world_from_asset upper-left 3x3 must be nonsingular with det > 0 (got {det})"
        )
    col_norms = np.linalg.norm(linear, axis=0)
    if np.any(col_norms <= 1e-9):
        raise DatasetValidationError(f"{loc_label}.splat.world_from_asset has zero-scale axis")
    normalized = linear / col_norms[np.newaxis, :]
    gram = normalized.T @ normalized
    if not np.allclose(gram, np.eye(3), atol=1e-4):
        raise DatasetValidationError(
            f"{loc_label}.splat.world_from_asset contains unsupported shear or non-orthogonal axes"
        )


def _validate_location_semantics(
    loc: dict[str, Any],
    public_root: pathlib.Path,
    source_map: dict[str, dict[str, Any]],
    loc_label: str,
) -> None:
    if not SAFE_ID_RE.match(str(loc["id"])):
        raise DatasetValidationError(
            f"{loc_label}.id must match [A-Za-z0-9_-]+, got {loc['id']!r}"
        )
    known_sources = set(source_map.keys())
    body = loc["body"]
    expected_frame = BODY_TO_OUTPUT_FRAME[body]
    if loc["coordinates"]["frame"] != expected_frame:
        raise DatasetValidationError(
            f"{loc_label}.coordinates.frame {loc['coordinates']['frame']!r} != {expected_frame!r}"
        )
    for sid in loc["coordinates"]["source_ids"]:
        if sid not in known_sources:
            raise DatasetValidationError(f"{loc_label}.coordinates unknown source_id {sid!r}")

    for sid in loc["aoi"]["source_ids"]:
        if sid not in known_sources:
            raise DatasetValidationError(f"{loc_label}.aoi unknown source_id {sid!r}")
    aoi_path = _resolve_public_asset(loc["aoi"]["local_path"], public_root)
    validate_aoi_geojson(
        aoi_path,
        expected_lat_deg=float(loc["coordinates"]["latitude_deg"]),
        expected_lon_deg=float(loc["coordinates"]["longitude_deg"]),
    )

    # Features
    features = loc["features"]
    for key in FEATURE_KEYS:
        feat = features[key]
        if feat["unit"] != CANONICAL_UNITS[key]:
            raise DatasetValidationError(
                f"{loc_label}.features.{key} unit {feat['unit']!r} != {CANONICAL_UNITS[key]!r}"
            )
        for sid in feat["source_ids"]:
            if sid not in known_sources:
                raise DatasetValidationError(
                    f"{loc_label}.features.{key} unknown source_id {sid!r}"
                )
        if feat["period"] is not None:
            t0 = _parse_utc_iso(feat["period"]["start"], f"{loc_label}.features.{key}.period.start")
            t1 = _parse_utc_iso(feat["period"]["end"], f"{loc_label}.features.{key}.period.end")
            if t0 > t1:
                raise DatasetValidationError(
                    f"{loc_label}.features.{key}.period start > end"
                )

    s_mean = features["slope_mean_deg"]["value"]
    s_max = features["slope_max_deg"]["value"]
    if s_mean is not None and s_max is not None and float(s_mean) > float(s_max) + 1e-12:
        raise DatasetValidationError(
            f"{loc_label}: slope_mean_deg ({s_mean}) > slope_max_deg ({s_max})"
        )

    t_min = features["temp_min_c"]
    t_max = features["temp_max_c"]
    t_min_fam = _temp_family(str(t_min["quantity"]))
    t_max_fam = _temp_family(str(t_max["quantity"]))
    if (
        t_min["value"] is not None
        and t_max["value"] is not None
        and t_min_fam is not None
        and t_min_fam == t_max_fam
        and _periods_compatible(t_min["period"], t_max["period"])
        and float(t_min["value"]) > float(t_max["value"]) + 1e-12
    ):
        raise DatasetValidationError(
            f"{loc_label}: temp_min_c ({t_min['value']}) > temp_max_c ({t_max['value']})"
        )

    # Geology
    geo = loc["geology"]
    for sid in geo["source_ids"]:
        if sid not in known_sources:
            raise DatasetValidationError(f"{loc_label}.geology unknown source_id {sid!r}")
        src_obj = source_map[sid]
        if geo["classes"] and (
            "soilgrids" in src_obj["provider"].lower()
            or "soilgrids" in src_obj["product_id"].lower()
        ):
            raise DatasetValidationError(
                f"{loc_label}.geology cannot use SoilGrids as mineralogy classes"
            )

    # Assets & Camera
    if loc["assets"]["dem"] is not None:
        _verify_asset_obj(loc["assets"]["dem"], public_root, known_sources, f"{loc_label}.assets.dem")
    _validate_heightmap_and_camera(loc, public_root, known_sources, loc_label)
    if loc["assets"]["splat"] is not None:
        _validate_splat(loc["assets"]["splat"], public_root, known_sources, loc_label)


def validate_dataset(
    dataset: dict[str, object],
    schema_path: pathlib.Path,
    public_root: pathlib.Path,
    *,
    require_demo_ready: bool,
    repo_root: pathlib.Path | None = None,
) -> None:
    """Validate dataset against immutable JSON Schema and Contract 1.0.0 invariants."""
    if not isinstance(dataset, dict):
        raise DatasetValidationError("Dataset root must be a JSON object")
    _assert_no_non_finite(dataset)

    schema_file = pathlib.Path(schema_path)
    if not schema_file.is_file():
        raise FileNotFoundError(f"JSON Schema file does not exist: {schema_file}")
    schema = json.loads(schema_file.read_text(encoding="utf-8"))

    validator = jsonschema.Draft202012Validator(
        schema,
        format_checker=jsonschema.FormatChecker(),
    )
    errors = sorted(validator.iter_errors(dataset), key=lambda err: list(err.path))
    if errors:
        first = errors[0]
        loc = ".".join(str(p) for p in first.path) or "<root>"
        raise DatasetValidationError(f"JSON Schema violation at {loc}: {first.message}")

    _parse_utc_iso(str(dataset["generated_at"]), "$.generated_at")

    pub_root = pathlib.Path(public_root).resolve()
    resolved_repo_root = (
        pathlib.Path(repo_root).resolve() if repo_root is not None else _infer_repo_root(pub_root)
    )

    # Sources: unique IDs + strict URL safety + file existence & hash verification inside repo_root
    sources = dataset["sources"]
    source_map: dict[str, dict[str, Any]] = {}
    for idx, src in enumerate(sources):
        sid = src["id"]
        if sid in source_map:
            raise DatasetValidationError(f"Duplicate source id {sid!r}")
        for url_key in ("product_url", "access_url"):
            try:
                validate_https_url(src[url_key], f"$.sources[{idx}].{url_key}")
            except ManifestValidationError as exc:
                raise DatasetValidationError(str(exc)) from exc
        _parse_utc_iso(src["retrieved_at"], f"$.sources[{idx}].retrieved_at")
        resolved_src = resolve_safe_path(src["local_path"], resolved_repo_root)
        if not resolved_src.is_file():
            raise DatasetValidationError(
                f"Source '{sid}' local_path file does not exist: {resolved_src}"
            )
        actual_sha = sha256_file(resolved_src)
        if actual_sha != src["sha256"]:
            raise DatasetValidationError(
                f"Source '{sid}' SHA-256 mismatch: expected {src['sha256']}, got {actual_sha}"
            )
        source_map[sid] = src

    known_source_ids = set(source_map.keys())

    # Profiles: unique IDs + semantic validation
    profiles = dataset["profiles"]
    profile_map: dict[str, dict[str, Any]] = {}
    for prof in profiles:
        pid = prof["id"]
        if pid in profile_map:
            raise DatasetValidationError(f"Duplicate profile id {pid!r}")
        validate_profile(prof, known_source_ids=known_source_ids)
        profile_map[pid] = prof

    # Comparisons
    comparisons = dataset["comparisons"]
    ranked_comparisons_count = 0
    for c_idx, comp in enumerate(comparisons):
        pid = comp["profile_id"]
        if pid not in profile_map:
            raise DatasetValidationError(
                f"comparisons[{c_idx}] references unknown profile_id {pid!r}"
            )
        profile = profile_map[pid]
        target = comp["target"]
        analogs = comp["analogs"]
        excluded = comp["excluded"]

        seen_loc_ids: set[str] = {target["id"]}
        _validate_location_semantics(target, pub_root, source_map, f"comparisons[{c_idx}].target")

        for a_idx, analog in enumerate(analogs):
            aloc = analog["location"]
            aid = aloc["id"]
            if aid in seen_loc_ids:
                raise DatasetValidationError(
                    f"comparisons[{c_idx}] duplicate location id {aid!r}"
                )
            seen_loc_ids.add(aid)
            _validate_location_semantics(
                aloc, pub_root, source_map, f"comparisons[{c_idx}].analogs[{a_idx}].location"
            )

        for ex in excluded:
            ex_id = ex["location_id"]
            if ex_id in seen_loc_ids:
                raise DatasetValidationError(
                    f"comparisons[{c_idx}] excluded location_id {ex_id!r} collides with target or ranked analog"
                )
            seen_loc_ids.add(ex_id)

        if len(analogs) > 0:
            ranked_comparisons_count += 1
            expected_ranks = list(range(1, len(analogs) + 1))
            actual_ranks = [int(a["rank"]) for a in analogs]
            if actual_ranks != expected_ranks:
                raise DatasetValidationError(
                    f"comparisons[{c_idx}] ranks {actual_ranks} != contiguous {expected_ranks}"
                )

            # Verify sort order: descending similarity_score then ascending location.id
            sort_keys = [(-float(a["similarity_score"]), str(a["location"]["id"])) for a in analogs]
            if sort_keys != sorted(sort_keys):
                raise DatasetValidationError(
                    f"comparisons[{c_idx}] analogs are not sorted by descending score then ascending location.id"
                )

            # Independent score & breakdown recomputation
            t_reasons = check_location_feature_compatibility(target, profile)
            if t_reasons:
                raise DatasetValidationError(
                    f"comparisons[{c_idx}] target incompatible with profile '{pid}' yet has ranked analogs: {t_reasons}"
                )
            active_pfs = profile["features"]
            active_keys = [pf["key"] for pf in active_pfs]
            target_vec = np.array([float(target["features"][k]["value"]) for k in active_keys], dtype=np.float64)
            weights_vec = np.array([float(pf["weight"]) for pf in active_pfs], dtype=np.float64)
            lower_vec = np.array([float(pf["lower"]) for pf in active_pfs], dtype=np.float64)
            upper_vec = np.array([float(pf["upper"]) for pf in active_pfs], dtype=np.float64)
            cand_mat = np.array(
                [[float(a["location"]["features"][k]["value"]) for k in active_keys] for a in analogs],
                dtype=np.float64,
            )
            for a_idx, a in enumerate(analogs):
                c_reasons = check_location_feature_compatibility(
                    a["location"], profile, reference_location=target
                )
                if c_reasons:
                    raise DatasetValidationError(
                        f"comparisons[{c_idx}].analogs[{a_idx}] incompatible with profile/target: {c_reasons}"
                    )

            exp_total, exp_pct, exp_sq = score_matrix(
                target_vec, cand_mat, weights_vec, lower_vec, upper_vec, float(profile["alpha"])
            )
            active_idx_map = {k: i for i, k in enumerate(active_keys)}
            for a_idx, analog in enumerate(analogs):
                if abs(float(analog["similarity_score"]) - float(exp_total[a_idx])) > 1e-9:
                    raise DatasetValidationError(
                        f"comparisons[{c_idx}].analogs[{a_idx}] similarity_score {analog['similarity_score']} "
                        f"!= recomputed {float(exp_total[a_idx])}"
                    )
                if abs(float(analog["coverage"]) - 1.0) > 1e-12:
                    raise DatasetValidationError(
                        f"comparisons[{c_idx}].analogs[{a_idx}] coverage {analog['coverage']} != 1.0"
                    )
                for key in FEATURE_KEYS:
                    fb = analog["breakdown"][key]
                    if key in active_idx_map:
                        j = active_idx_map[key]
                        if fb["similarity_pct"] is None or fb["squared_distance_contribution"] is None:
                            raise DatasetValidationError(
                                f"comparisons[{c_idx}].analogs[{a_idx}].breakdown.{key} unexpectedly null"
                            )
                        if abs(float(fb["similarity_pct"]) - float(exp_pct[a_idx, j])) > 1e-9:
                            raise DatasetValidationError(
                                f"comparisons[{c_idx}].analogs[{a_idx}].breakdown.{key}.similarity_pct mismatch"
                            )
                        if abs(float(fb["squared_distance_contribution"]) - float(exp_sq[a_idx, j])) > 1e-9:
                            raise DatasetValidationError(
                                f"comparisons[{c_idx}].analogs[{a_idx}].breakdown.{key}.squared_distance_contribution mismatch"
                            )
                    else:
                        if fb["similarity_pct"] is not None or fb["squared_distance_contribution"] is not None:
                            raise DatasetValidationError(
                                f"comparisons[{c_idx}].analogs[{a_idx}].breakdown.{key} inactive feature must be null"
                            )

    if require_demo_ready:
        if len(comparisons) < 1 or ranked_comparisons_count < 1:
            raise DatasetValidationError(
                "Demo-ready check failed: requires >= 1 supported target with >= 1 ranked real Earth analog"
            )
        for c_idx, comp in enumerate(comparisons):
            if not comp["analogs"]:
                continue
            t_assets = comp["target"]["assets"]
            if t_assets["dem"] is None or t_assets["heightmap"] is None:
                raise DatasetValidationError(
                    f"Demo-ready check failed: comparisons[{c_idx}].target lacks real DEM or heightmap"
                )
            for a_idx, analog in enumerate(comp["analogs"]):
                a_assets = analog["location"]["assets"]
                if a_assets["dem"] is None or a_assets["heightmap"] is None:
                    raise DatasetValidationError(
                        f"Demo-ready check failed: comparisons[{c_idx}].analogs[{a_idx}] lacks real DEM or heightmap"
                    )
