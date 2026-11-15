# Source-derived Moon and Mars assets

The orbital displays are historical mission imagery; local ground is actual raster relief. None of these exports computes geometry similarity, habitability, climate, radiation, landing safety, Gaussian splats or a validated body-fixed terrain mesh.

## Moon

Official discovery and technical documentation: https://svs.gsfc.nasa.gov/4720/ (NASA Scientific Visualization Studio / Ernie Wright; LRO LROC and LOLA teams). Exact source URLs are preserved in receipts.

The 2019 `lroc_color_poles_4k.tif` source is 4096 × 2048. The exporter makes 1024, 2048 and 4096 wide JPEG derivatives using Pillow LANCZOS, quality 92, RGB without chroma subsampling. The source already has exposure/white-balance adjustment, inpainted high-latitude gaps, and lower-resolution monochromatic LOLA albedo in the polar regions outside LROC's 70 N–70 S color coverage. NASA explicitly calls this an aesthetic visualization product. It is display-only and must not become calibrated feature evidence.

The separate `ldem_4.tif` is 1440 × 720 Float32 kilometers relative to a 1737.4 km sphere, per NASA's displacement documentation. Every source sample is multiplied by 1000 and exported little-endian Float32 meters without resampling. Its TIFF has no geotransform or CRS. The centered-zero simple cylindrical geographic interpretation follows NASA's map description, with north at the top, west at the left, edge bounds ±180 longitude and ±90 latitude. Derived sample centers are longitude −179.875 + 0.25 × column, latitude 89.875 − 0.25 × row. These are rendering conventions derived from documented bounds, not invented embedded georeference metadata. The orbital Moon terrain stays global and coarse.

Orientation is independently verified against the original official PDS [LDEM_4 label](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_4.lbl) and its 2,073,600-byte signed-integer IMG. The label explicitly declares pixel registration, 4 pixels/degree, north 90 to south −90, east longitude 0–360, and Mean Earth/Polar Axis of DE421. Multiplying every SVS Float32 kilometer sample by 2000 and rounding recovers all 1,036,800 original PDS integer samples after exactly a 720-column (180-degree) roll, with no row flip. Maximum conversion residual is 0.0018464 source DN (under 1 mm elevation). Both source receipts and original label text are retained in provenance; the TIFF itself is not misrepresented as georeferenced.

## Mars orbital imagery

Official product: https://www.mars.asu.edu/data/mdim_color/ ; download directory: https://www.mars.asu.edu/data/mdim_color/large/ . NASA Viking Orbiter color mosaic sharpened with MDIM 1.0, nominal 64 pixels/degree / 920 m/pixel, planetocentric simple cylindrical −180 E to +180 E, north 90 to south 90. Although the summary says "single file", the actual official downloadable collection is eight 5760-square PNG tiles. Provider HTML title bounds establish columns `225,315,045,135` (180–270 E, 270–360 E, 0–90 E, 90–180 E), and rows north then south. The raw HTML is cached with checksum.

Each original tile is downsampled to 1024 square with LANCZOS and assembled at its exact integer boundary into 4096 × 2048. The lower resolution derivatives come from that 4K image; no derivative is upsampled. Mosaic seams remain. No Mars global displacement is supplied. `source_sha256` for this collection identifies the exact compact ordered `source-image-manifest.json` bytes containing raw image names and individual SHA256 identities. It is explicitly a source collection identity, not a claim to a nonexistent single raw PNG checksum.

The ASU server truncated long full-image responses, so the fetcher retrieves exact 1 MiB HTTP206 chunks, checking Content-Range and byte lengths before concatenation; final receipts identify complete original PNG products. Cached sources are checked against receipt hashes before reuse.

## Mars native relief

Official product discovery: https://www.uahirise.org/dtm/dtm.php?ID=ESP_045994_1985 ; official use guide: https://www.uahirise.org/dtm/howto.php . Credit NASA/JPL-Caltech/UArizona. The linked DTM is `DTEEC_045994_1985_046060_1985_U01.IMG`, a 380,814,764-byte PDS3 product. A full download truncated, so the exporter uses exact, verified HTTP206 ranges from the official HiRISE PDS mirror. Full IMG identity is **not** claimed. Receipts retain the exact label range and 129 complete native raster rows, their source offsets, byte counts and hashes. The original attached label text is preserved publicly.

The attached label declares 6673 columns × 14266 rows, PC_REAL Float32, scale 1, offset 0, nodata `16#FF7FFFFB#`, and valid range −2679.20 to −2388.31 m. It explicitly states elevation in meters above the martian equipotential surface (Mars 2000 Datum), Smith et al. (2001). Equirectangular mapping uses planetocentric latitude, east longitude, center latitude 15 degrees, center longitude 77.44 degrees, and a local-radius sphere 3394839.8133163 m. Actual native MAP_SCALE is 1.0096633268711 m/pixel; the webpage's 1 m/pixel is nominal.

GDAL/rasterio interprets the original PDS label's georeference. The deterministic project crop is 129 × 129 native sample centers around floor(width/2), floor(height/2): full-image center row7133,column3336; crop row7069,column3272. Geographic center is derived through native projection inversion: 18.426855598372786 N, 77.44221401151552 E. All 16,641 samples in this window are valid, with minimum −2577.19970703125 m, maximum −2573.0234375 m, relief 4.17626953125 m. No resampling, smoothing or hole filling occurs. Invalid pixels are zero plus a separate zero validity mask. Valid heights subtract the exact crop minimum before Float32 encoding. Source label text, native WKT, signed sample spacing, sample-center origin, byte-range identities and exact source spot checks are public provenance.

The source-specific `MARS_HIRISE_PLANETOCENTRIC` frame deliberately does not assert a particular IAU Mars realization. Horizontal display remains native projected relief, not exact ENU. Source latitude/longitude from inverse projection does not create a transformation into another body frame. Stereo DTM pixels are not direct laser returns. The rectangle is a project context window, not a published ROI or landing recommendation.

## Reproduction and verification

Use `previews/a04/.venv/Scripts/python.exe data-pipeline/fetch_planet_assets.py`, then `previews/a04/.venv/Scripts/python.exe data-pipeline/export_mars_surface.py`. Pillow is included in pipeline dependencies. New raw files live only in `data-pipeline/cache/raw/planet-explorer`; older Moon/Earth raw sources and surface assets are not modified. Mars is appended to the v1.1 native surface catalog. Planet catalog is a separate v1.0 contract.

Run `previews/a04/.venv/Scripts/python.exe -m pytest data-pipeline/tests/test_planet_assets.py -q`. The focused checks validate schemas, every output hash and byte count, actual RGB dimensions, raw source image identities, exact global Moon kilometer-to-meter sample conversion and all native Mars valid source samples against exported buffers. Frontend verification separately bounds assets and validates loader contracts.
