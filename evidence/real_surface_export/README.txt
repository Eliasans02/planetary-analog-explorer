Actual native DEM relief export

Reproduce offline from repository root:
previews/a04/.venv/Scripts/python.exe data-pipeline/export_surface_catalog.py
previews/a04/.venv/Scripts/python.exe -O data-pipeline/tests/test_surface_export.py

Public entry: web-client/public/data/surface_catalog.json
Assets: web-client/public/assets/surfaces/lola-site04-roi3/
        web-client/public/assets/surfaces/usgs-hawaii-summit/

Both crops preserve 129 by 129 native samples. Binary layout: little-endian
Float32 heights, UInt8 mask, native raster row order. Invalid values are zero;
valid values are source elevations minus each crop's minimum valid elevation.
native_origin is the center of sample [0,0]; native_spacing is signed per
column and row. Moon grid axes are native polar stereographic axes, not local
east/north. Earth metre spacing is an approximate display using native NAD83
ellipsoid geodesic one-pixel distances at crop center; degree sample centers
are retained without a datum transformation.

The lunar crop contains the published valid ROI record 3 (no polygon repair)
and 640m of native projected sample-center context. Its 126 ROI sample centers
are separate from 16641 crop samples. The ROI has 106 zero-return surface
samples. The crop has 1726 direct-return samples and 14915 zero-return surface
samples. These interpolation-filled surface samples remain valid and are
explicitly distinguished from laser observations in provenance.

Earth selection scans the complete source in native blocks and chooses its
highest finite GDAL-valid elevation, resolving ties by smallest row-major
index. There are 11785500 valid source tile samples. Chosen row 651, column
1920 has elevation 4204.6845703125m; NAD83 longitude -155.46819444474266,
latitude 19.82069444425608. This is project policy, not NASA recommendation.

validation.json / export-run.json record actual schema validation, asset
SHA256/byte/mask/semantic checks, and 12 independent direct single-pixel
source comparisons. focused-tests.txt records five passing tests under
python -O, including all 33282 source-to-output samples, preserved origins
and ROI vertices, raw-nodata-before-scale behavior, block-order-independent
maximum tie selection, archive path rejection and explicit source identity
error handling. Production checks use ValueError, not optimization-removable
assertions. JSON writes use a sibling temporary file followed by replacement.

Six public surface artifacts total 207506 bytes; catalog 12305 bytes.
All source receipts, raw SHA256 identities/paths, README and XML contents,
and companion receipts are retained in bounded public provenance JSON.
Absolute lunar height zero and Hawaii vertical datum applicability remain
unverified. This export claims relative projected relief only, with no ENU,
similarity scoring, calibration, suitability or landing recommendation.
