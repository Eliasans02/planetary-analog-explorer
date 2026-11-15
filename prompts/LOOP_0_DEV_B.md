Скопируйте весь текст внутри внешнего блока в Gemini. Контракт уже внедрён.

````markdown
# LOOP_0 / DEV_B / Gemini Hydrogen — базовое 3D-ядро Planetary Analog Explorer

Ты — Gemini Hydrogen, генератор кода в изолированном браузере. У тебя нет доступа к локальным файлам и терминалу разработчика. Ниже дан весь межмодульный контракт. Верни полное содержимое каждого создаваемого файла с точным путём, без многоточий, псевдокода, необъявленных импортов и утверждений, что тесты уже запущены. Не изменяй shared-контракт. Разработчик скопирует файлы и выполнит команды локально.

Корень монорепозитория: planetary-analog-explorer/.
Основной создаваемый файл: web-client/src/components/Viewport3D.tsx.

[CONTEXT_HEADER]

Существующий общий файл shared/types/analog-location.ts — единственный источник TypeScript-типов данных. Его полное содержимое:

```typescript
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

```

Существующий общий файл shared/schemas/analog_location.schema.json — единственный источник правил JSON. Его полное содержимое:

```json
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

```

Не предполагай, что существует какой-либо frontend-код помимо приведённых shared-файлов. Все остальные необходимые файлы создай в ответе. Импорты shared через alias @shared, соответствующий ../shared; настрой одинаковый alias в Vite, Vitest и tsconfig. Если поле в описании ниже названо смысловым именем, используй точное имя из shared-контракта, не создавай альтернативную схему. Не дублируй Location и LocationsDataset своими несовместимыми типами.

Обязательный public API компонента:

```typescript
import type { Location, LocationsDataset } from '@shared/types/analog-location';
export interface Viewport3DProps {
  selected: Location | null;
  dataset: LocationsDataset;
  onTargetSelected: (id: string) => void;
}
export function Viewport3D(props: Viewport3DProps): React.JSX.Element;
```

Внутренний frontend-контракт, который ты реализуешь вместе с компонентом:

```typescript
// web-client/src/terrain/heightfield.ts
import type { Location } from '@shared/types/analog-location';
export interface HeightfieldData {
  heights: Float32Array; // локальный y в метрах: offset_from_origin_elevation_m
  valid: Uint8Array; // 1 = измерение допустимо, 0 = NoData
  width: number;
  height: number;
  originX_m: number; // x первого узла = East
  originZ_m: number; // z первого узла = South
  spacingX_m: number;
  spacingZ_m: number;
  verticalOrigin_m: number; // только datum metadata: абсолютная высота = y + verticalOrigin_m
}
export async function readHeightfield(location: Location, signal: AbortSignal): Promise<HeightfieldData | null>;
export function sampleHeight(grid: HeightfieldData, x_m: number, z_m: number): number | null;
// sampleHeight возвращает локальный y, а не абсолютную высоту datum.

// web-client/src/terrain/terrain.worker.ts и terrain-worker-client.ts
export interface TerrainBuffers {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}
export function buildTerrainInWorker(grid: HeightfieldData, signal: AbortSignal): Promise<TerrainBuffers>;
// heightfield буферы нужны collision sampler: не detach их при отправке worker.

// web-client/src/data/loadDataset.ts
import type { LocationsDataset } from '@shared/types/analog-location';
export function parseDataset(value: unknown): LocationsDataset;
export async function loadDataset(signal: AbortSignal): Promise<LocationsDataset>;
```

Зафиксируй зависимости без ^ и ~:
runtime: react 18.3.1, react-dom 18.3.1, three 0.170.0,
@mkkellogg/gaussian-splats-3d 0.4.7, ajv 8.17.1, ajv-formats 3.0.1.
dev: vite 8.3.8, @vitejs/plugin-react 6.3.0, typescript 5.9.3,
@types/react 18.3.12, @types/react-dom 18.3.1, @types/three 0.170.0,
@types/node 22.10.2, vitest 5.1.0, @playwright/test 1.65.1.
Node.js >=22.12.0; для разработки рекомендован установленный поддерживаемый Node 24 LTS.
Сгенерируй package.json, но не сочиняй package-lock.json: npm install создаст его локально.
В этой версии plugin-react дополнительные compiler peers optional; не добавляй React Compiler.

Viewer 0.4.7 не поставляет .d.ts. Создай web-client/src/types/gaussian-splats-3d.d.ts с узкой типизированной поверхностью; не используй declare module без типов и не подавляй ошибки через any:

```typescript
declare module '@mkkellogg/gaussian-splats-3d' {
  import type { Camera, Scene, WebGLRenderer } from 'three';
  export interface SceneLoad {
    readonly promise: Promise<void>;
    abort(reason?: string): void;
  }
  export class Viewer {
    constructor(options: {
      renderer: WebGLRenderer;
      camera: Camera;
      threeScene: Scene;
      rootElement: HTMLElement;
      selfDrivenMode: false;
      useBuiltInControls: false;
      sharedMemoryForWorkers: false;
      gpuAcceleratedSort?: boolean;
      integerBasedSort?: boolean;
      sphericalHarmonicsDegree?: number;
    });
    addSplatScene(path: string, options?: {
      showLoadingUI?: boolean;
      progressiveLoad?: boolean;
      position?: [number, number, number];
      rotation?: [number, number, number, number];
      scale?: [number, number, number];
    }): SceneLoad;
    update(): void;
    render(): void;
    dispose(): Promise<void>;
  }
}
```

Это минимальная локальная декларация проверенной API-поверхности, не полный upstream API.
Важно: custom AbortablePromise у Viewer не реализует полноценный PromiseLike. Используй
`const load = viewer.addSplatScene(url, options); await load.promise;`, НЕ `await load`.
У addSplatScene нет стандартного AbortSignal option. Отмена: load.abort(reason) и viewer.dispose().
Не вызывай viewer.start(): при selfDrivenMode:false этот метод бросает ошибку.

[IMPLEMENTATION_SPEC]

1. Состав выдачи и scope.

Создай:
- web-client/package.json
- web-client/index.html
- web-client/vite.config.ts
- web-client/tsconfig.json
- web-client/tsconfig.node.json при необходимости выбранного typecheck
- web-client/src/vite-env.d.ts
- web-client/src/main.tsx
- web-client/src/App.tsx
- web-client/src/styles.css
- web-client/src/components/Viewport3D.tsx
- web-client/src/components/TelemetryHUD.tsx
- web-client/src/data/loadDataset.ts
- web-client/src/terrain/heightfield.ts
- web-client/src/terrain/terrain.worker.ts
- web-client/src/terrain/terrain-worker-client.ts
- web-client/src/types/gaussian-splats-3d.d.ts
- web-client/src/terrain/heightfield.test.ts
- web-client/src/data/loadDataset.test.ts
- web-client/playwright.config.ts
- web-client/tests/viewport.spec.ts
- web-client/scripts/verify-assets.mjs
- web-client/README.md

Если требуется дополнительный небольшой helper, выдай его целиком с путём и точными экспортами.
Не выдавай Python pipeline и не изменяй shared schema. Собственный код проекта Apache-2.0;
лицензии MIT-зависимостей сохраняются. Не переписывай лицензии библиотек на Apache-2.0.
Не выдавай fake splat/DEM/scientific JSON или generated научные изображения.
public/data/locations_dataset.json и public/assets/ создаёт Dev_A. До их появления UI обязан работать в честном empty/error состоянии.
LOOP_0 реализует один viewport с orbit/ground переключением; синхронный split-screen остаётся следующим loop и не должен объявляться готовым.

2. Данные и offline-first.

Загружай только локальный data/locations_dataset.json относительно import.meta.env.BASE_URL.
Валидируй JSON через Ajv2020 + ajv-formats по полной shared schema до любых Three/WebGL аллокаций данных.
TypeScript cast допустим только после успешной runtime-валидации. Не импортируй Draft-2020-12 schema в стандартный Ajv constructor.
Проверяй semantic invariants, которых не обеспечивает JSON Schema: ссылочная целостность source IDs,
уникальность location IDs, применимость camera к assets, matching grid dimensions и finite числа.
Missing dataset / invalid dataset: понятное сообщение и кнопка повторить, без fallback научных координат/показателей.
Неполный валидный dataset: отрисуй доступные локации и объясни отсутствие ранжирования/ground assets.
Не подменяй null нулями, средними, случайным шумом, табличными догадками или fake top-3.
Сходство уже рассчитано Dev_A: UI только показывает score/breakdown/coverage/reasons; не пересчитывай score другой формулой.
Все fetch для данных/asset только same-origin локальные пути из контракта; заблокируй внешние URL,
path traversal, абсолютные filesystem paths. External source URLs допустимы как ссылки пользователя,
но не как автоматически загружаемые ресурсы во время demo.
Показывай сведения о источниках/периоде/разрешении/ограничениях рядом с аналитикой.

3. Orbit и Pegman.

Создай явно обозначенный «схематический глобус» в нормализованных UI единицах, если нет настоящей
документированной текстуры. SphereGeometry радиуса 1 — графическая система координат, не DEM.
Не имитируй настоящую поверхность процедурным рельефом и не подписывай schematic как спутниковый снимок.
Показывай Earth/Moon/Mars selector и маркеры только из валидного sourced dataset.
Луна/Марс: разрешён drop Pegman только на предварительно рассчитанные AOI/target markers.
Raycast по маркерам определяет существующий target ID; onTargetSelected(id) вызывается один раз.
Drop на пустую часть глобуса показывает «Для этой области данные ещё не подготовлены».
Не вычисляй произвольный ближайший земной аналог по координатам drop и не выдавай marker centroid за новый измеренный полигон.
Кроме pointer drag-and-drop дай доступный обычный выбор target через кнопку/список и keyboard.
При data body CRS следуй указанным latitude convention и east-positive longitude, с приведением
долгот только как визуального преобразования. Тестировать antimeridian и полярные маркеры.
OrbitControls и PointerLockControls взаимоисключены, не конкурируют за управление камерой.

4. Настоящий heightfield и ground mode.

Переключение наземного режима доступно только при валидной camera и реальном heightmap asset.
Типы nullable assets/camera читай буквально из shared schema. Если нет heightmap,
показывай причину и оставляй orbit; существующий splat без подтверждённой привязки не делает terrain метрическим.
Читай heights BIN f32-le и mask BIN u8 из local asset metadata, соблюдая checksum, byte length,
width/height, origin/spacing и vertical datum. Массив узлов row-major, столбцы west→east,
строки north→south; локальный Three frame x=East, y=Up, z=South (то есть -North), единица метр.
Первый узел: x=extent_m[0], z=extent_m[1]; spacingX=(extent_m[2]-extent_m[0])/(width-1), spacingZ=(extent_m[3]-extent_m[1])/(height-1). origin.latitude_deg/longitude_deg — географический anchor, не локальный x/z.
Не трактуй node grid как pixel centers и не используй width*spacing для последнего узла.
Если shared metadata задаёт transform иначе, переведи его явно к указанному внутреннему HeightfieldData,
сохрани spatial meaning; не меняй shared schema. Порядок north→south и y-origin документировать.
Для f32-le используй корректный little-endian decode; не полагайся на canvas RGB как научные высоты.
Valid mask 0 исключает узел; никогда не превращай NoData в плоское дно/нулевую высоту.
Не создавай треугольник, если хотя бы одна его вершина NoData. Mesh normals и slope только из настоящих высот.
Collision sampler использует те же треугольники/диагональ, что terrain mesh: barycentric interpolation,
чтобы камера не расходилась с геометрией; sampleHeight на NoData/outside возвращает null.
Slope в HUD вычисляется по фактической поверхности и подписывается как derived from DEM.
Heightfield хранит локальные offsets из BIN; sampleHeight возвращает их без повторного вычитания origin.elevation_m. Three y и камера — те же локальные метры. Абсолютную высоту HUD получай добавлением verticalOrigin_m только при показе.
Не меняй terrain exaggeration по умолчанию: вертикальный масштаб 1.
Строительство positions/normals/indices вынести в module WebWorker с transferable output buffers.
Не передавай принадлежащие collision sampler ArrayBuffers через transfer (они detached): копируй
input или сохрани отдельный компактный sampling buffer. Worker terminate при cancel/unmount/error.
Проверяй mesh budget до аллокаций. Если вход слишком большой, сообщи необходимость offline downsample;
не подменяй его искусственно упрощённым рельефом без метаданных обработки.

5. Splat overlay.

При nullable splat: terrain-only с надписью «3D-реконструкция не подготовлена», не с fake cloud.
При asset: поддержи .splat и Gaussian .ply, не любой произвольный PLY point cloud.
Используй world_from_asset из shared metadata: column-major affine Matrix4, mapping в local ENU metres. Разложи матрицу в position/quaternion XYZW/scale через Matrix4.decompose для addSplatScene; проверь обратной композицией отсутствие shear/reflection/degeneracy. При scale_is_metric:false или недоказанной привязке не накладывай splat на метрический terrain. Не ищи несуществующие position/rotation/scale в JSON.
Не подгоняй splat к terrain «на глаз». Некалиброванная реконструкция не используется для scientific telemetry.
Один экземпляр WebGLRenderer принадлежит Viewport lifecycle. Viewer принимает renderer/camera/threeScene.
Параметры: selfDrivenMode:false, useBuiltInControls:false, sharedMemoryForWorkers:false.
Внешний RAF единственный. Пока splats не готовы или произошла ошибка — renderer.render(scene,camera).
После успешного load.promise — viewer.update(); viewer.render(); без второго renderer.render.
Viewer.render сам рисует threeScene и splats и до splatRenderReady не рисует даже terrain.
Загрузки и выгрузки сериализовать: библиотека не разрешает addSplatScene во время другого load/unload.
При loading/error сохраняй настоящий DEM доступным. Не скрывай ошибку splat как successful 3D mode.

6. Камера, lifecycle, производительность.

PointerLockControls из three/addons/controls/PointerLockControls.js; yaw/pitch мышью,
WASD с normalized diagonal velocity и ограниченным delta time. Walk speed/eye height — настройки UI,
явно не научные параметры планеты. Начальная камера из metadata; placement relative to DEM не заменять произвольной координатой.
Pointer lock только по клику пользователя; Esc unlock; покажи инструкции до захвата.
На blur/unlock/visibilitychange сбрасывай keys; не допускай движения камеры после возврата фокуса.
Перед применением displacement проверяй sampler; при NoData/outside сохрани последнюю валидную позицию.
Не симулируй лунную/марсианскую гравитацию и прыжки с придуманными constants.
ResizeObserver обновляет renderer CSS size и projection matrix; при нулевом размере пропускай render.
Установи инженерный начальный budget: DPR <=1.5, terrain <=257*257 узлов, splats <=250000
и суммарные assets <=64 MiB на активную наземную сцену; размеры брать из metadata, по загрузке перепроверять.
Эти числа — конфигурация производительности, не измеренные научные свойства и не гарантия 60 FPS.
Включи adaptive DPR reduction только на основе измеренного frame time, с гистерезисом;
не выгружай/перезагружай scene на каждом кадре и не пересоздавай renderer при HUD update.
HUD обновляется максимум 4 раза/сек; FPS считает настоящий RAF measurement window.
Показывай режим, loading/error, источник DEM, score и coverage, FPS/frame time, локальную позицию,
DEM slope при наличии. Sun azimuth/horizon/temperature показывать N/A, если отсутствуют
подтверждённые входные данные и вычисление; не делать декоративные значения похожими на научные.
VRAM не представлять как измеренную, если есть только renderer.info counts. performance.memory
не стандартизован и необязателен: отображай N/A и не делай его условием PASS.
На смену selected и unmount: increment generation token, немедленно прекрати input и RAF,
abort fetch, cancel/terminate terrain worker, abort splat load; await viewer.dispose() с catch ожидаемого
abort и finally cleanup. Viewer.dispose асинхронен; внешние meshes/materials/textures/renderer принадлежат
приложению и освобождаются после disposal viewer. dispose geometry/material/textures ровно по ownership.
React effect cleanup не async: запусти контролируемый disposal task, храни его promise, сериализуй
последующую init и обработай rejection. Старые async callbacks не устанавливают state и не добавляют сцену.
StrictMode mount→cleanup→mount не должен создавать второй активный renderer, RAF или worker.
Отслеживай canvas/WebGL context lost: прекрати render, покажи понятное восстановление, cleanup корректен.

7. Научная и лицензионная дисциплина.

Никаких live NASA/Google/Mapbox API, API keys, CDN scripts/fonts, рекламы и удалённых scene downloads.
Нельзя считать single-image depth истинной геометрией: такие реконструкции отдельно помечаются как
model-derived visualization и не участвуют в similarity/terrain collision без metric calibration.
Original Graphdeco research-only/noncommercial training не добавляй; в этой задаче только MIT viewer.
Не утверждай, что Gemini уже сгенерировал dataset или что Dev_A одобрил данные.
README перечисляет созданные тобой модули как Gemini Hydrogen generated, pending human review.
В attribution не приписывай Gemini код, который только планируется. Укажи необходимость внести
реальные записи в AI_AND_DATA_ATTRIBUTION_LOG после копирования/проверки разработчиком.

[SELF_VERIFICATION_TEST]

Добавь scripts package.json:
typecheck = tsc --noEmit (или корректный эквивалент с project references без выдачи JS);
test = vitest run;
build = vite build;
dev = vite --host 127.0.0.1;
preview = vite preview --host 127.0.0.1;
e2e = playwright test;
verify:assets = node scripts/verify-assets.mjs.

Unit tests проверяют реальные contract invariants, finite/NoData/extent/triangle sampling,
отсутствие координатных off-by-one, checksum/byte length rejection, bad schema и null assets.
Математические unit fixtures могут быть абстрактными маленькими массивами: подпиши
«TEST_ONLY mathematical fixture, not Earth/Moon/Mars data», храни только в *.test.ts,
никогда не экспортируй их в public, dataset или демонстрацию.
E2E empty-state: 404/invalid dataset даёт читаемую ошибку и не генерирует научных сцен;
никаких requests к внешним origin; повторный mount и resize не оставляют лишние canvas.
E2E реальных assets запускается только при наличии валидного Dev_A dataset с target/heightmap;
без него test.skip с явной причиной, а финальный отчёт «ground integration NOT VERIFIED».
На реальных данных: target dropdown и Pegman выбирают тот же ID, orbit/ground переключается,
WASD ограничен DEM, Escape разблокирует мышь, failed splat оставляет DEM fallback,
переключение location во время load не показывает старую сцену. Повторить 20 mode/location переключений;
сравнить owned canvas/worker/resource counters после cleanup. Не требовать точного нуля от внутренних
renderer.info кешей; ищи монотонный рост и лишние живые owners. WebGL unavailable должен давать явный skip/error,
а не зелёный «3D работает». Pointer lock дополнительно проверяется вручную в headed браузере.
verify-assets сверяет наличие всех local paths, bytes, sha256, допустимые formats и budget metadata,
и exit!=0 при dataset/обязательных assets отсутствующих. Он не скачивает и не сочиняет файлы.
Для demo готовности нужен отдельный real-assets PASS; проходящий empty-state тест не заменяет его.
Измерь 60-секундную сессию на машине судейского demo: median/p95 frame time и viewport resolution,
число splats, GPU/browser, cold-load время; 60 FPS — цель. Без настоящих assets сообщи PERF NOT MEASURED.

Команды для человека из planetary-analog-explorer/web-client (PowerShell):
node --version
npm install
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run e2e
npm run verify:assets
npm run dev

Не записывай «PASS» по результату чтения кода. Заверши ответ перечнем файлов, точными командами,
известными ограничениями/skip и ожидаемым human сигналом:
[PASS: Dev_B/Viewport3D | typecheck,test,build,e2e,real-assets/manual | browser/GPU | timings]
или [FAIL: Dev_B/Viewport3D | команда | полный лог]
или [PERF_WARN: Dev_B/Viewport3D | FPS/frame-time | resolution/splat-count/GPU].

Проверенные первичные ссылки (документация, не dataset assets):
https://raw.githubusercontent.com/mkkellogg/GaussianSplats3D/v0.4.7/package.json
https://raw.githubusercontent.com/mkkellogg/GaussianSplats3D/v0.4.7/src/Viewer.js
https://raw.githubusercontent.com/mkkellogg/GaussianSplats3D/v0.4.7/src/AbortablePromise.js
https://github.com/mkkellogg/GaussianSplats3D
https://threejs.org/docs/pages/PointerLockControls.html
https://vite.dev/guide/
https://github.com/graphdeco-inria/gaussian-splatting/blob/main/LICENSE.md
https://github.com/nerfstudio-project/gsplat/blob/main/LICENSE


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
