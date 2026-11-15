"""Numerical methods for the bounded Earth terrain discovery run."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np


SLOPE_BINS = [0, 5, 10, 20, 30, 90]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_hash(value: object) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def round_number(value: float, digits: int = 6) -> float:
    return round(float(value), digits)


def block_mean(values: np.ndarray, block: int, valid: np.ndarray | None = None):
    if values.shape[0] % block or values.shape[1] % block:
        raise ValueError("Array dimensions must be divisible by the block size")
    if valid is None:
        valid = np.isfinite(values)
    height, width = values.shape
    shaped_values = values.reshape(height // block, block, width // block, block)
    shaped_valid = valid.reshape(height // block, block, width // block, block)
    counts = shaped_valid.sum(axis=(1, 3))
    sums = np.where(shaped_valid, shaped_values, 0.0).sum(axis=(1, 3))
    means = np.divide(sums, counts, out=np.zeros_like(sums), where=counts > 0)
    return means, counts == block * block


def overlap_weights(length: int, support_pixels: float, output_size: int) -> np.ndarray:
    """Weights from pixel cells to equal output intervals over centered support."""
    if support_pixels > length:
        raise ValueError("Support is larger than input")
    start = (length - support_pixels) / 2
    edges = np.linspace(start, start + support_pixels, output_size + 1)
    weights = np.zeros((output_size, length), dtype=np.float64)
    for output_index in range(output_size):
        left, right = edges[output_index : output_index + 2]
        first = max(0, math.floor(left))
        last = min(length, math.ceil(right))
        for pixel in range(first, last):
            weights[output_index, pixel] = max(0.0, min(right, pixel + 1) - max(left, pixel))
        weights[output_index] /= right - left
    return weights


def area_average(values: np.ndarray, valid: np.ndarray, support_y: float, support_x: float):
    """Area average a centered rectangular support to a 10 by 10 grid."""
    wy = overlap_weights(values.shape[0], support_y, 10)
    wx = overlap_weights(values.shape[1], support_x, 10)
    coverage = wy @ valid.astype(np.float64) @ wx.T
    sums = wy @ np.where(valid, values, 0.0) @ wx.T
    means = np.divide(sums, coverage, out=np.zeros_like(sums), where=coverage > 0)
    return means, np.isclose(coverage, 1.0, atol=1e-10)


def terrain_metrics(values: np.ndarray, valid: np.ndarray, spacing_m: float = 60.0) -> dict:
    if values.shape != (10, 10) or valid.shape != values.shape:
        raise ValueError("Metrics require a 10 by 10 grid")
    valid = valid.astype(bool)
    center_valid = (
        valid[1:-1, 1:-1]
        & valid[1:-1, :-2]
        & valid[1:-1, 2:]
        & valid[:-2, 1:-1]
        & valid[2:, 1:-1]
    )
    dz_dx = (values[1:-1, 2:] - values[1:-1, :-2]) / (2 * spacing_m)
    dz_dy = (values[2:, 1:-1] - values[:-2, 1:-1]) / (2 * spacing_m)
    slopes = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy)))[center_valid]
    windows = np.lib.stride_tricks.sliding_window_view(values, (3, 3))
    window_valid = np.lib.stride_tricks.sliding_window_view(valid, (3, 3)).all(axis=(-1, -2))
    roughness = (windows.max(axis=(-1, -2)) - windows.min(axis=(-1, -2)))[window_valid]
    samples = values[valid]
    if samples.size == 0 or slopes.size == 0 or roughness.size == 0:
        raise ValueError("Insufficient valid samples for terrain metrics")
    histogram, _ = np.histogram(slopes, bins=SLOPE_BINS)
    histogram = histogram.astype(np.float64) / slopes.size
    rounded_histogram = [round_number(value, 9) for value in histogram]
    rounded_histogram[-1] = round_number(1.0 - sum(rounded_histogram[:-1]), 9)
    return {
        "mean_slope_deg": round_number(slopes.mean()),
        "p95_slope_deg": round_number(np.percentile(slopes, 95)),
        "relief_m": round_number(np.ptp(samples)),
        "roughness_m": round_number(roughness.mean()),
        "slope_histogram": rounded_histogram,
        "valid_fraction": round_number(valid.mean()),
    }


def relative_heights(values: np.ndarray) -> list[float]:
    relative = values.astype(np.float64) - float(np.min(values))
    return [round_number(value, 4) for value in relative.ravel()]


def distance_parts(left: dict, right: dict) -> tuple[float, float]:
    histogram_left = np.asarray(left["slope_histogram"])
    histogram_right = np.asarray(right["slope_histogram"])
    total_variation = 0.5 * np.abs(histogram_left - histogram_right).sum()
    relief_scale = max(left["relief_m"], right["relief_m"], 1.0)
    relief_difference = abs(left["relief_m"] - right["relief_m"]) / relief_scale
    return float(total_variation), float(relief_difference)


def exploratory_distance(left: dict, right: dict, weights=(0.7, 0.3)) -> float:
    histogram_distance, relief_distance = distance_parts(left, right)
    return weights[0] * histogram_distance + weights[1] * relief_distance


def ranked_indices(candidates: list[dict], target_metrics: dict, weights=(0.7, 0.3)):
    scored = []
    for index, candidate in enumerate(candidates):
        distance = exploratory_distance(candidate["metrics"], target_metrics, weights)
        scored.append((distance, candidate["id"], index))
    return sorted(scored)


def separated_shortlist(ranking, centers: list[tuple[float, float]], separation_m=1800, count=12):
    selected = []
    for _, _, index in ranking:
        x, y = centers[index]
        if all(math.hypot(x - centers[other][0], y - centers[other][1]) >= separation_m for other in selected):
            selected.append(index)
            if len(selected) == count:
                break
    return set(selected)
