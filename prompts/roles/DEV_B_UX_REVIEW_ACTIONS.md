# LOOP_0-B-02 — bounded UX re-loop, prepared but NOT dispatched

Role: Gemini Hydrogen / Dev_B. Apply only to the actual existing PAE implementation in your developer session. If its code is unavailable, report BLOCKED_SOURCE_MISSING; do not replace it with invented context. First export the B01 source bundle for independent review. This task does not change shared contracts or close the paired human acceptance gate.

Exact existing paths in the intended repository:
- `web-client/src/App.tsx`
- `web-client/src/components/TelemetryHUD.tsx`
- `web-client/src/components/Viewport3D.tsx`
- `web-client/src/styles.css`
- `web-client/tests/viewport.spec.ts`

[CONTEXT_HEADER]

Existing component public API (unchanged):

```typescript
import type { Location, LocationsDataset } from '@shared/types/analog-location';
export interface Viewport3DProps {
  selected: Location | null;
  dataset: LocationsDataset;
  onTargetSelected: (id: string) => void;
}
export function Viewport3D(props: Viewport3DProps): React.JSX.Element;
```

The immutable full shared definitions are embedded below. This task uses no new data fields or imported APIs. Existing scientific fields remain dataset-derived; viewer preferences and measured runtime diagnostics must remain visibly distinct. There is currently no prepared real dataset, no verified ground integration and no measured 60-second GPU performance result.

Evidence: Astra inspected an actual 1440x900 screenshot. It has a schematic Mars globe, disabled ground mode and target selector, an amber missing-data banner with developer paths, telemetry N/A and viewer preferences. Stitch could not inspect the authenticated preview and received no screenshot attachment. Its review is indirect. Its reference mockups are not approved implementation assets.

[IMPLEMENTATION_SPEC]

1. Show plain honest empty-state copy explaining that prepared data is unavailable. Keep the existing retry/reload action. Put diagnostic file paths in a collapsed Technical details disclosure.
2. Use consistent English labels for this revision. Do not add an i18n framework.
3. Clearly group scientific data, measured client diagnostics, and viewer navigation preferences. Unknown data stays N/A; performance stays not measured unless derived from the actual frame loop.
4. Check the existing keyboard target-selection path and disabled-mode reason. Correct a real defect only if reproduced; do not add speculative shortcuts.
5. Check narrow viewport layout and make the telemetry panel collapsible if it otherwise obstructs the viewport. Preserve focus and readable controls.
6. Do not add JSON/GeoJSON upload, a nonexistent bundled-baseline button, synthetic examples, promised scores/FPS, NASA certification claims, new data requirements, or new dependencies.
7. Preserve scene disposal, AbortController handling, worker shutdown, input cleanup, and B01 dependency pins. No rendering-engine changes for cosmetic edits; no allocation per frame for UI text. The shared contract remains unchanged.

[SELF_VERIFICATION_TEST]

Run the existing typecheck, unit and build commands. Re-run relevant empty-state/invalid-data browser checks; inspect desktop and narrow screenshots. Demonstrate keyboard focus, retry and technical disclosure without a real dataset. Do not fabricate assets to unskip real-ground tests. Export a new `reports/source-bundle.json` with actual contents and SHA256 after the edit, explicitly superseding B01 only for changed files. Report actual outputs separately from unrun checks. No global PASS until independent review and both human signals.


[EMBEDDED_IMMUTABLE_CONTRACT]

File: shared/types/analog-location.ts
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


File: shared/schemas/analog_location.schema.json
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
