# Planetary Analog Explorer — LOOP_0

The Gemini Python and React implementations have been imported and preserved, and development now runs in separate GPT-6.1 Sol instances with medium reasoning. Astra integrates the pipeline, application, viewer, science research, and independent code/security review. This is a working engineering preview; calibrated similarity, registered Gaussian reconstruction and human acceptance remain incomplete.

To run a fresh clone, install Node.js with npm, then use PowerShell from the repository root:

```powershell
Set-Location web-client
npm.cmd ci
npm.cmd run build
npm.cmd run preview -- --port 4173 --strictPort
```

Open **http://127.0.0.1:4173/**. For development, use `npm.cmd run dev` instead (http://127.0.0.1:3000/). The committed public catalogs, imagery, terrain buffers and provenance are sufficient to run the app; no raw NASA download or Python environment is required. Keep `shared/` alongside `web-client/` when cloning or moving the project.

The current checkpoint is `MARS_SOURCE_RELIEF_VERIFIED_2026-11-14`. Read [the GitHub and resume handoff](docs/GITHUB_HANDOFF.md) for fresh Python setup, validation scope, excluded source caches and a continuation prompt. Older reproduction commands and checkpoint paragraphs below preserve local development history; use the handoff's `.venv` setup instead of the historical `previews/a04/.venv` path.

The default Planet Explorer provides Moon/Mars globes, independent side-by-side orbit and per-body source texture selection: Moon 1K/2K/4K; Mars 1K or Native 1440 × 720 (default). Quality changes retain the camera and current verified map while its replacement loads; **Showing** and **Loading** report actual map state. Each body retains its view and relative zoom across split view and ground visits. Six named prepared sites are pinned across the Moon and Mars, three per body. Prepared-site cards show source links, coordinates and native grid spacing. **Locate** turns the globe to a site; clicking a pin selects and highlights it, with its name and **Explore selected surface** above the globe. Use **Explore surface**, **Explore verified site**, or drag the astronaut onto a marker to open its native terrain. Named cards distinguish overlapping polar pins without relocating them. Use **Start exploration**, WASD to move, and arrows or mouse look; **Pause exploration** or Escape pauses, and **Resume exploration** continues. If the browser cannot capture the mouse, use arrows or drag the ground while the canvas has keyboard focus. The native position readout flushes its final value on key release or pause. Orbit mode returns to the complete local terrain. Source triangles and validity masks bound movement; a drop elsewhere reports unavailable local terrain.

The Moon globe uses LROC display imagery and coarse LOLA radial relief. The Mars globe uses the [NASA-published Viking display texture](https://science.nasa.gov/3d-resources/mars/) on a sphere, with real HiRISE relief at Jezero, Gale crater and Eberswalde crater. Lunar windows cover Shackleton rim, Connecting ridge (LOLA Site01) and Nobile rim 1 (LOLA Site06). Global marker positions are approximate locators; the detailed crops retain native source frames. The Surface Archive also keeps the LOLA Shackleton rim and USGS Hawaiʻi views. The catalog contains seven surfaces including Earth. After terrain buffers pass checksum and content verification, each surface shows native-grid slope mean/95th percentile/maximum, elevation relief, 3 × 3 range roughness, Riley TRI, slope-distribution percentages and coverage. These derived metrics depend on grid spacing and window extent; roughness and TRI include the gradient. The separate `surface_analysis` 1.0.0 catalog binds the exact full source-catalog SHA-256 and each height/mask hash, dimensions and spacing. Stale or inconsistent summaries are unavailable. These remain unranked relative-height displays. The separate similarity workspace still requires calibrated comparison data and exact ENU ground assets. Gaussian reconstruction remains a future phase. Do not open `index.html` directly as a local file; use the preview server.

- Target file tree: [docs/REPO_PLAN.txt](docs/REPO_PLAN.txt).
- Exact JSON Schema: [shared/schemas/analog_location.schema.json](shared/schemas/analog_location.schema.json).
- TypeScript contract: [shared/types/analog-location.ts](shared/types/analog-location.ts).
- Semantic checks: [docs/contract_semantics.md](docs/contract_semantics.md).
- Current parallel workflow: [Astra Sol loop](prompts/ASTRA_SOL_LOOP.md) and [team state](docs/orchestration/SOL_TEAM_STATE.json).
- Planet sources and reproduction: [source research](docs/research/PLANET_ASSETS.md), [planet contract](docs/planet_explorer_contract.md), [planet schema](shared/schemas/planet_catalog.schema.json).
- Expanded sites and analysis: [source acquisition and pixel verification](docs/research/SURFACE_SITE_EXPANSION.md), [methods, limits and reproduction](docs/research/SURFACE_ANALYSIS.md).
- Preserved Gemini handoff: [archive manifest](archives/GEMINI_HANDOFF_MANIFEST.json). The original [Dev_A](prompts/LOOP_0_DEV_A.md) and [Dev_B](prompts/LOOP_0_DEV_B.md) prompts remain historical context.
- Current state and attribution: [REPO_STATE.json](REPO_STATE.json), [AI_AND_DATA_ATTRIBUTION_LOG.json](AI_AND_DATA_ATTRIBUTION_LOG.json).

Real NASA LOLA and USGS elevation payloads have been downloaded, inspected and compiled into local native relief assets. The [native surface contract](docs/native_surface_contract.md) explains the display projection, masks, relative-height zero and retained coordinate frames. The [native DEM audit](docs/research/NATIVE_DEM_AUDIT.md) still defines the unresolved absolute-height and exact ENU gates. No calibrated feature vector, similarity score or splat reconstruction is published.

Reproduce the source-backed surface export from the cached, checksum-verified inputs:

```powershell
.\previews\a04\.venv\Scripts\python.exe data-pipeline\export_surface_catalog.py
.\previews\a04\.venv\Scripts\python.exe data-pipeline\fetch_planet_assets.py
.\previews\a04\.venv\Scripts\python.exe data-pipeline\export_mars_surface.py
.\previews\a04\.venv\Scripts\python.exe data-pipeline\expand_surface_sites.py
.\previews\a04\.venv\Scripts\python.exe data-pipeline\analyze_surfaces.py
.\previews\a04\.venv\Scripts\python.exe data-pipeline\analyze_surfaces.py --check
Set-Location web-client
npm.cmd run verify:surfaces
npm.cmd run verify:planets
```

Original project work is Apache-2.0. Third-party software and datasets retain their own licenses and attribution requirements.

Contract-only validation (PowerShell, repository root):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install "jsonschema[format]==4.25.1"
.\.venv\Scripts\python.exe scripts/verify_contract.py
```

Run the exporters in the order shown: the original Moon/Earth exporter recreates its catalog, the Mars exporter appends Jezero, and the offline expansion exporter appends the four additional sites from checksum-verified cached inputs. Generate and check analysis only after the complete seven-surface catalog is exported. Raw downloads are kept outside the web build; public derivatives and provenance are served locally.

Earlier surface checks are recorded in [surface export evidence](evidence/real_surface_export/validation.json), [frontend checks](evidence/real_surface_ui/check-status.json), and [independent source/buffer review](evidence/real_surface_review.md). New globe and walking evidence lives in `evidence/planet_explorer/` and `evidence/planet_assets/`. Frontend commands are `npm.cmd run typecheck`, `npm.cmd run test`, `npm.cmd run test:config`, and `npm.cmd run build`. `npm.cmd run verify:surfaces` validates the real unranked catalog; `npm.cmd run verify:planets` checks the orbital assets. The distinct `npm.cmd run verify:assets` checks scored comparisons and still fails while that dataset is missing; success of display catalogs is not success of similarity analysis.

The completed navigation checkpoint is `NAVIGATION_CONTINUITY_VERIFIED_2026-11-14`, with its historical evidence in `evidence/navigation_improvements/`. Frontend validation passed 105 tests across 12 files, typecheck/build, and planet/surface asset verification. Display-only grid-spacing formatting followed the full suite and was checked by the final typecheck/build; the final script is `index-BIWJTfWF.js`. Human Dev_A/Dev_B PASS remains unreceived and PHASE_5 remains false. Native pointer-lock success and 60 FPS are not certified. At that checkpoint, next work was expanded native coverage, real registered Gaussian assets, calibration and performance measurement; the current checkpoint below supersedes that queue.


The preceding checkpoint is `SURFACE_SITES_ANALYSIS_VERIFIED_2026-11-14`; the navigation checkpoint above is preserved history. Evidence lives in [surface expansion evidence](evidence/surface_expansion/). All 119 frontend tests across 13 files, typecheck, production build and both planet/surface asset verifiers passed; the final JavaScript is `index-Cuab9JlK.js`. Python validation passed 13 analysis tests, 3 expansion tests and 5 legacy export tests. All 66,564 new pixel values and masks were compared with verified source pixels. Browser review verified all four new sites, selected-pin/Locate/Explore behavior and Earth archive analysis, with an empty console. Human Dev_A/Dev_B PASS remains unreceived and PHASE_5 remains false. No Gaussian reconstruction, native pointer-lock success or FPS target is certified. Next work is registered source imagery, larger native coverage, comparable physical support for analysis, real registered Gaussian assets and performance measurement.


Globe **Color + shape** adds neutral source-texture lighting by default; **Original image** provides the unlit source display. Mars remains a sphere without global DEM displacement. Its NASA-published Viking display texture is not certified natural RGB. The three prepared Mars **Orbital color** drapes have also been regenerated from that verified 1440 × 720 source; local HiRISE imagery, native DEM buffers and analysis identities are unchanged.

Source imagery appearance is available on six Moon/Mars terrain windows. **Local image** is selected initially wherever a published HiRISE orthoimage is prepared; grayscale and enhanced IRB false color remain explicitly labeled. Other windows initially use **Orbital color**, a coarse global display drape with approximate placement and potentially a single source color across the crop. **Relief shading** explicitly selects an elevation tint. Image selection and lighting are separate: **Relief light** adds neutral DEM slope shading by default, while **Original image · unlit** preserves the source display without added illumination. A direction slider controls the visualization light in native grid axes; it does not represent the real Sun. Source images already contain their acquisition illumination and shadows. Neither image mode multiplies in elevation colors. Appearance and lighting changes retain the camera, native geometry and walking position. Earth has no prepared photographic layer. Source links, provenance, limitations and exact catalog/grid binding remain visible; these display products are not calibrated albedo or mineralogical measurements.


Preceding color checkpoint: `SURFACE_SITES_ANALYSIS_COLOR_VERIFIED_2026-11-14`. See [imagery check status](evidence/surface_imagery/check-status.json) and [color checkpoint](evidence/surface_imagery/SURFACE_COLOR_CHECKPOINT.json). Final validation passed 155 frontend tests across 15 files, typecheck, production build and both surface/planet asset verifiers. The project Python environment (`previews/a04/.venv/Scripts/python.exe`) passed all 26 combined `test_surface*.py` tests and the read-only analysis `--check`. Final production assets are `index-7jGhMrdp.js` and `index-BrMCF5He.css`. Browser review verified Connecting ridge orbital colors, Gale orbital/local enhanced IRB and relief switching, and appearance changes in first person while retaining the native-position HUD (X 0 m, Z −1 m); console warnings/errors were empty. Screenshots: [Moon](evidence/surface_imagery/imagery-moon.jpg), [Mars orbital](evidence/surface_imagery/imagery-mars.jpg), [Mars local](evidence/surface_imagery/imagery-local.jpg).

The default lunar imagery at all three prepared polar windows comes from NASA SVS's documented monochrome LOLA-albedo polar replacement in its display mosaic; these are not local color photographs. The global drapes remain coarse and approximately placed. Local HiRISE imagery preserves the published grayscale or enhanced false-color pixels. See [source imagery research](docs/research/SURFACE_IMAGERY.md). Human Dev_A/Dev_B PASS remains unreceived and PHASE_5 remains false. Neither real Gaussian reconstruction nor FPS performance is certified. Next work remains larger native coverage, independently registered source imagery, common physical support for comparisons, real registered Gaussian assets and measured performance.


Current presentation checkpoint: `MARS_SOURCE_RELIEF_VERIFIED_2026-11-14`. See [display checkpoint](evidence/display_relief/DISPLAY_CHECKPOINT.json) and [display check status](evidence/display_relief/check-status.json) for final validation counts, production asset identities and browser evidence. The 155 frontend / 26 Python results recorded for the preceding color checkpoint are historical and must not be reused as this presentation loop's results. Human Dev_A/Dev_B PASS remains unreceived and PHASE_5 remains false; Gaussian reconstruction, native pointer-lock success and FPS performance are not certified.
