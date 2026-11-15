# Mars display review — 2026-11-14

## Finding

The maroon local ground color is already present in the selected published ASU Viking mosaic. It is not evidence of a newly invented app palette. The selected global product is unsuitable for showing metre-scale local terrain detail, and its strongly saturated historical display processing is a poor fit for the requested NASA-style beige/brown appearance.

Inspected `data-pipeline/fetch_planet_assets.py`, `texture_surfaces.py`, `web-client/public/data/planet_catalog.json`, `surface_imagery.json`, raw source PNGs, exported Mars JPEG, and native drape PNGs. No public assets/catalogs or renderer changed in this audit.

## Local evidence

- ASU source: [Viking Merged Color Mosaic](https://www.mars.asu.edu/data/mdim_color/). Publisher states 64 pixels/degree, 920 m/pixel, planetocentric simple cylindrical, -180 to +180 east, north +90 to south -90, 23040×11520, Viking color sharpened with MDIM 1.0.
- Raw `mars45n045.png` and `mars45n225.png` decode as RGB, 5760×5760, with no Pillow-reported ICC/gamma metadata. A raw Jezero-neighborhood sample, tile `mars45n045.png`, row 4580/column 4956, is RGB (45,6,33). Visually inspected crop: `evidence/planet_assets/raw-jezero-review.png`. This is genuinely a source display pixel, not calibrated natural-color ground truth.
- Export stitches tile columns 225,315,045,135, rows north/south, matching the provider's -180..180 ordering. It converts to RGB, downsamples with LANCZOS, saves JPEG quality 92; no source hue, saturation, gamma, or elevation tint is applied. North polar cap and recognizable geographic features are correctly oriented in the inspected export. No evidence found of channel swap, color-profile loss, or gross longitude/latitude inversion explaining the maroon hue. This audit does not independently certify geodetic registration.
- `texture_surfaces.py` samples the largest exported texture (4096×2048) by native-DEM inverse projection, then copies nearest RGB values. Its five provenance samples match the PNG colors. Every pixel in each current Mars `orbital-color/color.png` is identical: Jezero (58,11,27), Gale (91,29,40), Eberswalde (58,10,26). Thus increasing that PNG's output dimensions cannot add information.
- The exported 4K global map represents roughly 5.2 km per equatorial texel (coarser than the original 920 m product), whereas these native HiRISE crops span roughly a hundred metres. Uniform image drapes are the expected sampling result. They obscure neither a missing local photograph nor recoverable fine texture: the global product simply contains none at this scale. Relief readability then depends on mesh normals and illumination.

## Verified alternate published display asset

[NASA Mars Image Texture](https://science.nasa.gov/3d-resources/mars/) explicitly supplies an image texture for 3D models, describes Viking images processed at USGS from the JPL/Caltech planetary-map database, and credits NASA/Jet Propulsion Laboratory & Caltech. Both linked files were acquired and decoded for review:

| Asset | Native dimensions | Bytes / SHA256 |
| --- | --- | --- |
| [Mars.jpg](https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/mars/Mars.jpg) | 1440×720 RGB | SHA256 `12ec6bf02ebd42a246edc778cb2ce8c595b4d9f0892badf0bfff8abb2303c780` |
| [Mars.tif](https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/mars/Mars.tif) | 1440×720 RGB | 3,137,136 bytes; SHA256 `fb094158273b465ba4c017be9d13e266a86921f3aa7ac0eb99d6943e0f3e5f47` |

Review files are under `evidence/planet_assets/nasa-mars-texture-review*`. Visual inspection shows beige/ochre terrain and gray dark regions, much closer to the requested appearance. Geographic feature ordering matches the current global image visually. The NASA page does **not** document a CRS, radiometric calibration, exact color transform, or certify natural/true color. Treat it as NASA's published **visualization texture**, not a newly scientifically calibrated map. The TIFF has no ICC profile. Prefer the TIFF if adopting this asset; document its inferred display orientation, native resolution, complete download/hash receipt, and limitations. Never upscale it and claim 2K/4K source detail.

## Scientific and alternate-source context

The original authors' [Global Color Views of Mars abstract](https://ntrs.nasa.gov/api/citations/19940028684/downloads/19940028684.pdf) describes cosmetic red/violet mosaics merged with MDIM and a synthetic green channel derived by averaging; [NASA's accompanying public page](https://science.nasa.gov/resource/global-color-views-of-mars/) describes the two-filter origins and approximately 1 km color coverage. Therefore 'NASA Viking color' is not by itself a claim of calibrated human-eye appearance. These sources establish the historical family, not an exact recipe for the particular ASU PNG download.

[USGS Mars Viking Colorized Global Mosaic 232m](https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m) is a candidate for newer geometric control and higher detail, but its page returned HTTP 403 to this audit. Do not substitute an unverified URL or describe it as true color. ASU's [data index](https://www.mars.asu.edu/data/) also offers monochrome MOC visible imagery and MOLA shaded relief; neither is a natural-color substitute. Thermal-IR imagery and elevation palettes must remain separately labeled scientific layers.

The prominent [2023 ESA global Mars color view](https://www.esa.int/media/global-mars-in-colour) is explicitly enhanced and individually channel-stretched; ESA says it does not show the beige/brown appearance from orbit. It is a poor choice for a request for natural appearance. The cited NASA Eyes application is a visual reference; its application page supplies no readable source/texture metadata here. This audit cannot claim that either candidate is the exact Eyes asset.

## Recommended feasible implementation

1. Use the existing matched published HiRISE local ortho as the local-terrain default, retaining accurate labels: grayscale RED for monochrome, enhanced IRB for false color. Keep global colors as an explicitly coarse optional context layer. Do not use a flat global texel as the main surface-detail layer.
2. If the global globe needs a quieter NASA-published appearance now, adopt the verified NASA TIFF as a separately documented display texture, retaining ASU as a historical optional source if the app supports alternatives. No app-authored recoloring is necessary. Native 1440×720 resolution is a visible tradeoff and should be disclosed.
3. Keep relief readable with directional lighting and correct normals; retain neutral relief mode. Do not modify scientific texture pixels to fake shadows, color, or height. A newly selected global source still cannot resolve local metre-scale structure.
4. Update pipeline receipts/provenance/schema references and regenerate local display drapes only after coordinating the source decision. Verify representative raw→export pixels, orientation landmarks, source native dimensions, source credit, checksums, and offline loading. No independent geodetic/photometric accuracy claim should be added.


## Authorized implementation and verification

Following review, the published NASA JPEG became the default global Mars display source. `Native` is the exact original 1440x720 JPEG, copied byte-for-byte; `1K` is a LANCZOS downsample. No 2K/4K Mars enlargement remains in the current public asset directory or catalog. Historical ASU raw data and receipts remain cached. The review TIFF is not the runtime source.

Empirical display registration was verified against the independently documented ASU tile geography: assemble its 225,315,045,135 north/south tiles at 1440x720, compare grayscale minus Gaussian blur (radius 3), and exclude 60 polar rows at each edge. Zero-shift correlation exceeds 0.97; horizontal shifts from -5 to +5 pixels have their unique maximum at 0; vertical/horizontal reversal and 180-degree longitude rotation produce correlations near 0. This verifies corresponding geographic image layout, without claiming a certified datum transformation. The producer repeats this registration gate before exporting, and provenance stores exact scores.

All Mars coarse local image drapes were regenerated from this source. Native DEM catalog and all matched local HiRISE ortho files were byte-checked unchanged. Eight focused Python source-integrity/imagery tests passed. Old public Mars assets/catalogs recovered from the pre-existing dist tree are retained under `evidence/display_relief/before`; its RECOVERY.txt records the snapshot limitation.
