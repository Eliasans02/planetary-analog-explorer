# Independent navigation review

Date: 2026-11-14. Scope: source inspection and offline identity checks only. This report does not provide human acceptance, browser interaction evidence, or a performance benchmark. Reviewer writes only this report; implementation belongs to the app, globe, and ground owners.

## Baseline and integrity

Read the current checkpoint in `REPO_STATE.json`, `docs/planet_explorer_contract.md`, `docs/native_surface_contract.md`, the frozen prior independent review, both navigation viewports, app integration, loading helpers, geometry/input helpers and relevant added tests.

Independently checked 27 `data-pipeline/`, `shared/`, and `web-client/public/` entries from `evidence/planet_explorer/SOURCE_MANIFEST.json`: every retained file length and SHA256 matched. Both catalog hashes also matched the current checkpoint: planet `5727a84a02993f7bad28ff707a51333951c9128297eb0e87547f57e42ae2208e`; surface `0a94f8074e25e7863fa9412d2a781096660e2ad3cab7a1e58a4c2641ce8cee9f`. These checks establish unchanged retained identities, not independent publisher checksum validation or coordinate calibration.

Also independently compared the frozen hashes for planet/surface loaders, heightfield loading, planet/surface geometry and their associated tests: all ten matched. Scientific sampling, validity masks, triangle collision, source-frame handling and asset verification therefore retain their reviewed implementations.

## Closed draft findings

- A retained locate request could override the restored camera after locate, manual rotation, landing and return. Root now clears it on body/split/landing transitions, with a separate monotonic revision counter. Matching-body routing remains in place.
- In fallback navigation, pointerdown on Pause could blur the canvas and pause before click; the conditional click handler could then resume. The control now prevents pointerdown's default focus transfer and completes the explicit pause on click. Keyboard focus transfer itself pauses; subsequent activation explicitly resumes.
- The ground draft briefly removed explicit pointer-lock-unavailable disclosure and rounded the native HUD to whole metres. Final source restores the disclosure and one-decimal native coordinates. Key release and pause flush the final sample through the publisher, even inside its 200 ms movement throttle.
- Globe map status initially overlapped the bottom source label. Its final bottom offset is 52 px. Temporary ground-copy encoding corruption was also corrected with ASCII-safe text.

## Final source disposition

No remaining material defect was identified in this bounded review of the final owner patches.

Texture selection is independent of the scene effect. Latest resolution/view refs cover changes during asynchronous global-DEM initialization. The resource owner aborts superseded requests, ignores stale failures, releases stale successful decodes and disposes the displayed resource on unmount. A replacement is published before the previous texture/ImageBitmap is released; failures retain the displayed verified map and offer retry. Status names the actual displayed resolution separately from a pending selection.

Each body has its own saved camera snapshot and stable callback. Split controls remain independent. Saved azimuth/polar values are restored, while optional fit distance preserves zoom relative to viewport fit across panel resizing/remount. Locate changes only the named approximate orbital locator. Drops preserve exact prepared IDs or explicitly report unavailable coverage; landing aligns the selected body/site without inventing global terrain.

Ground entry prepares an inactive first-person view. Start/resume or a terrain click explicitly activates input. Pause, Escape, canvas/window blur and orbit clear held keys, release pointer capture and stop the continuous walking frame loop. Tick also requires active input. Late grants check disposed/walking/focus/input state and release unauthorized lock. For a pending legacy request, cleanup temporarily retains only document lock/error guards; settlement removes them. Promise settlement additionally checks the late grant. Ordinary controls, canvas/window input listeners and rendering resources are cleaned up on unmount. The existing valid-triangle movement path is unchanged.

Accessibility/layout source changes include a named canvas region with navigation-help association, visible canvas/button focus styles, textual active/paused status, explicit action labels, and wrapping header/action controls. Actual visual fit and assistive-technology behavior were not exercised by this reviewer.

The globe owner reported three targeted resource tests and final typecheck passing; the ground owner reported ten targeted tests and typecheck passing. These are owner reports, not independent reviewer test runs. Reviewer independently inspected those tests; full suite and browser automation were deliberately not repeated. Runtime interaction, final build verification, human acceptance and performance measurement remain separate root-owned evidence.

## Final follow-up and root-attributed observations

Independently inspected the final ground arrow-look delta: the existing active/focused-or-locked input gate runs before arrow handling; shared `lookBy` applies the existing clamped pitch/yaw helper to both drag and arrow input. Arrow keys add no held state or separate animation loop. The final ASCII-safe help retains the explicit mouse-capture-unavailable disclosure. No additional material source finding was identified.

Independently inspected root's spacing expression: `spacing_m.map(value => value.toLocaleString('en-US', { maximumFractionDigits: 3 })).join(' × ')`. It formats a display string only and does not mutate catalog values or change geometry/collision spacing. Exact native metadata remains in provenance.

Root reported these CUA observations on production bundle `index-DwWbGyZ_.js`: rotated Moon retained its pose when switching 2K to 4K, with status progressing from showing 2K/loading 4K to showing 4K. Split view fit without observed clipping; independently rotated Mars retained its pose after switching to a single panel. Locate Mars, rotate away, explore, then return restored the off-site view, with the marker on the left limb rather than a stale refocus. After Start and approximately 800 ms W input, the native HUD changed from zero to Z -1.7 m. Pause followed by W left the coordinates unchanged and focus on BODY. Resume and approximately 600 ms D input changed X to 1.2 m; Escape returned the paused state. These are root-reported observations, not independent reviewer interactions or timing/performance measurements.

Root subsequently reported final typecheck/build PASS for `index-BIWJTfWF.js`. The full 105-test/12-file run preceded only the display-spacing formatting edit, which was followed by that final typecheck/build. In final CUA, spacing displayed as 1.01 × 1.01 m, keyboard Start/Resume worked, arrow look visibly moved the horizon, and Tab/Escape paused. After keyboard W, the HUD showed Z -0.1 m; some timed holds showed no coordinate delta. The ground owner's read-only audit found no concrete RAF stall. These observations establish neither browser movement speed nor FPS, and no throttling cause is attributed.

Root's final split view showed both 4K maps, and the final console warnings/errors were empty. Final screenshots were saved as `evidence/navigation_improvements/navigation-orbit.jpg` and `evidence/navigation_improvements/navigation-ground.jpg`. These remain root-attributed observations, not independently repeated reviewer browser checks.

Report frozen after this consolidation. Scope is unchanged: no human acceptance, successful native pointer-lock certification or performance benchmark is claimed.
