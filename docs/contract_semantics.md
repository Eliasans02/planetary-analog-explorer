# Contract 1.0.0 — runtime invariants

JSON Schema governs structure, types, bounds and required missing-data reasons. It does not prove scientific validity. Python and the browser must also validate the relationships below. TypeScript interfaces are compile-time shapes only; JSON received at runtime requires validation.

- Unique source/profile/location IDs and complete referential integrity. Every non-null measurement, location geometry and derived asset has actual input provenance. A catalog reference is not a source observation.
- `analog.similarity_score` exists only for ranked Earth locations. Unrankable candidates appear in `excluded` with reasons; no numeric placeholder is emitted. Targets with invalid profiles have no ranked analogs. `analogs` is sorted by full-precision descending score then location ID, with consecutive ranks 1..N and N<=3.
- Every ranked row uses the same immutable scoring profile, quantities, units, effective resolution, physical support window, methods and temporal aggregation. All profile features are required. Profile bounds are versioned independent calibration, never refitted to current candidates. Check lower<upper, unique keys, finite inputs, bounds and source references. No silent clipping. Profile changes need a version change.
- `coverage` means valid active-profile weight / total active-profile weight. Ranked entries therefore have coverage 1. It is not full physical coverage of a Moon/Mars environment. Display active features out of the nine numerical features and the profile name. Geology is a separate categorical field, excluded from LOOP_0 arithmetic.
- `Feature.quantity` is a semantic identifier, including surface versus 2 m air temperature and albedo spectral/illumination definition. `method` records derivation and aggregation; period uses UTC timestamps, start<=end. Surface-temperature extrema from different coverage/aggregation are not automatically comparable. Missing is null with reason; zero remains a real value.
- Numeric features have canonical units in schema. `solar_irradiance_kwh_m2` is a legacy API field name for mean daily irradiation in kWh/m2/day, not instantaneous irradiance. Do not change its meaning silently.
- Mean slope<=max slope; min temperature<=max temperature where comparable. Finite values only. Coordinate source frame must be converted, not relabelled. Longitude is east-positive in [-180,180]. Heightmap origin uses the location body's coordinate frame. Planetary CRS parameters and input datum/labels remain in source sidecars.
- `aoi.local_path` is a same-origin `/assets/...` URL to the published real AOI GeoJSON. Its source records identify original geometry. GeoJSON lon/lat is interpreted in the explicit location body/frame; do not silently treat planetary geometry as WGS84. Validate rings, coordinate ranges, closure, antimeridian handling and membership offline. Raw source `local_path` is relative to repository root.
- Source sidecars preserve CRS/datum, vertical units, no-data value, product version, observation time, quality flags, original labels and transformation method. `Source.local_path` identifies actual cached raw bytes and must match its SHA256. Document companion labels and sidecars in the source manifest with their own checksums.
- Heightmaps are grid nodes in row-major order. x increases west→east, z increases north→south, y is up, all metres. `extent_m=[x_min,z_min,x_max,z_max]`, minima<maxima; spacing=(max-min)/(count-1). Height floats are offsets from `origin.elevation_m`; values are finite little-endian Float32. Mask is Uint8 (0 invalid,1 valid), exactly width*height bytes. Height buffer is exactly width*height*4 bytes. A zero at mask=0 is storage padding, not an observation. Do not interpolate or allow collision across invalid nodes.
- Camera position/lookAt are local metres with y relative to origin. Require near<far and nonzero viewing direction; validate initial position over valid supported terrain before ground entry. FOV and eye height are UI settings, not NASA observations.
- `Splat.world_from_asset` is a Three.js column-major 4x4 affine matrix into the heightmap frame. Validate finite, nonsingular transform; reject unsupported shear/reflection rather than silently misregistering it. Its translation is metres. Splats used for metric movement require metric scale and real registration. `inferred` geometry cannot provide scientific measurements; LOOP_0 ground navigation requires a sourced DEM and measured registration. A plain point-cloud PLY is not automatically a Gaussian PLY.
- Resolve local paths and reject escapes from the intended repository/public roots, including symlinks. Verify hashes, file sizes and file formats before publication and before expensive browser allocation. Asset budgets are engineering policy, never altered scientific heights.
- A neutral orbital sphere is a UI reference surface, not a DEM. A Pegman drop only selects an existing prepared AOI, with snapping visibly disclosed. An unsupported drop yields no measurement or score. Sun azimuth and horizon are N/A until their inputs and algorithm exist.

## Scoring definition

For common normalized vectors x,y in [0,1], positive weights w and W=sum(w):

`D=sqrt(sum(w*(x-y)^2)/W)`; `C=sum(w*x*y)/sqrt(sum(w*x*x)*sum(w*y*y))`.

Both zero norms give C=1; exactly one zero norm gives C=0. `score=100*(alpha*C+(1-alpha)*(1-D))`. This is a project-defined similarity index, not a NASA-approved habitability probability. Round only for display.

Per-feature percentage is `100*(1-abs(x-y))`; squared-distance contribution is `w*(x-y)^2/W`. Percentages are not additive contributions to the total score.

## State gate

LOOP_0 preparation does not complete either implementation module. Only explicit human `[PASS: Dev_A/...]` and `[PASS: Dev_B/...]` permit PHASE 5. Any FAIL/PERF_WARN pauses progression and produces a targeted hotfix prompt. Do not treat an empty dataset or skipped WebGL test as demo acceptance.
