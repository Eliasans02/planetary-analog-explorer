# Local independent review R1 — bounded configuration evidence

Дата: 2026-11-14. Reviewer: Astra delegated independent code/science/security review. Владелец этого прохода меняет только данный файл. Implementations, shared contract, REPO_STATE и attribution не изменялись.

## Результат и граница scope

**Captured Dev_B r1 configuration: FAIL по подтверждённым расхождениям с dispatch. Полное приложение, B01 и новый local fallback: NOT_REVIEWED. Human PASS: отсутствует.**

Во время этого прохода root приостановил создание fallback implementations для повторного подключения браузера. Оба владельца подтвердили, что новых Python/frontend исходников ещё не записывали. Локальная read-only проверка также показала отсутствие `data-pipeline/fetch_and_score.py` и `web-client/src/components/Viewport3D.tsx`. Это отсутствие evidence, а не доказанный дефект отсутствующего кода. Новый local implementation не объявляется завершённым.

Проверены существующие фактические `incoming/dev_b_config_r1/source/package.json`, `vite.config.ts`, `CAPTURE.md` и соответствующий REVIEW_BUNDLE.json. Это прежняя частичная транскрипция редактора, а не полный экспорт приложения. Замечания ниже независимо подтверждают уже известные CFG issues для этой ревизии; они не переносятся автоматически на B01 и не доказывают, что B01 не исправлен.

Контекст: shared schema/types 1.0.0, `docs/contract_semantics.md`, полные dispatch specifications, `docs/research/CHALLENGE_RESOURCES.json`, RESOURCE_INTEGRATION, challenge addendum и существующий REVIEW_ADJUDICATION. Спецификация не принимается за реализованный код.

## Идентичность проверенного artifact

| Artifact | SHA-256 |
|---|---|
| incoming/dev_b_config_r1/REVIEW_BUNDLE.json | `cc1d785ffbf180904a08119a63a550d224ca1ce0d24fcdf85fa24faaf8cde482` |
| package.json | `bf34b444d8070f3e2e2bb58742a801819997fbd8ef49e4d372a70df160f6c7b0` |
| vite.config.ts | `442b87115d6fa30934a4eaf66507f2e5fb0bef252b1468169688d0cbe4a6b740` |
| CAPTURE.md | `325145d546d5f7ff99ca245d0eb245d52c28dc52bd5f0451cfa5bfa7ce4dc0e3` |

Bundle digest пересчитан в этом проходе. File digests совпадают с ранее независимо проверенным manifest; новая конфигурация или полный B01 artifact не получены. Новый source snapshot должен получить собственный hash.

## Подтверждённые findings

| ID / priority | Evidence | Дефект и предел вывода | Owner / необходимое исправление |
|---|---|---|---|
| LR-R1-001 / P1 | `incoming/dev_b_config_r1/source/package.json:23`, `:30`, `:31`, `:33`, `:38`, `:39`, `:44`; исходные pins: `prompts/LOOP_0_DEV_B.template.txt:71` | 8 обязательных pins не совпадают с согласованными версиями; 19 из 26 direct declarations плавающие. Нарушен зафиксированный dependency contract. Не доказана runtime-несовместимость каждого отличающегося пакета. Соответствует CFG-01. | Dev_B: предоставить исправленный manifest, реальный lockfile и результаты проверки этой ревизии. |
| LR-R1-002 / P1 | `incoming/dev_b_config_r1/source/package.json:18` | В runtime manifest присутствует `@google/genai`, который уже признан выходящим за согласованный static offline runtime scope. Само наличие не доказывает импорт, сетевой вызов, использование ключей или утечку. Соответствует CFG-02. | Dev_B: удалить ненужную runtime SDK dependency; по полному source подтвердить отсутствие скрытого CDN/API replacement. |
| LR-R1-003 / P1 | `incoming/dev_b_config_r1/source/package.json:7` | Default dev command задаёт `--host=0.0.0.0`, а dispatch требует loopback. Проверен текст команды; listener не запускался, фактический внешний доступ не утверждается. Соответствует CFG-03. | Dev_B: default `127.0.0.1`; Studio preview override только отдельно и явно. Проверить нужный режим на фактической новой конфигурации. |
| LR-R1-004 / P2 | `incoming/dev_b_config_r1/source/package.json:14` | `rm -rf dist server.js` зависит от shell и удаляет не обоснованный frontend scope файл. Команда не выполнялась; Windows failure не воспроизводился. Соответствует CFG-04. | Dev_B: удалить неиспользуемый script либо ограничить переносимый cleanup подтверждёнными generated outputs. |

P0 code/science defect в невидимой реализации не заявляется. Известные findings отправлены root сразу после подтверждения. Отдельное наличие Express/dotenv не доказывает их использование или credential access. `__dirname` в Vite config не объявляется гарантированным ESM failure: вывод зависит от реального config loader. Отсутствие ESLint не является новым blocker исходного контракта.

## Локально выполненные проверки

Выполнены только read-only операции: список доступных файлов, чтение JSON/text, поиск точных строк, SHA-256 bundle и сопоставление declared pins. Никакие `npm install`, `pip install`, scripts приложения, `clean`, pipeline или WebGL не выполнялись. Значения credentials не читались.

Результат отдельной JSON-проверки captured manifest:

- Direct declarations: 26; плавающие declarations: 19.
- Несовпадающие обязательные pins: React, React DOM, Vite, plugin-react, TypeScript, @types/react, @types/react-dom, @types/node.
- `@google/genai` присутствует в dependencies.
- Default dev script: `vite --port=3000 --host=0.0.0.0`.
- Local fallback pipeline/viewer entrypoints отсутствовали на момент проверки.

Это не unit/build/runtime PASS. Remote B01 self-report о 29 файлах, unit/typecheck/build и E2E сохраняет статус unverified locally до получения исходников и логов.

## Приоритетные проверки следующего actual source snapshot

Строки ниже — **acceptance checks / missing evidence, не подтверждённые дефекты**.

| Область / приоритет | Что проверить по фактическому коду | Targeted evidence |
|---|---|---|
| Score / P0 | Один фиксированный profile и полный feature mask на cohort; no pairwise weight renormalization; неизменные bounds; quantity/unit/method/support compatibility; source reference integrity | scalar-vs-matrix invariant, добавление/перестановка кандидатов не меняет score, missing required feature исключает кандидата |
| Zero vectors / P0 | Оба нуля → cosine 1; один ноль → 0; отсутствие скрытого epsilon; finite values, shape/weight/alpha/bounds guards | Изолированные dimensionless test-only vectors, NaN/Inf/out-of-range/zero-total rejection; никакие fixtures не экспортируются |
| Scientific semantics / P0 | Air_2m не surface; RH не aridity; P/PET не имитируется на Луне; spectral albedo/method/period matching; topography-only не называется полной пригодностью | Negative semantic tests и прослеживаемый фактический export |
| DEM / P0 | Маска NoData, scale/offset/vertical units, одинаковая physical resolution/window, отсутствие upsampling как новых измерений, gradient boundary policy | Реальные labels/metadata + маленькие изолированные mathematical tests; valid fraction и derivatives только на допустимой support |
| Pixel/coordinate semantics / P0 | Приобретённый LOLA raster описан как PixelIsArea/MOON_ME-DE421; runtime heightmap требует grid nodes/local metres. Нужна настоящая конверсия/обоснование, а не relabel | Путь через исходный label → sample coordinates → node extent/origin → explicit body frame; Earth EPSG не применяется к Луне |
| Pipeline IO / P0 | Offline запрещает сеть, в prepare разрешены только declared destinations; bounded request/read/retry, redirect policy, fail closed; outputs atomic | Offline network trap, cache miss failure, невалидный ответ/слишком большой payload не меняет last-good output |
| Paths / P0 | Resolved source/public roots, traversal и symlink escapes; source URLs не становятся runtime URLs; секреты не экспортируются | Adversarial relative paths, symlink/redirect tests в разрешённой temp area; никакого credential dumping |
| Browser allocations / P0 | Same-origin asset paths, finite integer sizes, schema + semantic validation, preallocation budget и фактическая byte-length/hash проверка | Malformed metadata/body-size/redirect rejection до больших allocations; 257² terrain, 250000 splats, 64 MiB scene budget из dispatch |
| Browser lifecycle / P0 | Один renderer/RAF, serial async viewer disposal, abort/generation guards, worker termination, StrictMode и смена selected без stale scene | Реальные lifecycle tests/owned counters на 20 переходах; headless skip не считается WebGL acceptance |
| DEM/splat fallback / P0 | Реальный DEM остаётся доступен при missing/failed splat; geometry registration и metric scale; inferred depth не источник collision/science | Actual assets + failure/abort test; общий frame и triangle interpolation; mask gaps не перекрываются |
| Credentials/dependencies / P1 | Точные pins/lock provenance, install hooks до установки, loopback default, отсутствие незаявленных SDK/CDN/API; helper scripts только согласованные outputs | Full manifest/lock/source scan, осмотр hooks без исполнения, затем ограниченные local checks |
| Resource/discovery chain / P1 | Listed resource membership ≠ acquired product ≠ derived feature ≠ UI use; known baseline ≠ новый кандидат | Resource ID/product relation/raw hash/method/UI chain; fixed sourced baseline/search domain/grouping и честная novelty label |

Frontend budgets — инженерные ограничения конкретного dispatch, не физические константы NASA. Byte limits должны проверяться по фактически полученным данным; одному declared Content-Length доверять недостаточно.

## Что остаётся непроверенным

- Любая реализация score/terrain/validation/export и её реальные данные.
- Actual Viewport3D, assets loaders, workers, controls, disposal, fallback и runtime requests.
- Полный B01 source/lockfile и подтверждение исправления CFG findings.
- End-to-end listed NASA resource use, реальный Earth DEM, sourced AOI, calibration, discovery, score и карта.
- Ground/splat navigation, offline demo, FPS/RAM, headless/headed integration.
- Полная проверка новых local sources, которые могли быть записаны после данного snapshot.

Следующий независимый проход начинается после передачи конкретных файлов/revision/hash. Read-only targeted checks запускаются только после согласования с владельцами, чтобы не конкурировать с установкой или записью artifacts. Findings с фактическим file:line немедленно передаются владельцу/root; воспроизведение незаметно не превращается в собственное исправление reviewer-а.

Оба человеческих PASS и global phase gate остаются pending. Этот документ не разрешает PHASE_5 и не объявляет fallback implementation выполненной.
