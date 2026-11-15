# Vercel UI SDK — verified integration decision

Research snapshot: 2026-11-14. Scope: the user's requested [vercel-labs/ui](https://github.com/vercel-labs/ui), its published npm packages, packaged documentation and declaration files. No dependency installation, application code execution, account creation or terms acceptance occurred during this research.

## Published versions and React compatibility

| Package | Chosen exact version | Evidence |
|---|---|---|
| `@ui-sdk/core` | `0.1.0-beta.1` | npm `latest` metadata and package tarball |
| `@ui-sdk/react` | `0.1.0-beta.1` | npm `latest` metadata and package tarball |
| `react` | `19.3.1` | npm stable `latest` metadata |
| `react-dom` | `19.3.1` | npm metadata; peer React `^19.3.1` |
| `@types/react` | `19.3.0` | npm stable metadata |
| `@types/react-dom` | `19.3.0` | npm metadata; peer `@types/react: ^19.3.0` |

Published `@ui-sdk/react@0.1.0-beta.1` requires React and React DOM `>=19`, `@types/react >=19.2.10`, and core `^0.1.0-beta.1`. It is **not compatible with the prior React 18.3.1 baseline according to its peer contract**. Astra chose a coordinated React 19 baseline change to fulfil the user's newer UI SDK requirement. Only React, React DOM and their type pins are superseded; shared scientific contracts, TypeScript 5.9.3, Three.js 0.170.0 and the other required pins remain unchanged. Do not use `--force` or `--legacy-peer-deps`.

Both SDK packages also have a published `0.1.0-beta.2` under the `beta` dist-tag; GitHub main has moved to beta.2. B03 deliberately uses **beta.1**, with that release's packaged docs/types, rather than assuming main's APIs match. Registry metadata: [core](https://registry.npmjs.org/@ui-sdk%2fcore/0.1.0-beta.1), [React adapter](https://registry.npmjs.org/@ui-sdk%2freact/0.1.0-beta.1), [React](https://registry.npmjs.org/react/19.3.1), [React DOM](https://registry.npmjs.org/react-dom/19.3.1), [React types](https://registry.npmjs.org/@types%2freact/19.3.0), [React DOM types](https://registry.npmjs.org/@types%2freact-dom/19.3.0).

The package tarballs were read in memory without extracting or executing code. Computed SHA512 values matched registry integrity:

```text
@ui-sdk/core@0.1.0-beta.1
sha512-sWsZW8RN6Gviir7REQYuDIafm9hierHQE31OJ+2g+1Pp3lDVKp/dk0+0dxFvqOQRmBveRvlE9FiARgNlQ9dMFw==

@ui-sdk/react@0.1.0-beta.1
sha512-7wcUsZI+WoG2uo3N+PHrWntk97qI9ez2cUrHV9H507FiL118Pi4tuhWUCMDtWwEUCNQLybpBm1QRLkEXVOPAUg==
```

Both package manifests declare Apache-2.0. The repository README separately identifies UI SDK as beta and links Vercel beta terms. Preserve the package licenses/notices and record the beta dependency; do not imply the APIs are final or that an agreement/account was accepted. No Vercel service, remote runtime, paid key or hosted deployment is required by the proposed local component use. [Repository README and license](https://github.com/vercel-labs/ui)

## Skill and API evidence

Applied the repository's [ui-sdk skill](https://github.com/vercel-labs/ui/blob/main/packages/core/skills/ui-sdk/SKILL.md), then read its build-interface, testing and agent-ready references. The full skill was also checked in the beta.1 core tarball. Read `@ui-sdk/react/docs/llms.txt` and relevant packaged component pages; inspected `.d.ts` declarations, not compiled JavaScript. Browser implementation should use its installed beta.1 docs as the API source of truth.

Verified public surfaces from beta.1 packaged docs:

| Existing need | Public entry and composition | Decision |
|---|---|---|
| Evidence/limits disclosure | `@ui-sdk/react/collapsible`: `Collapsible`, `CollapsibleTrigger`, `CollapsiblePanel` | First B03 adoption |
| Custom local names for that same behavior | `collapsible` from `@ui-sdk/core/collapsible`, `createParts` from `@ui-sdk/react/primitive` | Supported adapter pattern for `InfoDisclosure`; do not reimplement behavior |
| Prepared target picker | `@ui-sdk/react/select`: `Select`, `SelectLabel`, `SelectTrigger` → `SelectValue`, `SelectContent` → `SelectItem` | Verified future option; not required in this first migration |
| Focused modal task | `@ui-sdk/react/dialog`: `Dialog`, `DialogTrigger`, optional `DialogBackdrop`, `DialogContent` with `DialogTitle`, `DialogDescription`, `DialogClose` | Do not introduce a modal merely to use the package |
| Related content panels | `@ui-sdk/react/tabs`: `Tabs`, `TabsList`/`TabsTab`, `TabsPanel` paired by value | Do not place/unmount the WebGL viewport inside tabs in B03 |

There is no framework root component import and no invented `Panel`, `Dropdown` or shadcn-style API. Components use `render`, not `as`. Popups use the browser top layer; a guessed Portal/Positioner part must not be added.

Exact supported first-use adapter call, verified in beta.1 `docs/components/collapsible.md`:

```tsx
import { collapsible } from '@ui-sdk/core/collapsible';
import { createParts } from '@ui-sdk/react/primitive';

const parts = createParts(collapsible, {
  root: 'div', trigger: 'button', panel: 'div',
});
const DisclosureRoot = parts.Root;
const DisclosureTrigger = parts.Trigger;
const DisclosurePanel = parts.Panel;
```

The root supports `open?: boolean`, `defaultOpen?: boolean`, `disabled?: boolean`, `onOpenChange?: (open, details) => void`, `onOpenChangeComplete?: (open) => void`, and an optional `createCollapsibleController()` controller. `details` is `ChangeDetails<CollapsibleOpenChangeReason>`; reasons are `trigger-press | find-in-page | imperative`. Panel props include `keepMounted?: boolean` and `hiddenUntilFound?: boolean`. Enter/Space toggle a focused native trigger and keep focus there; Tab reaches the open panel's focusable children. A disabled trigger stays focusable with `aria-disabled`. These are SDK behavior claims to test in the app, not completed PAE accessibility evidence.

## Narrow product adoption: Analog Passport

Implement reusable `InfoDisclosure` and actually mount it around the app's evidence/limitations content. Organize an **Analog Passport** into Physical profile, Why this match, Limits of this comparison and Source evidence. This gives the app a purpose-specific way to inspect a comparison instead of adding unrelated UI controls.

All contents come from current `Comparison`, `Analog`, `ScoringProfile`, feature metadata and `Source` objects. Show actual quantities/units/support windows and source IDs; describe hashes as recorded checksums unless bytes were actually verified. Explain per-feature similarity separately from normalized Euclidean squared-distance contribution. The latter is **not a percentage contribution to the hybrid total score**. Limits use existing missing reasons, excluded reasons and active-profile scope. Empty input produces an honest empty Passport with no invented target, score, source or baseline import button.

The 3D viewer remains mounted outside disclosures. Toggling details must not recreate its renderer, RAF, controls, workers or asset loads. Keep the current accessible prepared-target selector and all scientific contracts intact; do not introduce simulations, new score formulas, `.geojson` import or new scientific fields.

## Verification and current status

The migration requires an actual regenerated lockfile and npm peer resolution without bypass flags. Verify React 19 render/unmount/StrictMode behavior, refs, existing WASD and PointerLock handlers, cancellation and async viewer disposal. Run existing typecheck/unit/build/e2e plus focused disclosure keyboard/focus/ARIA tests on the real component. An empty state may validate UI wiring; it cannot validate real DEM/splat navigation or 60 FPS.

The skill's agent-ready check can remain test-only: exercise the new disclosures through `createAgent` from `@ui-sdk/react/agent`, with accessible names and assertions about resulting state. No production WebMCP registration, cloud model or external runtime endpoint is introduced by B03. Browser contrast/responsive checks require measured rendered evidence; no accessibility certification is implied by installing UI SDK.

Status: **RESEARCH_COMPLETE / IMPLEMENTATION_PENDING**. No implementation, package installation, migration test result or global PASS is asserted here. Dispatch: [DEV_B_UI_SDK.md](../../prompts/roles/DEV_B_UI_SDK.md).
