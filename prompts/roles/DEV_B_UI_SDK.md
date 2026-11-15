# Dev_B B03 — Vercel UI SDK / Analog Passport

Скопируйте весь fenced prompt в существующую Dev_B-сессию после завершения B02. Не запускайте второго writer на те же файлы. Это узкая UI-интеграция с согласованным обновлением React baseline, а не новый scientific feature.

````markdown
Ты — Dev_B / Gemini Hydrogen. Выполни B03 после завершения текущего B02 в том же проекте. Пользователь прямо потребовал использовать https://github.com/vercel-labs/ui для развития настоящего UI. Astra выбрала первое применение: Analog Passport с переиспользуемым InfoDisclosure для фактических показателей, причин сходства, ограничений и источников. Добавленная, но не используемая dependency не считается выполнением.

Не меняй data-pipeline/**, shared/**, REPO_STATE или глобальный attribution. Не объявляй human PASS или PHASE 5. Выдай точный diff/содержимое изменённых файлов и реальные результаты команд. При недоступном исполнении честно перечисли непроверенное.

[CONTEXT_HEADER]

Проект: planetary-analog-explorer/. Frontend: web-client/. B02 является текущей рабочей версией в твоей сессии; прочитай его настоящие App/TelemetryHUD/styles/package/lock/test files до правки. Это не разрешение воссоздать их по догадке. Если ты получаешь промпт в новой пустой сессии без исходников B02, создай только самодостаточные новые компоненты ниже, но поставь HOST_INTEGRATION_BLOCKED и запроси точные файлы; не объявляй B03 завершённым и не сочиняй существующие props/imports. Astra не подразумевает доступ к локальному ПК.

Разрешённые outputs:
- web-client/package.json и фактически регенерированный package-lock.json;
- web-client/src/components/ui/InfoDisclosure.tsx;
- web-client/src/components/AnalogPassport.tsx;
- минимальная правка фактического host: web-client/src/App.tsx и/или web-client/src/components/TelemetryHUD.tsx для реального подключения Passport;
- web-client/src/styles.css;
- web-client/tests/ui-sdk.spec.ts и минимальная test-only harness при необходимости;
- web-client/README.md и тесты, непосредственно затронутые React migration.

Не переписывай Viewport3D/loader/scoring/terrain архитектуру для этого UI. Если React 19 выявит реальную typing/lifecycle ошибку в них, сделай минимальное исправление с отдельным explanation и regression test; не скрывай ее cast/any/ts-ignore.

DEPENDENCY BASELINE B03 — явная замена только прежних React pins:

```json
{
  "dependencies": {
    "@ui-sdk/core": "0.1.0-beta.1",
    "@ui-sdk/react": "0.1.0-beta.1",
    "react": "19.3.1",
    "react-dom": "19.3.1"
  },
  "devDependencies": {
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0"
  }
}
```

Это merge entries в существующий manifest, не его полная замена. Registry действительно публикует эти версии. @ui-sdk/react beta.1 peers: react>=19, react-dom>=19, @types/react>=19.2.10, @ui-sdk/core ^0.1.0-beta.1. react-dom19.3.1 peer React^19.3.1; types/react-dom19.3.0 peer types/react^19.3.0. Старые React18 pins superseded только этой задачей; это согласованное решение Astra ради нового требования пользователя. Не используй --force/--legacy-peer-deps и не оставляй одновременно React18 types/runtime. Не бери GitHub main APIs: там beta.2, хотя npm latest здесь beta.1.

Остальные pins сохраняются: three0.170.0, GaussianSplats3D0.4.7, TS5.9.3, Vite8.3.8, plugin-react6.3.0, Ajv8.17.1, ajv-formats3.0.1, @types/three0.170.0, @types/node22.10.2, Vitest5.1.0, Playwright1.65.1. Если реальная установка сообщает конфликт, приложи точный вывод; не меняй эти pins без доказательства. Default dev/preview — 127.0.0.1; Studio network binding только явный отдельный opt-in.

UI SDK skill прочитан Astra: packages/core/skills/ui-sdk/SKILL.md. Для реализации читай установленный node_modules/@ui-sdk/react/docs/llms.txt, docs/components/collapsible.md и public .d.ts; не копируй compiled JS и не импортируй internal/*.
Пакеты объявлены Apache-2.0, README сообщает beta и ссылается на beta terms. Сохрани notices, не создавай аккаунт/подписку, не принимай соглашения и не добавляй remote scripts/web.js/CDN. Пакеты должны входить в локальную сборку. Никаких @google/genai/LLM API/model keys/production WebMCP endpoints.

Проверенные API beta.1:

```tsx
import { collapsible } from '@ui-sdk/core/collapsible';
import { createParts } from '@ui-sdk/react/primitive';

// Module scope, не внутри render: это public documented adapter call.
const parts = createParts(collapsible, {
  root: 'div', trigger: 'button', panel: 'div',
});
const DisclosureRoot = parts.Root;
const DisclosureTrigger = parts.Trigger;
const DisclosurePanel = parts.Panel;
```

Публичная generic declaration из package/dist/use-primitive.d.ts beta.1 (для справки, не копировать в свой declare module):

```ts
declare function createParts<P extends Primitive, Tags extends {
    [S in SlotName<P>]?: Tag;
}>(primitive: P, tags: Tags): Parts<P, Tags>;
```

Primitive/SlotName/Tag/Parts — типы SDK; используй inference от приведённого конкретного вызова, не импортируй эти детали ради собственных re-declarations.

Это адаптация уже существующего SDK collapsible, не новая самодельная implementation поведения. Альтернативные готовые exports существуют в @ui-sdk/react/collapsible: Collapsible, CollapsibleTrigger, CollapsiblePanel. В B03 используй показанный createParts для локальных имён InfoDisclosure; не добавляй выдуманные `Panel`, `Portal`, `as`, root import из @ui-sdk/react или shadcn APIs.

Проверенные типы из core beta.1 `.d.ts` (описание используемой поверхности, не добавлять своё declare module):

```ts
import type { ChangeDetails } from '@ui-sdk/core';
import type { CollapsibleOptions, CollapsiblePanelProps } from '@ui-sdk/react/collapsible';
type OpenReason = 'trigger-press' | 'find-in-page' | 'imperative';
type OnOpenChange = (open: boolean, details: ChangeDetails<OpenReason>) => void;
// Root options: open?:boolean; defaultOpen?:boolean; disabled?:boolean;
// onOpenChange?:OnOpenChange; onOpenChangeComplete?:(open:boolean)=>void;
// optional controller returned by createCollapsibleController().
// Panel options: keepMounted?:boolean; hiddenUntilFound?:boolean.
// Public imported types are authoritative. Native button trigger supplies Enter/Space behavior.
```

Контракт нового локального компонента, который ты реализуешь полностью:

```tsx
// web-client/src/components/ui/InfoDisclosure.tsx
import type { ReactNode } from 'react';
export interface InfoDisclosureProps {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}
export function InfoDisclosure(props: InfoDisclosureProps): React.JSX.Element;
```

InfoDisclosure использует DisclosureRoot/Trigger/Panel выше. Root defaultOpen из props, trigger видимый label, panel children; кнопка никогда не вложена в другую кнопку. Имена section triggers уникальны. Не вручную назначай aria-expanded/aria-controls/id на основе guessed SDK IDs: это делает SDK. Применяй собственные className и state selectors. `@layer ui-sdk;` вверху global CSS. Используй существующий локальный стиль, без необходимости web.css/нового icon package. Статический chevron допустим как CSS/aria-hidden текст.

Точный shared/types/analog-location.ts (не менять и не дублировать как новую схему):

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

API нового Passport:

```tsx
// web-client/src/components/AnalogPassport.tsx
import type { Analog, Comparison, ScoringProfile, Source } from '@shared/types/analog-location';
export interface AnalogPassportProps {
  comparison: Comparison | null;
  selectedAnalog: Analog | null;
  profile: ScoringProfile | null;
  sources: readonly Source[];
  loading: boolean;
  errorMessage: string | null;
}
export function AnalogPassport(props: AnalogPassportProps): React.JSX.Element;
```

Внутренний импорт только реального созданного helper:
`import { InfoDisclosure } from './ui/InfoDisclosure';`
Host получает comparison/analog/profile из уже валидированного dataset, а не из сетевого нового источника. selectedAnalog должен принадлежать comparison. Сверка profile.id===comparison.profile_id обязательна; при несогласованности показывай unavailable вместо неправильной аналитики. sources — текущий dataset.sources. Не вызывай fetch из Passport и не меняй Source IDs, scores или feature values.

[IMPLEMENTATION_SPEC]

1. Реальный narrow adoption.

Найди существующую evidence/telemetry/sidebar область B02. Добавь в неё AnalogPassport, заменив дублирующиеся plain technical details. Элемент должен быть виден в реально запускаемом App, а не только в отдельном sample. Отдельно покажи hook-up diff host файла. Если host отсутствует, это BLOCKED, не success. Canvas/Viewport остаётся sibling вне всех collapsible panels и не получает новый key при открытии секций.

2. Analog Passport: продуктовая уникальность через объяснимые доказательства.

Заголовок «Analog Passport» и короткая подпись «Inspect the evidence behind a comparison». Используй четыре InfoDisclosure:

- «Physical profile»: target name/body и, если выбран реальный аналог, его name. Показывай реальные features с quantity, value/unit, method, spatial_resolution_m, support_window_m и period. Null — «Not available» с exact missing_reason. Метры/градусы/°C не смешивать; solar_irradiance_kwh_m2 означает mean daily kWh/m²/day. Geology только существующие classes/method/reasons; не конвертировать в произвольные числа. Viewer walk speed/eye height не относятся к этому science profile.
- «Why this match»: только если selectedAnalog и его comparison/profile согласованы. Total similarity_score показывай как project-defined index, не вероятность обитаемости и не NASA certification. Рядом profile.name отсутствует в контракте: используй profile.id/version и active features count из profile.features, не выдумывай name. Breakdown similarity_pct — per-feature similarity. squared_distance_contribution — contribution to normalized Euclidean squared distance; НЕ процент вклада в общий hybrid score, НЕ pie chart с суммой100%. Формулу не пересчитывай. Покажи coverage как active-profile coverage и объясни, что это не охват всей физики среды.
- «Limits of this comparison»: фактические missing_reason, geology.missing_reason, comparison.excluded reasons, неактивные numeric features по active profile; честно сообщи отсутствие real heightmap/splat/metric registration при соответствующих null/flags. Не выдавай inferred splat за измерение. Не сочиняй «0% risk», «safe», certification, model confidence или общую научную эквивалентность Земли и Луны/Марса.
- «Source evidence»: только referenced sources, разрешённые текущим dataset; собери union source_ids из target/selectedAnalog coordinates, aoi, features, geology, существующих DEM/heightmap/mask/splat assets и calibration_source_ids активного profile. Удали дубликаты, unresolved ID покажи как unavailable, не придумывай Source. Поля: id, provider, product_id, mission, retrieved_at, license и recorded SHA256. Показывай product_url как HTTPS-ссылку только после URL parsing и проверки отсутствия username/password; относительные raw Source.local_path не делай browser download link. Само наличие hash не означает, что текущая сессия сверила raw bytes: подпись «Recorded checksum», не «verified». React text rendering, без innerHTML и без автоматических external requests.

Keys всех списков — существующие stable source/feature/location IDs или комбинация родителя и key. Нет sample coordinates, score placeholders, synthetic terrain, fictional source IDs, preset Earth candidates, demonstration NASA numbers.

3. Empty/error/loading state.

Если comparison=null, покажи «No prepared comparison yet» и короткое объяснение, что сравнение появится после загрузки source-backed dataset. Никаких import/baseline кнопок без реализованного pipeline. При loading сообщи loading; при error показывай краткий status и его технические подробности в InfoDisclosure, сохрани существующую Retry кнопку host. Можно оставить четыре секции с честными empty messages для keyboard/accessibility проверки, но не рисуй fake metric cards. Главное сообщение остаётся видимым без раскрытия.

4. UI и взаимодействие.

English consistently. Desktop — Passport в текущем sidebar; narrow viewport — нормальный document flow без горизонтального overflow и перекрытия canvas controls. Visible focus styles, reduced-motion preference, CSS state selectors по фактическим data-slot/data-open. Не заявляй численные contrast ratios до измерения отрисованных состояний. Details toggle должен работать мышью, Enter и Space; focus остаётся на trigger, Tab входит в реальный открытый panel. Не добавляй собственных keyboard shortcuts.

5. React migration и 3D stability.

В package.json заменяются только согласованные React/types pins плюс два SDK package entries. Остальные необходимые B02 deps не сносить целиком. Получи настоящий lockfile через package manager; не выдумывай integrity. Проверь отсутствие React18 дубликатов и peer warnings. Installation scripts до выполнения читаются; не исполняй неизвестные downloaded commands.
TypeScript остается5.9.3. Исправления React19 typings (React.JSX, useRef initializer, ref callback return) делай по реальным compile errors, не blanket any. Viewer effect owner, один RAF, abort/generation token и async disposal не меняются от disclosure state. Root React.StrictMode сохраняется. Контроль pointer lock только от пользовательского клика; disclosure UI не крадёт управление и не включает WASD из text controls. Main test — повторное раскрытие Passport не размонтирует canvas, не плодит workers и не загружает assets заново.

6. Skill scope.

Agent-ready wiring проверяется только для новых SDK disclosures. Можно использовать `createAgent` из `@ui-sdk/react/agent` в test-only harness, чтобы проверить snapshot accessible names и toggle/open через action. Не добавляй production bridge/registerTools/WebMCP/cloud model: пользователь запросил UI, не новый agent backend. Существующий prepared target selector остаётся доступным; массовая миграция других controls сейчас не требуется. Не помечай regression test `fails`, чтобы скрыть новый B03 дефект; reported failure запускает hotfix.

[SELF_VERIFICATION_TEST]

Сначала сохрани B02 source revision/evidence, затем B03 package+source. Одна сессия writer; native subagent только если реальный supported tool доступен, иначе честно single-session.

1. Реальные команды (сохрани exit codes/raw relevant output):
   npm install
   npm ls react react-dom @types/react @types/react-dom @ui-sdk/core @ui-sdk/react
   npm run typecheck
   npm run test
   npm run build
   npm run e2e
   npm run verify:assets
   Не запускай отсутствующие команды как успешные. Отсутствующие real assets дают явный NOT_VERIFIED/skip, не обещание ground PASS.

2. Новые focused tests в существующем Playwright suite: настоящий InfoDisclosure/AnalogPassport, не переписанная тестовая копия. Empty dataset открывает Passport с честным текстом; на каждой из четырёх кнопок Space/Enter меняют aria-expanded ровно один раз, focus остаётся на trigger; закрытый panel недоступен Tab; названия уникальны; section toggle не меняет canvas owner count. Проверить mobile width и keyboard-only доступ к существующим controls. Не использовать pixel screenshot как доказательство keyboard поведения.

3. Для `createAgent` test используйте test-only HTML/React harness, если нет DOM unit environment. Он импортирует реальные компоненты и SDK, не попадает в production index/build entry. `createAgent` публично экспортируется из @ui-sdk/react/agent; создай `const agent = createAgent()` ДО первого React render в harness. После render agent.snapshot() даёт entries с label/ref/actions; `await agent.act({steps:[{ref:actualLabel,action:'toggle',args:[]}]})` применим, только если snapshot объявляет toggle. Сначала возьми реальные labels/actions из snapshot, проверь четыре ожидаемых названия, затем доступный action и конечный DOM state. Не сочиняй API result fields; сверяй packaged docs/agents.md. Не добавляй jsdom/testing libraries без необходимости и проверки exact versions.

4. React19 regressions: mount→unmount→mount/StrictMode; 20 details toggles и viewport resize; отмена pending load при смене selected; отсутствие второго canvas/RAF/worker. PointerLock WASD/Esc/blur на реальном ground asset — только если asset действительно существует. При отсутствии real ground input это отдельный незакрытый пункт, не успешный тест. Для pure lifecycle unit tests допустимы явно TEST_ONLY mocks, не scientific data.

5. Truthfulness: показать source metadata из actual dataset, null reasons без замен, no external runtime network, no AI SDK import. Не приписывать добавленному UI SDK успешную научную валидацию, FPS или NASA certification.

Финал: task_id B03; exact files changed; React baseline migration rationale; actual installed versions; выполненные checks с exit codes; raw failure/skip list; screenshot только реально полученный; manual keyboard/contrast evidence либо NOT VERIFIED. Укажи какой реальный host теперь использует InfoDisclosure и AnalogPassport. Требуется новый exported source bundle/hash для independent reviewers; старый r1 hash не переиспользуется. Результат B03_GENERATED/TESTED не является human PASS.

Проверенные источники:
https://registry.npmjs.org/@ui-sdk%2freact/0.1.0-beta.1
https://registry.npmjs.org/@ui-sdk%2fcore/0.1.0-beta.1
https://registry.npmjs.org/@ui-sdk/react/-/react-0.1.0-beta.1.tgz
https://registry.npmjs.org/@ui-sdk/core/-/core-0.1.0-beta.1.tgz
https://github.com/vercel-labs/ui
https://github.com/vercel-labs/ui/blob/main/packages/core/skills/ui-sdk/SKILL.md
````
