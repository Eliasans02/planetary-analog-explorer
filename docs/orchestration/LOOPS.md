# Astra parallel development loop

This plan accelerates independent work while preserving scientific provenance and the paired human PASS gate. Browser sessions are isolated: they do not share the local filesystem or each other's messages. Astra transports exact, versioned artifacts between them.

## Ownership and independent roles

| Role | Write ownership | Immediate deliverable | Independent internal subtasks |
|---|---|---|---|
| Dev_A / Hydrogen | data-pipeline/ | Python pipeline, tests, empty-state export | ingestion; geospatial processing; scoring; tests |
| Dev_B / Hydrogen | web-client/ | viewer and UI, tests | rendering; controls/lifecycle; data validation; tests |
| Researcher / Hydrogen | reports/research.json | exact real product/ROI acquisition evidence | lunar/Mars products; Earth products; comparability audit |
| Code Reviewer / Hydrogen | reports/code_review.json | source-specific findings and regression checks | scientific math/contracts; frontend lifecycle; test quality |
| Stitch Design Reviewer | design references + design findings | review flow and screenshots, prioritized UX changes | information hierarchy; accessibility; empty/error states |
| Security Evaluator / Hydrogen | reports/security_review.json | evidence-based source review | filesystem/URLs; asset memory bounds; dependencies/offline runtime |
| Requirements Manager / Hydrogen | reports/requirements.json | traceable acceptance coverage | science; interaction; reliability/licensing; acceptance evidence |
| Astra | shared contract, integration, task board, attribution | transport artifacts, adjudicate findings, apply reviewed integration | local checks and source verification |

Ask Hydrogen to use native delegation when its actual environment supports it. Record whether it used that capability; never present simulated role prose as proof of spawned agents. Parallel browser sessions already provide isolated work streams regardless of native delegation availability.

Reviewers do not modify implementation files. A single writer owns each module. Proposed shared-schema changes return to Astra before both developers receive the same revision. A reviewer cannot approve its own patch as an independent review.

## LOOP_0 — foundation and team activation (active)

1. Freeze contract 1.0.0 and distribute full self-contained prompts.
2. Generate Dev_A and Dev_B concurrently; researcher prepares the real-data acquisition manifest; Stitch checks the intended flow; requirements manager establishes coverage.
3. Export source into incoming/ROLE/revision/, inventory and hash it before running installation scripts.
4. Feed the identical source bundle/hash to code review and security review. Specification-only work is explicitly NOT_REVIEWED for implementation.
5. Run local contract, type, unit and build checks. Missing real data stays a blocker for integration/ground performance, not a fabricated fixture.
6. Send each confirmed finding as a minimal hotfix with exact file context, regression and unchanged acceptance criteria. Re-review affected scope against the new hash.
7. Both human Dev_A and Dev_B PASS signals are required for PHASE 5. Automatic checks cannot substitute for them.

## LOOP_1 — real-data vertical slice (planned)

Dependency: accepted LOOP_0 contract and implementations. Research/preparation may proceed in parallel before acceptance, but completion cannot.

- Select one source-backed target AOI and real Earth candidate set; document coordinate transformations, source labels, nodata and calibration.
- Freeze the sourced known-analog baseline and an explicit search domain. Generate candidate ROIs systematically from real georeferenced inputs, evaluate candidates outside that baseline, and document spatial grouping, search coverage and limitations. A curated comparison alone does not close the new-analog discovery requirement.
- Use the 11 challenge resources in `docs/research/CHALLENGE_RESOURCES.json` for product selection. Demonstrate an actual listed NASA source through the resource-to-product-to-raw-hash-to-derived-artifact-to-UI chain; catalogue metadata alone does not close this gate.
- Compute a fixed topography-only profile; retain POWER climate as correctly labelled context.
- Export provenance-complete local artifacts; load them in the viewer with actual target selection and DEM-ground navigation.
- Review score independently, confirm all rendered numbers trace to sources, and verify no runtime external requests.
- Gate: real-science integration evidence plus both human PASS signals. Do not call fewer-than-three results a complete top-three candidate coverage milestone.

## LOOP_2 — synchronized exploration (planned)

Dependency: accepted real-data vertical slice.

- Parallel tasks: real metric splat reconstruction/registration offline; split-screen/scissor camera integration; HUD accuracy and accessible controls.
- Use scientific DEM for collision/telemetry, with explicit inferred-versus-measured reconstruction labels.
- Review splat/terrain alignment, camera frame transformations and repeated scene disposal under real assets.
- Gate: genuine metric asset evidence, reviewed viewer integration, measured performance and paired human PASS.

## LOOP_3 — offline demo and judge readiness (planned)

Dependency: accepted exploration slice.

- Freeze data, source manifest, code versions and licenses. Package all runtime assets locally.
- Verify cold start, no external network dependencies, errors/missing assets, device/resolution-specific frame-time and memory behavior.
- Requirements manager maps each claimed feature to reproducible evidence; unsupported claims are removed.
- Include the challenge alignment criteria in `docs/orchestration/REQUIREMENTS_CHALLENGE_ADDENDUM.json`; keep benchmark analogs distinguishable from candidates identified by this search.
- Stitch reviews actual screenshots and interaction paths. Security and code reviewers close confirmed high-impact findings.
- Gate: 30-second demo runbook, scientific/AI attribution page, final evidence packet, both human PASS. No publishing or external sharing changes are implied by this plan.

## Artifact protocol and re-loop

Each dispatch has task_id, role, contract_version, input_paths + SHA256, allowed_outputs, acceptance_checks and dependency IDs. A response records observed results separately from claims.

`RECEIVED → STATIC_REVIEW → LOCAL_CHECKS → INDEPENDENT_REVIEW → HUMAN_ACCEPTANCE`.

`FAIL` or `PERF_WARN` returns the affected work to `HOTFIX_REQUIRED`; unaffected independent tasks may continue. No shared/global state commit until the original paired PASS gate is satisfied. Every revision invalidates prior approval of changed files; preserve unaffected evidence with its original scope/hash.

Polling and orchestration happen while Astra is actively working. Open browser jobs may continue externally, but this document does not create an unattended scheduler or promise background monitoring after a turn ends.
