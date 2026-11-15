# Independent analysis review

Reviewed `data-pipeline/analyze_surfaces.py`, its focused tests, `shared/schemas/surface_analysis.schema.json`, `shared/types/surface-analysis.ts`, `web-client/src/data/surfaceAnalysis.ts`, `SurfaceAnalysisPanel.tsx`, and catalog-loader identity integration. Reviewer did not author the analysis implementation. No implementation or source assets were changed. No full test suite was rerun.

## Findings

1. **Low severity — catalog checksum and computation can use different snapshots.** In `analyze_surfaces.py` lines 148–149, `build_analysis` reads the catalog once as bytes for SHA-256 and then independently reads/parses the path. An atomic replacement between those reads can bind a result to the previous catalog bytes while computing from the replacement. This was reproduced without filesystem changes by replacing only the second parsed snapshot's timestamp through a narrow `read_json` substitute: the output retained the first snapshot's SHA-256 while adopting the second snapshot's timestamp. Parse the already captured byte sequence once, with the same nonfinite-token rejection. The frozen current artifact is unaffected; normal deterministic builds and checks passed elsewhere.

2. **Low severity — frontend accepts a histogram inconsistent with its own maximum slope.** `surfaceAnalysis.ts` validates bin counts, percentages and total coverage but does not compare occupied bins to metric bounds. In an in-memory copy of the actual Jezero analysis, maximum slope remained 12.72500158151502°, while all 16,129 eligible samples were moved into the 30–90° bin (other bins zero, fractions adjusted to 100%/0%). The transpiled real `validateSurfaceAnalysis` accepted it. The generated current artifact has consistent metrics. A nonempty bin whose minimum exceeds `max_slope_deg` should fail, with numerical tolerance; other distribution-to-metric checks may be added if desired. This is a malformed-summary validation gap, not evidence of a formula error or altered published source data.

## Independent numeric check

A separate explicit row/column loop evaluated a deterministic 19 × 23 Float32 grid, anisotropic spacings 3.5 m and 8.25 m, and 33 invalid cells. It computed the Horn derivatives, slope, neighborhood range and Riley TRI directly for every complete neighborhood. All seven metric aggregates and all histogram counts matched the vectorized pipeline to absolute tolerance 1e-12. Coverage independently matched: 404 valid heights / 437 total, 179 analyzed centers / 357 possible interior centers.

## Correctness observations

Horn weights and axis spacings are correct for the stated projected native-grid approximation. The row-axis sign does not change slope magnitude. TRI uses the square root of the sum of squared differences to eight neighbors; inclusion of the zero center term is equivalent. Roughness is the 3 × 3 height range. Neither claims detrended rockiness. Relief includes all valid crop cells; local statistics exclude outer boundaries and any neighborhood with an invalid sample. Histogram intervals follow NumPy's half-open bins with the final upper bound included, and percentages divide by analyzed centers. Empty local coverage returns null metrics and fractions rather than fabricated zero estimates.

Input buffers are bounded by dimensions, exact byte counts and SHA-256, reject nonfinite storage, nonbinary masks and nonzero invalid padding, and are interpreted explicitly as little-endian Float32. Input hashes, dimensions, spacings and exact catalog response digest are bound in the frontend. Source projection, scale, interpolation and cross-resolution limitations are retained in output and visible in the panel. The JSON schema checks structure and numerical ranges; semantic checks in computation and frontend provide the cross-field checks. Runtime does not recompute every metric; it trusts the locally published summary after input-binding and semantic validation.

## Resolution check

Both findings were corrected during the review. The analyzer now hashes and parses the same captured byte sequence (`catalog = parse_json(data)`), closing the two-read race. The frontend now checks occupied histogram bins and metric distribution bounds. Repeating the exact previously accepted Jezero mutation against the updated real validator rejects the impossible distribution. No unresolved material findings remain in this scope. The published analysis/source buffers were not changed by this review.
