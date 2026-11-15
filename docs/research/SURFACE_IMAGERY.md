# Source imagery on native terrain

Six prepared Moon/Mars surfaces have source mosaic colors from their orbital globes. Three Mars sites also provide their published local HiRISE orthoimage, now selected by default when available. These are actual image pixels draped over the existing DEM; height never selects a palette or invents a color in image modes. The DEM catalog and terrain analysis are unchanged. Earth currently has no imagery layer. Neutral visualization lighting now reveals DEM relief; Original image disables this added lighting.

## Available layers

| Surface | Available orbital colors | Local image (preferred when available) |
| --- | --- | --- |
| Shackleton rim, Connecting ridge, Nobile rim 1 | Existing NASA SVS lunar display mosaic | Unavailable |
| Jezero crater | NASA published Mars model texture | Published HiRISE RED grayscale |
| Gale crater | NASA published Mars model texture | Published HiRISE enhanced IRB false color |
| Eberswalde crater | NASA published Mars model texture | Published HiRISE RED grayscale |

Orbital pixels come directly from the highest available verified globe image, using the corresponding native DEM longitude/latitude: 4096 pixels wide for the Moon and the native 1440-pixel NASA Mars texture. The global maps are coarse: a tiny 129 m Mars window can lie inside one displayed source pixel. A 129 × 129 output PNG does not add detail. There is no artificial noise or generative enhancement.

The [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) identifies its map as an aesthetic visualization, with adjusted exposure/white balance, high-latitude inpainting and polar replacement by monochrome LOLA albedo. All three prepared lunar windows are in that polar replacement region. Those colors are explicitly a coarse published display treatment, **not local color photographs**. The SVS map's display realization and MOON_ME_DE421 DEMs have not been independently registered. Native projection inversion followed by sampling the same longitude/latitude is an approximate display drape, not a reference-frame transformation.

Mars now uses the [NASA Mars image texture](https://science.nasa.gov/3d-resources/mars/), published for planetary models and credited to Viking, USGS and JPL/Caltech. Its original JPEG is retained byte-for-byte at Native 1440 × 720; a 1K downsample is also offered. The previous [Viking/MDIM mosaic from ASU](https://www.mars.asu.edu/data/mdim_color/) had strongly saturated purple/maroon regional pixels. The new source uses the NASA-published colors without application recoloring, but NASA does not certify it as natural RGB. See `MARS_DISPLAY_REVIEW.md` for the source comparison and empirical global registration check. Neither global drape is calibrated photometry or a scientific registration measurement.

## Local HiRISE products

The official DTM pages link the matching orthoimages:

- [Jezero DTM and orthoimages](https://www.uahirise.org/dtm/dtm.php?ID=ESP_045994_1985): `ESP_045994_1985_RED_C_01_ORTHO.JP2`, 34,413,875 bytes, 6673 × 14266, one published 8-bit RED band. Gray values repeat across RGB channels without invented color.
- [Gale DTM and orthoimages](https://www.uahirise.org/dtm/dtm.php?ID=ESP_023957_1755): `ESP_023957_1755_IRB_C_01_ORTHO.JP2`, 14,818,660 bytes, 3407 × 16591, three published 8-bit display bands. [The observation page](https://www.uahirise.org/ESP_023957_1755) defines IRB as infrared-red-blue. The companion label specifies near-infrared / red / blue-green filters. This is enhanced false color, not a human-eye natural-color claim.
- [Eberswalde DTM and orthoimages](https://www.uahirise.org/dtm/dtm.php?ID=ESP_016065_1560): `ESP_016065_1560_RED_C_01_ORTHO.JP2`, 47,929,159 bytes, one published 8-bit RED band. Gray values remain grayscale.

Original illumination, shadows and display processing remain in the source pixels. No new histogram stretch, color conversion to estimated radiance, whitening, contrast enhancement, or elevation tint is applied to the image assets. The PDS labels describe a DN-to-I/F scale/offset; these assets preserve published DN image pixels and do not claim calibrated I/F values. Credit NASA/JPL-Caltech/UArizona under the [HiRISE public-domain usage policy](https://www.uahirise.org/media/usage.php).

The default Relief light mode adds neutral Lambert illumination from the actual DEM normals to improve shape readability. Its adjustable direction is in the local display grid, not a Sun ephemeris, compass bearing, or visibility analysis. Lighting changes displayed brightness, not stored image pixels or terrain analysis. Baked source illumination remains, so this is illustrative relighting rather than photometrically correct reconstruction. Original image uses an unlit material to inspect the supplied colors without added illumination. Materials, lights and textures change in place without moving the camera or replacing the DEM.

## Georeferencing checks

[HiRISE's usage documentation](https://www.uahirise.org/dtm/howto.php) cautions that mapping keywords have been interpreted differently by software versions. This matters here: the Jezero embedded GeoJP2 WKT assigns the true-scale latitude to `latitude_of_origin`, and Eberswalde's embedded WKT uses a different radius from its authoritative PDS label. Blindly transforming through that embedded WKT would misplace the images.

The exporter acquires and hashes each complete companion PDS `.LBL`. For these published equirectangular products, it constructs the declared local-radius sphere with `lat_ts=CENTER_LATITUDE`, `lat_0=0`, and `lon_0=CENTER_LONGITUDE`. It independently verifies:

1. Label dimensions and bands equal the decoded image.
2. Label `MAP_SCALE` and line/sample projection offsets derive the embedded affine exactly: upper-left X = `-(SAMPLE_PROJECTION_OFFSET-1)*MAP_SCALE`; upper-left Y = `(LINE_PROJECTION_OFFSET-1)*MAP_SCALE`; column spacing positive and row spacing negative.
3. The interpreted full-image projected corners agree with the label's published geographic bounds within three source pixels, allowing source edge conventions.
4. The declared ortho sphere matches the native DEM sphere. Transforming the native DEM crop through the PDS-declared ortho CRS changes its X/Y by at most 1e-6 m; incompatible same-product mapping fails.
5. Every sampled image position is inside coverage and outside source masks / PDS `CORE_NULL` pixels.

Both the embedded WKT and authoritative sampling WKT remain in provenance, alongside derived affine and geographic-bound verification. `projected_ortho` means mapping through these verified published product coordinates. It does not assert independent tie-point registration or an uncertainty bound.

Each output image pixel `[row,col]` samples the corresponding DEM native pixel-center X/Y. Source nearest-neighbor sampling preserves a published source pixel rather than mixing or inventing colors. When a DEM center is exactly equidistant between ortho pixels, floating-point values within 1e-7 source pixel of an integer edge snap to that integer; the tie chooses the larger row/column. This resolves numerical edge ambiguity, not spatial alignment.

The rendering convention is `imageOrientation: none`, texture `flipY: false`, and UV `((col+0.5)/width,(row+0.5)/height)`. The 129 × 129 RGB8 PNG row zero matches DEM row zero. Vertex positions and native height masks remain unchanged.

## Reproduction and evidence

```powershell
previews/a04/.venv/Scripts/python.exe data-pipeline/texture_surfaces.py --acquire
previews/a04/.venv/Scripts/python.exe data-pipeline/texture_surfaces.py
previews/a04/.venv/Scripts/python.exe -m unittest discover -s data-pipeline/tests -p test_surface_imagery.py
```

The default export is offline. Acquisition accepts only exact bounded HTTP ranges with correct status, byte count, Content-Range and total source size. Complete JP2s are assembled from verified 1 MiB ranges and receive complete-product SHA-256 identities. Companion labels receive complete-file hashes. Cached inputs are identity checked before reuse. Public provenance preserves retrieval URLs, source identities, range receipts, source metadata, sampling choices and source-pixel spot comparisons.

The separate `/data/surface_imagery.json` manifest binds every record to the exact frozen catalog SHA-256, height/mask hashes, grid dimensions, native origin, native spacing and WKT. It describes six records and nine layers. The focused tests compare every output RGB value with its actual verified globe image or local JP2 source; test seam/pole orientation; check RGB8 PNG format and metadata/UV consistency; and reject wrong PDS projection/affine interpretations. `evidence/surface_imagery/verification.json` records final checks and identities. The runtime uses only small local image/provenance assets and requires no JP2 download.
