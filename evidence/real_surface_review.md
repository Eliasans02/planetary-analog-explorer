# Independent native surface review

Review date: 2026-11-14. Scope: the separate unranked native terrain catalog, exporter, public artifacts, loader, SurfaceExplorer, SurfaceViewport and geometry. This is a bounded code/science/security review, not a human visual acceptance or a certification of the separate scoring/ENU workspace.

## Result

No material defect affecting the two delivered native source views was found in the reviewed snapshot. Source-to-buffer fidelity is independently established below. Final combined build and actual browser inspection, including source switching, belong to the application owner; this review does not substitute for those checks.

## Independent artifact checks

Read the catalog and public provenance sidecars independently, rehashed the cached inputs, and reread each complete 129 x 129 crop with Rasterio. The check independently applied GDAL validity, finite raw/scaled values, scale/offset, crop minimum subtraction in float64, and little-endian Float32 conversion. Compared every exported height and mask sample, not just exporter spot checks.

| Surface | Verified source SHA-256 | Exact native sample comparisons | Valid / missing |
| --- | --- | --- | --- |
| LOLA Site04 ROI 3 | `38ff70dbdf2f066c2cfa94a646c3a59d653ce7f6b4528b15fc1b43ee397ce758` | 16,641 / 16,641 | 16,641 / 0 |
| USGS n20w156 summit window | `75b69b4df0ac16cc7e1cccaa30c59ecb3a6834944d62aba245b0a36aa8d3b270` | 16,641 / 16,641 | 16,641 / 0 |

All six primary/companion receipt files matched their recorded SHA-256 and byte counts: lunar surface, return count, README, ROI archive, Earth surface and Earth XML. All four recorded ROI regular-member hashes matched archive bytes. Each public height, mask and provenance asset matched its catalog SHA-256 and byte count. Native top-left origins matched source pixel centers.

## Contract and science review

The exporter preserves source raster column/row order, signed native spacing and native WKT. The mesh increases X with columns and Z with rows, retaining Y offsets in metres at 1x vertical scale. Native lunar stereographic axes are explicitly described as projected relief; Earth display spacing is explicitly a constant crop-center geodesic approximation. Neither is represented as exact ENU. Height offset zero is the minimum valid crop sample; absolute vertical datum is honestly unverified. This is sufficient for direct relative-relief viewing.

The lunar source realization is retained as MOON_ME_DE421 using the supplied README; Earth remains NAD83. The locator is explicitly an equirectangular schematic of source coordinates with no cross-body frame conversion. Body/frame mismatch is rejected. Published ROI record 3 is retained as a separate outline within its context crop. The Earth maximum-native-sample selection is explicitly project-selected. No score, mission approval, climate comparability, direct-return equivalence, validated absolute height, splat reconstruction or measured performance claim is implied by the native catalog.

## Implementation review

Triangle generation references only adjacent, finite, valid samples; no triangle includes a missing node. The outline sampling requires fully valid neighboring cells. The delivered crops contain no missing samples, so missing-data behavior is additionally checked with the targeted synthetic geometry test. `npx vitest run src/terrain/surfaceGeometry.test.ts` passed all three tests (axis/height preservation, gap omission, boundary and missing-cell sampling).

Catalog and binary streaming have byte quotas; downloads reject redirects; binaries verify exact length and SHA-256 before parsing. Binary parsing uses explicit little-endian reads and rejects nonfinite values and invalid mask bytes. Catalog paths reject traversal/empty path segments and fetched assets use same-origin resolution. External provenance source links require HTTPS and are user-invoked navigation. React escapes catalog text. Surface IDs gate displayed buffer selection; switching/unmount aborts in-flight requests. Viewer cleanup cancels frames, disconnects observers, disposes controls, geometry/materials, shadow targets and renderer, and removes the canvas.

The exporter follow-up replacing all assert guards with explicit ValueError exceptions and atomic per-JSON temporary-file replacement was reviewed. Guards remain active under optimized Python. Per-file atomic replacement is not a transactional publication of the entire asset bundle; the current offline export followed by verification is the reviewed delivery workflow.

## Acceptance limits

This review does not establish absolute lunar/Earth datum alignment, ENU registration, surface similarity ranking, suitability, climate/profile equivalence, original instrument accuracy, or 60 FPS. It does not transform source coordinates into IAU_MOON or WGS84. It does not assert a human PASS. Actual browser appearance, responsive layout and switching still require the owner's final browser evidence. No whole build was rerun by this reviewer.
