# Local DEM readiness — 2026-11-14

Real lunar elevation rasters, their published ROI archive, and one public USGS Earth DEM are now cached. The next safe deliverable is a **native-frame Site04 ROI audit**, followed by a source-backed DEM ground asset after the coordinate-frame and vertical-reference decisions below. No scientific features, similarity scores, application manifests or ground assets were produced by this research task.

## Acquired evidence

Exact receipts are in [the earlier acquisition report](acquisition_status.json), [ROI receipt](LOCAL_DEM_ROI_ACQUISITION.json), [Earth receipt](LOCAL_DEM_EARTH_ACQUISITION.json) and [machine-readable header/geometry audit](LOCAL_DEM_READINESS.json). Hashes below are SHA-256 of actual cached bytes.

| Raw file under `data-pipeline/cache/raw/fast-path/` | Bytes | SHA-256 |
|---|---:|---|
| `Site04_final_adj_5mpp_surf.tif` | 40,980,806 | `38ff70dbdf2f066c2cfa94a646c3a59d653ce7f6b4528b15fc1b43ee397ce758` |
| `Site04_final_adj_5mpp_ldec.tif` | 40,980,740 | `fcc8c2219ae2368d5b2a1f6aec05fcf96cf725f3035ac8d80efc312a4ff29227` |
| `Site04_final_adj_5mpp_toterr.tif` | 40,980,808 | `416c4baa3b64def0182bb3379a1a9228482efd8ce32a39309ea8de5d0330fbe6` |
| `Site04_ROIs.tgz` | 1,712 | `8e8b788f9fdf6400f23fd36dad02138102bd1a905b4b71a5739a9a4fd8a0e07a` |
| `USGS_1_n20w156_20250611.tif` | 41,513,373 | `75b69b4df0ac16cc7e1cccaa30c59ecb3a6834944d62aba245b0a36aa8d3b270` |

The [official PGDA product page](https://pgda.gsfc.nasa.gov/products/78) links the Site04 files, including [the actual ROI archive](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_ROIs.tgz). The cached README identifies Site04 as Shackleton rim, the horizontal realization as MOON_ME / DE421, and TIFF X/Y/Z units as metres. Surface interpolation is part of the published product. Its `ldec` layer counts laser returns; `toterr` supplies RMS height uncertainty. Preserve these distinctions and cite the associated [Barker et al. paper](https://ntrs.nasa.gov/citations/20205009660).

## Lunar grid and actual source polygons

All three TIFF headers describe 3200 × 3200 Float32 samples on the same 5 m south-polar stereographic grid. GeoTIFF `PixelIsArea`, upper-left outer tiepoint `(-9000, 1000)` m and positive pixel scales `(5, 5)` m give the following **derived grid geometry**, not a new geographic ROI:

- Outer bounds `[xmin,ymin,xmax,ymax] = [-9000,-15000,7000,1000]` m.
- Pixel-center bounds `[-8997.5,-14997.5,6997.5,997.5]` m.
- Sample center: `x = -9000 + (column + 0.5) * 5`; `y = 1000 - (row + 0.5) * 5`.
- Projection sphere axes are both 1,737,400 m; pole latitude is -90°, central meridian 0°. The embedded datum name is unspecified. These projection parameters alone do not establish the physical vertical reference.
- Header nodata is textual `nan`. It must become a finite output buffer plus a separate validity mask, never JSON NaN.

The archive contains four ordinary files (`.shp`, `.shx`, `.dbf`, `.prj`) and **one symbolic link**: `Site04_ROIs.gmt` points to the absent `Site04_final_adj_5mpp_01_regionProps_avgillGT070.gmt`. Nothing was extracted to the filesystem; only the four allowlisted ordinary files were read in memory. Do not resolve or publish the link.

The shapefile has four single-part Polygon records. Their coordinates are real source geometry in the same stereographic metre grid; all rings were observed closed and all coordinates finite. Self-intersection and complete GIS validity checks remain pending.

| Source record | Native bounding box `[xmin,ymin,xmax,ymax]`, m | Points including closure |
|---:|---|---:|
| 1 | `[-2842.5,-6802.5,-2782.5,-6522.5]` | 121 |
| 2 | `[-2792.5,-6432.5,-2712.5,-6262.5]` | 87 |
| 3 | `[-2702.5,-6167.5,-2642.5,-6052.5]` | 59 |
| 4 | `[-2687.5,-6027.5,-2627.5,-5902.5]` | 58 |

The `.prj` declares a sphere and South Pole stereographic projection but no named datum. README evidence supplies MOON_ME / DE421; retain both records. DBF fields `X` and `Y` are source attributes with unverified semantic meaning. They are not automatically centroids, approved landing coordinates or camera origins. Choosing source record 1 for the first demo is a project selection policy, not a NASA recommendation.

## Frame adjudication is a publication gate

The frozen contract's `moon_iau_planetocentric` label does not specify whether it means a latitude/longitude convention or the literal SPICE `IAU_MOON` orientation. Planetocentric latitude does not resolve that distinction. NAIF defines [MOON_ME_DE421 and its aliases](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf); its [coordinate-system guidance](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/MATLAB/req/dsk.html) distinguishes MOON_ME and IAU_MOON realizations. Therefore the present evidence does **not** authorize relabelling the source.

Request an explicit architecture decision before publication. The clearest future contract is a versioned explicit `moon_me_de421_planetocentric` realization. An alternative requires a documented contract interpretation that the existing label denotes a convention while mandatory source metadata records the realization. If the intended frame really is SPICE IAU_MOON, a reviewed transformation needs an explicit epoch and appropriate verified kernels; changing a CRS string or using a map projection alone is insufficient. No shared file was changed here.

Also establish the exact Site04 surface-height reference from its product documentation before interpreting the TIFF values as radii or constructing body-fixed Cartesian coordinates. The [LOLA RDR/GDR specification](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/document/rdrsis.htm) is supporting family documentation; it must not silently replace missing labels for this supplemental product.

Once resolved, transform source samples through the approved body frame into the chosen local ENU frame and resample with documented mask semantics. Polar-stereographic X/Y are not local east/north across this ROI; subtracting an origin and negating Y does not establish `local_enu_x_east_y_up_z_south`. Contract node extents span `(count - 1)` intervals. Do not reuse the 16,000 m pixel-edge span as the 3,200-node span.

For quality, distinguish finite published interpolated surface from directly sampled laser coverage. A zero `ldec` count does not automatically make the published interpolated `surf` value nodata. Conversely, a finite surface sample does not prove a direct observation. Keep model-validity, return-count coverage and uncertainty separately traceable; approve the scientific mask policy before measuring features. No further hole filling is authorized.

## Earth fallback with actual payload

The [official TNM product query](https://tnmaccess.nationalmap.gov/api/v1/products?datasets=National+Elevation+Dataset+%28NED%29+1+arc-second&q=n20w156&max=5&outputFormat=JSON) returned source ID `684a3701d4be026f96d9de35`, title `USGS 1 Arc Second n20w156 20250611`, and the exact [public USGS TIFF](https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1/TIFF/historical/n20w156/USGS_1_n20w156_20250611.tif). The bounded download matched its declared 41,513,373 bytes and was independently rehashed. It used normal TLS, no account and no protected SRTM endpoint. This is explicitly a **USGS 3DEP fallback**, not a NASA SRTM granule or a demonstrated lunar analog.

The actual header is 3612 × 3612 Float32, LZW-compressed, PixelIsArea, NAD83 / EPSG:4269. Pixel size is `0.000277777777786999` degrees; outer upper-left is `(-156.0016666669826, 20.00166666648431)`; nodata is `-999999`. This is not the SRTM 3601-node HGT layout. Derive local metric spacing at the selected AOI rather than assuming constant 30 m pixels. NAD83 cannot simply be renamed `earth_wgs84`.

The exact [companion XML](https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1/TIFF/historical/n20w156/USGS_1_n20w156_20250611.xml) was discovered through the public USGS bucket listing and saved as [local evidence](local_dem_evidence/USGS_1_n20w156_20250611.xml). It declares metres and NAVD88. This is a **metadata declaration**, not an independently validated vertical transformation. USGS's [seamless DEM specification](https://pubs.usgs.gov/tm/11b9/tm11B9.pdf) explains that vertical references outside CONUS can vary. Verify this tile's lineage/datum before any ellipsoidal-height conversion; do not substitute a guessed Hawaiian datum. The ScienceBase JSON endpoint returned HTTP 403 and remains unavailable; the public companion file is a separate official route, not an authentication bypass.

USGS [3DEP products](https://www.usgs.gov/3d-elevation-program/) are publicly available; retain product provenance and describe modifications without implying endorsement. The Earth tile covers a potential Hawaii search domain, but no Earth comparison AOI has been selected, no common-support features calculated and no ranking justified. SRTM remains preferred but its protected science payload is still absent.

REMA remains a metadata-only contingency: [PGC's actual `18_35_32m_v2.0` item](https://stac.pgc.umn.edu/api/v1/collections/rema-mosaics-v2.0-32m/items/18_35_32m_v2.0) and the [open-data license listing](https://registry.opendata.aws/pgc-rema/) establish an available Antarctic product and CC-BY-4.0 attribution requirement. No REMA or ArcticDEM payload was downloaded. Their vertical reference and analysis support would need a separate audit.

## Next atomic task for Dev_A: `A05_SITE04_NATIVE_ROI_AUDIT`

1. Consume the five lunar files and exact hashes above plus the existing README receipt. Work only in an explicitly staged audit directory; preserve cached bytes and shared contracts.
2. Read only the four ordinary allowlisted shapefile members in memory. Reject traversal, duplicate components, oversized members and link extraction. Confirm CRS parameters, finite/closed/simple geometry, record count and overlap with all three registered rasters.
3. Select published record 1 explicitly as project policy. Derive a bounded native-grid crop and polygon inclusion from its vertices and actual pixel centers. Record the boundary-inclusion rule and any context padding; context padding is a display choice, not an enlargement of the scientific ROI.
4. Emit an audit sidecar with source hashes, source record number, transform/pixel registration, crop bounds, nodata interpretation, return-count and uncertainty availability. Native-frame crop diagnostics may proceed; no application coordinates, camera, heightmap publication or features until the frame and vertical-reference gates are resolved.
5. After the architecture decision, implement the approved source-to-local-ENU route as its own reviewable task. Export finite Float32 offsets plus Uint8 mask, register provenance and confirm buffer size, node spacing, orientation, real supported camera location and gap-safe collision. Keep absent splats absent.
6. Only then select a documented Earth AOI, resolve its datum transformation, align the two analysis scales and introduce an independently fixed calibration profile. This research does not establish a similarity score.

Acceptance evidence must include half-pixel registration checks against source coordinates, hash identity, rejection of the archived symlink, source-to-local transform checks, nodata separation and a real ground-view inspection. Mathematical fixtures belong only in tests. Any useful figure or UI must label source interpolation and missing evidence honestly.

## Verification performed and remaining limits

The local audit rehashed the four TIFFs and ROI archive, inspected TIFF directory tags with Pillow, parsed the four shapefile components without disk extraction, and read the companion XML with the standard library. It did not calculate raster statistics or scientific features. Full rasterio/shapely validation could not run: the independent A04 checker reported native DLL loading blocked by Windows Application Control. That policy was not altered or bypassed; use an approved geospatial environment for the remaining checks.

Earlier registry/constraints prose saying that nothing has been downloaded describes its initial snapshot. These acquisition receipts are the later evidence; catalog membership, usable raw data, valid scientific features and an accepted application dataset remain different states. No global PASS or Phase 5 is implied.
