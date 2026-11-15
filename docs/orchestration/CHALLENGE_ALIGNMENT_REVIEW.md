# Challenge alignment review — discovery beyond a curated benchmark

Дата: 2026-11-14. Тип работы: traceability review и предлагаемые критерии проекта. Это не implementation PASS, не проверка научных результатов и не изменение REPO_STATE или контракта 1.0.0.

## Вывод

Существующий план позволяет успешно сравнить заранее выбранные известные аналоги, но не требует найти новый кандидат за пределами этого списка. Это существенный пробел относительно цели челленджа: выявлять и характеризовать новые земные аналоги с помощью открытых данных Земли, Луны и Марса и представлять результаты как карту, визуализацию или другой инструмент. Такой смысл подтверждён доступным описанием [официальной страницы челленджа](https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/).

Curated baseline полезен как контрольный набор для проверки метода и демонстрации интерфейса. Один только рейтинг Atacama, McMurdo, Mauna Kea и других заранее названных мест не доказывает выполненную задачу поиска новых кандидатов. Это вывод о достаточности нашей реализации, а не выдуманная формальная NASA rubric или оценка судей.

## Граница проверенного источника

- Пользователь предоставил [официальную вкладку Resources](https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/?tab=resources), затем полный текст её списка из 11 ресурсов. Membership evidence теперь имеет тип `user_provided_page_content`; это отличается от независимого получения страницы инструментом.
- NASA: Earthdata Search, Worldview, Planetary Data System, LRO mission archive, Diviner. CSA: RCM, RADARSAT-1, SAR tutorial. ESA: Copernicus Data Space, Open Science Catalog. JAXA: G-Portal.
- Точные target URLs, доступность, продукты внутри архивов, лицензии и связь с приобретёнными файлами проверяются отдельно. Текст названия портала не доказывает выбранный granule или фактическое использование данных.
- Нельзя объявлять весь существующий source registry официальным списком Resources. Для каждого продукта нужна доказанная связь: listed archive child, related external product, external supplement или supporting documentation. Например, скачанный PGDA LOLA TIFF не следует называть явно перечисленным в Resources только потому, что там упомянут LRO.
- Из описания следует задача поиска и характеристики аналогов; оно не устанавливает нашу cosine/Euclidean формулу, 60 FPS, Gaussian Splatting, ровно три результата или Apache-2.0 как единственную разрешённую лицензию.
- Формула, стек, offline-first, 60 FPS, top-3 и выбранная лицензия оригинального кода — требования пользователя/решения проекта. Они сохраняются. Лицензии данных и зависимостей проверяются отдельно; это review не заменяет проверку правил участия.

## Разрыв с текущими требованиями

| Текущий пункт | Что он покрывает | Чего не требует |
|---|---|---|
| REQ-011, LOOP_1 | Реальная цель и три валидных Earth-кандидата | Выход за заранее выбранный каталог, генерация кандидатов из search domain |
| REQ-012 | Покрытие названных регионов и честная площадь поиска | Versioned known-analog baseline и свидетельство новизны относительно него |
| REQ-004/005/013 | Воспроизводимый индекс и фиксированная калибровка | Отсутствие выбора кандидатов задним числом по желаемому score |
| REQ-016/017/021 | Выбор AOI, Pegman, сравнение сцен | Карта исследованной области, новых/известных/исключённых кандидатов |
| REQ-019/032 | Телеметрия, provenance и честные ограничения | Отдельное объяснение, почему кандидат предложен как новый и насколько устойчив вывод |

Добавленный файл REQUIREMENTS_CHALLENGE_ADDENDUM.json хранит независимые CHAL-001…CHAL-009. Он дополняет, а не переписывает 32 первоначальных требования. CHAL-001 имеет PARTIAL благодаря предоставленному списку и проверенной guidance; остальные критерии имеют NOT_VERIFIED. Это не implementation PASS; существующий reviewer baseline не пересчитывается без новых evidence.

## Resource-to-result traceability

Ответ Nick-GO-Team от 6 ноября 2026 года говорит, что для Global Awards необходимо использовать хотя бы один NASA data source из Resources соответствующего челленджа. Ответ находится в треде другого челленджа и имеет общую формулировку; здесь он служит основанием для проверки evidence, а не заявлением об eligibility нашей команды. Дополнительные партнёрские источники в этом ответе описаны как рекомендуемые, необязательные. [GO Team guidance, discussion #1849](https://github.com/nasa/spaceapps/discussions/1849).

Для минимум одного действительно используемого NASA источника требуется полная цепочка:

`challenge_resource_id → verified relationship → selected product/version/access URL → local raw path + SHA-256 → derived feature/artifact + method → exported location/asset ID → actual UI use`

Каждый ID должен разрешаться в зафиксированном реестре. Baseline reference, открытая страница, download без обработки или декоративный логотип не заменяют использование данных. В цепочке различаются научные measurements и supporting documentation. Для карты/изображения допустима подтверждённая визуальная роль, но нельзя приписывать ей невычисленные физические параметры.

Проверка включает источник membership (`user_provided_page_content`), отдельную primary-target verification, product lineage, реальный hash, воспроизводимое преобразование и доказательство потребления экспортированного результата UI. Партнёрские/внешние продукты сохраняют собственные отношения и лицензии; они не становятся NASA-only или официально перечисленными через переименование. Acquisition bytes без derived/UI-use evidence не закрывают CHAL-009.

## Что в этой версии означает «новый»

Использовать ограниченное утверждение: «Новый кандидат относительно baseline версии B, найденный нашим поиском в области D; требуется дальнейшая проверка». Это не заявление о первом мировом открытии и не утверждение о NASA-approved landing site.

До ранжирования фиксируются:

1. Baseline: реально документированные известные аналоги, источники, геометрии или ограничения их пространственной определённости, версия и дата отсечения.
2. Search domain: реальный полигон/footprint доступных геоданных, источники границы и физическая поддержка анализа.
3. Политика исключения baseline: правило spatial overlap/separation и обращения с неопределёнными границами. Порог — объявленный параметр поиска, не наблюдённая константа NASA.
4. Правило candidate grouping: соседние похожие окна не объявляются независимыми новыми местами только ради заполнения top-3.
5. Фиксированный profile и screening rules до просмотра итогового рейтинга. Калибровка не переоценивается на выбранных победителях.

Неизвестные точные границы известного аналога не означают отсутствие пересечения: novelty остаётся unresolved. Отсутствие результата в одном поисковом запросе также не доказывает мировую новизну. Researcher хранит источники/запросы проверки известности и явно ограничивает охват baseline.

## Практический минимальный discovery slice

Предлагаемый минимальный критерий команды: найти и воспроизводимо обосновать хотя бы один пригодный кандидат вне документированного baseline посредством систематического поиска. Это наш тест приёмки, а не подтверждённый NASA минимум. Исходное требование top-3 остаётся отдельным: если пригодных независимых результатов меньше трёх, интерфейс показывает реальное количество и не объявляет top-3 выполненным.

- Выбрать ограниченный участок Earth coverage, который действительно можно обработать за хакатон. Не нужно обещать миллионы квадратных километров до измерения покрытия.
- Построить воспроизводимую сетку или детерминированный набор окон из геопривязки реальных источников. Это производные области анализа, а не выдуманные наблюдения или «официальные NASA полигоны». Записать преобразование координат, origin/spacing/window и stable candidate IDs.
- Для всей объявленной области сохранить количество сгенерированных, исключённых и пригодных окон. Площадь вычислять по объединению обработанного footprint в подходящей системе координат, не суммой перекрывающихся окон.
- Извлечь features из настоящего DEM с одинаковыми effective resolution, physical support, methods и masks у цели и каждого кандидата. Проверить научную семантику before scoring.
- Ранжировать одинаковым замороженным профилем. Curated baseline использовать для сравнения; пометка known/discovered не должна менять математический score.
- Проверить shortlisted ROI: настоящий источник, валидность данных, spatial separation/overlap с baseline и независимость от соседнего окна. Группировка и tie-break правила должны воспроизводиться.
- Отобразить карту search domain и реальных candidate AOI с известными аналогами, exclusion/coverage, source links, profile и объяснением выбранных признаков. Ground mode доступен только при наличии настоящих подготовленных assets.

При topography-only профиле допустим вывод «кандидат морфологического аналога». Без соответствующих измерений нельзя расширять его до температурной, геологической или общей пригодности базы. Lunar/Mars environment не воспроизводится на Земле целиком.

## Уверенность, ограничения и characterization

Для кандидата необходима не только цифра score:

- Источники, effective resolution, valid fraction, метод/окно, datum/CRS и семантика признаков.
- Имеющиеся QA/uncertainty слоя и их ограничения. Отсутствующую численную неопределённость обозначать not_quantified.
- Анализ чувствительности ранга к заранее описанным обоснованным вариантам profile/масштаба. Это rank stability, а не confidence interval или вероятность пригодности.
- Повторная проверка извлечения shortlisted ROI с сохранёнными исходниками. Она подтверждает воспроизводимость; не называть её независимым наблюдением.
- Причина предложения кандидата, сопоставление с known baseline и ограничения: что совпало, что не измерено/не сопоставимо, что требует field validation.

Нельзя придумывать error bars или статистическое распределение для получения красивой уверенности. Декоративная картинка, AI inferred depth и UI telemetry не становятся источниками доказательств.

## Задачи по ролям и loop

| Роль | Следующий атомарный вклад | Evidence |
|---|---|---|
| Researcher | Зафиксировать user-provided membership всех 11 Resources, проверить target/product relations; собрать known-analog baseline и реальные coverage products | Resource-ID/product relations, baseline/version/source URLs, geometry uncertainty, acquisition candidates |
| Dev_A | В LOOP_1 добавить воспроизводимый candidate enumeration вне baseline, matched-scale extraction, grouping, ranking и sensitivity report | Search manifest, полный accounting, параметры/версии, source hashes, shortlist GeoJSON и отчёт |
| Dev_B | В LOOP_1 показать search extent и различие known/new candidates; раскрывать baseline-relative novelty и limitations | Реальная карта, выбранные ID, source/profile UI; позже split-screen в LOOP_2 |
| Code Reviewer | Проверить leakage/cherry-picking, invariance профиля, counts/area/grouping и заявления о новизне | Review конкретного hash плюс tests/logs и неизученные области |
| Security Evaluator | Проверить безопасные загрузки/пути и allocation budgets для расширенного candidate export | Review того же source artifact; без изменения научных критериев |
| Requirements Manager | Добавить CHAL evidence к исходной матрице без превращения подготовленного плана в PASS | Ссылки на каждую CHAL acceptance check и открытые gaps |
| Astra | Согласовать additive discovery sidecar и передать всем одну ревизию контракта/промптов | Зафиксированный контракт/manifest; оба human PASS остаются обязательными |

LOOP_0: только подготовка discovery contract и baseline research, без заявления продвижения фазы. LOOP_1: bounded discovery slice вместе с текущим real-data slice. LOOP_2: исследование подтверждённых новых кандидатов в split-screen/splat при наличии assets. LOOP_3: повторяемый offline поиск, карта и проверка всех заявлений для pitch.

## Предлагаемая граница контракта

Не добавлять поля в strict analog_location.schema.json без согласования: additionalProperties:false сделает такой JSON невалидным. Существующий Location/Comparison способен хранить подготовленные shortlisted ROI и scores; он не хранит baseline version, поисковую область, полный candidate accounting или novelty evidence.

Для следующего согласованного контракта предложен отдельный discovery-manifest/GeoJSON sidecar с ссылками на существующие location_id/profile_id. Обсуждаемые поля: run_id, baseline_version/hash, target_id, profile_id/version/hash, search_domain asset/source refs, grid/window specification, exclusion/grouping policy, candidate counts и area, selected IDs, novelty status/evidence, uncertainty/sensitivity report refs. Это описание будущего интерфейса, не созданный валидированный dataset и не разрешение односторонне менять shared.

## Приёмка и текущее решение

Сейчас discovery и full resource-to-UI evidence отсутствуют; CHAL-002…CHAL-009 остаются NOT_VERIFIED. Даже наличие acquired raw NASA файлов не доказывает candidate search, validated ROI, characterization или discovery.

Сохранить curated sites как benchmark, добавить bounded search как обязательный проектный gap для соответствия намерению челленджа. После реализации проверить воспроизводимость, происхождение и карту, затем получить оба человеческих PASS для общей ревизии. Этот review не продвигает LOOP и не закрывает текущие FAIL/транспортные ограничения.
