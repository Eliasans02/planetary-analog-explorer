import importlib.util
import json
from pathlib import Path
import sys

import numpy as np
import pytest


PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))
from earth_discovery_core import (  # noqa: E402
    area_average,
    canonical_hash,
    exploratory_distance,
    ranked_indices,
    separated_shortlist,
    terrain_metrics,
)


def test_metrics_use_central_gradients_and_are_offset_invariant():
    x = np.arange(10) * 60.0
    values = np.tile(0.1 * x, (10, 1))
    valid = np.ones((10, 10), dtype=bool)
    first = terrain_metrics(values, valid)
    shifted = terrain_metrics(values + 2_400.0, valid)
    assert first == shifted
    assert first["mean_slope_deg"] == pytest.approx(np.degrees(np.arctan(0.1)), abs=1e-6)
    assert first["relief_m"] == 54.0
    assert sum(first["slope_histogram"]) == pytest.approx(1.0, abs=1e-9)


def test_mask_is_propagated_without_filling():
    values = np.arange(100, dtype=float).reshape(10, 10)
    valid = np.ones((10, 10), dtype=bool)
    valid[5, 5] = False
    metrics = terrain_metrics(values, valid)
    assert metrics["valid_fraction"] == 0.99
    invalid_support = valid.copy()
    invalid_support[1:9, :] = False
    with pytest.raises(ValueError, match="Insufficient valid samples"):
        terrain_metrics(values, invalid_support)


def test_overlap_average_preserves_constant_and_reports_full_coverage():
    values = np.full((620, 620), 18.25)
    valid = np.ones_like(values, dtype=bool)
    averaged, coverage = area_average(values, valid, 594.257, 605.0)
    assert averaged.shape == (10, 10)
    assert coverage.all()
    assert averaged == pytest.approx(18.25)


def test_distance_and_rank_weights_are_independent_with_stable_ties():
    target = {"relief_m": 10.0, "slope_histogram": [1, 0, 0, 0, 0]}
    candidates = [
        {"id": "b", "metrics": {"relief_m": 10.0, "slope_histogram": [0, 1, 0, 0, 0]}},
        {"id": "a", "metrics": {"relief_m": 10.0, "slope_histogram": [0, 1, 0, 0, 0]}},
        {"id": "c", "metrics": {"relief_m": 20.0, "slope_histogram": [1, 0, 0, 0, 0]}},
    ]
    default = ranked_indices(candidates, target, (0.7, 0.3))
    sensitivity = ranked_indices(candidates, target, (0.5, 0.5))
    assert [item[1] for item in default] == ["c", "a", "b"]
    assert [item[1] for item in sensitivity] == ["c", "a", "b"]
    assert exploratory_distance(candidates[2]["metrics"], target) == 0.15
    assert canonical_hash({"weights": [0.7, 0.3]}) != canonical_hash({"weights": [0.5, 0.5]})


def test_ranking_keeps_full_precision_for_near_ties():
    target = {"relief_m": 1.0, "slope_histogram": [1, 0, 0, 0, 0]}
    candidates = [
        {"id": "a", "metrics": {"relief_m": 100.000002, "slope_histogram": [1, 0, 0, 0, 0]}},
        {"id": "b", "metrics": {"relief_m": 100.000001, "slope_histogram": [1, 0, 0, 0, 0]}},
    ]
    assert [item[1] for item in ranked_indices(candidates, target)] == ["b", "a"]
    assert exploratory_distance(candidates[0]["metrics"], target) != exploratory_distance(candidates[1]["metrics"], target)


def test_shortlist_enforces_center_separation():
    ranking = [(0.1, "a", 0), (0.2, "b", 1), (0.3, "c", 2)]
    centers = [(0, 0), (600, 0), (1_800, 0)]
    assert separated_shortlist(ranking, centers, separation_m=1_800, count=12) == {0, 2}


def test_export_contract_counts_footprints_hashes_and_reproducibility():
    output = PIPELINE.parent / "web-client/public/data/earth_discovery.json"
    if not output.exists():
        pytest.skip("Run earth_discovery.py to exercise the exported artifact")
    data = json.loads(output.read_text())
    assert data["schema_version"] == "1.0.0"
    assert data["domain"]["crs"] == "EPSG:32640"
    assert data["domain"]["generated_count"] == 1600
    assert data["domain"]["eligible_count"] == len(data["candidates"])
    assert data["domain"]["eligible_count"] + data["domain"]["excluded_count"] == 1600
    assert len(data["domain"]["footprint"]) == 5
    assert {target["body"] for target in data["targets"]} == {"moon", "mars"}
    assert all(len(candidate["footprint"]) == 5 for candidate in data["candidates"])
    assert all(len(candidate["heights_m"]) == 100 for candidate in data["candidates"])
    assert all(sum(candidate["metrics"]["slope_histogram"]) == pytest.approx(1, abs=1e-8) for candidate in data["candidates"])
    assert all(len(source["sha256"]) == 64 and source["bytes"] > 0 for source in data["sources"])
    first = canonical_hash({"profile": data["method"]["profile_sha256"], "candidates": data["candidates"]})
    second = canonical_hash({"profile": data["method"]["profile_sha256"], "candidates": json.loads(output.read_text())["candidates"]})
    assert first == second
