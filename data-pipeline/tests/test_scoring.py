# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Unit tests for scoring.py matrix math, profile validation, and batch/order invariance."""

from __future__ import annotations

import math

import numpy as np
import pytest

from pae_pipeline.scoring import (
    CANONICAL_UNITS,
    FEATURE_KEYS,
    ScoringValidationError,
    rank_analogs,
    score_matrix,
    validate_profile,
)


def _scalar_reference_score(
    t: list[float],
    c: list[float],
    w: list[float],
    lo: list[float],
    hi: list[float],
    alpha: float,
) -> tuple[float, list[float], list[float]]:
    x = [(ti - li) / (ui - li) for ti, li, ui in zip(t, lo, hi)]
    y = [(ci - li) / (ui - li) for ci, li, ui in zip(c, lo, hi)]
    W = sum(w)
    sq = [wi * ((xi - yi) ** 2) / W for wi, xi, yi in zip(w, x, y)]
    D = math.sqrt(sum(sq))
    nx = math.sqrt(sum(wi * xi * xi for wi, xi in zip(w, x)))
    ny = math.sqrt(sum(wi * yi * yi for wi, yi in zip(w, y)))
    if nx == 0.0 and ny == 0.0:
        C = 1.0
    elif nx == 0.0 or ny == 0.0:
        C = 0.0
    else:
        C = sum(wi * xi * yi for wi, xi, yi in zip(w, x, y)) / (nx * ny)
    S = 100.0 * (alpha * C + (1.0 - alpha) * (1.0 - D))
    pct = [100.0 * (1.0 - abs(xi - yi)) for xi, yi in zip(x, y)]
    return S, pct, sq


def _make_dimless_location(
    loc_id: str,
    body: str,
    active_values: dict[str, float | None],
    *,
    temp_quantity: str = "surface_temperature_min",
    temp_max_quantity: str = "surface_temperature_max",
    res_m: float = 10.0,
    win_m: float = 100.0,
) -> dict[str, object]:
    frame = {
        "earth": "earth_wgs84",
        "moon": "moon_iau_planetocentric",
        "mars": "mars_iau_planetocentric",
    }[body]
    features: dict[str, object] = {}
    for k in FEATURE_KEYS:
        val = active_values.get(k)
        if k == "temp_min_c":
            qty = temp_quantity
        elif k == "temp_max_c":
            qty = temp_max_quantity
        else:
            qty = f"test_{k}"
        if val is None:
            features[k] = {
                "value": None,
                "unit": CANONICAL_UNITS[k],
                "quantity": qty,
                "method": "test_fixture",
                "spatial_resolution_m": res_m,
                "support_window_m": win_m,
                "period": None,
                "source_ids": [],
                "missing_reason": "fixture_omitted",
            }
        else:
            features[k] = {
                "value": float(val),
                "unit": CANONICAL_UNITS[k],
                "quantity": qty,
                "method": "test_fixture",
                "spatial_resolution_m": res_m,
                "support_window_m": win_m,
                "period": None,
                "source_ids": ["src_fixture"],
                "missing_reason": None,
            }
    return {
        "id": loc_id,
        "name": f"Fixture {loc_id}",
        "body": body,
        "coordinates": {
            "latitude_deg": 0.0,
            "longitude_deg": 0.0,
            "frame": frame,
            "source_ids": ["src_fixture"],
        },
        "aoi": {"local_path": "/assets/aoi/fixture.geojson", "source_ids": ["src_fixture"]},
        "missions": [],
        "features": features,
        "geology": {
            "classes": [],
            "method": "fixture",
            "source_ids": [],
            "missing_reason": "no_geology_in_math_fixture",
        },
        "assets": {"dem": None, "heightmap": None, "splat": None},
        "camera": None,
    }


def _make_profile(
    keys: list[str],
    *,
    alpha: float = 0.5,
    temp_min_qty: str = "surface_temperature_min",
    temp_max_qty: str = "surface_temperature_max",
) -> dict[str, object]:
    pfs = []
    for k in keys:
        lo, hi = (0.0, 100.0) if k != "albedo" else (0.0, 1.0)
        if k in {"temp_min_c", "temp_max_c"}:
            lo, hi = (-200.0, 100.0)
        qty = temp_min_qty if k == "temp_min_c" else (temp_max_qty if k == "temp_max_c" else f"test_{k}")
        pfs.append(
            {
                "key": k,
                "unit": CANONICAL_UNITS[k],
                "quantity": qty,
                "weight": 1.0,
                "lower": lo,
                "upper": hi,
                "calibration_source_ids": ["src_fixture"],
                "calibration_method": "dimensionless_unit_test_fixture",
            }
        )
    return {
        "id": "topography_only",
        "version": "1.0.0",
        "algorithm": "weighted_cosine_euclidean_v1",
        "alpha": alpha,
        "features": pfs,
        "comparison_resolution_m": 10.0,
        "window_m": 100.0,
        "min_valid_area_fraction": 0.8,
    }


def test_identical_vectors_including_zero_give_100() -> None:
    lo = np.array([0.0, 0.0, 0.0, 0.0])
    hi = np.array([45.0, 90.0, 1.0, 500.0])
    w = np.array([1.0, 2.0, 1.5, 0.5])

    # Zero normalized vector (all equal to lower bound)
    target_zero = np.array([0.0, 0.0, 0.0, 0.0])
    cands_zero = np.array([[0.0, 0.0, 0.0, 0.0]])
    s, pct, sq = score_matrix(target_zero, cands_zero, w, lo, hi, alpha=0.5)
    assert math.isclose(float(s[0]), 100.0, abs_tol=1e-12)
    assert np.allclose(pct[0], 100.0, atol=1e-12)
    assert np.allclose(sq[0], 0.0, atol=1e-12)

    # Identical non-zero vector
    target_nz = np.array([12.5, 30.0, 0.25, 120.0])
    cands_nz = np.array([target_nz])
    s2, pct2, sq2 = score_matrix(target_nz, cands_nz, w, lo, hi, alpha=0.35)
    assert math.isclose(float(s2[0]), 100.0, abs_tol=1e-12)
    assert np.allclose(pct2[0], 100.0, atol=1e-12)
    assert np.allclose(sq2[0], 0.0, atol=1e-12)


def test_one_zero_norm_gives_finite_cosine_zero() -> None:
    lo = np.array([0.0, 0.0, 0.0])
    hi = np.array([10.0, 10.0, 10.0])
    w = np.array([1.0, 2.0, 1.0])
    target = np.array([0.0, 0.0, 0.0])
    cand = np.array([[5.0, 5.0, 5.0]])
    s, pct, sq = score_matrix(target, cand, w, lo, hi, alpha=0.5)
    assert np.all(np.isfinite(s))
    # C = 0, D = 0.5 => S = 100 * (0.5*0 + 0.5*(1 - 0.5)) = 25.0
    assert math.isclose(float(s[0]), 25.0, abs_tol=1e-12)
    assert np.allclose(pct[0], 50.0, atol=1e-12)
    assert np.allclose(sq[0], [0.25 / 4.0, 0.5 / 4.0, 0.25 / 4.0], atol=1e-12)


def test_scalar_vs_matrix_equivalence() -> None:
    rng = np.random.default_rng(42)
    lo = np.array([-20.0, 0.0, 0.0, 10.0])
    hi = np.array([40.0, 90.0, 2.0, 1010.0])
    w = np.array([0.3, 0.2, 0.4, 0.1])
    t = np.array([5.5, 22.0, 0.7, 300.0])
    cands = rng.uniform(lo, hi, size=(12, 4))
    alpha = 0.42

    totals, pcts, sqs = score_matrix(t, cands, w, lo, hi, alpha)
    for i in range(cands.shape[0]):
        s_ref, pct_ref, sq_ref = _scalar_reference_score(
            t.tolist(), cands[i].tolist(), w.tolist(), lo.tolist(), hi.tolist(), alpha
        )
        assert math.isclose(float(totals[i]), s_ref, rel_tol=1e-12, abs_tol=1e-12)
        assert np.allclose(pcts[i], pct_ref, rtol=1e-12, atol=1e-12)
        assert np.allclose(sqs[i], sq_ref, rtol=1e-12, atol=1e-12)


def test_batch_order_and_extra_candidate_invariance() -> None:
    profile = _make_profile(
        ["slope_mean_deg", "slope_max_deg", "roughness_index", "elevation_delta_m"]
    )
    target = _make_dimless_location(
        "target_0",
        "mars",
        {
            "slope_mean_deg": 10.0,
            "slope_max_deg": 25.0,
            "roughness_index": 0.05,
            "elevation_delta_m": 40.0,
        },
    )
    cands = [
        _make_dimless_location(
            f"earth_{i}",
            "earth",
            {
                "slope_mean_deg": 5.0 + i * 3.0,
                "slope_max_deg": 15.0 + i * 4.0,
                "roughness_index": 0.02 + i * 0.01,
                "elevation_delta_m": 30.0 + i * 5.0,
            },
        )
        for i in range(5)
    ]

    analogs_b1, excl_b1 = rank_analogs(target, cands, profile, batch_size=1)
    analogs_b64, excl_b64 = rank_analogs(target, list(reversed(cands)), profile, batch_size=64)
    assert excl_b1 == [] and excl_b64 == []
    assert [a["location"]["id"] for a in analogs_b1] == [a["location"]["id"] for a in analogs_b64]
    for a1, a2 in zip(analogs_b1, analogs_b64):
        assert math.isclose(a1["similarity_score"], a2["similarity_score"], abs_tol=1e-12)

    # Adding an uncompetitive extra candidate must not alter fixed-normalization scores
    worst_extra = _make_dimless_location(
        "earth_extra_far",
        "earth",
        {
            "slope_mean_deg": 80.0,
            "slope_max_deg": 89.0,
            "roughness_index": 0.9,
            "elevation_delta_m": 99.0,
        },
    )
    analogs_extra, _ = rank_analogs(target, cands + [worst_extra], profile, batch_size=2)
    assert [a["location"]["id"] for a in analogs_extra] == [a["location"]["id"] for a in analogs_b1]
    for a1, a3 in zip(analogs_b1, analogs_extra):
        assert math.isclose(a1["similarity_score"], a3["similarity_score"], abs_tol=1e-12)


def test_missing_required_feature_unranks_target_or_excludes_candidate() -> None:
    profile = _make_profile(
        ["slope_mean_deg", "slope_max_deg", "roughness_index", "elevation_delta_m"]
    )
    good_target = _make_dimless_location(
        "target_ok",
        "moon",
        {
            "slope_mean_deg": 12.0,
            "slope_max_deg": 30.0,
            "roughness_index": 0.05,
            "elevation_delta_m": 50.0,
        },
    )
    cand_ok = _make_dimless_location(
        "earth_ok",
        "earth",
        {
            "slope_mean_deg": 11.0,
            "slope_max_deg": 28.0,
            "roughness_index": 0.04,
            "elevation_delta_m": 45.0,
        },
    )
    cand_missing = _make_dimless_location(
        "earth_missing",
        "earth",
        {
            "slope_mean_deg": 11.0,
            "slope_max_deg": None,
            "roughness_index": 0.04,
            "elevation_delta_m": 45.0,
        },
    )

    analogs, excluded = rank_analogs(good_target, [cand_ok, cand_missing], profile)
    assert [a["location"]["id"] for a in analogs] == ["earth_ok"]
    assert len(excluded) == 1
    assert excluded[0]["location_id"] == "earth_missing"

    # Target missing a required feature -> zero ranked analogs
    bad_target = _make_dimless_location(
        "target_missing",
        "moon",
        {
            "slope_mean_deg": None,
            "slope_max_deg": 30.0,
            "roughness_index": 0.05,
            "elevation_delta_m": 50.0,
        },
    )
    analogs_t, excluded_t = rank_analogs(bad_target, [cand_ok], profile)
    assert analogs_t == []
    assert len(excluded_t) == 1


def test_unknown_units_and_air_surface_mismatch_rejected() -> None:
    # Profile mixing air_2m_temperature and surface_temperature must fail validation
    mixed_profile = _make_profile(
        ["temp_min_c", "temp_max_c"],
        temp_min_qty="air_2m_temperature_min",
        temp_max_qty="surface_temperature_max",
    )
    with pytest.raises(ScoringValidationError, match="incompatible temperature"):
        validate_profile(mixed_profile)

    # Unknown / mismatched unit in profile rejected
    bad_unit_profile = _make_profile(["slope_mean_deg"])
    bad_unit_profile["features"][0]["unit"] = "rad"
    with pytest.raises(ScoringValidationError, match="canonical"):
        validate_profile(bad_unit_profile)

    # Candidate with air_2m_temperature excluded when target/profile uses surface_temperature
    surf_profile = _make_profile(["temp_min_c"], temp_min_qty="surface_temperature_min")
    t_surf = _make_dimless_location(
        "t_surf", "moon", {"temp_min_c": -50.0}, temp_quantity="surface_temperature_min"
    )
    c_air = _make_dimless_location(
        "c_air", "earth", {"temp_min_c": -10.0}, temp_quantity="air_2m_temperature_min"
    )
    analogs, excluded = rank_analogs(t_surf, [c_air], surf_profile)
    assert analogs == []
    assert excluded[0]["location_id"] == "c_air"
    assert any("quantity" in r for r in excluded[0]["reasons"])


def test_invalid_calibration_weights_and_nan_rejected() -> None:
    lo = np.array([0.0, 10.0])
    hi = np.array([10.0, 20.0])
    w = np.array([1.0, 1.0])
    t = np.array([5.0, 15.0])
    c = np.array([[5.0, 15.0]])

    # lower >= upper
    with pytest.raises(ScoringValidationError, match="lower < upper"):
        score_matrix(t, c, w, np.array([10.0, 10.0]), hi, 0.5)

    # non-positive weights
    with pytest.raises(ScoringValidationError, match="strictly > 0"):
        score_matrix(t, c, np.array([1.0, 0.0]), lo, hi, 0.5)

    # alpha outside [0, 1]
    with pytest.raises(ScoringValidationError, match="alpha"):
        score_matrix(t, c, w, lo, hi, 1.2)

    # out-of-bounds value (no silent clipping)
    with pytest.raises(ScoringValidationError, match="outside calibration bounds"):
        score_matrix(t, np.array([[10.5, 15.0]]), w, lo, hi, 0.5)

    # NaN rejected
    with pytest.raises(ScoringValidationError, match="Non-finite"):
        score_matrix(np.array([np.nan, 15.0]), c, w, lo, hi, 0.5)


def test_profile_id_rejects_traversal_and_unsafe_characters_sec001() -> None:
    for bad_id in ("../escape", "bad/id", "dir\\sub", "has space", ""):
        bad_profile = _make_profile(["slope_mean_deg"])
        bad_profile["id"] = bad_id
        with pytest.raises(ScoringValidationError, match=r"\[A-Za-z0-9_-\]\+"):
            validate_profile(bad_profile)


def test_period_and_resolution_tolerance_compatibility_cr010() -> None:
    profile = _make_profile(["temp_min_c"], temp_min_qty="air_2m_temperature_daily_min")
    target = _make_dimless_location(
        "t_period",
        "earth",
        {"temp_min_c": -12.0},
        temp_quantity="air_2m_temperature_daily_min",
        res_m=10.0,
        win_m=100.0,
    )
    target["features"]["temp_min_c"]["period"] = {
        "start": "2025-01-01T00:00:00Z",
        "end": "2025-01-31T23:59:59Z",
    }

    # Matching period with +00:00 vs Z format and 1e-9 resolution jitter is accepted
    cand_ok = _make_dimless_location(
        "c_ok",
        "earth",
        {"temp_min_c": -10.0},
        temp_quantity="air_2m_temperature_daily_min",
        res_m=10.0 + 1e-9,
        win_m=100.0 - 1e-9,
    )
    cand_ok["features"]["temp_min_c"]["period"] = {
        "start": "2025-01-01T00:00:00+00:00",
        "end": "2025-01-31T23:59:59+00:00",
    }

    # Different observation window is excluded with explicit period reason
    cand_diff_period = _make_dimless_location(
        "c_diff_period",
        "earth",
        {"temp_min_c": -11.0},
        temp_quantity="air_2m_temperature_daily_min",
        res_m=10.0,
        win_m=100.0,
    )
    cand_diff_period["features"]["temp_min_c"]["period"] = {
        "start": "2024-06-01T00:00:00Z",
        "end": "2024-06-30T23:59:59Z",
    }

    # Substantive resolution mismatch (> tol=1e-6) is excluded
    cand_diff_res = _make_dimless_location(
        "c_diff_res",
        "earth",
        {"temp_min_c": -11.0},
        temp_quantity="air_2m_temperature_daily_min",
        res_m=11.0,
        win_m=100.0,
    )
    cand_diff_res["features"]["temp_min_c"]["period"] = {
        "start": "2025-01-01T00:00:00Z",
        "end": "2025-01-31T23:59:59Z",
    }

    analogs, excluded = rank_analogs(target, [cand_ok, cand_diff_period, cand_diff_res], profile)
    assert [a["location"]["id"] for a in analogs] == ["c_ok"]
    excl_map = {row["location_id"]: row["reasons"] for row in excluded}
    assert any("period" in r for r in excl_map["c_diff_period"])
    assert any("spatial_resolution_m" in r for r in excl_map["c_diff_res"])

