# Review adjudication — Dev_B configuration r1 and Stitch DESIGN02

Снимок решения Astra: 2026-11-14. Подтверждён частичный FAIL конфигурации Dev_B r1. Полное приложение, исправленная ревизия B01 и наземная демонстрация локально не приняты. Этот документ не изменяет REPO_STATE и не заменяет human PASS.

## Доступное evidence и границы проверки

Локально просмотрены [package.json](../../evidence/dev_b_config_r1/package.json), [vite.config.ts](../../evidence/dev_b_config_r1/vite.config.ts), [CAPTURE.md](../../evidence/dev_b_config_r1/CAPTURE.md) и соответствующий [REVIEW_BUNDLE.json](../../incoming/dev_b_config_r1/REVIEW_BUNDLE.json).

CAPTURE.md фиксирует получение двух исходных файлов из настоящего редактора AI Studio через Select All / Copy. Это UTF-8/LF транскрипция текста редактора; она не выдаётся за побайтовый экспорт исходного проекта. Успешный скачанный ZIP полного приложения отсутствует. Локально не запускались зависимости, исходники приложения или его scripts.

Проверенная identity частичного artifact:

| Объект | SHA256 |
|---|---|
| Переданный REVIEW_BUNDLE.json | `cc1d785ffbf180904a08119a63a550d224ca1ce0d24fcdf85fa24faaf8cde482` |
| Archive, указанный внутри bundle | `259813950fdbddd4bfc5a1811ffe288b8b1bb2c22c305bef7014f07f604b95f3` |
| package.json | `bf34b444d8070f3e2e2bb58742a801819997fbd8ef49e4d372a70df160f6c7b0` |
| vite.config.ts | `442b87115d6fa30934a4eaf66507f2e5fb0bef252b1468169688d0cbe4a6b740` |
| CAPTURE.md | `325145d546d5f7ff99ca245d0eb245d52c28dc52bd5f0451cfa5bfa7ce4dc0e3` |

Digest REVIEW_BUNDLE.json пересчитан локально. Размеры и SHA256 всех трёх manifest entries сверены с файлами в `evidence/dev_b_config_r1/` и `incoming/dev_b_config_r1/source/`. Archive digest приведён из bundle; он обозначает упаковку частичного capture и не доказывает получение полного ZIP из AI Studio.

Внешние Code Reviewer и Security Evaluator сообщили FAIL частичного source review. Сводки их ответов и B01/DESIGN02 ниже получены из телеметрии сессий Astra; отдельных сохранённых JSON-отчётов этих ответов в просмотренном local evidence нет. Подтверждение выводов выполнено по доступным исходникам, а не простым принятием каждого утверждения reviewer-а. Native delegation в reviewer-сессиях недоступна: каждая была одной сессией. Имитация внутренних subagents не считается дополнительной независимой проверкой.

## Принятые замечания к конфигурации

Нормативный контекст: [исходный dispatch Dev_B](../../prompts/LOOP_0_DEV_B.md), секции точных зависимостей и SELF_VERIFICATION_TEST.

| ID | Подтверждённый факт | Решение и предел вывода | Условие закрытия |
|---|---|---|---|
| CFG-01 | 19 из 26 direct dependency declarations используют `^`. React/React DOM — `^19.0.1`, TypeScript — `^7.0.2`, Vite — `^8.3.0`, plugin-react — `^6.1.1`; dispatch требует точные React 18.3.1, TypeScript 5.9.3, Vite 8.3.8, plugin-react 6.3.0 и соответствующие types. | Подтверждённое нарушение зафиксированного dependency contract и воспроизводимости. Это не доказательство runtime-несовместимости каждой новой версии. | Исправленный package.json, локально созданный lockfile, сверка всех требуемых pins и raw install/typecheck/test/build logs той же ревизии. |
| CFG-02 | `dependencies["@google/genai"]` равно `^2.4.0` (строка 18). | Нежелательная SDK-зависимость для согласованного статического offline runtime; удалить из этого scope. Наличие пакета само по себе не доказывает импорт, передачу данных, использование ключей или network request. Такие обвинения не принимаются без source/network evidence. | Исправленные package/lock, поиск фактических imports/calls в полном source и runtime network evidence. Не заменять удаление пакета скрытым CDN импортом. |
| CFG-03 | `scripts.dev` содержит `--host=0.0.0.0` (строка 7), тогда как dispatch задаёт loopback `127.0.0.1`. | Подтверждённое расхождение default local-demo команды. При её выполнении намерение конфигурации — слушать все интерфейсы; фактический listener локально не запускался. Это не доказательство произошедшего внешнего доступа. | Default local dev остаётся loopback. Если AI Studio требует доступ к preview через иной интерфейс, выделить явный Studio-only opt-in script/setting и проверить оба режима отдельно. |
| CFG-04 | `scripts.clean` равно `rm -rf dist server.js` (строка 14). | Подтверждён shell-dependent leftover scaffold. Команда не была выполнена; Windows failure не воспроизведён. Удаление `server.js` не обосновано текущим static frontend scope. | Удалить неиспользуемый clean script либо заменить переносимым ограниченным cleanup только известных generated outputs. До удаления проверить resolved paths; не выполнять старую команду для демонстрации проблемы. |
| CFG-05 | Test/build tooling и type packages размещены среди runtime dependencies. | Небольшое замечание к manifest grouping и установочному следу. Само по себе не доказывает включение tooling в browser bundle и не является самостоятельной security-уязвимостью. | Разнести tooling/types в devDependencies при исправлении manifest; итог проверить сборкой. Не расширять это замечание до полного FAIL приложения. |

Среди дополнительных packages присутствуют Express/dotenv и другие элементы scaffold. Без остальных source files их неиспользование не доказано. Их необходимость надо установить по imports/entrypoints в полном snapshot; предпочтение минимальному static scope не заменяет этот анализ.

## Утверждения, не принятые как доказанные дефекты

**`__dirname` и native ESM.** `vite.config.ts` действительно использует `__dirname`, а package.json содержит `type: module`. Из этих двух фактов нельзя заключить, что обычный запуск Vite неизбежно падает: Vite по умолчанию предварительно собирает конфигурацию, а `bundleConfigFile` версии 8.3.8 инжектирует значение `__dirname`. Это подтверждено [официальным описанием config loaders](https://vite.dev/config/) и [исходником Vite v8.3.8](https://github.com/vitejs/vite/blob/v8.3.8/packages/vite/src/node/config.ts). Blanket finding о гарантированном native-ESM failure отклонён. Реальный startup ещё предстоит проверить с зафиксированной версией и фактическим loader. Если проект явно выберет native loader, его совместимость проверяется отдельно.

**`server.fs.allow` и sibling shared.** Source выбирает `../shared` при наличии и `./shared` иначе; явного fs.allow нет. Недостаёт полного layout, workspace markers, tsconfig/import graph и dev-server trace. Vite использует workspace detection и правила доступа к импортируемым файлам; отсутствие одной опции не доказывает 403. [Официальные правила server.fs](https://vite.dev/config/server-options#server-fs-allow) подтверждают зависимость от контекста. Замечание оставлено как runtime integration check: воспроизвести локальный monorepo import `@shared` и отдельно Studio layout. Не открывать весь родительский filesystem и не отключать fs.strict ради гипотетической ошибки. Явное минимальное разрешение допустимо только при подтверждённой необходимости.

**`lint = tsc --noEmit` без ESLint.** Это alias проверки типов, а не полноценный lint. Однако ESLint не был обязательным acceptance check LOOP_0; требуемый `typecheck` присутствует. Требование добавить новую lint-систему отклонено как scope expansion. Можно уточнить название/documentation, но отсутствие ESLint не блокирует текущий контракт.

## Ответ Dev_B B01

Удалённая Dev_B-сессия сообщила об исправлении основных конфигурационных замечаний. Статус: **CLAIMED_FIXED — SOURCE_AND_TEST_EVIDENCE_PENDING**.

Исправленный полный source, lockfile и raw результаты всех обязательных проверок локально ещё не получены. Поэтому CFG-01…CFG-04 не закрыты по одному сообщению генератора; прежний r1 hash не может обозначать B01. Новая ревизия должна иметь собственный artifact digest. Факт remote self-report не превращается в local build PASS, независимый review PASS или human Dev_B PASS.

## Stitch DESIGN02

DESIGN02 завершён в рамках этого раунда. Внешняя живая ссылка упёрлась в sign-in barrier; screenshot file в Stitch не поступил. Review основывался только на текстовом описании Astra настоящего screenshot 1440×900. Это косвенный review описанного экрана; Stitch не проверил живую страницу, клавиатурное взаимодействие, DOM, вычисленные цвета или адаптивную верстку.

Приняты как ограниченные UX-направления для текущих состояний:

- Простое empty state с честным сообщением об отсутствии подготовленного dataset.
- Сворачиваемые технические подробности ошибки/метаданных, не заслоняющие основное действие.
- Последовательный английский язык интерфейса.
- Доступный выбор имеющихся targets клавиатурой как дополнение к Pegman.
- Разделение измерений из dataset и настроек viewer; пользовательские preferences не выглядят научными показателями.
- Адаптивная боковая панель с сохранением основных действий на узком экране.

Не приняты как новые требования или подтверждённые результаты:

- Новый `.geojson` import flow: его нет в согласованном LOOP_0 contract, описание UI не создаёт разрешённый parser/pipeline.
- Кнопка bundled baseline dataset при отсутствии настоящих локальных assets: нельзя обещать загрузку несуществующего научного набора.
- Утверждение, что текущая keyboard navigation сломана: функционального теста не было. Доступность остаётся acceptance check.
- Обещанные contrast ratios/соответствие порогам без измерения фактических цветов.
- Новые shortcuts, отсутствующие в согласованном взаимодействии; WASD/мышь/Esc и доступный target selection остаются текущим scope.

Stitch заявил об очистке canvas от выдуманных FPS, certification и «0% risk». Это **CLAIMED_CHANGED**, а не независимо проверенный результат: обновлённый canvas/screenshot/source не был просмотрен в этом adjudication. Весь mockup не одобрен. Дальнейший Stitch dispatch в этом раунде не требуется; проверка выбранных UX-изменений выполняется на полученном реальном интерфейсе.

## Следующий evidence gate

1. Получить actual B01 source и lockfile. При недоступном архиве разрешён явно маркированный partial editor capture, но его scope ограничивается полученными файлами; полный app acceptance остаётся недоступен.
2. Подготовить новый immutable review bundle и manifest. Локально вычислить SHA256 точных bytes нового REVIEW_BUNDLE.json, сверить file sizes/hashes. B01 digest пока **PENDING_SOURCE_ACQUISITION**; никакого placeholder hash вместо реального значения.
3. Передать обоим reviewer-ам один и тот же новый artifact/digest. В отчётах `reviewed_artifact_sha256` должен совпадать с ним. Просить закрыть CFG-01…CFG-04 по исходникам, не переносить их r1 verdict автоматически; CFG-05 остаётся небольшим manifest cleanup.
4. До dependency installation осмотреть фактические package/lock/scripts. Затем получить привязанные к новой ревизии команды, exit codes и raw logs: typecheck, unit tests, build, e2e и asset verification. Проверить реальные Vite startup/shared imports на Windows и Studio-only opt-in отдельно. Неподготовленные real-assets/WebGL проверки остаются явными skip/NOT_VERIFIED.
5. При наличии source принять только подтверждённые bounded UX-изменения; keyboard/contrast/responsive claims проверить на actual UI. Не добавлять вымышленные baseline данные, scientific metrics или certification.

На текущем evidence нет локального полного app PASS, подтверждения real ground/splat/FPS и paired human PASS. PHASE 5 не разрешена этим документом.
