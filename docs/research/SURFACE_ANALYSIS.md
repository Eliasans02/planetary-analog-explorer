# Native-grid terrain analysis

The application now computes descriptive terrain results from verified local DEM buffers. This is an offline scientific summary of each displayed native window, using its existing meter spacing. It does not derive data from globe colors, visual exaggeration, or screenshots. It does not rank analog sites or infer landing suitability.

## Primary-source basis

Reviewed 2026-11-14:

- [GDAL gdaldem documentation](https://gdal.org/en/stable/programs/gdaldem.html): slope in degrees, complete 3×3 neighborhoods by default, no-data exclusion, explicit edge interpolation option, horizontal/vertical unit considerations, and Riley TRI definition. Our pipeline never enables edge interpolation.
- [GDAL v3.11.0 implementation](https://github.com/OSGeo/gdal/blob/v3.11.0/apps/gdaldem_lib.cpp): `GDALSlopeHornAlg`, `GDALTRIAlgRiley`, and `GDALRoughnessAlg` provide directly inspectable implementation references. The last computes the 3×3 maximum minus minimum. Our calculation uses Float64 intermediates rather than GDAL's Float32 output raster.
- [NASA GSFC high-resolution LOLA topography](https://pgda.gsfc.nasa.gov/products/78): the 5 m lunar surface is substantially interpolated, and interpolation error depends on laser-point gaps. An available raster sample is not necessarily a direct laser return. Published product uncertainty summaries are not a per-window uncertainty calculation here.
- [USGS National Map seamless DEM specifications](https://pubs.usgs.gov/publication/tm11B9): source requirements, spatial reference, horizontal resolution, vertical accuracy, surface treatment, voids, and metadata are distinct aspects of DEM quality. Access to the publication landing page was blocked during this review; the USGS indexed abstract was available. No uninspected specification details are assumed.
- [HiRISE DTM use guidance](https://www.uahirise.org/dtm/howto.php): PDS raster format, no-data handling, and mapping-label interpretation require care. The existing asset exporter and provenance retain the source label and sample geometry.

## Exact computation

Input heights are row-major little-endian Float32 meters; validity is UInt8, exactly 0 or 1. Analysis verifies both complete buffer SHA-256 digests and byte lengths against the catalog before computing. It validates the source catalog schema, unique identifiers and source references. Stored heights must all be finite, invalid cells zero, dimensions at most 257×257. Observed valid/total counts must match metadata. Buffer relief must match catalog relief within `max(1e-6 m, 2 * Float32_epsilon * abs(catalog_relief_m))`, allowing the exporter’s Float32 rounding. All-invalid input is rejected.

Each local center must have all nine valid samples, including the center; outermost rows/columns are excluded. No holes are filled, and no resampling occurs. With the window ordered by raster row and column:

```text
a b c
d e f
g h i

gx = ((c-a) + 2(f-d) + (i-g)) / (8 dx)
gy = ((g-a) + 2(h-b) + (i-c)) / (8 dy)
slope_deg = atan(hypot(gx,gy)) * 180/pi
roughness_m = max(a,...,i) - min(a,...,i)
Riley_TRI_m = sqrt(sum((neighbor-e)^2 for eight neighbors))
```

`dx,dy` are the catalog `spacing_m` values along column/row axes; they can differ. Calculations promote stored Float32 heights to Float64 first. Raster row direction may invert a derivative sign relative to north; slope magnitude is unaffected. Vertical offset is constant and cancels in differences. `relief_m` is the maximum minus minimum of **all valid** heights, including edges, so it can differ in support from local metrics.

Summary statistics are arithmetic mean, maximum, and the linear 95th percentile of eligible center slopes. For sorted slopes `s`, percentile position is `r=0.95(n-1)` with linear interpolation between `floor(r)` and `ceil(r)`. Roughness is summarized by mean and maximum; Riley TRI by mean. No detrending is applied: roughness and TRI include the local gradient and are not rockiness measurements.

Histogram bins are `[0,5)`, `[5,10)`, `[10,20)`, `[20,30)`, `[30,90]` degrees. Each fraction is `100 * bin_samples / analyzed_centers`, a percentage of eligible centers, not confidence or coverage of the whole raster. `coverage` separately reports valid/total heights and analyzed/possible interior centers. With zero eligible centers, local metrics and histogram percentages are null and bin counts zero; relief is still computed if at least one height is valid.

## Physical interpretation and limitations

These are **native-grid estimates**, not exact slopes in a local ground-distance or ENU solution. The record copies the catalog horizontal method. Earth’s geographic raster retains native samples and uses a center-based degree-to-meter approximation; lunar stereographic spacing is projected; Mars equirectangular MAP_SCALE is true at the projection center, which can differ from the window latitude. No additional terrain-distance correction is silently applied.

A 3×3 sample kernel spans two sample intervals between its outer centers in each direction; it is not a fixed meter-scale physical kernel across surfaces. Grid resolution, projection, window extent, source noise, interpolation and missing data affect slopes and extrema. Current Mars windows are roughly 129 m across, lunar windows 640 m, and Earth windows several kilometers. Equal numerical metrics across these supports do not establish geological similarity. The source DEM can contain provider interpolation or fill even where this analysis uses no interpolation. No instrument-return confidence, per-sample error model, elevation-datum equivalence, or habitability claim is produced.

## Reproduction and verification

From the repository root in PowerShell:

```powershell
& previews/a04/.venv/Scripts/python.exe data-pipeline/analyze_surfaces.py
& previews/a04/.venv/Scripts/python.exe data-pipeline/analyze_surfaces.py --check
& previews/a04/.venv/Scripts/python.exe -m unittest discover -s data-pipeline/tests -p test_surface_analysis.py -v
```

Export validates finite JSON and the independent analysis schema, then atomically replaces the output. Identical catalog/assets produce identical JSON: `generated_at` reuses the catalog publication time rather than wall-clock execution time; `catalog_sha256` hashes the exact source catalog bytes. `--check` is read-only, validates current published JSON, verifies current input buffers again, and compares every field exactly to recomputation except `generated_at`. It detects stale catalog hashes, missing records, and changed scientific results. This exact check assumes the same NumPy/Python numeric implementation; it is not a tolerance-based comparison of third-party software outputs.

Tests exercise an analytic plane on an anisotropic grid, known Riley TRI/range, vertical-offset invariance, no-data neighborhood exclusion, edge support, empty eligible neighborhoods, explicit histogram boundaries, independently calculated linear p95, input corruption, metadata inconsistency and atomic failure behavior. GDAL Python bindings are unavailable in the execution environment, so no GDAL runtime parity claim is made.

## Next defensible analysis

Cross-body analog comparison first needs a stated question and comparable meter-scale neighborhoods and window extents, with an explicit common physical support and resampling policy. Keep the native products for provenance and quantify how resampling changes derivatives before introducing a similarity model. Horizon and sunlight calculations need a substantially wider DEM and suitable solar/body ephemerides; the colored globe cannot supply either. Rock hazards, mineralogy, temperature and other environmental interpretations require their own measurements and uncertainty metadata.
