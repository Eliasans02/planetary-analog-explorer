# Analog Passport: проверяемое отличие Planetary Analog Explorer

Статус: выбранное продуктовое направление для текущего development loop; реализация и user acceptance не подтверждены. Эта стратегия не меняет contract 1.0.0 и не создаёт scientific observations.

PAE должен помогать понять, **для какого исследования земная площадка похожа на заданный лунный или марсианский участок, где сходство заканчивается и как проверить вывод**. Рабочая единица — Analog Passport: связанная с конкретной парой площадок карточка доказательств, которую можно открыть рядом с синхронным 3D-view. Это проектная гипотеза отличия; конкурентное исследование и исключительная новизна не доказаны.

## Продуктовое ядро

Один экран связывает четыре проверяемых вопроса:

| Вопрос пользователя | Что показывает Passport | Основание в текущем контракте |
|---|---|---|
| Почему найден этот аналог? | Фактические target/candidate значения, единицы, одинаковый метод и per-feature similarity; итоговый индекс только из активного профиля. | `Comparison`, `Analog.similarity_score`, `Analog.breakdown`, `Location.features`, `ScoringProfile.features` |
| Где сравнение ограничено? | Неактивные и missing признаки, разные quantities/periods, доступность geology и поверхности; отсутствие данных не трактуется как физическое различие. | `missing_reason`, `quantity`, `method`, `period`, `geology`, активные keys профиля |
| В каком масштабе это верно? | Общая resolution/window, реальный AOI, datum/frame и ограничения покрытия. Нельзя сравнивать 5 m и 30 m как одинаковую детализацию. | `comparison_resolution_m`, `window_m`, `Feature.spatial_resolution_m`, `support_window_m`, `aoi`, `heightmap` |
| Откуда результат и как повторить? | Exact product/version, источник, локальный hash, processing/QA evidence и revision профиля; offline scientific artifacts. | `Source`, `source_ids`, asset hashes, `ScoringProfile.id/version`; acquisition/processing sidecars |

Наиболее важная формулировка — не обещание «похож на Марс», а ограниченное утверждение о выбранных наблюдаемых свойствах и масштабах. Например, UI может объяснять, что сравнение основано только на топографии, **если именно такой профиль находится в полученном dataset**. Никакие sample percentages, температуры, координаты, высоты или FPS не включаются в пустой экран или mockup как реальные данные.

## Что доступно без изменения shared schema

Passport реализуется как frontend view model поверх существующего `Comparison`; сохранять новые незаявленные поля внутри strict `locations_dataset.json` запрещено. Измеренные значения и breakdown читаются напрямую, computed labels не подменяют scientific values. Геологический контекст остаётся отдельным категориальным блоком. Кнопка источника открывает исходную product page по явному действию пользователя; подготовленный demo не загружает внешние данные автоматически.

Профиль и общее число активных keys должны быть видны рядом с индексом. `coverage=1` означает полноту действующего профиля, а не полноту всех свойств Луны/Марса. Per-feature percentages не суммируются в total score. Ни score, ни цвет карточки не сообщают вероятность пригодности для базы, безопасность экспедиции или одобрение NASA.

Пространственная привязка: Pegman выбирает только подготовленный реальный AOI и явно показывает snapping. Необработанный drop даёт понятное «участок ещё не подготовлен» без числа. Ground mode доступен после валидации DEM/mask/camera. Splat, если появится, несёт reconstruction/registration label; single-image inferred geometry не становится источником уклонов или расстояний.

Полное описание области поиска и baseline — отдельное versioned research/processing evidence. Contract 1.0.0 не содержит search-domain manifest, поэтому первый UI показывает только реально известный scope: «среди подготовленных площадок». Пока отдельный search evidence не принят и не передан через согласованную границу, нельзя подписывать результат «лучший на Земле» или «новый найденный кандидат».

## Новые кандидаты: честный bounded search

Известные Atacama, McMurdo Dry Valleys, Mauna Kea, Iceland Highlands, Charyn/Mangystau и именованные лунные/марсианские регионы — отправные research labels. Название не определяет AOI, координаты, landability или пригодность данных. Baseline состоит из документированных реальных полигонов с source/version/hash; membership фиксируется до оценки новых кандидатов.

Researcher выбирает один ограниченный земной домен, который реально покрывается доступным DEM и допускает воспроизводимую обработку. Первый практический вариант исследуется вокруг точного SRTMGL1 V003 N19W156 product: метаданные уже проверены, но защищённый elevation ZIP ещё не получен. Его нельзя объявлять принятым доменом или готовым ROI до acquisition и проверки geometry. Для lunar target уже имеются PGDA LOLA Site04 raw products, но CRS/vertical-reference, quality mask, ROI и calibration ещё требуют review. Это конкретные кандидаты для подготовки, не завершённая scientific pair.

После проверки продуктов pipeline должен:

1. Зафиксировать source-backed domain boundary, baseline polygons, body/frame, source coverage, common metric window/resolution, stepping/overlap policy, masks и quality thresholds **до** ранжирования.
2. Систематически сформировать candidate windows на допустимом реальном покрытии; locations — производные documented geometry, а не случайные координаты. Исключить недостаточное покрытие и неподдерживаемые преобразования.
3. Считать один и тот же набор признаков с одной calibration/profile version для baseline и всех допустимых кандидатов. Отсутствие значения не разрешает смену weights или feature set для отдельной пары.
4. Отделить кандидатов вне baseline по явно определённому пространственному правилу, учитывая overlap и соседние окна. До выбора правило фиксируется как проектная методика, а не выдаётся за NASA standard.
5. Экспортировать actual searched footprint, evaluated/excluded counts и причины, spatial grouping и ranking evidence. Счётчики вычисляются из обработки, не записываются из плана.
6. Показать новый результат только как «кандидат, найденный этим поиском вне зафиксированного baseline». Никакого world-first или глобальной полноты при локальном домене.

Хорошее отличие — возможность воспроизвести, почему этот кандидат выше других в **том же** домене и профиле, и увидеть, как обоснованная новая версия профиля меняет ranking. Визуальный UI-experiment с весами допустим только как отдельный явно помеченный исследовательский режим после контрактного решения; он не должен молча переписывать принятую offline оценку.

## Задачи ближайшего цикла

| Владелец | Атомарная задача | Проверяемый результат |
|---|---|---|
| Astra | Получить Dev_A export и завершённую B02 ревизию; проверить bytes, пути и hashes. | Локальный полный source bundle, actual inventory, единый revision для review. |
| Dev_B | Добавить Analog Passport после согласования B03 SDK/React migration. | Компонент из действительного `Comparison`, honest empty/error states, keyboard access, no fake telemetry, typecheck/build/tests. |
| Dev_A | Проверить API boundary и поддержать real-data traceability для принятого pipeline. | Источник → QA/method → derived asset → feature; fixed-profile scores проверяются независимо. |
| Researcher | Предложить один конкретный bounded search domain и исходные продукты/правила baseline. | Exact URLs/identifiers, coverage и access status, reproducible geometry proposal, unresolved blockers. |
| Code Reviewer | Проверить все показанные объяснения на совпадение с algorithm и contract. | Findings по actual files/hash: без invented observations, смешения units/quantity и misleading ranking. |
| Security Evaluator | Проверить source links, asset allocation, downloads, paths и offline boundary. | Findings по тому же source hash; без выполнения непроверенных download/install scripts. |
| Requirements Manager | Проверить отличие между сравниванием curated sites и поиском новых кандидатов. | Evidence matrix: scope, baseline, search execution, new candidate, provenance, UI; неподтверждённое остаётся NOT_VERIFIED. |
| Stitch | Проверить actual Passport hierarchy и взаимодействие. | Доступный inspected screenshot/flow либо честно ограниченный indirect review; placeholders явно UI-only. |

Роль reviewer не создаёт patch, который затем независимо одобряет. Dev_B не рассчитывает новые научные scores на main thread. SDK-компоненты используются для presentation, а жизненный цикл Three.js/WebGL, камера и scientific data validation остаются явно управляемыми.

## Условия приёмки отличия

- Пользователь может проследить **каждое видимое scientific число** до фактической feature/source/derived asset; отсутствующие inputs явно обозначены.
- Две площадки сравниваются при одном documented quantity, method, physical support и profile. Противоположная thermal quantity не скрывается за одинаковой единицей °C.
- Список причин показывает и сильное сходство, и ограничения, без заявления, что missing data доказывает различие.
- Ranking scope не шире фактически обработанной области. «Новый кандидат» требует frozen baseline и реально завершённого поиска за его пределами.
- Реальный DEM и source attribution работают в offline demo; отсутствие splat не маскируется синтетическим landscape.
- Весь evidence привязан к текущим raw/derived/source hashes. Нужны независимые review, local checks и оба human PASS; документ стратегии сам по себе ничего из этого не подтверждает.

## Доказательства и ограничения на стартовом срезе

`docs/research/acquisition_status.json` фиксирует actual LOLA bytes и CMR metadata; `docs/research/CHALLENGE_RESOURCES.json` различает перечисленные пользователем ресурсы и отдельно проверенные providers; `docs/research/CHALLENGE_RESOURCES_RESEARCH.json` содержит доказанный Earthdata → SRTM metadata/download relationship. `docs/orchestration/CHALLENGE_ALIGNMENT_REVIEW.md` и `REQUIREMENTS_CHALLENGE_ADDENDUM.json` фиксируют незакрытый search/new-candidate gap. Ни один из этих документов не является готовым scientific dataset или доказательством frontend integration.

Текущая работа делает продуктовую гипотезу конкретной и проверяемой. Коммерческая/научная исключительность, превосходство над существующими инструментами и факт обнаружения нового аналога пока не исследованы и не заявляются.
