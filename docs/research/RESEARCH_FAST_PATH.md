# LOOP_0 research fast path

Reviewed 2026-11-14. Research recommendation: **LOLA Site04 (Shackleton rim) + SRTM Mauna Kea tile**. This is the quickest small, explicitly identified pair found in this pass; it is an engineering choice, not a demonstrated best terrestrial analog. No DEM payload was saved, no scientific value extracted and no score calculated. Catalog/README/CMR responses and HTTP HEAD metadata were inspected. No paid key is needed; an Earthdata account may be needed for the Earth download.

## Exact source products

| Product | Canonical URL | Verified evidence | Access state |
|---|---|---|---|
| LOLA Site04 elevation | https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif | Catalog link and HEAD: HTTP 200, `image/tiff`, `Content-Length: 40980806` bytes | Public URL; payload not downloaded |
| LOLA Site04 return count | https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_ldec.tif | Exact catalog link; HEAD 200, `image/tiff`, 40,980,740 bytes; count-map meaning in README | Payload not downloaded |
| LOLA Site04 elevation uncertainty | https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_toterr.tif | Exact catalog link; HEAD 200, `image/tiff`, 40,980,808 bytes; RMS-error meaning in README | Payload not downloaded |
| LOLA metadata | https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README | Fetched and read in memory | Not yet retained as a checksummed project source |
| SRTMGL1 V003, `N19W156.SRTMGL1.hgt` | https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/SRTMGL1.003/N19W156.SRTMGL1.hgt/N19W156.SRTMGL1.hgt.zip | CMR granule `G2821072105-LPCLOUD`, collection `C2763266360-LPCLOUD`; UMM archive size `10.5306 MB` | HEAD returned HTTP 303; protected download/authentication not completed |
| SRTM granule metadata | https://cmr.earthdata.nasa.gov/search/concepts/G2821072105-LPCLOUD.umm_json | Actual public CMR response inspected | No account needed for metadata |

The [LOLA catalog](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/) names Site04 as Shackleton rim. The product is a published, interpolated elevation surface, with separate return-count and uncertainty layers; do not represent every output pixel as a direct laser return. No copied count/uncertainty values are asserted here. The README mentions ROI shapefile archives but this pass did not verify an exact archive link; do not invent one.

The SRTM identifier and download URL were obtained using this exact [CMR query](https://cmr.earthdata.nasa.gov/search/granules.json?short_name=SRTMGL1&version=003&readable_granule_name=N19W156%2A&options%5Breadable_granule_name%5D%5Bpattern%5D=true&page_size=10). The reported size is catalog MB, not a verified exact byte count or SHA-256. Do not preserve temporary signed redirect URLs as source identifiers.

## Coordinates and reproducible ROI selection

LOLA README specifies south-polar stereographic X/Y in metres, **MOON_ME / DE421**, at 5 m/pixel; X/Y refer to pixel centers. Read the actual GeoTIFF CRS and bounds. The shared contract expects `moon_iau_planetocentric`, east-positive longitude in [-180,180]. Preserve the actual lunar frame in sidecars and document a valid transformation/interpretation before emitting contract coordinates. The registry does not establish a numerical center or vertical reference radius for this file.

The [SRTM guide](https://lpdaac.usgs.gov/documents/179/SRTM_User_Guide_V3.pdf) defines WGS84/EGM96 heights in metres, 3601 by 3601 samples for SRTMGL1, big-endian signed 16-bit HGT data, north-to-south rows, and overlapping boundary nodes. N19W156 identifies the southwest grid node at 19 N, 156 W. CMR's slightly expanded footprint must not replace the grid-node interpretation.

[USGS Mauna Kea](https://www.usgs.gov/volcanoes/mauna-kea) provides an approximate locator at 19.82 N, 155.47 W. It lies in the identified tile. The viewed page does not specify a coordinate datum or a research polygon; do not invent greater positional precision or call it an official analog-test polygon.

Proposed deterministic selection policy, to be recorded as a **project analysis choice**: select a supported lunar window from the Site04 raster; select an Earth window near the USGS locator using the SRTM grid, then derive its exact center and polygon from the raster geometry. Use the same physical support window and effective resolution on both bodies, fixed in a versioned profile. Check support, slope edges, voids and any interpolation. If the windows lack enough support, reject them. Publish the real derived AOI GeoJSON and provenance only after inspection; no hand-written example polygon belongs in the dataset. The search is currently one pair, not a global search or top-three validation.

## Download commands for Dev_A

Run from repository root. These commands are **proposed, not executed**. Their canonical URLs were verified above. They prepare source bytes only; execution must record retrieval timestamps and SHA-256 before a `Source` record is accepted. Keep credentials/cookies outside the repository.

```powershell
New-Item -ItemType Directory -Force -Path 'data-pipeline/cache/raw/fast-path' | Out-Null
curl.exe --fail --location --retry 2 --output 'data-pipeline/cache/raw/fast-path/LOLA_README.txt' 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README'
curl.exe --fail --location --retry 2 --output 'data-pipeline/cache/raw/fast-path/Site04_final_adj_5mpp_surf.tif' 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif'
curl.exe --fail --location --retry 2 --output 'data-pipeline/cache/raw/fast-path/Site04_final_adj_5mpp_ldec.tif' 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_ldec.tif'
curl.exe --fail --location --retry 2 --output 'data-pipeline/cache/raw/fast-path/Site04_final_adj_5mpp_toterr.tif' 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_toterr.tif'
curl.exe --fail --location --output 'data-pipeline/cache/raw/fast-path/N19W156.cmr.json' 'https://cmr.earthdata.nasa.gov/search/concepts/G2821072105-LPCLOUD.umm_json'
```

For SRTM, first configure your existing local Earthdata credential store and authorize the required download application using the [official LP DAAC curl guide](https://github.com/nasa/LPDAAC-Data-Resources/blob/main/guides/bulk_download_using_curl.md). Do not paste a password into a Hydrogen prompt or command history. The following adapts that documented method to PowerShell and assumes a valid external `.netrc` already exists:

```powershell
$earthdataNetrc = Join-Path $env:USERPROFILE '.netrc'
$earthdataCookies = Join-Path $env:USERPROFILE '.urs_cookies'
if (-not (Test-Path -LiteralPath $earthdataNetrc -PathType Leaf)) { throw 'Configure Earthdata authentication outside the repository first.' }
curl.exe --fail --location --retry 2 --netrc-file $earthdataNetrc --cookie $earthdataCookies --cookie-jar $earthdataCookies --output 'data-pipeline/cache/raw/fast-path/N19W156.SRTMGL1.hgt.zip' 'https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/SRTMGL1.003/N19W156.SRTMGL1.hgt/N19W156.SRTMGL1.hgt.zip'
```

Before extraction, check command exit codes, ZIP/TIFF magic, expected members, safe paths and actual byte counts; an HTTP success alone is not a validated scientific file. Never overwrite a verified source with a failed/partial download. A production fetcher should use temporary files and atomic promotion.

## Remaining blockers and parallel tasks

| Owner | Independent deliverable | Completion evidence |
|---|---|---|
| Researcher | Verify actual Site04 CRS, vertical reference and any published ROI archive; inspect SRTM source-number QA availability | Exact metadata citations and transform decision; unknowns remain explicit |
| Dev_A | Acquire both DEMs and supporting metadata, hash bytes, inspect masks, derive real equal-support AOIs and features | Schema-valid sources/assets, reproducible processing command and measured valid fractions |
| Requirements reviewer | Freeze a topography-only profile and independently justified calibration bounds | Versioned profile; no bounds fitted to this candidate pair |
| Security reviewer | Review downloader paths, archive extraction, auth separation and publication allowlist | No tokens/raw secrets in static output; verified assets only |
| Dev_B | Load prepared heightmap/mask and report unavailable score/splat gracefully | Actual ground view after assets arrive; no synthetic terrain fallback |

No score until calibration and comparability pass; no thermal score from POWER air temperature versus lunar surface temperature. POWER can later add contextual Earth climate. Diviner, mineralogy, splat reconstruction and top-three search are separate work. Missing splat stays null. One-pair success proves ingestion and viewing, not the full scientific ranking.

The verified Jezero alternative remains larger: [HiRISE directory](https://www.uahirise.org/PDS/DTM/ESP/ORB_045900_045999/ESP_045994_1985_ESP_046060_1985/) lists `DTEEC_045994_1985_046060_1985_U01.IMG` at 380,814,764 bytes. Use it when Mars-specific demonstration is required; this research does not claim it was downloaded.
