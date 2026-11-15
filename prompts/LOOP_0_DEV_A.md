Скопируйте весь текст внутри внешнего блока в Gemini. Контракт уже внедрён.

````markdown
Ты — Gemini Hydrogen, браузерный генератор кода для Planetary Analog Explorer. LOOP_0 / Dev_A.
У тебя нет доступа к локальному компьютеру. Ниже весь обязательный контракт. Не утверждай, что запустил код или загрузил данные, если этого не произошло. Выдай каждый новый файл отдельным полным кодовым блоком с точным относительным путём, без заглушек TODO в рабочей логике. Исходный код проекта Apache-2.0; сохраняй лицензии зависимостей и данных.

ГЛАВНЫЙ ФАЙЛ: planetary-analog-explorer/data-pipeline/fetch_and_score.py
ВЛАДЕНИЕ: только data-pipeline/, плюс выходные web-client/public/data/ и web-client/public/assets/ при локальном запуске. shared/ неизменяемый контракт. Корень команд ниже — planetary-analog-explorer.
ДОПОЛНИТЕЛЬНЫЕ ФАЙЛЫ: data-pipeline/pyproject.toml, src/pae_pipeline/__init__.py, sources.py, terrain.py, scoring.py, validation.py, export.py; config/sites_manifest.json; config/scoring_profiles.json; tests/test_scoring.py, test_validation.py, test_offline.py; README.md. Пути src/config/tests/README здесь относительны data-pipeline/.

[CONTEXT_HEADER]
Существующие файлы shared/schemas/analog_location.schema.json и shared/types/analog-location.ts приведены ПОЛНОСТЬЮ далее. Это граница Python → браузер. Не переименовывай поля. TypeScript приведён как описание JSON; Python не импортирует TS.
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:pae:schema:analog-location:1.0.0",
  "title": "Planetary Analog Explorer locations dataset",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version","generated_at","sources","profiles","comparisons"],
  "properties": {"schema_version":{"const":"1.0.0"},"generated_at":{"type":"string","format":"date-time"},"sources":{"type":"array","items":{"$ref":"#/$defs/source"}},"profiles":{"type":"array","items":{"$ref":"#/$defs/scoringProfile"}},"comparisons":{"type":"array","items":{"$ref":"#/$defs/comparison"}}},
  "$defs": {
    "source": {"type":"object","additionalProperties":false,"required":["id","provider","product_id","product_url","mission","access_url","retrieved_at","sha256","license","local_path"],"properties":{"id":{"type":"string","minLength":1},"provider":{"type":"string","minLength":1},"product_id":{"type":"string","minLength":1},"product_url":{"type":"string","format":"uri","pattern":"^https://"},"mission":{"type":["string","null"],"minLength":1},"access_url":{"type":"string","format":"uri","pattern":"^https://"},"retrieved_at":{"type":"string","format":"date-time"},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"license":{"type":"string","minLength":1},"local_path":{"type":"string","pattern":"^(?!/)(?!.*(?:^|/)\\.{1,2}(?:/|$))[A-Za-z0-9_./-]+$"}}},
    "period": {"type":"object","additionalProperties":false,"required":["start","end"],"properties":{"start":{"type":"string","format":"date-time"},"end":{"type":"string","format":"date-time"}}},
    "feature": {"type":"object","additionalProperties":false,"required":["value","unit","quantity","method","spatial_resolution_m","support_window_m","period","source_ids","missing_reason"],"properties":{"value":{"type":["number","null"]},"unit":{"enum":["deg","1","m","degC","kWh/m2/day"]},"quantity":{"type":"string","minLength":1},"method":{"type":"string","minLength":1},"spatial_resolution_m":{"type":["number","null"],"exclusiveMinimum":0},"support_window_m":{"type":["number","null"],"exclusiveMinimum":0},"period":{"anyOf":[{"$ref":"#/$defs/period"},{"type":"null"}]},"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true},"missing_reason":{"type":["string","null"],"minLength":1}},"allOf":[{"if":{"properties":{"value":{"type":"number"}}},"then":{"properties":{"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1},"missing_reason":{"type":"null"}}},"else":{"properties":{"missing_reason":{"type":"string","minLength":1}}}}]},
    "features": {"type":"object","additionalProperties":false,"required":["slope_mean_deg","slope_max_deg","roughness_index","elevation_delta_m","temp_min_c","temp_max_c","solar_irradiance_kwh_m2","aridity_index","albedo"],"properties":{"slope_mean_deg":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"deg"},"value":{"type":["number","null"],"minimum":0,"maximum":90}}}]},"slope_max_deg":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"deg"},"value":{"type":["number","null"],"minimum":0,"maximum":90}}}]},"roughness_index":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"1"},"value":{"type":["number","null"],"minimum":0}}}]},"elevation_delta_m":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"m"},"value":{"type":["number","null"],"minimum":0}}}]},"temp_min_c":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"degC"},"value":{"type":["number","null"],"minimum":-273.15}}}]},"temp_max_c":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"degC"},"value":{"type":["number","null"],"minimum":-273.15}}}]},"solar_irradiance_kwh_m2":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"kWh/m2/day"},"value":{"type":["number","null"],"minimum":0}}}]},"aridity_index":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"1"},"value":{"type":["number","null"],"minimum":0}}}]},"albedo":{"allOf":[{"$ref":"#/$defs/feature"},{"properties":{"unit":{"const":"1"},"value":{"type":["number","null"],"minimum":0,"maximum":1}}}]}}},
    "coordinates": {"type":"object","additionalProperties":false,"required":["latitude_deg","longitude_deg","frame","source_ids"],"properties":{"latitude_deg":{"type":"number","minimum":-90,"maximum":90},"longitude_deg":{"type":"number","minimum":-180,"maximum":180},"frame":{"enum":["earth_wgs84","moon_iau_planetocentric","mars_iau_planetocentric"]},"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1}}},
    "asset": {"type":"object","additionalProperties":false,"required":["path","sha256","bytes","source_ids"],"properties":{"path":{"type":"string","pattern":"^/assets/(?!\\.{1,2}(?:/|$))(?!.*\\/\\.{1,2}(?:/|$))[A-Za-z0-9_./-]+$"},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"bytes":{"type":"integer","minimum":1},"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1}}},
    "heightmap": {"type":"object","additionalProperties":false,"required":["asset","valid_mask","width","height","encoding","nodata","row_order","col_order","samples","height_reference","extent_m","origin","frame","vertical_datum","meters_per_unit"],"properties":{"asset":{"$ref":"#/$defs/asset"},"valid_mask":{"$ref":"#/$defs/asset"},"width":{"type":"integer","minimum":2},"height":{"type":"integer","minimum":2},"encoding":{"const":"float32_le"},"nodata":{"type":"null"},"row_order":{"const":"north_to_south"},"col_order":{"const":"west_to_east"},"samples":{"const":"grid_nodes"},"height_reference":{"const":"offset_from_origin_elevation_m"},"extent_m":{"type":"array","items":{"type":"number"},"minItems":4,"maxItems":4},"origin":{"type":"object","additionalProperties":false,"required":["latitude_deg","longitude_deg","elevation_m"],"properties":{"latitude_deg":{"type":"number","minimum":-90,"maximum":90},"longitude_deg":{"type":"number","minimum":-180,"maximum":180},"elevation_m":{"type":"number"}}},"frame":{"const":"local_enu_x_east_y_up_z_south"},"vertical_datum":{"type":"string","minLength":1},"meters_per_unit":{"const":1}}},
    "splat": {"type":"object","additionalProperties":false,"required":["asset","format","gaussian_count","scale_is_metric","world_from_asset","reconstruction_method","geometry_provenance"],"properties":{"asset":{"$ref":"#/$defs/asset"},"format":{"enum":["splat","ply"]},"gaussian_count":{"type":"integer","minimum":1},"scale_is_metric":{"type":"boolean"},"world_from_asset":{"type":"array","items":{"type":"number"},"minItems":16,"maxItems":16},"reconstruction_method":{"type":"string","minLength":1},"geometry_provenance":{"enum":["photogrammetric","inferred"]}}},
    "camera": {"type":"object","additionalProperties":false,"required":["position","lookAt","frame","fov","near","far"],"properties":{"position":{"type":"array","items":{"type":"number"},"minItems":3,"maxItems":3},"lookAt":{"type":"array","items":{"type":"number"},"minItems":3,"maxItems":3},"frame":{"const":"local_enu_x_east_y_up_z_south"},"fov":{"type":"number","exclusiveMinimum":0,"exclusiveMaximum":180},"near":{"type":"number","exclusiveMinimum":0},"far":{"type":"number","exclusiveMinimum":0}}},
    "geology": {"type":"object","additionalProperties":false,"required":["classes","method","source_ids","missing_reason"],"properties":{"classes":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true},"method":{"type":"string","minLength":1},"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true},"missing_reason":{"type":["string","null"],"minLength":1}},"allOf":[{"if":{"properties":{"classes":{"minItems":1}}},"then":{"properties":{"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1},"missing_reason":{"type":"null"}}},"else":{"properties":{"missing_reason":{"type":"string","minLength":1}}}}]},
    "location": {"type":"object","additionalProperties":false,"required":["id","name","body","coordinates","aoi","missions","features","geology","assets","camera"],"properties":{"id":{"type":"string","minLength":1},"name":{"type":"string","minLength":1},"body":{"enum":["earth","moon","mars"]},"coordinates":{"$ref":"#/$defs/coordinates"},"aoi":{"type":"object","additionalProperties":false,"required":["local_path","source_ids"],"properties":{"local_path":{"type":"string","pattern":"^/assets/(?!\\.{1,2}(?:/|$))(?!.*\\/\\.{1,2}(?:/|$))[A-Za-z0-9_./-]+$"},"source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1}}},"missions":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true},"features":{"$ref":"#/$defs/features"},"geology":{"$ref":"#/$defs/geology"},"assets":{"type":"object","additionalProperties":false,"required":["dem","heightmap","splat"],"properties":{"dem":{"anyOf":[{"$ref":"#/$defs/asset"},{"type":"null"}]},"heightmap":{"anyOf":[{"$ref":"#/$defs/heightmap"},{"type":"null"}]},"splat":{"anyOf":[{"$ref":"#/$defs/splat"},{"type":"null"}]}}},"camera":{"anyOf":[{"$ref":"#/$defs/camera"},{"type":"null"}]}},"allOf":[{"if":{"properties":{"body":{"const":"earth"}}},"then":{"properties":{"coordinates":{"properties":{"frame":{"const":"earth_wgs84"}}}}}},{"if":{"properties":{"body":{"const":"moon"}}},"then":{"properties":{"coordinates":{"properties":{"frame":{"const":"moon_iau_planetocentric"}}}}}},{"if":{"properties":{"body":{"const":"mars"}}},"then":{"properties":{"coordinates":{"properties":{"frame":{"const":"mars_iau_planetocentric"}}}}}}]},
    "featureBreakdown": {"type":"object","additionalProperties":false,"required":["similarity_pct","squared_distance_contribution","reason"],"properties":{"similarity_pct":{"type":["number","null"],"minimum":0,"maximum":100},"squared_distance_contribution":{"type":["number","null"],"minimum":0,"maximum":1},"reason":{"type":["string","null"],"minLength":1}},"allOf":[{"if":{"properties":{"similarity_pct":{"type":"number"}}},"then":{"properties":{"squared_distance_contribution":{"type":"number","minimum":0,"maximum":1},"reason":{"type":"null"}}},"else":{"properties":{"squared_distance_contribution":{"type":"null"},"reason":{"type":"string","minLength":1}}}}]},
    "breakdown": {"type":"object","additionalProperties":false,"required":["slope_mean_deg","slope_max_deg","roughness_index","elevation_delta_m","temp_min_c","temp_max_c","solar_irradiance_kwh_m2","aridity_index","albedo"],"properties":{"slope_mean_deg":{"$ref":"#/$defs/featureBreakdown"},"slope_max_deg":{"$ref":"#/$defs/featureBreakdown"},"roughness_index":{"$ref":"#/$defs/featureBreakdown"},"elevation_delta_m":{"$ref":"#/$defs/featureBreakdown"},"temp_min_c":{"$ref":"#/$defs/featureBreakdown"},"temp_max_c":{"$ref":"#/$defs/featureBreakdown"},"solar_irradiance_kwh_m2":{"$ref":"#/$defs/featureBreakdown"},"aridity_index":{"$ref":"#/$defs/featureBreakdown"},"albedo":{"$ref":"#/$defs/featureBreakdown"}}},
    "analog": {"type":"object","additionalProperties":false,"required":["location","similarity_score","rank","breakdown","coverage"],"properties":{"location":{"allOf":[{"$ref":"#/$defs/location"},{"properties":{"body":{"const":"earth"}}}]},"similarity_score":{"type":"number","minimum":0,"maximum":100},"rank":{"type":"integer","minimum":1,"maximum":3},"breakdown":{"$ref":"#/$defs/breakdown"},"coverage":{"type":"number","minimum":0,"maximum":1}}},
    "excluded": {"type":"object","additionalProperties":false,"required":["location_id","reasons"],"properties":{"location_id":{"type":"string","minLength":1},"reasons":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1}}},
    "profileFeature": {"type":"object","additionalProperties":false,"required":["key","unit","quantity","weight","lower","upper","calibration_source_ids","calibration_method"],"properties":{"key":{"enum":["slope_mean_deg","slope_max_deg","roughness_index","elevation_delta_m","temp_min_c","temp_max_c","solar_irradiance_kwh_m2","aridity_index","albedo"]},"unit":{"enum":["deg","1","m","degC","kWh/m2/day"]},"quantity":{"type":"string","minLength":1},"weight":{"type":"number","exclusiveMinimum":0},"lower":{"type":"number"},"upper":{"type":"number"},"calibration_source_ids":{"type":"array","items":{"type":"string","minLength":1},"uniqueItems":true,"minItems":1},"calibration_method":{"type":"string","minLength":1}},"allOf":[{"if":{"properties":{"key":{"const":"slope_mean_deg"}}},"then":{"properties":{"unit":{"const":"deg"}}}},{"if":{"properties":{"key":{"const":"slope_max_deg"}}},"then":{"properties":{"unit":{"const":"deg"}}}},{"if":{"properties":{"key":{"const":"roughness_index"}}},"then":{"properties":{"unit":{"const":"1"}}}},{"if":{"properties":{"key":{"const":"elevation_delta_m"}}},"then":{"properties":{"unit":{"const":"m"}}}},{"if":{"properties":{"key":{"const":"temp_min_c"}}},"then":{"properties":{"unit":{"const":"degC"}}}},{"if":{"properties":{"key":{"const":"temp_max_c"}}},"then":{"properties":{"unit":{"const":"degC"}}}},{"if":{"properties":{"key":{"const":"solar_irradiance_kwh_m2"}}},"then":{"properties":{"unit":{"const":"kWh/m2/day"}}}},{"if":{"properties":{"key":{"const":"aridity_index"}}},"then":{"properties":{"unit":{"const":"1"}}}},{"if":{"properties":{"key":{"const":"albedo"}}},"then":{"properties":{"unit":{"const":"1"}}}}]},
    "scoringProfile": {"type":"object","additionalProperties":false,"required":["id","version","algorithm","alpha","features","comparison_resolution_m","window_m","min_valid_area_fraction"],"properties":{"id":{"type":"string","minLength":1},"version":{"type":"string","minLength":1},"algorithm":{"const":"weighted_cosine_euclidean_v1"},"alpha":{"type":"number","minimum":0,"maximum":1},"features":{"type":"array","items":{"$ref":"#/$defs/profileFeature"},"minItems":1,"maxItems":9,"uniqueItems":true},"comparison_resolution_m":{"type":"number","exclusiveMinimum":0},"window_m":{"type":"number","exclusiveMinimum":0},"min_valid_area_fraction":{"type":"number","exclusiveMinimum":0,"maximum":1}}},
    "comparison": {"type":"object","additionalProperties":false,"required":["target","profile_id","analogs","excluded"],"properties":{"target":{"allOf":[{"$ref":"#/$defs/location"},{"properties":{"body":{"enum":["moon","mars"]}}}]},"profile_id":{"type":"string","minLength":1},"analogs":{"type":"array","items":{"$ref":"#/$defs/analog"},"maxItems":3},"excluded":{"type":"array","items":{"$ref":"#/$defs/excluded"}}}}
  }
}


/** Contract 1.0.0. Validate numeric bounds and cross-field invariants at runtime.
 * Heightmap invalid samples contain float 0 and mask 0; 0 is not a missing sentinel.
 */
export type Body = "earth" | "moon" | "mars";
export type FeatureKey =
  | "slope_mean_deg" | "slope_max_deg" | "roughness_index"
  | "elevation_delta_m" | "temp_min_c" | "temp_max_c"
  | "solar_irradiance_kwh_m2" | "aridity_index" | "albedo";
export type FeatureUnit = "deg" | "1" | "m" | "degC" | "kWh/m2/day";
export type Vec3 = [number, number, number];
export type Mat4 = [number, number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number];
export type LocalFrame = "local_enu_x_east_y_up_z_south";
export interface Source {
  id: string; provider: string; product_id: string; product_url: string;
  mission: string | null; access_url: string; retrieved_at: string;
  sha256: string; license: string; local_path: string;
}
export interface ObservationPeriod { start: string; end: string }
interface FeatureMetadata<U extends FeatureUnit> {
  unit: U; quantity: string; method: string;
  spatial_resolution_m: number | null; support_window_m: number | null;
  period: ObservationPeriod | null;
}
export type Feature<U extends FeatureUnit = FeatureUnit> = FeatureMetadata<U> & (
  | { value: number; source_ids: [string, ...string[]]; missing_reason: null }
  | { value: null; source_ids: string[]; missing_reason: string }
);
export interface Features {
  slope_mean_deg: Feature<"deg">; slope_max_deg: Feature<"deg">;
  roughness_index: Feature<"1">; elevation_delta_m: Feature<"m">;
  temp_min_c: Feature<"degC">; temp_max_c: Feature<"degC">;
  solar_irradiance_kwh_m2: Feature<"kWh/m2/day">;
  aridity_index: Feature<"1">; albedo: Feature<"1">;
}
export type CoordinateFrame = "earth_wgs84" | "moon_iau_planetocentric" | "mars_iau_planetocentric";
export interface Coordinates {
  latitude_deg: number; longitude_deg: number; frame: CoordinateFrame;
  source_ids: [string, ...string[]];
}
export interface AreaOfInterest { local_path: string; source_ids: [string, ...string[]] }
export interface Asset {
  path: string; sha256: string; bytes: number; source_ids: [string, ...string[]];
}
export interface Heightmap {
  asset: Asset; valid_mask: Asset; width: number; height: number;
  encoding: "float32_le"; nodata: null;
  row_order: "north_to_south"; col_order: "west_to_east"; samples: "grid_nodes";
  height_reference: "offset_from_origin_elevation_m";
  extent_m: [number, number, number, number];
  origin: { latitude_deg: number; longitude_deg: number; elevation_m: number };
  frame: LocalFrame; vertical_datum: string; meters_per_unit: 1;
}
export interface Splat {
  asset: Asset; format: "splat" | "ply"; gaussian_count: number;
  scale_is_metric: boolean; world_from_asset: Mat4; reconstruction_method: string;
  geometry_provenance: "photogrammetric" | "inferred";
}
export interface Camera {
  position: Vec3; lookAt: Vec3; frame: LocalFrame; fov: number; near: number; far: number;
}
export type Geology =
  | { classes: [string, ...string[]]; method: string; source_ids: [string, ...string[]]; missing_reason: null }
  | { classes: []; method: string; source_ids: string[]; missing_reason: string };
export interface Location<B extends Body = Body> {
  id: string; name: string; body: B; coordinates: Coordinates;
  aoi: AreaOfInterest; missions: string[];
  features: Features; geology: Geology;
  assets: { dem: Asset | null; heightmap: Heightmap | null; splat: Splat | null };
  camera: Camera | null;
}
export type FeatureBreakdown =
  | { similarity_pct: number; squared_distance_contribution: number; reason: null }
  | { similarity_pct: null; squared_distance_contribution: null; reason: string };
export interface Analog {
  location: Location<"earth">; similarity_score: number; rank: 1 | 2 | 3;
  breakdown: Record<FeatureKey, FeatureBreakdown>; coverage: number;
}
export interface Excluded { location_id: string; reasons: [string, ...string[]] }
type ProfileFeatureBase<K extends FeatureKey, U extends FeatureUnit> = {
  key: K; unit: U; quantity: string; weight: number; lower: number; upper: number;
  calibration_source_ids: [string, ...string[]]; calibration_method: string;
};
export type ProfileFeature =
  | ProfileFeatureBase<"slope_mean_deg" | "slope_max_deg", "deg">
  | ProfileFeatureBase<"elevation_delta_m", "m">
  | ProfileFeatureBase<"temp_min_c" | "temp_max_c", "degC">
  | ProfileFeatureBase<"solar_irradiance_kwh_m2", "kWh/m2/day">
  | ProfileFeatureBase<"roughness_index" | "aridity_index" | "albedo", "1">;
export interface ScoringProfile {
  id: string; version: string; algorithm: "weighted_cosine_euclidean_v1";
  alpha: number; features: [ProfileFeature, ...ProfileFeature[]];
  comparison_resolution_m: number; window_m: number; min_valid_area_fraction: number;
}
export interface Comparison {
  target: Location<"moon" | "mars">; profile_id: string;
  analogs: Analog[]; excluded: Excluded[];
}
export interface LocationsDataset {
  schema_version: "1.0.0"; generated_at: string;
  sources: Source[]; profiles: ScoringProfile[]; comparisons: Comparison[];
}


Внутренние функции, которые нужно создать; все импорты между твоими модулями должны совпадать с этими сигнатурами:
sources.py:
  def load_manifest(path: pathlib.Path) -> dict[str, object]
  def fetch_power(latitude_deg: float, longitude_deg: float, start: str, end: str, cache_dir: pathlib.Path, *, offline: bool) -> dict[str, object]
terrain.py:
  def extract_terrain(dem_path: pathlib.Path, aoi_path: pathlib.Path, profile: dict[str, object]) -> dict[str, object]
scoring.py:
  def score_matrix(target: numpy.ndarray, candidates: numpy.ndarray, weights: numpy.ndarray, lower: numpy.ndarray, upper: numpy.ndarray, alpha: float) -> tuple[numpy.ndarray, numpy.ndarray, numpy.ndarray]
  # arrays: target[D], candidates[N,D], weights/lower/upper[D]; returns total[N], per_feature_pct[N,D], squared_distance_contributions[N,D]. Only finite, complete, semantically matched inputs reach this function.
validation.py:
  def validate_dataset(dataset: dict[str, object], schema_path: pathlib.Path, public_root: pathlib.Path, *, require_demo_ready: bool) -> None
export.py:
  def atomic_write_json(destination: pathlib.Path, value: dict[str, object]) -> None
fetch_and_score.py:
  def main(argv: list[str] | None = None) -> int

[IMPLEMENTATION_SPEC]
1. Python >=3.11. Use numpy, rasterio, pyproj, shapely, requests, jsonschema[format], pytest. pyproject.toml with src layout and test optional dependency. fetch_and_score.py delegates to modules; no scipy/GPU required for LOOP_0. Handle Windows paths with pathlib. No network or file mutation at import time. Pin resolved versions into a human-generated lock/requirements file after installation; do not invent hashes.
2. Implement CLI:
   --mode prepare|offline|validate|empty
   --manifest PATH --profiles PATH --output PATH --require-demo-ready
   defaults: data-pipeline/config/sites_manifest.json, data-pipeline/config/scoring_profiles.json, web-client/public/data/locations_dataset.json.
   empty writes ONLY a valid root with current UTC generated_at and empty sources/profiles/comparisons. It must print EMPTY_NOT_SCIENCE_VALIDATED, never PASS/demo-ready. No coordinates or observations invented. validate loads existing output and validates. offline prohibits ALL network even on cache miss. prepare may fetch only declared verified input URLs and NASA POWER; bounded retries/timeouts, no bulk global downloads. Fail with actionable error on missing required manifest/assets, leave last good output untouched. --require-demo-ready requires >=1 supported target, >=1 ranked real Earth analog, validated real terrain and referenced local files; separately report top3_available and splat_available without pretending absent assets exist.
3. sites_manifest.json initial value must be {"schema_version":"1.0.0","sites":[]}; profiles config initially {"profiles":[]}. Document complete strict INPUT schema in README and validate it in load_manifest; each site needs id,name,body, sourced coordinates+frame, sourced AOI GeoJSON local file/hash/access URL, exact DEM file + label/metadata paths and provenance, optional temperature/albedo/geology measurements with their source/units/support. Include publication metadata rather than arbitrary constants. Missing manifest content is an explicit data readiness blocker, not an invitation to populate guessed measurements.
4. Support declared research regions by name: Shackleton, Haworth, Jezero, Arcadia Planitia, Atacama, McMurdo Dry Valleys, Mauna Kea, Iceland Highlands, Charyn, Mangystau. Names alone NEVER define analytical polygons or NASA landing sites. Do not hardcode their coordinates, slopes, temperatures or NASA mission membership. NASA observation mission and approved landing-site status are distinct. Allow sourced AOIs and clearly documented user-selected study windows; preserve source frame and convert mathematically to the output frame. USGS planetographic and planetocentric coordinates must not be relabelled. Preserve original body/ellipsoid/CRS and conversion provenance in source sidecars. Earth datum/planetary geodesy must not share an Earth EPSG assumption.
5. All real numeric features come from files/response parsing, never a table of 'SRTM/LOLA/MOLA constants'. Use physical meter grids and a fixed common comparison window/resolution per profile, never finer than the coarsest effective source. Reject insufficient coverage, invalid georeferencing, unsupported source units, partial/nodata windows below min_valid_area_fraction. Slope uses explicitly documented central/Horn gradient in meters (same algorithm all bodies); mean and maximum on common valid mask. elevation_delta=max(valid z)-min(valid z). Define roughness_index as RMS detrended plane residual / support_window_m (dimensionless); fit the plane only on valid DEM samples and document nodata+boundary policy. No terrain synthesis, hole-filling that becomes observation, or noise-generated DEM. Export raw/source DEM separately from derived common analysis raster.
6. NASA POWER prepare query endpoint https://power.larc.nasa.gov/api/temporal/daily/point with parameters=T2M_MIN,T2M_MAX,ALLSKY_SFC_SW_DWN,RH2M, community=RE, latitude/longitude from sourced Earth AOI sampling, start/end explicitly configured, format=JSON,time-standard=UTC. Read units and fill value FROM RESPONSE. Do not assume radiation units; convert MJ/m2/day ÷3.6 to kWh/m2/day only if metadata says MJ. Unknown units are errors. Record complete query URL, raw response SHA256, API/source version and period. Cache deduplicated requests at source grid resolution. Point sampling is labeled as sampling/coarse grid context, never as fine polygon-average climate. For polygon aggregates document cell intersections/weighting and quality. RH is contextual metadata, never aridity. T2M_MIN/MAX are air at 2m, never surface temperature. Retain RH/raw metadata in the cached response/sidecar rather than inventing a tenth contract feature.
7. Temperature features carry quantity identifying air_2m_temperature versus surface_temperature, aggregation and period. POWER and Diviner cannot enter same profile component. Aridity=P/PET requires real P and PET over same period; Moon not applicable => value:null with reason. SoilGrids is predicted soil properties, not mineralogy; geology remains missing without a supported geologic dataset. MODIS albedo needs same spectral/illumination definition as compared source. Missing optional values are null + explicit reason. Never replace missing with 0 or sentinel -999 in output.
8. Baseline comparison profile is explicitly topography_only: slope_mean_deg, slope_max_deg, roughness_index,elevation_delta_m, provided all are supported. Profile must be supplied with fixed calibration bounds, weights, alpha, source_ids, method and common support; do not fit bounds to each candidate batch. Engineering weights and alpha are project policy, not NASA measurements. Bounds from independent documented calibration. No silent percentile clamp. Reject L>=U, out-of-bounds values, negative/zero weights, alpha outside[0,1], duplicate features, missing quantity/unit/support match. If required target feature unavailable, no candidates ranked; if candidate feature missing, exclude that candidate with reason. Same profile and feature set for all ranked candidates. No pairwise missing-feature renormalization.
9. Matrix formula, using normalized x=(target-L)/(U-L), y=(candidate-L)/(U-L), W=sum(w):
   D=sqrt(sum(w*(x-y)^2)/W)
   C=sum(w*x*y)/sqrt(sum(w*x*x)*sum(w*y*y))
   Both norms zero => C=1. Exactly one zero => C=0. No hidden epsilon.
   S=100*(alpha*C+(1-alpha)*(1-D)). Only tolerance-sized FP overshoots may be corrected with documented tolerance; substantive range errors fail.
   breakdown.similarity_pct_j=100*(1-abs(x_j-y_j)); squared_distance_contribution_j=w_j*(x_j-y_j)^2/W. Excluded features have both null plus reason. Breakdown percentages are explanatory, not additive shares of score.
   Keep full precision in artifact; UI formats 2 decimals. Sort descending score then ascending stable location_id; top min(3,N). Never pad missing analogs. coverage=sum(active original policy weights)/sum(original policy weights) must have a single documented definition; for the stored fixed active profile use valid active weight / total active weight (ranked rows=1). UI separately reports active feature count of 9; coverage=1 is not complete physical equivalence.
10. Chunk candidates so memory is O(batch_size*D), with fixed profile normalization independent of chunk/order. Do not claim a continental search from five named polygons. Supported AOIs only in first demo. Calculations offline, never on browser main thread.
11. Heightmap export: .bin float32 little endian node heights relative to origin elevation; local x east,y up,z south. Rows north→south, cols west→east; width*height samples including extent boundaries, spacing extent/(count-1). U8 validity mask same dimensions, 1 valid/0 invalid; placeholders 0 under mask0 are not measurements. Geometry source from real DEM, datum and units explicit. Emit width/height/layout/origin/extent metadata required by shared schema. Hash and byte-size each public artifact. Renderer assets only same-origin /assets/...; source download URLs never used by browser. Splat remains null until a real supported .splat or Gaussian .ply plus reconstruction provenance and metric registration exist. No fake Gaussian scenes or single-image hallucination used as terrain truth.
12. Validate JSON Schema plus semantic invariants: every ID unique; every reference exists; exact supported units/quantity; periods coherent; bodies/frames consistent; camera within supported terrain; extent monotonic; byte lengths exactly width*height*4 and width*height; mask values only0/1; source and asset hashes/bytes verified; no NaN/Infinity; ranks contiguous/top3; profile matches scores recomputed independently; related features min<=max; no source outside repository/public roots after resolved path checks. Scored artifacts fail if any source/asset unverifiable. Atomic write only after all checks.
13. AI_AND_DATA_ATTRIBUTION_LOG additions returned separately: modules generated by Gemini Hydrogen, Astra specification, exact downloaded product/query URLs ONLY after local download. Do not mark this prompt execution as tests passed. Do not edit shared schema to make bad output pass.

Primary catalogs (not proof of downloaded granules):
LOLA https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/
LOLA 5m south pole https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/
Diviner https://pds-geosciences.wustl.edu/missions/lro/diviner.htm
MOLA https://pds-geosciences.wustl.edu/mgs/
HiRISE Jezero https://www.uahirise.org/dtm/dtm.php?ID=ESP_045994_1985
POWER https://power.larc.nasa.gov/docs/services/api/temporal/daily/
SRTM https://data.nasa.gov/dataset/shuttle-radar-topography-mission-dted-level-1-3-arc-second-data-dted-1
REMA/ArcticDEM https://www.pgc.umn.edu/guides/stereo-derived-elevation-models/pgc-dem-products-arcticdem-rema-and-earthdem/
MODIS https://doi.org/10.5067/MODIS/MCD43A3.061
SoilGrids https://isric.org/explore/soilgrids/
SRTM coverage 60N–56S excludes Iceland Highlands and McMurdo. Use documented real ArcticDEM/REMA with proper provenance, or excluded status. Earthdata may require free authentication during preparation; never include tokens in logs/source URLs or runtime demo. No proprietary paid services.

[SELF_VERIFICATION_TEST]
Write meaningful tests: identical vectors including zero =>100; one zero norm finite; scalar vs matrix; batch/order/extra candidate invariance; missing required features =>unranked; unknown units and air/surface mismatch rejected; invalid calibration/weights/NaN rejected; missing/hash-mismatched file blocks publication. Mathematical fixtures are dimensionless vectors in tests only, no fake coordinates/scientific dataset. Offline test monkeypatches all HTTP/network entry points to raise and verifies cache-only success and missing-cache failure. Schema test empty dataset success but require-demo-ready failure. Use tmp_path and verify no partial output overwrites on failure.
Provide commands (PowerShell; execute locally, not claimed by you):
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e "./data-pipeline[test]"
.\.venv\Scripts\python.exe -m pytest data-pipeline/tests -q
.\.venv\Scripts\python.exe data-pipeline/fetch_and_score.py --mode empty
.\.venv\Scripts\python.exe data-pipeline/fetch_and_score.py --mode validate
# after real sourced manifests/calibration/rasters are available:
.\.venv\Scripts\python.exe data-pipeline/fetch_and_score.py --mode prepare --require-demo-ready
.\.venv\Scripts\python.exe data-pipeline/fetch_and_score.py --mode offline --require-demo-ready
Conclude with actual remaining DATA_BLOCKERS, not fake PASS. Human reports [PASS: Dev_A/fetch_and_score] or [FAIL: Dev_A/fetch_and_score | log].


[CONTRACT_SEMANTICS — обязательные межполе́вые проверки]
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

````
