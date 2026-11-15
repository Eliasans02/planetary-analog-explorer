# GitHub and continuation handoff

This handoff describes the repository prepared for publication under the GitHub account `Eliasans02`. It does not certify a remote push; confirm the repository URL, branch and commit in GitHub or with `git remote -v` and `git status` after publication.

## Run a fresh clone

Clone the complete repository, keeping `shared/`, `web-client/` and `data-pipeline/` together. Install a Node.js version supported by the locked Vite dependencies and npm. From the repository root in PowerShell:

```powershell
Set-Location web-client
npm.cmd ci
npm.cmd run build
npm.cmd run preview -- --port 4173 --strictPort
```

Open http://127.0.0.1:4173/. For development, run `npm.cmd run dev` (http://127.0.0.1:3000/) instead of build/preview. Serve the application through Vite; opening `index.html` directly is unsupported.

The committed `web-client/public/data/` catalogs and `web-client/public/assets/` derivatives provide the runtime data. The viewer needs no raw NASA/USGS download, Python installation, local preview directory or source cache. Build output and installed dependencies are generated locally.

## Validate the clone

From `web-client/`:

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run test:config
npm.cmd run verify:surfaces
npm.cmd run verify:planets
npm.cmd run build
```

`verify:surfaces` and `verify:planets` validate the published display assets. The separate `npm.cmd run verify:assets` checks calibrated scored comparisons; that dataset remains missing, so it is not a completion check for the functioning Planet Explorer.

Python is optional for running the viewer. For pipeline development, install Python 3.11 or newer and create a new environment from the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e './data-pipeline[test]'
.\.venv\Scripts\python.exe scripts/verify_contract.py
.\.venv\Scripts\python.exe data-pipeline/analyze_surfaces.py --check
```

The editable package includes NumPy, Pillow, Rasterio, PyProj, Shapely, Requests, JSON Schema and the pytest test extra. See [the pipeline README](../data-pipeline/README.md) for its CLI and input contracts. Historical evidence refers to `previews/a04/.venv`; that environment is not portable and is not needed for a fresh clone.

## Source downloads and reproduction

`data-pipeline/raw/` and `data-pipeline/cache/` are excluded from Git. They hold large original DEMs, image products and acquisition caches. Public provenance preserves source URLs, identities, checksums and processing limits; paths into the excluded cache are provenance references rather than browser dependencies.

Source-pixel reproduction and some Python tests need those original bytes. In particular, the final source checks used `test_planet_assets.py` and `test_surface_imagery.py`; do not expect their recorded eight-test result to reproduce on an empty raw cache. Acquire and verify the documented sources separately before running source-backed tests or exporters. Do not run every exporter merely to start the viewer: exporters rewrite the public catalogs and must follow the documented ordering.

Use [planet asset research](research/PLANET_ASSETS.md), [surface expansion reproduction](research/SURFACE_SITE_EXPANSION.md), [imagery reproduction](research/SURFACE_IMAGERY.md), [Mars source review](research/MARS_DISPLAY_REVIEW.md) and [analysis methods](research/SURFACE_ANALYSIS.md). Replace historical Python executable paths with `.\.venv\Scripts\python.exe`. Source retrieval requires network access and may be substantial; it is a separate task from installing the app.

## Saved checkpoint and evidence

Current checkpoint: `MARS_SOURCE_RELIEF_VERIFIED_2026-11-14`, phase `PHASE_4_ENGINEERING_VERIFIED_HUMAN_PASS_PENDING`.

- Moon/Mars globes support independent views, source-resolution selection, neutral color-plus-shape lighting and original-image display. Mars uses the NASA-published Viking visualization texture at its native 1440 × 720 size or downsampled 1K.
- Six prepared Moon/Mars sites provide native DEM terrain, bounded first-person exploration and source imagery/relief controls that retain the view. The archive contains seven surfaces including Earth, with hash-bound terrain summaries and provenance.
- Compact controls occupy separate toolbar, fitted-canvas and status rows. Local HiRISE imagery and native terrain/analysis identities were retained during the display-source update.
- Mars remains spherical globally: no global Mars DEM was added. Global drapes are coarse and approximately placed. Source imagery is not certified natural RGB, calibrated albedo or mineralogical measurement; HiRISE enhanced false color is labeled.
- Calibrated analog rankings, exact ENU ground assets and registered Gaussian reconstruction remain incomplete. Human Dev_A/Dev_B PASS is unreceived and PHASE_5 is false. Native pointer-lock success and FPS/RAM performance are not certified.

The [display checkpoint](../evidence/display_relief/DISPLAY_CHECKPOINT.json) and [check status](../evidence/display_relief/check-status.json) are the current evidence. They record 165 frontend tests across 18 files **before** the final presentation markup/CSS edits; five focused appearance/UV tests across two files **after** those edits; final typecheck/build and both asset verifiers passing; eight Python source tests passing with the local source cache; and seven unchanged analysis surfaces. These are historical checkpoint results, not a claim that a fresh clone has already been tested. Earlier README test counts describe earlier checkpoints.

## Continue later

The GitHub preparation pass also validated a clean Git index export with no raw caches or preinstalled dependencies: `npm ci`, typecheck, both public-asset verifiers, production build, all 165 frontend tests across 18 files, and the configuration test passed. The lockfile was unchanged. See [publication validation](../evidence/github_handoff/check-status.json) and its logs. This pass did not repeat browser or Python source-pixel checks. The build retains its large-chunk warning; npm audit reports one moderate AJV advisory ([GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6)). Review and update that dependency in the next development loop.

Start with [REPO_STATE.json](../REPO_STATE.json), [AI and data attribution](../AI_AND_DATA_ATTRIBUTION_LOG.json), the current display evidence, and the contracts: [comparison semantics](contract_semantics.md), [planet explorer](planet_explorer_contract.md), [native surfaces](native_surface_contract.md), plus [scientific constraints](scientific_constraints.md) and [schemas](../shared/schemas/).

Suggested next priorities are a real registered global Mars DEM, larger native terrain windows with independently registered local imagery, source-backed registered Gaussian reconstruction, calibrated analog comparisons with common physical support, and measured foreground FPS/RAM and pointer-lock behavior. Choose a concrete next task while preserving source identities and explicit scientific limits.

Copy this continuation prompt into a new session:

> Continue Planetary Analog Explorer from `MARS_SOURCE_RELIEF_VERIFIED_2026-11-14`. Read `docs/GITHUB_HANDOFF.md`, `REPO_STATE.json`, `AI_AND_DATA_ATTRIBUTION_LOG.json`, the contracts under `docs/` and `shared/schemas/`, and `evidence/display_relief/DISPLAY_CHECKPOINT.json` plus `check-status.json` before changing anything. Inspect the current Git branch/commit and working tree. Run the committed public-asset viewer using `npm ci` in `web-client`; create a fresh root `.venv` with `pip install -e './data-pipeline[test]'` only if Python work is needed. Raw NASA/USGS caches are excluded, so separate runtime checks from source-pixel tests requiring documented acquisition. Preserve scientific limits, attribution and historical evidence; do not promote old test counts or human acceptance to new results. Propose the next concrete improvement from the saved priorities, then implement and validate the selected work without inventing source data or claiming global Mars relief, calibrated similarity, Gaussian reconstruction or performance until supported by evidence.
