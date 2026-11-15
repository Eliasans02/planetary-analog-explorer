# Independent bounded engineering review

Review date: 2026-11-14. This is a source review and limited offline check, not human acceptance, a browser interaction result, or a performance benchmark. Reviewer owns only this report. Source edits and browser automation were excluded; the full test suite was not repeated.

## Read scope

Read `docs/planet_explorer_contract.md`, shared planet types/schema, surface type/schema 1.1 compatibility, `PlanetViewport`, `PlanetExplorer`, `SurfaceViewport`, `planetGeometry`, `surfaceGeometry`, planet/surface data loading, and the planet acquisition pipeline.

## Corrected finding

The original global DEM nearest-neighbor formula treated a pixel-center raster as an endpoint grid. For the actual 1440 × 720 Moon DEM, mesh column 1 (longitude -178.59375°) selected source column `round((1/256)*1439)=6`, whereas the pixel-center nearest sample is `floor((1/256)*1440)=5`. Mesh row 1 (latitude 88.59375°) likewise selected 6 instead of 5. The duplicated ±180° vertex also selected two different source columns, opening the displaced seam. Longitude-dependent pole samples prevented duplicate pole vertices from sharing one radius. Root was notified and corrected these points; the final patch was independently inspected as described below.

## Static conclusions and limits

- Coordinate convention is internally consistent: east longitude maps toward negative Z, longitude zero maps to U=.5, north to V=1. `createImageBitmap(...imageOrientation:'flipY')` supplies the decode flip that `Texture.flipY=false` correctly leaves alone for ImageBitmap uploads. The sphere indices face outward. Actual source-landmark orientation still needs the root browser inspection.
- Prepared-site ray hits carry the exact named surface ID. Globe-only drag drops carry `surfaceId:null`; the UI reports unavailable local terrain and offers explicit named destinations. There is no proximity snap or invented global walking coverage in this code path. Marker positions are explicitly approximate locators.
- Split panels use different keyed planet records and independent controls. `GlobePanel` memoizes its surface array by immutable catalog IDs, preventing unrelated UI state changes from recreating the globe scene. Texture quality changes intentionally recreate a panel and therefore reset its camera; this is behavior to inspect, not a claim of retained camera state.
- Walking samples the same a-b-c / b-c-d triangles emitted by the terrain mesh. Swept segments are divided at grid edges and triangle diagonals; invalid triangle interiors and out-of-bounds positions stop movement. Movement direction is normalized, preventing diagonal speed inflation, and frame delta is capped at .05 seconds. Eye height and speed are labeled navigation settings.
- A minor generic entry-search limitation was identified: the original fallback inspected only `.25,.25` (the first triangle), missing a hypothetical mesh containing only valid second triangles. Root subsequently added `surfaceWalkEntry`, which tries the preferred location and then both `.25,.25` and `.75,.75` triangle interiors. The final helper, viewport integration, and regression case for a lone valid b-c-d triangle/no-floor case were independently inspected. This finding is closed; actual supplied-site entry still requires browser verification.
- The original implementation required successful pointer lock for WASD. Root subsequently observed an actual IAB `WrongDocumentError`, so the owner added focused-canvas WASD and drag-to-look fallback while retaining normal pointer lock. The final fallback inspection and browser outcome status are recorded below. Orbit mode remains available. Unmount removes pointer/input listeners and disposes controls, buffers, materials, light shadow resources, and renderer.
- Globe cleanup aborts fetches, cancels frames, disconnects resize observation, removes event listeners, closes ImageBitmap, and disposes textures/geometries/materials/renderer. A decode completed after abort is closed by `loadPlanetTexture`; an unmounted viewport also closes a returned bitmap before proceeding. No additional cancellation resource defect was found by inspection. Runtime GPU reclamation was not measured.
- Shared surface schema accepts existing 1.0.0 catalogs while rejecting Mars records under 1.0.0. Mars requires the new planetocentric frame in runtime validation.
- UI keeps relief meshes separate from Gaussian reconstruction and calibrated similarity scoring. No photogrammetric/Gaussian ground reconstruction is claimed.

## Offline source identity observations

Independent disk hashes of the completed lunar files matched their receipts: `lroc_color_poles_4k.tif` is 4096 × 2048 RGB, 13,095,388 bytes; `ldem_4.tif` is 1440 × 720 Float32, 4,153,352 bytes, all finite, range -8.878499984741211 to 10.504000663757324 in source units. These observations establish byte identity and structure, not independent radiometric or geodetic calibration.

The acquired HiRISE label identifies `DTEEC_045994_1985_046060_1985_U01`, source pair ESP_045994_1985 / ESP_046060_1985, 6673 samples × 14266 lines, 32-bit PC_REAL, metre elevations above Mars 2000 Datum, equirectangular/planetocentric/east-positive coordinates. The pipeline must retain these native conventions. Any partial-range acquisition hash must be labeled as the acquired byte-range or collection identity rather than the complete IMG product SHA256.

Mars tile downloads and global planet export were incomplete at this report's initial review. The final Mars local surface provenance was subsequently audited below. The completed global asset identity and layout audit is recorded below; actual source-landmark appearance remains for browser inspection.

## Final delta status

The final `globalDemSampleIndex` patch now uses the pixel-center formula, wraps longitude at the periodic seam, and chooses column zero at either geometric pole. This resolves the concrete original sampling/seam/pole findings. The new tests cover sample registration and duplicate vertex radius closure. The root reported its targeted planet geometry run as 5/5 passing; this reviewer inspected the patch/tests without duplicating that run.

The final Mars local provenance explicitly declares `complete_product:false`, exact inclusive ranges, matching complete-product byte totals and ETags, and that each SHA256 identifies only the acquired range. Independent disk hashes and lengths matched both range receipts: label bytes 0–26691 and native row bytes 188712440–192155707 of 380814764. The data range starts at `26692 + 7069*6673*4`, exactly the first retained source row after the one-record image header. The 129×129 crop uses columns 3272–3400. Independently reconstructing all 16,641 offsets from the acquired 129 complete native rows produced exact Float32 equality with the delivered height buffer. Height and mask catalog hashes also matched disk. The retained source heights span -2577.19970703125 to -2573.0234375 m; the catalog preserves the source-declared Mars 2000 Datum and native projection convention. No complete IMG checksum is implied.

No additional material defect was found within this bounded static/offline review. The minor generic entry-search finding above was corrected and closed after inspection. Actual globe/drop/pointer-lock behavior and final source-landmark inspection belong to the root's browser verification. No human PASS or performance claim is issued by this report.


## Final viewport follow-up

Independently read the root's subsequent initial-fit, helper-spacing, and `focusRequest` changes. The initial fit uses the narrower horizontal/vertical field of view and a margin around the globe/markers. CSS panel heights now own layout while the viewport's minimum height is zero; the source helper is lifted above the panel's footer label. These are inspected implementation choices, not visual acceptance results.

`focusRequest:{surfaceId,revision}` changes camera position toward the named approximate locator while preserving its distance; it does not call `onDrop`, select local terrain, synthesize a coordinate registration, or enter first person. The pending request is retained through asynchronous loading, applied after initial fit, and the callback is cleared at cleanup. Matching-body filtering limits a split-view locate request to its planet. No material concern was found in this delta by inspection.


## Final global assets and provenance audit (frozen)

The final catalog contains both planets, each with actual RGB JPEG assets at 1024×512, 2048×1024 and 4096×2048. Independently checked all six image dimensions/modes and the disk byte counts/SHA256 values for textures, public provenance, source manifests and Moon elevation. Independently checked the nine raw color-input identities against their receipts/manifests (one lunar TIFF plus eight Mars PNGs); all matched. Each Mars raw tile is 5760×5760. These are acquired-byte identity checks; no publisher checksum comparison is claimed.

Moon `source_sha256` identifies the raw 2019 color TIFF. Mars `source_sha256` equals the exact compact ordered eight-entry `source-image-manifest.json` hash, with raw tile names and hashes retained. The public provenance explicitly describes this collection identity. The cached ASU provider HTML independently confirms north/south rows and west-to-east column order 225,315,045,135: 180–270E, 270–360E, 0–90E, 90–180E. Its stated simple cylindrical -180E..180E, 90N..-90N, planetocentric layout agrees with the exporter. The exporter independently downsamples each native tile to a 1024-square block; lower derived resolutions are further downsampled. No Mars global displacement is asserted.

The final PNG validation adds chunk CRC verification and full decode before export. Acquisition limitations remain precise: existing raw `.range` chunks are reused by length without per-chunk hashes/receipts; the downloader verifies new Content-Range/length but does not bind all chunks through a common ETag/If-Range. Thus final PNG checks and locally computed SHA256 establish integrity and exact retained identities, not independent publisher checksum validation or a cryptographic guarantee of cross-request version consistency. The provider files are historical static products; no restart of acquisition was required for this bounded review. Final provenance explicitly states that no publisher-provided independent checksum was available.

Independently compared all 1,036,800 delivered lunar elevation values with the raw SVS Float32 TIFF times 1000: exact Float32 equality. Independently repeated the new PDS orientation proof: rounding SVS kilometres ×2000 exactly matches the original signed-integer `LDEM_4.IMG` after a 720-column roll, with no row flip. The retained original PDS label states 4 pixels/degree, pixel registration, east-positive 0..360 longitude and north-to-south bounds. This supports the displayed centered-zero orientation independently of the ungeoreferenced TIFF. The provenance honestly retains the TIFF's missing embedded CRS/geotransform and the source-derived convention.

Final bounded disposition: the material DEM registration/closure finding and minor walking-entry finding are corrected. No remaining material concern was identified in this source/offline scope. Report frozen after the final viewport and asset audit. Root owns actual browser interaction evidence, final build verification, and any subsequent changes. This report provides neither human acceptance nor a performance benchmark.


## IAB navigation fallback follow-up

Root reported a real browser failure: the IAB rejects pointer lock with `WrongDocumentError`, making the original locked-only WASD path unusable there. This supersedes any implication that static pointer-lock inspection alone proved successful movement.

Independently inspected the final `SurfaceViewport`, `walkInput` helpers/tests, and installed Three.js pointer-lock event ordering. The canvas request catches both synchronous errors and rejected promises, permanently enables the visible fallback for that scene after failure, and does not retry it on every click. Focused-canvas WASD is permitted without pointer lock; unlocked drag uses captured pointer coordinates to change yaw and clamp pitch. Key input and the animation loop require walking plus pointer lock or explicit terrain focus. Escape, blur, orbit, and unmount clear held keys, release drag capture and stop the walking frame loop; cleanup removes added canvas/document/window listeners. The existing exact triangle movement/collision path remains in use. No material source-level defect was found in this delta. The app owner was cleared to run final checks; the reviewer did not duplicate the full suite.

Root also enlarged prepared-site markers to radius .04 at orbital radius 1.05 after an actual missed small drag target. The ray handler still selects the exact named surface ID, and the UI still declares approximate locators; enlarged interaction geometry adds no global-to-local registration claim.

Actual post-patch IAB fallback movement/drag/Escape evidence remains pending root's browser result. No fallback usability success is claimed by this static review.


The late-grant delta was also inspected: both native request settlement and pointer-lock grant handling now release a grant when disposed, outside walking mode, or after terrain focus was cleared. This closes the reviewer's asynchronous Escape/blur concern: a pending request must not restart movement after the user released focus. Handled lock failures are suppressed whether promise rejection or the document error event arrives first. Actual browser evidence remains a separate root-owned check.


Root browser status before the final HUD build: actual Jezero entry and the visible fallback label were observed; unlocked drag visibly changed the camera, and Escape left `activeElement=BODY`, `pointerLockElement=null`. Root also observed an actual astronaut drag onto the enlarged Moon marker landing at the named Moon window, plus split/rotation/zoom/quality switching. These are root-reported CUA observations, not independent reviewer browser work. WASD movement remained visually ambiguous in the flat terrain, so this report does not yet claim observed translation.

The final source delta adds a native navigation HUD from `gridToSurface`, explicitly labeled X/Z with grid-centre origin. Entry initializes it and moving-key frames update it no more than every 200ms, skipping unchanged coordinates. Walk mode disables terrain shadow receiving to remove illustrative self-shadow artifacts; orbit restores it and source geometry/heights are unchanged. These choices and the final focus guards were independently inspected and cleared for the app owner's final build/checks. Final HUD-backed movement evidence remains pending root's CUA.


## Final root browser outcome and report freeze

Root's final CUA checked the exact production script `index-ZfJGDHkp.js`. In Jezero fallback mode, the navigation HUD changed from X 0.0 / Z 0.0 m to X 0.0 / Z -0.1 m after W input. Escape left `activeElement=BODY`; subsequent W input left that HUD position unchanged. This is positive evidence of bounded navigation translation and focus release for that observed interaction, not a movement-speed benchmark. Root previously observed visible drag-look camera rotation in `onDVDlPM9E`; the relevant input code was unchanged in the final build. The final ground view no longer displayed the observed shadow striping.

Root also reported preserved Moon/Earth Source Archive navigation, final split 4K maps rendered, and exact production-script DOM verification. No new console warnings/errors were observed in the final check; retained log entries were older pre-fix `CdIcAISp` pointer-lock failures at 10:51:50. These browser observations are attributed to root and were not independently repeated by this reviewer.

Report frozen after this final result. All reviewer findings described above are closed; remaining stated acquisition, frame, coverage and benchmark limitations are retained. This is engineering verification, with no human-acceptance or performance claim.
