# PAE Dev_A / Python Data Pipeline Task Report (LOOP_0 / C01-A04 Hotfix R2)

## Scope & Ownership

All scientific and pipeline deliverables live strictly under `data-pipeline/`. No Contract `1.0.0` schema fields (`analog_location.schema.json`), shared types, or `config/` readiness state were fabricated or silently altered. (Temporary static JSON transport links in `src/App.tsx` and `/public/exports/` remain developer transport only.)

## Multi-Agent Delegation Status

Native subagent delegation tools were not available in this execution environment; therefore, no subagents were spawned or invented. Modular separation of responsibilities was enforced directly across the package boundary:
- Source ingestion, HTTPS/SSRF/redirect guards, exact-coordinate POWER caching & frame conversion: `data-pipeline/src/pae_pipeline/sources.py`
- Geospatial terrain extraction, planetocentric/geodetic projection, bounded windows/antimeridian seams, scaled raster masking & heightmap export: `data-pipeline/src/pae_pipeline/terrain.py`
- Matrix scoring, profile ID/safety validation, period/tolerance matching & ranking: `data-pipeline/src/pae_pipeline/scoring.py`
- Schema & semantic invariant validation (temperature family, splat/PLY header/record validation): `data-pipeline/src/pae_pipeline/validation.py`
- Atomic serialization, streaming file copy & hashing: `data-pipeline/src/pae_pipeline/export.py`
- Transactional asset staging, content-addressed publication & CLI orchestration: `data-pipeline/fetch_and_score.py`
- Independent test & regression suites: `data-pipeline/tests/test_scoring.py`, `test_validation.py`, `test_offline.py`

## Cycle C01 / A04 Hotfix Summary

All 15 independent review findings (`CR-001`..`CR-010`, `SEC-001`..`SEC-005`) were confirmed against the R1 bundle and fixed without changing Contract `1.0.0`:
- `CR-001`: Invariant `Feature.method` strings across `terrain.py` and `fetch_and_score.py`; per-site sample counts and `valid_fraction` moved to `diagnostics`.
- `CR-002`: Backwards-compatible `aoi_frame: str | None = None` on `extract_terrain` with mathematical planetocentric-to-geodetic conversion and exact `±90°` pole handling before PROJ `+proj=longlat` / `+proj=aeqd`.
- `CR-003`: Temperature family classification (`air_2m_temperature` vs `surface_temperature`) plus period compatibility check in `validation.py` before enforcing `temp_min_c <= temp_max_c`.
- `CR-004`: Bounded antimeridian MultiPolygon unwrapping, `[0, 360)` geographic DEM coordinate handling, and bounded east/west seam-strip reading (fail closed if `> 180°` span or coverage gap).
- `CR-005`: Domain check (`0_to_360` or `minus180_to_180`) validated before west-positive sign negation in `normalize_east_longitude`.
- `CR-006`: Raw-DN nodata/mask evaluated before GDAL band `scales`/`offsets` with finite/positive validation.
- `CR-007` + `SEC-002` + `SEC-003`: Strict `https://` validation (no embedded userinfo/credentials, no `localhost`/`.local`/`.internal`, no private/loopback/link-local/multicast/reserved IPs), `session.trust_env = False`, manual hop-by-hop redirect validation before any redirected request, `Content-Length` + streamed byte quotas, O(64 KiB) streamed verified temp file writes, and sanitized URL error messages.
- `CR-008`: Zero directory creation during `fetch_power(..., offline=True)` misses, exact-coordinate SHA-256/query_url cache keys (removed coarse grid-cell cross-reuse), and strict in-repo `--cache-dir` rejection (`DataReadinessError`).
- `CR-009` + `SEC-001`: `SAFE_ID_RE` (`^[A-Za-z0-9_-]+$`) enforced on site & profile IDs; content-addressed asset staging into temporary directory, pre-publish `validate_dataset`, transactional asset install with rollback, and atomic `os.replace` dataset publication so failures preserve any prior valid dataset.
- `CR-010`: Timestamp-aware `_periods_compatible` and float tolerance (`1e-6`) for optional `spatial_resolution_m` / `support_window_m` in `scoring.py`.
- `SEC-004`: `MAX_OUTPUT_GRID_NODES` (`4,000,000`) & `MAX_READ_WINDOW_PIXELS` (`16,777,216`) guards, `isfinite` transform checks, and streaming 1 MiB `atomic_copy_file`.
- `SEC-005`: Fail-closed `.splat` (`gaussian_count * 32` + chunked `<f4` finite check) and `.ply` (bounded 64 KiB ASCII header, magic/version/`element vertex`/Gaussian props/payload record count check).

## Commands Executed in This Environment

1. `python3 --version` -> `Python 3.10.12` (no `pip`, no `python3.11+`, no `numpy`/`rasterio`/`pyproj`/`shapely`/`requests`/`jsonschema`/`pytest` installed).
2. `py_compile.compile` + `ast.parse` on all 10 Python files (`fetch_and_score.py`, `src/pae_pipeline/*.py`, `tests/*.py`) + JSON parse check on `config/*.json` and `schemas/analog_location.schema.json` -> exited `0` (`PY_COMPILE_AND_AST_OK`, `CONFIG_AND_SCHEMA_JSON_OK`).
3. Stdlib runtime verification of `pae_pipeline.export` (`atomic_write_json` NaN guard preserving existing file + `atomic_copy_file` chunked copy SHA-256/byte verification) -> exited `0` (`EXPORT_STDLIB_OK`).

## Commands NOT Run in This Environment (Must Run Locally)

- `python -m venv .venv`
- `.\.venv\Scripts\python.exe -m pip install -e "./data-pipeline[test]"`
- `.\.venv\Scripts\python.exe -m pytest data-pipeline/tests -q`
- `.\.venv\Scripts\python.exe data-pipeline/fetch_and_score.py --mode empty`
- `.\.venv\Scripts\python.exe data-pipeline/fetch_and_score.py --mode validate`
- `.\.venv\Scripts\python.exe data-pipeline/fetch_and_score.py --mode prepare --require-demo-ready`
- `.\.venv\Scripts\python.exe data-pipeline/fetch_and_score.py --mode offline --require-demo-ready`

Reason: This container provides Python `3.10.12` without `pip` or third-party scientific packages (`numpy`, `rasterio`, `pyproj`, `shapely`, `requests`, `jsonschema`, `pytest`), and `pyproject.toml` requires Python `>=3.11`. Accordingly, `requirements.lock.txt` was NOT fabricated with invented hashes/versions; generate it locally via `pip freeze > data-pipeline/requirements.lock.txt` after installation.

## Remaining `DATA_BLOCKERS`

1. `data-pipeline/config/sites_manifest.json` is empty (`{"schema_version":"1.0.0","sites":[]}`): real sourced AOI GeoJSONs, raw DEMs, companion labels/sidecars, and SHA-256 checksums for targets and Earth analogs must be staged.
2. `data-pipeline/config/scoring_profiles.json` is empty (`{"profiles":[]}`): documented independent calibration bounds, weights, `alpha`, and `calibration_source_ids` must be populated.
3. No `.splat` / Gaussian `.ply` assets with metric scale and verified registration exist; `splat` remains `null` (`splat_available=false`).

