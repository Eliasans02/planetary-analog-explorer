# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Profile validation and matrix analog scoring for PAE LOOP_0.

Implements ``weighted_cosine_euclidean_v1`` with fixed independent calibration
bounds, explicit zero-norm rules, chunked memory-bounded batching, and strict
semantic matching.
"""

from __future__ import annotations

import json
import math
import pathlib
import re
from datetime import datetime
from typing import Any

import numpy as np

SAFE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")

FEATURE_KEYS: tuple[str, ...] = (
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

TERRAIN_FEATURE_KEYS: frozenset[str] = frozenset(
    {
        "slope_mean_deg",
        "slope_max_deg",
        "roughness_index",
        "elevation_delta_m",
    }
)

TEMPERATURE_FEATURE_KEYS: frozenset[str] = frozenset({"temp_min_c", "temp_max_c"})

CANONICAL_UNITS: dict[str, str] = {
    "slope_mean_deg": "deg",
    "slope_max_deg": "deg",
    "roughness_index": "1",
    "elevation_delta_m": "m",
    "temp_min_c": "degC",
    "temp_max_c": "degC",
    "solar_irradiance_kwh_m2": "kWh/m2/day",
    "aridity_index": "1",
    "albedo": "1",
}

FP_BOUND_TOLERANCE: float = 1e-12
FP_SCORE_TOLERANCE: float = 1e-10


class ScoringValidationError(ValueError):
    """Raised when scoring profiles, inputs, or calibration bounds are invalid."""


def _is_finite_real(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _clamp_with_tolerance(
    arr: np.ndarray,
    low: float,
    high: float,
    tol: float,
    label: str,
) -> np.ndarray:
    """Correct only floating-point-precision overshoots within ``tol``.

    Substantive out-of-range values fail loudly with ``ScoringValidationError``.
    """
    if np.any(~np.isfinite(arr)):
        raise ScoringValidationError(f"Non-finite values encountered in {label}")
    min_val = float(np.min(arr)) if arr.size > 0 else low
    max_val = float(np.max(arr)) if arr.size > 0 else high
    if min_val < low - tol or max_val > high + tol:
        raise ScoringValidationError(
            f"{label} out of valid range [{low}, {high}] beyond tolerance {tol}: "
            f"min={min_val}, max={max_val}"
        )
    return np.clip(arr, low, high)


def score_matrix(
    target: np.ndarray,
    candidates: np.ndarray,
    weights: np.ndarray,
    lower: np.ndarray,
    upper: np.ndarray,
    alpha: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Score ``N`` candidates against a target over ``D`` active features.

    Parameters
    ----------
    target:
        1-D array of shape ``(D,)`` containing finite target feature values.
    candidates:
        2-D array of shape ``(N, D)`` containing finite candidate values.
    weights:
        1-D array of shape ``(D,)`` with strictly positive finite weights.
    lower:
        1-D array of shape ``(D,)`` calibration lower bounds (``lower < upper``).
    upper:
        1-D array of shape ``(D,)`` calibration upper bounds.
    alpha:
        Blend factor in ``[0, 1]`` weighting cosine similarity vs Euclidean closeness.

    Returns
    -------
    tuple[np.ndarray, np.ndarray, np.ndarray]
        ``(total[N], per_feature_pct[N, D], squared_distance_contributions[N, D])``
    """
    target_arr = np.asarray(target, dtype=np.float64)
    cand_arr = np.asarray(candidates, dtype=np.float64)
    weight_arr = np.asarray(weights, dtype=np.float64)
    lower_arr = np.asarray(lower, dtype=np.float64)
    upper_arr = np.asarray(upper, dtype=np.float64)

    if target_arr.ndim != 1 or target_arr.shape[0] < 1:
        raise ScoringValidationError(f"target must be 1-D with D >= 1, got shape {target_arr.shape}")
    dim = target_arr.shape[0]

    if cand_arr.ndim != 2 or cand_arr.shape[1] != dim:
        raise ScoringValidationError(
            f"candidates must be 2-D with shape (N, {dim}), got shape {cand_arr.shape}"
        )
    if weight_arr.shape != (dim,) or lower_arr.shape != (dim,) or upper_arr.shape != (dim,):
        raise ScoringValidationError(
            f"weights, lower, and upper must have shape ({dim},)"
        )

    if not _is_finite_real(alpha):
        raise ScoringValidationError(f"alpha must be a finite real number, got {alpha!r}")
    alpha_f = float(alpha)
    if alpha_f < 0.0 or alpha_f > 1.0:
        raise ScoringValidationError(f"alpha must lie in [0, 1], got {alpha_f}")

    for name, arr in (
        ("target", target_arr),
        ("candidates", cand_arr),
        ("weights", weight_arr),
        ("lower", lower_arr),
        ("upper", upper_arr),
    ):
        if not np.all(np.isfinite(arr)):
            raise ScoringValidationError(f"Non-finite value (NaN or Inf) in {name}")

    if np.any(weight_arr <= 0.0):
        raise ScoringValidationError("All feature weights must be strictly > 0")
    if np.any(lower_arr >= upper_arr):
        raise ScoringValidationError("Calibration bounds must satisfy lower < upper for every feature")

    if np.any(target_arr < lower_arr) or np.any(target_arr > upper_arr):
        raise ScoringValidationError(
            "Target feature value(s) lie outside calibration bounds [lower, upper]; "
            "silent clipping is prohibited"
        )
    if cand_arr.shape[0] > 0 and (np.any(cand_arr < lower_arr) or np.any(cand_arr > upper_arr)):
        raise ScoringValidationError(
            "Candidate feature value(s) lie outside calibration bounds [lower, upper]; "
            "silent clipping is prohibited"
        )

    n_candidates = cand_arr.shape[0]
    if n_candidates == 0:
        return (
            np.empty((0,), dtype=np.float64),
            np.empty((0, dim), dtype=np.float64),
            np.empty((0, dim), dtype=np.float64),
        )

    span = upper_arr - lower_arr
    x = (target_arr - lower_arr) / span
    y = (cand_arr - lower_arr) / span
    total_weight = float(np.sum(weight_arr))

    diff = x[np.newaxis, :] - y
    sq_dist_contrib = (weight_arr[np.newaxis, :] * (diff * diff)) / total_weight
    dist = np.sqrt(np.sum(sq_dist_contrib, axis=1))
    dist = _clamp_with_tolerance(dist, 0.0, 1.0, FP_BOUND_TOLERANCE, "weighted_euclidean_distance")

    norm_x_sq = float(np.sum(weight_arr * (x * x)))
    norm_y_sq = np.sum(weight_arr[np.newaxis, :] * (y * y), axis=1)
    dot_xy = np.sum(weight_arr[np.newaxis, :] * x[np.newaxis, :] * y, axis=1)

    cosine = np.empty((n_candidates,), dtype=np.float64)
    if norm_x_sq == 0.0:
        cosine[norm_y_sq == 0.0] = 1.0
        cosine[norm_y_sq > 0.0] = 0.0
    else:
        zero_y = norm_y_sq == 0.0
        nonzero_y = ~zero_y
        cosine[zero_y] = 0.0
        if np.any(nonzero_y):
            denom = np.sqrt(norm_x_sq * norm_y_sq[nonzero_y])
            cosine[nonzero_y] = dot_xy[nonzero_y] / denom

    cosine = _clamp_with_tolerance(cosine, 0.0, 1.0, FP_BOUND_TOLERANCE, "weighted_cosine_similarity")

    total = 100.0 * (alpha_f * cosine + (1.0 - alpha_f) * (1.0 - dist))
    total = _clamp_with_tolerance(total, 0.0, 100.0, FP_SCORE_TOLERANCE, "similarity_score")

    per_feature_pct = 100.0 * (1.0 - np.abs(diff))
    per_feature_pct = _clamp_with_tolerance(
        per_feature_pct, 0.0, 100.0, FP_SCORE_TOLERANCE, "per_feature_pct"
    )

    return total, per_feature_pct, sq_dist_contrib


def _temp_family(quantity: str) -> str | None:
    lowered = quantity.lower()
    if "air_2m" in lowered:
        return "air_2m_temperature"
    if "surface" in lowered:
        return "surface_temperature"
    return None


def validate_profile(
    profile: dict[str, Any],
    *,
    known_source_ids: set[str] | None = None,
) -> None:
    """Strictly validate a scoring profile configuration or output profile object."""
    if not isinstance(profile, dict):
        raise ScoringValidationError("Profile must be an object")

    required_keys = {
        "id",
        "version",
        "algorithm",
        "alpha",
        "features",
        "comparison_resolution_m",
        "window_m",
        "min_valid_area_fraction",
    }
    missing = required_keys - set(profile.keys())
    if missing:
        raise ScoringValidationError(f"Profile missing required keys: {sorted(missing)}")
    extra = set(profile.keys()) - required_keys
    if extra:
        raise ScoringValidationError(f"Profile has unexpected keys: {sorted(extra)}")

    pid = profile["id"]
    if not isinstance(pid, str) or not SAFE_ID_RE.match(pid):
        raise ScoringValidationError(
            f"Profile 'id' must match [A-Za-z0-9_-]+, got {pid!r}"
        )
    if not isinstance(profile["version"], str) or not profile["version"].strip():
        raise ScoringValidationError(f"Profile '{pid}' version must be a non-empty string")
    if profile["algorithm"] != "weighted_cosine_euclidean_v1":
        raise ScoringValidationError(
            f"Profile '{pid}' unsupported algorithm {profile['algorithm']!r}"
        )

    alpha = profile["alpha"]
    if not _is_finite_real(alpha) or not (0.0 <= float(alpha) <= 1.0):
        raise ScoringValidationError(f"Profile '{pid}' alpha must be finite in [0, 1]")

    res_m = profile["comparison_resolution_m"]
    win_m = profile["window_m"]
    min_frac = profile["min_valid_area_fraction"]
    if not _is_finite_real(res_m) or float(res_m) <= 0.0:
        raise ScoringValidationError(f"Profile '{pid}' comparison_resolution_m must be > 0")
    if not _is_finite_real(win_m) or float(win_m) <= 0.0:
        raise ScoringValidationError(f"Profile '{pid}' window_m must be > 0")
    if not _is_finite_real(min_frac) or not (0.0 < float(min_frac) <= 1.0):
        raise ScoringValidationError(
            f"Profile '{pid}' min_valid_area_fraction must be in (0, 1]"
        )

    features = profile["features"]
    if not isinstance(features, list) or not (1 <= len(features) <= 9):
        raise ScoringValidationError(f"Profile '{pid}' features must have 1..9 items")

    seen_keys: set[str] = set()
    temp_families: set[str] = set()

    for pf in features:
        if not isinstance(pf, dict):
            raise ScoringValidationError(f"Profile '{pid}' feature entry must be an object")
        pf_required = {
            "key",
            "unit",
            "quantity",
            "weight",
            "lower",
            "upper",
            "calibration_source_ids",
            "calibration_method",
        }
        if set(pf.keys()) != pf_required:
            raise ScoringValidationError(
                f"Profile '{pid}' feature keys mismatch: expected {sorted(pf_required)}, "
                f"got {sorted(pf.keys())}"
            )
        key = pf["key"]
        if key not in CANONICAL_UNITS:
            raise ScoringValidationError(f"Profile '{pid}' unknown feature key {key!r}")
        if key in seen_keys:
            raise ScoringValidationError(f"Profile '{pid}' duplicate feature key {key!r}")
        seen_keys.add(key)

        if pf["unit"] != CANONICAL_UNITS[key]:
            raise ScoringValidationError(
                f"Profile '{pid}' feature '{key}' unit {pf['unit']!r} != canonical "
                f"{CANONICAL_UNITS[key]!r}"
            )
        qty = pf["quantity"]
        if not isinstance(qty, str) or not qty.strip():
            raise ScoringValidationError(f"Profile '{pid}' feature '{key}' empty quantity")

        if key in TEMPERATURE_FEATURE_KEYS:
            fam = _temp_family(qty)
            if fam is None:
                raise ScoringValidationError(
                    f"Profile '{pid}' temperature feature '{key}' quantity {qty!r} must "
                    "explicitly identify 'air_2m_temperature' or 'surface_temperature'"
                )
            temp_families.add(fam)

        if not _is_finite_real(pf["weight"]) or float(pf["weight"]) <= 0.0:
            raise ScoringValidationError(f"Profile '{pid}' feature '{key}' weight must be > 0")
        if not _is_finite_real(pf["lower"]) or not _is_finite_real(pf["upper"]):
            raise ScoringValidationError(f"Profile '{pid}' feature '{key}' bounds must be finite")
        if float(pf["lower"]) >= float(pf["upper"]):
            raise ScoringValidationError(
                f"Profile '{pid}' feature '{key}' requires lower < upper"
            )

        cal_src = pf["calibration_source_ids"]
        if (
            not isinstance(cal_src, list)
            or len(cal_src) == 0
            or len(set(cal_src)) != len(cal_src)
            or any(not isinstance(s, str) or not s.strip() for s in cal_src)
        ):
            raise ScoringValidationError(
                f"Profile '{pid}' feature '{key}' calibration_source_ids must be unique non-empty strings"
            )
        if known_source_ids is not None:
            missing_cal = [s for s in cal_src if s not in known_source_ids]
            if missing_cal:
                raise ScoringValidationError(
                    f"Profile '{pid}' feature '{key}' references unknown calibration_source_ids: {missing_cal}"
                )
        if not isinstance(pf["calibration_method"], str) or not pf["calibration_method"].strip():
            raise ScoringValidationError(
                f"Profile '{pid}' feature '{key}' calibration_method must be non-empty"
            )

    if len(temp_families) > 1:
        raise ScoringValidationError(
            f"Profile '{pid}' mixes incompatible temperature quantities {sorted(temp_families)}; "
            "air_2m_temperature (e.g. POWER) and surface_temperature (e.g. Diviner) cannot share a profile"
        )


def load_scoring_profiles(path: pathlib.Path) -> dict[str, object]:
    """Load and strictly validate ``scoring_profiles.json``."""
    cfg_path = pathlib.Path(path)
    if not cfg_path.is_file():
        raise ScoringValidationError(f"Scoring profiles file does not exist: {cfg_path}")
    raw = cfg_path.read_text(encoding="utf-8")
    data = json.loads(raw, parse_constant=lambda c: (_ for _ in ()).throw(
        ScoringValidationError(f"Invalid non-finite JSON constant {c!r} in {cfg_path}")
    ))
    if not isinstance(data, dict) or set(data.keys()) != {"profiles"}:
        raise ScoringValidationError(
            f"Scoring profiles root must have exact key 'profiles': {cfg_path}"
        )
    profiles = data["profiles"]
    if not isinstance(profiles, list):
        raise ScoringValidationError("'profiles' must be a list")

    seen_ids: set[str] = set()
    for profile in profiles:
        validate_profile(profile)
        pid = profile["id"]
        if pid in seen_ids:
            raise ScoringValidationError(f"Duplicate scoring profile id: {pid!r}")
        seen_ids.add(pid)
    return data


def check_location_feature_compatibility(
    location: dict[str, Any],
    profile: dict[str, Any],
    *,
    reference_location: dict[str, Any] | None = None,
) -> list[str]:
    """Return a list of incompatibility reasons for ``location`` against ``profile``."""
    reasons: list[str] = []
    features = location.get("features")
    if not isinstance(features, dict):
        return ["Location is missing 'features' object"]

    res_m = float(profile["comparison_resolution_m"])
    win_m = float(profile["window_m"])
    tol = 1e-6

    for pf in profile["features"]:
        key = pf["key"]
        feat = features.get(key)
        if not isinstance(feat, dict):
            reasons.append(f"Missing feature entry '{key}'")
            continue

        val = feat.get("value")
        if val is None:
            m_reason = feat.get("missing_reason") or "no value"
            reasons.append(f"Feature '{key}' missing: {m_reason}")
            continue
        if not _is_finite_real(val):
            reasons.append(f"Feature '{key}' has non-finite value {val!r}")
            continue

        val_f = float(val)
        lower_f = float(pf["lower"])
        upper_f = float(pf["upper"])
        if val_f < lower_f or val_f > upper_f:
            reasons.append(
                f"Feature '{key}' value {val_f} outside profile bounds [{lower_f}, {upper_f}]"
            )

        if feat.get("unit") != pf["unit"]:
            reasons.append(
                f"Feature '{key}' unit {feat.get('unit')!r} != profile unit {pf['unit']!r}"
            )
        if feat.get("quantity") != pf["quantity"]:
            reasons.append(
                f"Feature '{key}' quantity {feat.get('quantity')!r} != profile quantity {pf['quantity']!r}"
            )

        f_res = feat.get("spatial_resolution_m")
        f_win = feat.get("support_window_m")
        if key in TERRAIN_FEATURE_KEYS:
            if not _is_finite_real(f_res) or abs(float(f_res) - res_m) > tol:
                reasons.append(
                    f"Feature '{key}' spatial_resolution_m {f_res!r} != profile {res_m}"
                )
            if not _is_finite_real(f_win) or abs(float(f_win) - win_m) > tol:
                reasons.append(
                    f"Feature '{key}' support_window_m {f_win!r} != profile {win_m}"
                )

        if reference_location is not None:
            ref_feat = reference_location["features"][key]
            if feat.get("method") != ref_feat.get("method"):
                reasons.append(
                    f"Feature '{key}' method {feat.get('method')!r} != target method {ref_feat.get('method')!r}"
                )
            if not _opt_float_close(feat.get("spatial_resolution_m"), ref_feat.get("spatial_resolution_m"), tol):
                reasons.append(
                    f"Feature '{key}' spatial_resolution_m {feat.get('spatial_resolution_m')!r} "
                    f"!= target {ref_feat.get('spatial_resolution_m')!r}"
                )
            if not _opt_float_close(feat.get("support_window_m"), ref_feat.get("support_window_m"), tol):
                reasons.append(
                    f"Feature '{key}' support_window_m {feat.get('support_window_m')!r} "
                    f"!= target {ref_feat.get('support_window_m')!r}"
                )
            if not _periods_compatible(feat.get("period"), ref_feat.get("period")):
                reasons.append(
                    f"Feature '{key}' period {feat.get('period')!r} != target period {ref_feat.get('period')!r}"
                )

    return reasons


def _opt_float_close(v1: Any, v2: Any, tol: float) -> bool:
    if v1 is None and v2 is None:
        return True
    if v1 is None or v2 is None:
        return False
    if not (_is_finite_real(v1) and _is_finite_real(v2)):
        return False
    return abs(float(v1) - float(v2)) <= tol


def _parse_iso_dt(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo is not None else None


def _periods_compatible(p1: Any, p2: Any) -> bool:
    if p1 is None and p2 is None:
        return True
    if p1 is None or p2 is None:
        return False
    if not isinstance(p1, dict) or not isinstance(p2, dict):
        return False
    s1 = _parse_iso_dt(p1.get("start"))
    e1 = _parse_iso_dt(p1.get("end"))
    s2 = _parse_iso_dt(p2.get("start"))
    e2 = _parse_iso_dt(p2.get("end"))
    if s1 is not None and e1 is not None and s2 is not None and e2 is not None:
        return s1 == s2 and e1 == e2
    return p1 == p2


def rank_analogs(
    target_location: dict[str, Any],
    candidate_locations: list[dict[str, Any]],
    profile: dict[str, Any],
    *,
    batch_size: int = 64,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Score Earth candidates against ``target_location`` under ``profile``.

    Uses fixed independent profile normalization and chunked ``O(batch_size * D)``
    matrix evaluation. Never pads missing analogs or renormalizes missing features.
    """
    if batch_size < 1:
        raise ScoringValidationError(f"batch_size must be >= 1, got {batch_size}")

    validate_profile(profile)
    profile_id = str(profile["id"])
    profile_features = profile["features"]
    active_keys = [pf["key"] for pf in profile_features]

    excluded: list[dict[str, Any]] = []
    target_reasons = check_location_feature_compatibility(target_location, profile)
    if target_reasons:
        for cand in candidate_locations:
            cid = str(cand.get("id", "<unknown>"))
            excluded.append(
                {
                    "location_id": cid,
                    "reasons": [
                        f"Target '{target_location['id']}' unavailable under profile '{profile_id}': {r}"
                        for r in target_reasons
                    ],
                }
            )
        return [], excluded

    eligible: list[dict[str, Any]] = []
    for cand in candidate_locations:
        cid = str(cand["id"])
        cand_reasons: list[str] = []
        if cand.get("body") != "earth":
            cand_reasons.append(f"Candidate body {cand.get('body')!r} is not 'earth'")
        cand_reasons.extend(
            check_location_feature_compatibility(
                cand, profile, reference_location=target_location
            )
        )
        if cand_reasons:
            dedup_reasons = list(dict.fromkeys(cand_reasons))
            excluded.append({"location_id": cid, "reasons": dedup_reasons})
        else:
            eligible.append(cand)

    if not eligible:
        return [], excluded

    target_vec = np.array(
        [float(target_location["features"][k]["value"]) for k in active_keys],
        dtype=np.float64,
    )
    weights_vec = np.array([float(pf["weight"]) for pf in profile_features], dtype=np.float64)
    lower_vec = np.array([float(pf["lower"]) for pf in profile_features], dtype=np.float64)
    upper_vec = np.array([float(pf["upper"]) for pf in profile_features], dtype=np.float64)
    alpha = float(profile["alpha"])

    # Coverage definition: active policy weights present / total active policy weights.
    # Because all active profile features are required, every ranked row has coverage = 1.0.
    total_active_weight = float(np.sum(weights_vec))
    coverage = float(total_active_weight / total_active_weight)

    scored_rows: list[tuple[float, str, dict[str, Any], np.ndarray, np.ndarray]] = []
    for start in range(0, len(eligible), batch_size):
        batch = eligible[start : start + batch_size]
        cand_mat = np.array(
            [[float(loc["features"][k]["value"]) for k in active_keys] for loc in batch],
            dtype=np.float64,
        )
        totals, per_feat_pct, sq_dist = score_matrix(
            target_vec, cand_mat, weights_vec, lower_vec, upper_vec, alpha
        )
        for idx, loc in enumerate(batch):
            scored_rows.append(
                (
                    float(totals[idx]),
                    str(loc["id"]),
                    loc,
                    per_feat_pct[idx],
                    sq_dist[idx],
                )
            )

    # Full-precision descending similarity_score, ascending stable location_id tie-break
    scored_rows.sort(key=lambda item: (-item[0], item[1]))
    top_rows = scored_rows[:3]

    active_index = {key: idx for idx, key in enumerate(active_keys)}
    analogs: list[dict[str, Any]] = []
    for rank_idx, (score_val, _loc_id, loc, pct_row, sq_row) in enumerate(top_rows, start=1):
        breakdown: dict[str, Any] = {}
        for key in FEATURE_KEYS:
            if key in active_index:
                j = active_index[key]
                breakdown[key] = {
                    "similarity_pct": float(pct_row[j]),
                    "squared_distance_contribution": float(sq_row[j]),
                    "reason": None,
                }
            else:
                breakdown[key] = {
                    "similarity_pct": None,
                    "squared_distance_contribution": None,
                    "reason": f"Feature '{key}' is not active in profile '{profile_id}'",
                }
        analogs.append(
            {
                "location": loc,
                "similarity_score": float(score_val),
                "rank": rank_idx,
                "breakdown": breakdown,
                "coverage": coverage,
            }
        )

    return analogs, excluded
