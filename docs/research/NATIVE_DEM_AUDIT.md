# Native DEM audit — 2026-11-14

Actual rasterio/Shapely/PROJ inspection succeeded using ordinary imports in `previews/a04/.venv/Scripts/python.exe` (rasterio 1.5.2, Shapely 2.2.0, pyproj 3.8.0). The previous DLL failure is historical, not a present GIS blocker. This audit changes only its report and `evidence/native_dem_audit/`. It does not establish human acceptance or publish a ground asset.

## Observations

The reproducible [audit script](../../evidence/native_dem_audit/audit.py) rehashes actual raw files, inspects all raster headers and reads only bounded lunar ROI bounding windows. [Full observations](../../evidence/native_dem_audit/observations.json) contain WKT, affine transforms, mask flags, hashes, archive listing and counts. No full raster array, terrain statistic, feature, score or calibration was computed. Coverage counts below are data-readiness diagnostics.

The four exact regular tar members `.shp`, `.shx`, `.dbf`, `.prj` were read into memory, never extracted. Each is unique and <1 MiB; SHX record offsets/lengths match SHP. The fifth member is the previously identified symlink and was neither followed nor extracted. DBF X/Y strings are preserved as source attributes; their semantics remain unverified.

**The source's first two polygons are invalid.** This supersedes the earlier provisional suggestion to use record 1. No `buffer(0)`, make-valid operation, polygon repair or reinterpretation was performed.

| Source record | Shapely validity | Pixel centers covered* | Finite/GDAL-valid surface | Zero-return pixels |
|---:|---|---:|---:|---:|
| 1 | Ring self-intersection `[-2807.5,-6662.5]` | 279 | 279 | 252 |
| 2 | Ring self-intersection `[-2742.5,-6387.5]` | 154 | 154 | 130 |
| 3 | Valid/simple | 126 | 126 | 106 |
| 4 | Valid/simple | 127 | 127 | 109 |

*Boundary rule is `polygon.covers(pixel center)`, including boundary, without context padding. Counts on invalid rings 1/2 are diagnostic GEOS results, not an approved scientific mask or area. All covered centers also have finite/GDAL-valid `ldec` and `toterr`; zero returns remain valid counts. A published interpolated surface is available where no direct return exists; do not equate finite height with direct sampling or zero returns with surface nodata. These counts do not certify landing safety or uncertainty magnitude.

The three lunar rasters have exactly equal CRS, affine transform and dimensions: 3200×3200 Float32; transform `[5,0,-9000,0,-5,1000]`; outer bounds `[-9000,-15000,7000,1000]` m; scale 1, offset 0; nodata NaN; GDAL nodata-derived masks. Band unit tags are absent. Metres for surf/total uncertainty and return counts for LDEC come from the cached official README, not an inferred TIFF unit tag. All four source polygons lie entirely inside all three raster extents.

Pixel centers are `x=-9000+5*(col+0.5)`, `y=1000-5*(row+0.5)`. Record 3's minimal bounding window is `[col=1259,row=1410,width=13,height=24]`; its bounds intersect center coordinates at the outermost edges. Native nodes remain 5 m apart; node extents use `(count-1)*spacing`, not pixel-edge spans.

ROI WKT and DEM WKT are **not** `pyproj.CRS.equals`, even ignoring axis order: unknown-datum/name metadata differ. Their numerical stereographic definitions coincide: sphere radius 1,737,400 m, south pole and standard parallel −90°, central meridian 0°, zero false easting/northing, metres. Inverse projection of every ROI vertex using its own WKT and the raster WKT produced identical longitude/latitude (maximum absolute difference 0°). Preserve both WKT records and the README realization; numerical projection agreement does not prove a datum realization by itself.

## Actual source-frame location

For **valid record 3**, a Shapely representative point is native `[-2686.25,-6110.0]` m. Projection inversion gives east-positive longitude **−156.26739892005892°**, planetocentric latitude **−89.77989162018713°**, explicitly in **MOON_ME_DE421 as assigned by the README**. The sphere makes geodetic and planetocentric latitude numerically equal. Forward roundtrip error is about 1.26e−8 m, a numerical consistency check rather than positional accuracy. This point is a diagnostic location; it is not a prepared camera, a height sample, a NASA-recommended landing point or an IAU_MOON coordinate. Record 3 vertex lon/lat bounds are `[-156.51588470949514,-89.78214141594515,-156.10533736426237,-89.7781570965494]` degrees.

## Frame and height decisions

The [official README](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README) explicitly supplies MOON_ME / DE421 and height units, but does not state a physical height zero. The [NASA manuscript record](https://ntrs.nasa.gov/citations/20205009660) documents the LOLA-derived models and interpolation uncertainty; its downloadable PDF timed out during this audit. The 1,737,400 m projection radius **alone cannot establish that surf equals radius minus 1,737,400 m**. The precise supplemental product height definition remains a gate for body-fixed XYZ and exact ENU conversion. Existing family-level PDS documentation is supporting context, not a substitute for this product's height label.

The [NAIF DE421 frame kernel](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf) identifies MOON_ME_DE421 as frame 31007 and distinguishes its realization from IAU_MOON (sections “Frames Specified”, “Comparison of DE-based and IAU/IAG report-based ME frames”, and “Using this Kernel”). Latitude convention does not select body orientation. A PROJ inverse is not a body-frame rotation. If literal IAU_MOON is required, define the epoch, verified orientation kernels and transformation before conversion; this audit downloaded no kernels and performed no such conversion.

**Proposed smallest strict contract patch, not applied:** version 1.1.0 adds `moon_me_de421_planetocentric` to coordinates.frame and the Moon/body conditional enum. Preserve the old enum's behavior and specify its exact meaning rather than redefining it. Mirror that additive realization in source-frame validation and consumers. Require source sidecars to retain both original WKT and exact DE421 realization. Keep existing exact local ENU semantics; implement source-height → body-fixed XYZ → local ENU only after the height definition is verified. An existing 1.0.0 consumer should reject 1.1.0 until updated. Merely changing the schema's top-level version or renaming coordinates does not implement this patch.

An earlier useful **diagnostic relief preview** could preserve the native stereographic grid, metre height differences and source-frame labels without knowing absolute height zero. It must use a separately explicit projected/display frame and disclose its unverified absolute vertical reference. It must not be published under the current exact ENU contract or presented as a resolved body-fixed ground asset. This is an alternative scope decision, not an audit result.

Independent review of current `terrain.py` found the half-pixel subtraction and raw-nodata-before-scale handling present. However, its horizontal coordinates are AEQD and its vertical coordinates are source heights minus their mean; export names them `local_enu_x_east_y_up_z_south`. That is a projected relief approximation, not exact Cartesian ENU. For Site04, projection inversion still preserves source orientation; it does not repair this frame/height mismatch. Extracting features is coupled to that routine, so it should not be invoked simply to obtain this first unscored view.

## Earth evidence and minimum next task

The actual USGS tile is 3612×3612 Float32, EPSG:4269/NAD83, degree spacing approximately 1/3600°, scale 1, offset 0, nodata −999999, nodata-derived mask; band-unit tags are absent. Its cached [official companion XML](https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1/TIFF/historical/n20w156/USGS_1_n20w156_20250611.xml) declares metres and NAVD88, while its abstract says vertical references outside CONUS vary. Treat this as a retained metadata declaration pending Hawaii lineage verification. No Earth pixels, AOI, terrain statistics or geographic transformation were audited here. NAD83 must not be relabelled WGS84; no lunar analog claim or rank is supported.

Choose valid source record 3 explicitly as project policy, retaining its exact source polygon and hashes. First adjudicate the versioned frame change and product height zero. Then prepare a view-only crop with traceable source interpolation/return count/uncertainty, correctly transformed nodes, finite offset storage, independent mask and supported camera/collision. Test source-center registration, orientation and gaps; inspect the real ground view. Leave all features and scores unavailable with reasons. A target view with no ranked analogs is scientifically useful; Earth may remain an unranked source entry while its separate AOI/datum work proceeds. Current `excluded` entries carry only IDs/reasons, so showing a full browsable unranked Earth location would need a separate explicit schema/UI decision.

Remaining gates: frame contract, supplemental height definition, exact ENU implementation, display versus analytical mask policy, real asset/camera/collision validation, Earth datum/AOI/common support, and independently fixed calibration before ranking. No source data shortage or GIS import block prevents the next native diagnostic step; no global PASS is implied.
