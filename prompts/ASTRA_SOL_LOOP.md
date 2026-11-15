# Astra local Sol development loop

Continue Planetary Analog Explorer from the working repository. The user has moved development from Gemini's browser sessions to separate `gpt-6.1-sol` instances with `medium` reasoning. Preserve Gemini authorship and immutable exports; attribute new work separately.

## Resume from evidence

Read `docs/orchestration/SOL_TEAM_STATE.json`, `REPO_STATE.json`, the evidence paths in their current checkpoint, `evidence/planet_explorer/independent-review.md`, `docs/research/PLANET_ASSETS.md`, and `docs/research/NATIVE_DEM_AUDIT.md`. Reobserve running agents and the local preview. Historical browser prompts and earlier reports remain evidence, not current work queues. Do not repeat completed dispatches, exports, reviews or archive receipts.

The completed navigation checkpoint is `NAVIGATION_CONTINUITY_VERIFIED_2026-11-14`; read its current evidence in `evidence/navigation_improvements/`. Quality changes preserve the camera and displayed verified map, with actual Showing/Loading status and failure retention. Per-body views and relative zoom survive split changes and ground return. Ground navigation provides Start/Pause/Resume, arrow or mouse look, and final native-position flushing on key release/pause. These are completed engineering work, not the next queue.

Validation passed 105 frontend tests in 12 files, final typecheck/build, and planet/surface verifiers. Display-only grid-spacing formatting occurred after the full suite, followed by final typecheck/build; final JavaScript is `index-BIWJTfWF.js`. Human Dev_A/Dev_B PASS remains unreceived, PHASE_5 remains false, and neither 60 FPS nor successful native pointer lock is claimed. That checkpoint is superseded by the surface-sites/analysis checkpoint below; preserve its evidence.

The preceding checkpoint is `SURFACE_SITES_ANALYSIS_VERIFIED_2026-11-14`, with evidence in `evidence/surface_expansion/`. The navigation checkpoint above remains historical. Read [site expansion research](../docs/research/SURFACE_SITE_EXPANSION.md) and [native-grid analysis methods](../docs/research/SURFACE_ANALYSIS.md). Six Moon/Mars pins (three each) and seven total surfaces including Earth are complete. The four added sites are Connecting ridge, Nobile rim 1, Gale crater and Eberswalde crater. Prepared cards and the selected-site bar separate Locate, pin selection and Explore; native terrain remains bounded to verified source windows. After actual terrain-buffer verification, all seven surfaces expose native-grid metrics, coverage and slope histograms. Analysis contract 1.0.0 binds the exact full source-catalog SHA-256 plus each input hash, dimensions and spacing; stale summaries must remain unavailable.

Final validation passed 119 frontend tests in 13 files, typecheck/build and both asset verifiers; final JavaScript is `index-Cuab9JlK.js`. Python checks passed 13 analysis tests, 3 expansion tests and 5 legacy export tests; all 66,564 new pixel values and masks match verified source pixels. Browser review covered all four new sites and Earth archive results with an empty console. Human Dev_A/Dev_B PASS remains unreceived and PHASE_5 remains false. No analog score, Gaussian reconstruction or FPS result is implied. Next work is registered source imagery, larger native coverage, common physical support for comparison, real registered Gaussian assets and measured performance; adding these pins and native-grid summaries is completed work.

Offline reproduction, after the base Moon/Earth and Jezero exporters, is:

```powershell
.\previews\a04\.venv\Scripts\python.exe data-pipeline\expand_surface_sites.py
.\previews\a04\.venv\Scripts\python.exe data-pipeline\analyze_surfaces.py
.\previews\a04\.venv\Scripts\python.exe data-pipeline\analyze_surfaces.py --check
```

The source-imagery implementation was verified by the preceding color checkpoint below; the current presentation loop adds source/lighting separation. Six Moon/Mars records provide nine prepared image layers. Default to the published HiRISE **Local image** when available, otherwise the coarse **Orbital color** drape; never override an explicit user choice when an asynchronous catalog finishes. Preserve grayscale or explicitly labeled enhanced IRB false color and do not invent natural RGB. **Relief shading** remains an explicit elevation tint. Default **Relief light** uses neutral Lambert illumination without a height-ramp multiplier; **Original image · unlit** remains available to inspect unchanged source display colors. Keep the adjustable native-grid light direction explicitly illustrative, with source illumination already baked in and no solar ephemeris claim. Light/image switches preserve native geometry, camera and navigation. Site changes must reject a prior site's image and clear stale source metadata; asynchronous replacement and cleanup retain resource ownership. Earth imagery remains unavailable. Preserve source links, provenance, registration caveats and catalog/grid checksum binding. Neither orbital display color nor enhanced imagery supplies calibrated albedo or mineralogy.

## Parallel roles and ownership

- Pipeline developer: `data-pipeline/`, excluding raw cache and frozen schema copies.
- Application developer: App, dataset validation, selection, HUD, Analog Passport, and frontend configuration.
- Viewer developer: Viewport3D, terrain, asset parsing, workers, and renderer lifecycle.
- Independent reviewer: read-only application review; code and security findings must identify reproducible inputs and actual source lines. Review fixes independently of their author.
- Science researcher: primary-source and local-payload inspection; preserve native frames, datums, masks, and provenance.
- Astra: integration, requirements checks, UI/design inspection, state and attribution. Reuse completed workers for review roles as slots become available. At most three workers run alongside Astra; never imply more simultaneous instances than were launched.

Each delegated task states exact writable paths, frozen interfaces, acceptance evidence, and unresolved dependencies. One writer owns each file. Workers may inspect other scopes but send findings to the owner.

## Closed loop

1. Choose one bounded defect or functionality and record its contract. Keep shared contract 1.0.0 unchanged until a coordinated versioned change is implemented across producer, validator, and consumer.
2. Dispatch independent tasks in parallel with the requested model and effort. Existing local workers can read files directly; browser-only prompt duplication is no longer required.
3. Implement and run meaningful targeted checks. A failure or performance warning stays in diagnostic/re-loop status; communicate concrete findings at least once per minute.
4. Independently review the patch, resolve material findings, then run a combined frontend test/typecheck/build once both frontend scopes are stable. Verify the built app through the internal browser. Never manufacture a PASS from an author report.
5. Persist exact evidence, hashes, attribution, and the next unfinished action. Human Dev_A and Dev_B PASS remain prerequisites for the original PHASE_5 milestone. Engineering checkpoints are not that acceptance.

## Scientific and product constraints

No invented coordinates, terrain, physical values, calibration, scores, or reconstruction. Synthetic test fixtures stay test-only. Real native Moon/Earth/Mars relief is published via the separate `surface_catalog` 1.1.0 contract; preserve its source identities and native frames. Orbital texture derivatives and coarse Moon radial relief use `planet_catalog` 1.0.0. `verify:surfaces` and `verify:planets` validate those display catalogs. `verify:assets` still checks the distinct scored/ENU dataset and must fail until that dataset actually exists. Never confuse these gates or replace the working real terrain with placeholder scenes.

The new default Planet Explorer supports independent Moon/Mars globes, per-body texture choices (Moon 1K/2K/4K; Mars 1K or default Native 1440 × 720), prepared-site astronaut drops and bounded first-person navigation. Locate focuses the prepared site; a global color map is not coverage for ground walking. Retain NASA's visual-product inpainting disclosure and source processing limits. Mars now uses the NASA-published Viking display texture from [NASA 3D Resources](https://science.nasa.gov/3d-resources/mars/); it is not certified natural RGB. Preserve native 1440 × 720 pixels and derive 1K only by downsampling. The prepared Mars orbital-color drapes now sample that same verified source; local HiRISE imagery and all native heights/masks/analysis identities remain unchanged. Globe **Color + shape** adds neutral source-texture lighting, while **Original image** remains unlit. Lambert fill/key intensities are π × 0.38 and π × 0.62, bounding the linear brightness response from 0.38 to 1; this is a display calibration, not measured photometry. The HiRISE export uses verified partial HTTP ranges and must never be described as a fully hashed IMG. Future Gaussian work requires real source-backed reconstruction and explicit registration; do not create depth hallucinations or place an unrelated splat on a named site.

The native DEM audit still blocks exact ENU/scoring publication on MOON_ME_DE421 versus the comparison contract frame, unresolved absolute height datum, and AEQD being labelled exact ENU. It no longer blocks the explicitly labelled native projected relief display: that separate contract has been implemented and checked. Source ROI records 1 and 2 are invalid; do not silently repair them. Valid ROI 3 was explicitly chosen for the lunar crop, and the Earth crop uses the highest valid sample of the source tile as its documented project rule. Neither is a new NASA-approved landing/analog recommendation. Preserve the interpolation/return-count disclosure. A projection inversion does not transform lunar reference frames.

The score is a reproducible heuristic, not habitability or NASA approval. Recompute contract score relationships before displaying ranked results. Report missing comparable measurements; POWER air temperature is not Diviner surface temperature.

Keep prepared assets local and bounded, reject corrupt/unsafe inputs, and release GPU/worker resources. Do not claim real-ground rendering or 60 FPS from unit tests or an empty schematic preview. UI distinctiveness comes from evidence-backed comparison and the Analog Passport; no unsupported uniqueness claims.

## Continuation boundary

Continue authorized work during the active turn. Do not promise an unattended loop, create a scheduler, upgrade Gemini, bypass service quotas, or request permissions already granted. Leave the working local preview and a precise checkpoint for the next turn. No deployment or publication is implied.


Preceding color checkpoint: `SURFACE_SITES_ANALYSIS_COLOR_VERIFIED_2026-11-14`. See [imagery check status](../evidence/surface_imagery/check-status.json) and [color checkpoint](../evidence/surface_imagery/SURFACE_COLOR_CHECKPOINT.json). Final validation passed 155 frontend tests across 15 files, typecheck, production build and both surface/planet asset verifiers. The project Python environment (`previews/a04/.venv/Scripts/python.exe`) passed all 26 combined `test_surface*.py` tests and the read-only analysis `--check`. Final production assets are `index-7jGhMrdp.js` and `index-BrMCF5He.css`. Browser review verified Connecting ridge orbital colors, Gale orbital/local enhanced IRB and relief switching, and appearance changes in first person while retaining the native-position HUD (X 0 m, Z −1 m); console warnings/errors were empty. Screenshots: [Moon](../evidence/surface_imagery/imagery-moon.jpg), [Mars orbital](../evidence/surface_imagery/imagery-mars.jpg), [Mars local](../evidence/surface_imagery/imagery-local.jpg).

The default lunar imagery at all three prepared polar windows comes from NASA SVS's documented monochrome LOLA-albedo polar replacement in its display mosaic; these are not local color photographs. The global drapes remain coarse and approximately placed. Local HiRISE imagery preserves the published grayscale or enhanced false-color pixels. See [source imagery research](../docs/research/SURFACE_IMAGERY.md). Human Dev_A/Dev_B PASS remains unreceived and PHASE_5 remains false. Neither real Gaussian reconstruction nor FPS performance is certified. Next work remains larger native coverage, independently registered source imagery, common physical support for comparisons, real registered Gaussian assets and measured performance.


Current presentation checkpoint: `MARS_SOURCE_RELIEF_VERIFIED_2026-11-14`. See [display checkpoint](../evidence/display_relief/DISPLAY_CHECKPOINT.json) and [display check status](../evidence/display_relief/check-status.json) for final validation counts, production asset identities and browser evidence. The 155 frontend / 26 Python results recorded for the preceding color checkpoint are historical and must not be reused as this presentation loop's results. Human Dev_A/Dev_B PASS remains unreceived and PHASE_5 remains false; Gaussian reconstruction, native pointer-lock success and FPS performance are not certified.
