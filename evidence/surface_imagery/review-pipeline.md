# Independent imagery-pipeline review

Reviewed 2026-11-14 by the loader/terrain-analysis agent, who did not author `texture_surfaces.py`. Scope: source receipts, actual JP2/LBL payloads, published PNGs and provenance, native-grid/projected-image mapping, RGB preservation, and producer test source. This review used independent scalar mapping calculations and bounded source-pixel reads rather than rerunning the producer's complete comparison suite.

**Final result: no unresolved material findings.** Final manifest SHA-256: `d6b26ada6264b71abbb519fef48a6702144d787379bf98b1530325d0dac907d6`.

## Source mapping and appearance

- The six orbital layers use the same verified existing 4096-pixel globe JPEG derivatives. At seven independently selected native-grid positions per layer, analytic lunar stereographic or Mars equirectangular inversion followed by north-up equirectangular sampling reproduces the PNG RGB triplets exactly. Pixel rows follow image north-to-south order. These are coarse approximate mosaic drapes; the output does not add local photographic detail. Source provider polar fill and display processing remain disclosed, including monochrome lunar polar albedo.
- The three Mars local layers use complete published HiRISE ortho JP2 products and companion PDS labels. All source JP2 hashes match the retained complete payloads; independently hashing the contiguous retained source ranges reproduces each complete JP2 hash. Label payload hashes match the published provenance. Complete JP2/label identity is therefore correctly distinguished from range-only source DEM identities; no complete HiRISE DEM IMG checksum is newly claimed.
- Output PNGs are RGB8. Local JP2 samples are UInt8 with unit scale/zero offset, and preserve the native band order. Gale is published IRB enhanced false color, labeled accordingly. Jezero and Eberswalde repeat the published grayscale sample across R/G/B. No contrast stretch, new palette, height-dependent color, or new enhancement is applied. The loader integration test verifies every shipped PNG/provenance length/hash and PNG RGB8 dimensions.

## PDS projection interpretation

The PDS-authoritative mapping fix is justified by independently checkable source metadata, rather than fitted alignment:

- The source label declares spherical equirectangular projection, east longitude, its three equal radius axes, standard/true-scale latitude and central meridian, map scale and line/sample projection offsets. These produce the embedded raster affine exactly to the documented 1e-6 m threshold. The unchanged native DEM mapping sphere/projection agrees with that declared ortho coordinate system.
- Jezero's embedded GeoJP2 WKT places 15 degrees in latitude-of-origin with a zero standard parallel. The label instead declares a 15-degree true-scale parallel. Using the embedded interpretation would move the geographic coverage far from the independently published bounds. Using the PDS interpretation reproduces the corner bounds within approximately 0.00000649 degree.
- Eberswalde's embedded metadata additionally uses a 3,396,190 m radius, while its companion label and native DEM use 3,393,830 m. The producer correctly uses the label sphere and retains the embedded discrepancy in provenance. Independent scalar bounds checks give maximum discrepancies of approximately 0.00003076 degree for Eberswalde and 0.00001493 degree for Gale, each below the explicit three-source-pixel allowance. Geographic bounds are a coarse consistency check, not a subpixel registration-accuracy measurement.
- The DEM projected coordinates remain unchanged within 1e-6 m when checked against the same-product label CRS. The image affine retains the published origin; source pixel centers need not equal DEM pixel centers. Sampling uses the inverse affine at each DEM native sample; no manually chosen shift, tie-point fit, global datum conversion or guessed registration is applied.

## Findings resolved before final freeze

1. Initial provenance incorrectly described `1-v` although PNG row order and renderer were already positive-v. All nine final provenance records now state `((col+0.5)/width,(row+0.5)/height)`, `imageOrientation none`, and `texture flipY false`, matching the actual UV/render contract.
2. Independent scalar indexing exposed floating roundoff at exact nearest-neighbor ties: Gale and Eberswalde DEM samples can lie on source pixel edges. Algebraically equivalent formulas initially chose different adjacent, equally distant pixels. The final implementation explicitly snaps coordinates within 1e-7 source pixel of an integer before flooring, and documents that ties choose the larger row/column. Seven independent scalar RGB spot comparisons per local layer now match all final PNGs under that declared policy. This resolves a numerical sampling convention; it does not add a fitted geometric shift.

## Verification boundaries

The shipped manifest passes the independent schema and exact frozen catalog binding. The added consumer integration test reads current files from disk, validates the entire manifest through `validateSurfaceImageryCatalog`, and verifies every declared image/provenance payload hash and length plus RGB8 dimensions. It does not pin obsolete output hashes. Existing producer tests compare all pixels; this review separately checked 63 positions across nine layers and the complete source/hash/mapping chain described above. Native DEM catalog and terrain-analysis identities remain unchanged.

This is a source-pixel and geometry review, not independent photogrammetric calibration, accuracy certification, a publisher-signed authenticity check, or a claim of exact physical surface registration. Local orthos retain original source illumination and processing. No unacquired global ground coverage, natural-color claim for IRB, inferred geological measurement from RGB, or suitability conclusion is introduced.
