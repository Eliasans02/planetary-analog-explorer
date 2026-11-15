# Planetary Analog Explorer — Data Pipeline (`data-pipeline/`)

Offline data ingestion, geospatial terrain processing, scoring, validation, and artifact export pipeline for Planetary Analog Explorer (`LOOP_0 / Dev_A`, Contract `1.0.0`, Apache-2.0).

## Directory Layout

- `fetch_and_score.py`: CLI entry point (`--mode prepare|offline|validate|empty`).
- `pyproject.toml`: Python >=3.11 package definition (`src` layout, `test` optional dependency).
- `src/pae_pipeline/`:
  - `sources.py`: Strict input manifest validation, path safety, mathematical frame conversion, GeoJSON AOI verification, declared URL fetching, and NASA POWER ingestion/caching.
  - `terrain.py`: Fatal production terrain contract guard plus private synthetic-test AEQD relief diagnostics. Production terrain export is disabled pending exact ENU, frame and height-datum resolution.
  - `scoring.py`: Profile validation, `weighted_cosine_euclidean_v1` matrix scoring, fixed independent normalization, chunked batching (`O(batch_size * D)`), and deterministic ranking.
  - `validation.py`: Draft 2020-12 JSON Schema validation plus Contract `1.0.0` cross-field semantic, hash, binary buffer, camera, splat matrix, and score-recomputation checks.
  - `export.py`: SHA-256 helpers and atomic temp-file + `fsync` + `os.replace` writes.
- `config/`:
  - `sites_manifest.json`: Initialized empty (`{"schema_version":"1.0.0","sites":[]}`).
  - `scoring_profiles.json`: Initialized empty (`{"profiles":[]}`).
- `schemas/analog_location.schema.json`: Immutable Contract `1.0.0` schema copy used only when `../shared/schemas/analog_location.schema.json` is absent.
- `tests/`: `test_scoring.py`, `test_validation.py`, `test_offline.py`.

## Strict Input Schema (`sites_manifest.json`)

```json
{
  "schema_version": "1.0.0",
  "sites": [
    {
      "id": "safe_alphanumeric_id",
      "name": "Declared Region or Study Window Name",
      "body": "earth | moon | mars",
      "missions": ["LRO"],
      "region_status": {
        "study_window_type": "sourced_aoi | user_selected_study_window",
        "approved_nasa_landing_site": false,
        "landing_site_source_id": null,
        "notes": "NASA observation mission membership is distinct from approved landing-site status."
      },
      "coordinates": {
        "latitude_deg": 0.0,
        "longitude_deg": 0.0,
        "frame": "earth_wgs84 | moon_iau_planetocentric | moon_iau_planetographic | mars_iau_planetocentric | mars_iau_planetographic",
        "longitude_domain": "minus180_to_180 | 0_to_360",
        "east_positive": true,
        "ellipsoid": { "semi_major_m": 3396190.0, "semi_minor_m": 3376200.0 },
        "source_ids": ["source_id"]
      },
      "aoi": {
        "local_path": "data-pipeline/raw/site_aoi.geojson",
        "sha256": "<64-hex>",
        "access_url": "https://...",
        "frame": "earth_wgs84 | moon_iau_planetocentric | mars_iau_planetocentric",
        "source_ids": ["source_id"]
      },
      "dem": {
        "local_path": "data-pipeline/raw/site_dem.tif",
        "sha256": "<64-hex>",
        "vertical_datum": "Documented vertical datum string",
        "vertical_units": "m",
        "label_path": "data-pipeline/raw/site_dem.lbl",
        "label_sha256": "<64-hex>",
        "source_ids": ["source_id"]
      },
      "power_query": {
        "latitude_deg": 0.0,
        "longitude_deg": 0.0,
        "start": "YYYYMMDD",
        "end": "YYYYMMDD",
        "sampling_note": "Point sampling of NASA POWER coarse grid; not a polygon average."
      },
      "observations": {},
      "geology": {
        "classes": [],
        "method": "no_geologic_dataset_declared",
        "source_ids": [],
        "missing_reason": "Explicit reason when geology classes are absent"
      },
      "sources": [
        {
          "id": "source_id",
          "provider": "USGS / NASA PDS / PGC",
          "product_id": "PRODUCT_ID",
          "product_url": "https://...",
          "mission": "LRO",
          "access_url": "https://...",
          "retrieved_at": "2026-01-01T00:00:00Z",
          "sha256": "<64-hex>",
          "license": "NASA Open Data",
          "local_path": "data-pipeline/raw/site_dem.tif",
          "sidecar_path": "data-pipeline/raw/site_dem.lbl",
          "sidecar_sha256": "<64-hex>"
        }
      ]
    }
  ]
}
```

Rules enforced by `load_manifest`:
- Planetographic coordinates require explicit `ellipsoid` radii and are mathematically converted (`atan((b/a)^2 * tan(phi_g))`) to planetocentric rather than silently relabelled.
- `geology.classes` rejects ISRIC SoilGrids sources (SoilGrids provides predicted soil properties, not mineralogy/geology).
- Declared region names (`Shackleton`, `Haworth`, `Jezero`, `Arcadia Planitia`, `Atacama`, `McMurdo Dry Valleys`, `Mauna Kea`, `Iceland Highlands`, `Charyn`, `Mangystau`) never imply hardcoded coordinates, polygons, or NASA landing-site status.
- All local paths must resolve inside the repository root (symlink escapes rejected).

## Strict Input Schema (`scoring_profiles.json`)

```json
{
  "profiles": [
    {
      "id": "topography_only",
      "version": "1.0.0",
      "algorithm": "weighted_cosine_euclidean_v1",
      "alpha": 0.5,
      "comparison_resolution_m": 10.0,
      "window_m": 500.0,
      "min_valid_area_fraction": 0.85,
      "features": [
        {
          "key": "slope_mean_deg",
          "unit": "deg",
          "quantity": "terrain_slope_mean",
          "weight": 1.0,
          "lower": 0.0,
          "upper": 45.0,
          "calibration_source_ids": ["calibration_doc_source_id"],
          "calibration_method": "Documented independent physical calibration"
        }
      ]
    }
  ]
}
```

Rules enforced by `validate_profile` & `score_matrix`:
- `lower < upper`, `weight > 0`, `0 <= alpha <= 1`, unique feature keys, canonical units, no `NaN`/`Inf`.
- Out-of-bounds feature values fail loudly (or exclude the candidate); silent clipping or batch-fitted percentile bounds are prohibited.
- `air_2m_temperature` (NASA POWER) and `surface_temperature` (e.g. LRO Diviner) cannot mix in the same profile or across compared locations.

## Geospatial & Climate Rules

- **Terrain production gate**: `extract_terrain` always raises `TerrainContractBlockedError` (a fatal `ValueError`, separate from the per-site `TerrainValidationError`). Prepare/offline call the same gate before manifest/source reads, downloads or staging, and abort before publishing assets or dataset JSON, including without `--require-demo-ready`. No body/profile/flag can bypass the gate. Existing output remains intact. Contract 1.0.0 is unchanged.
- **Test-only diagnostic**: `_extract_projected_relief_for_tests` computes AEQD relief with mean-centered source heights, **not exact Cartesian ENU**. Its camera frame is deliberately outside the production schema and `contract_exportable` is false. It cannot establish a source-frame transformation or an absolute height zero. It uses the DEM CRS ellipsoid (no Earth EPSG assumptions for Moon/Mars). Rejects DEMs whose effective pixel size is coarser than `comparison_resolution_m`. Masked bilinear resampling requires all 4 surrounding source pixels to be valid (no hole-filling). Horn 3x3 gradient requires all 9 neighborhood nodes valid; `roughness_index = RMS(OLS detrended plane residual) / support_window_m`.
- **Heightmap Export**: `.bin` little-endian `float32` offsets from `origin.elevation_m` (`width * height * 4` bytes) and `uint8` validity mask (`width * height` bytes, values `0`/`1`, `0.0` padding under `mask=0`). Raw DEM is exported separately under `/assets/dem/...`.
- **NASA POWER**: Queries `https://power.larc.nasa.gov/api/temporal/daily/point` with `parameters=T2M_MIN,T2M_MAX,ALLSKY_SFC_SW_DWN,RH2M`, `community=RE`, `format=JSON`, `time-standard=UTC`. Reads `fill_value` and `units` from the response; converts `MJ/m^2/day / 3.6` only when reported in MJ; rejects unknown units; retains `RH2M` strictly as contextual metadata (never `aridity_index`).

## Local Setup & Verification Commands (PowerShell)

Run from the `planetary-analog-explorer` repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e "./data-pipeline[test]"
# After installation, generate a pinned lockfile with real resolved versions:
.\.venv\Scripts\python.exe -m pip freeze > data-pipeline/requirements.lock.txt

.\.venv\Scripts\python.exe -m pytest data-pipeline/tests -q
.\.venv\Scripts\python.exe data-pipeline/fetch_and_score.py --mode empty
.\.venv\Scripts\python.exe data-pipeline/fetch_and_score.py --mode validate

# Prepare/offline currently refuse terrain export (expected failure):
.\.venv\Scripts\python.exe data-pipeline/fetch_and_score.py --mode prepare --require-demo-ready
.\.venv\Scripts\python.exe data-pipeline/fetch_and_score.py --mode offline --require-demo-ready
```

## Current Data Readiness Blockers

1. `data-pipeline/config/sites_manifest.json` is initialized empty (`sites: []`): sourced AOI GeoJSONs, raw DEMs, companion labels/sidecars, and SHA-256 checksums must be staged for target and analog sites (note SRTM 60N-56S excludes Iceland Highlands and McMurdo Dry Valleys, which require ArcticDEM/REMA with provenance or explicit exclusion).
2. `data-pipeline/config/scoring_profiles.json` is initialized empty (`profiles: []`): documented `topography_only` (and any optional multi-feature) calibration bounds, weights, `alpha`, and `calibration_source_ids` must be supplied.
3. No `.splat` / Gaussian `.ply` assets with metric scale and verified registration exist; `splat` remains `null` (`splat_available=false`).

## Local A05 maintenance verification

Astra / GPT-6.1 Sol (medium) corrected the NumPy nodata tolerance keyword,
the +180° DEM boundary check, and rejection of ambiguous unsplit wide polygons.
Antimeridian AOIs must be explicitly split into a MultiPolygon. URL validation
rejects non-public IP literals and ambiguous resolver spellings such as `127.1`,
`2130706433`, and `0x7f000001`; conventional DNS labels are checked without a
network lookup. This syntax policy does not verify DNS resolution or prevent DNS
rebinding. Temperature and splat test fixtures now conform to frozen Contract
1.0.0 before exercising their intended invariant checks.

Local verification uses the existing approved Python environment with `PYTHONPATH`
set to this directory's `src`, so an older editable preview cannot shadow these
sources. Evidence is in `evidence/local_a05_checks` at repository root. All CLI
checks write to temporary paths; demo-ready refusal preserves the existing empty
output. No online preparation, scientific feature calculation, or publication is
part of these maintenance checks. Real ROI/frame/datum/calibration blockers remain
documented in `docs/research/LOCAL_DEM_READINESS.md`; passing unit tests supplies
neither human acceptance nor Phase 5 authorization.

## Local A06 geometry safeguard

New work: GPT-6.1 Sol (medium), separate from immutable Gemini exports. The
existing projected algorithm remains available only through a private diagnostic
entry point used by synthetic numerical tests; it no longer claims the contract
ENU camera frame. Public `extract_terrain` rejects even apparently complete inputs.
The dedicated exception must remain outside `TerrainValidationError`, because
the CLI catches that type as an excludable site error and can otherwise commit
a replacement dataset. Empty/validate modes and generic atomic writers retain
their existing behavior; this gate protects the production terrain preparation
path, not arbitrary callers constructing their own data.

Evidence and regression commands are in `evidence/local_a06_checks/pipeline_guard_report.md`.
The native DEM audit's source-frame, absolute height datum and exact ENU gates
remain unresolved; this change supplies no scientific reconstruction or Phase 5
acceptance. Production features/ranking from this terrain routine remain blocked.
