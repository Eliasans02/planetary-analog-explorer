# Published native DEM site expansion

The catalog adds four independently published source sites: Moon Connecting ridge (LOLA Site01), Moon Nobile rim 1 (LOLA Site06), Mars Gale crater (HiRISE ESP_023957_1755 / ESP_024023_1755), and Mars Eberswalde crater (HiRISE ESP_016065_1560 / ESP_016210_1560). Each displays a project-selected 129 × 129 native pixel-center crop at the raster center. These engineering crops are not published regions of interest or recommended destinations. The original Shackleton, Hawaii, and Jezero records and asset bytes are preserved.

## Primary source verification

- [NASA GSFC PGDA product 78](https://pgda.gsfc.nasa.gov/products/78) explicitly names Site01 Connecting ridge and Site06 Nobile rim 1, links their surface GeoTIFFs, and declares 5 m/pixel south polar stereographic metre grids in MOON_ME / DE421. Its [README](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README) describes interpolated surface heights in metres. Surface validity does not establish a direct LOLA return; return counts were not acquired for these crops and remain null. Lunar absolute vertical datum remains unverified.
- [HiRISE Gale product page](https://www.uahirise.org/dtm/dtm.php?ID=ESP_023957_1755) identifies DTEEC_023957_1755_024023_1755_U01, its stereo pair and approximately 1.01 m/pixel mapping scale. [HiRISE Eberswalde product page](https://www.uahirise.org/dtm/dtm.php?ID=ESP_016065_1560) identifies DTEEC_016065_1560_016210_1560_U01 and approximately 1 m/pixel scale. Native PDS labels, retained verbatim in provenance, are authoritative for exact grid scale, local-radius sphere, nodata/valid range and declared Mars 2000 equipotential vertical reference. NASA/JPL/University of Arizona attribution follows the [HiRISE usage policy](https://www.uahirise.org/media/usage.php).

The published HiRISE page center coordinates are rounded locators. Catalog coordinates instead come from inversion of each actual center pixel through its own native projection. Mars east longitude is normalized to [-180,180]; no reference-frame transformation is claimed. Moon coordinates retain MOON_ME_DE421; Mars coordinates retain MARS_HIRISE_PLANETOCENTRIC. Orbital pins are approximate locators.

## Acquisition and identity

Run from the project root using the project Python environment:

```powershell
previews/a04/.venv/Scripts/python.exe data-pipeline/expand_surface_sites.py --acquire
previews/a04/.venv/Scripts/python.exe data-pipeline/expand_surface_sites.py
previews/a04/.venv/Scripts/python.exe -m unittest discover -s data-pipeline/tests -p test_surface_expansion.py
```

The first command authorizes network acquisition. The default command is entirely offline and fails on missing or altered cache bytes. Each HTTP response must be 206 with exact inclusive Content-Range, correct total length and exact bounded payload. Complete lunar TIFFs are assembled from verified 4 MiB ranges; the source hash is the SHA-256 of that complete TIFF. Mars retrieval contains a bounded header and 129 full source rows. The Mars source hash identifies those exact retrieved rows, **not the complete IMG**; range offsets, source total size, URLs, timestamps, HTTP headers and individual hashes are retained. No complete HiRISE product checksum is claimed.

Cached original bytes remain in `data-pipeline/cache/raw/surface-expansion`. Public provenance contains the complete acquisition receipts. The offline runtime loads only the local height/mask/provenance files and does not need the cache or network. Published provenance paths to raw cache are identity references, not runtime download dependencies.

## Processing and verification

The exporter rejects unexpected sample formats, scaling, rotated grids, non-metre projected axes, wrong orientation, byte ordering or insufficient crop coverage. It retains finite valid source pixels, source nodata and PDS declared valid extrema. Valid heights subtract the valid crop minimum in float64, then cast to little-endian Float32. Invalid entries remain zero with mask zero. There is no resampling, smoothing, hole filling, generative terrain or inferred physical parameter. Native signed spacing, pixel-center origin and projection WKT remain in each record. Projected spacing is not exact ground distance and the relief display is not ENU.

Meaningful checks compare all 66,564 new output samples and all masks to verified cached source pixels, verify each source-derived coordinate and grid origin/spacing, reject malformed HTTP range identities, and preserve canonical hashes of all three original records and their three source records. Existing schema/semantic/hash checks validate all seven surfaces. `evidence/surface_expansion/assets_report.json` records each new surface's measured relief and source-pixel spot comparisons. Catalog replacement occurs atomically only after all four sites export and the entire catalog passes schema validation. Cached receipts keep repeat offline exports byte-for-byte deterministic, including provenance.

These products provide unranked native relief. They establish no analogue score, safe landing condition, temperature, illumination, uncertainty bound, habitat suitability, photogrammetric splat scene, or global first-person coverage.
