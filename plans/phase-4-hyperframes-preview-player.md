# Phase 4: HyperFrames Preview Player

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple has a real HyperFrames preview player inside the
existing preview-pane pattern. A user can open a Ripple project, preview the
active composition, play and pause motion, scrub time, refresh the player, and
see clear loading and error states without leaving the app.

This phase intentionally does not add the assets/compositions pane, the
right-side review rail, persistent comments, revisions, or export UX. Those are
later phases. Phase 4 is only the player layer, because the rest of the Ripple
shell should compose around a working motion preview.

The player must use official HyperFrames player/runtime primitives behind a
Ripple-owned adapter. Ripple owns the surrounding app chrome, controls, states,
and placement. HyperFrames owns motion playback, timing, composition loading,
and player semantics.

The first implementation reaches that shape by wrapping `@hyperframes/player`
and asking the main process for a prepared `srcdoc` document. The next
architecture step is to lean further on HyperFrames without giving up Ripple's
native UI: keep the Ripple player chrome, but move the composition document,
runtime injection, asset resolution, nested composition behavior, and future
timeline semantics behind a HyperFrames-prepared preview URL loaded by the
official player.

## Progress

- [x] 2026-04-26 / Codex: Re-scoped Phase 4 after the first broad shell pass
  moved too quickly. Phase 4 now focuses only on the HyperFrames preview
  player.
- [x] 2026-04-26 / Codex: Inspected the existing preview path:
  `active-chat.tsx` opens a right `ResizableSidebar` when preview is available,
  and `AgentPreview` already has useful UI patterns for load state, refresh,
  viewport controls, scale, device sizing, and external-open affordances.
- [x] 2026-04-26 / Codex: Ran package and runtime research. The checked-out
  app currently installs `hyperframes@0.4.28` and does not install
  `@hyperframes/player`, `@hyperframes/studio`, or `@hyperframes/core`.
- [x] 2026-04-26 / Codex: Selected the official HyperFrames package path as
  the only Phase 4 implementation architecture.
- [x] 2026-04-26 / Codex: Removed the temporary non-player implementation from
  the working tree and reset this plan to the official-player architecture.
- [x] 2026-04-26 / Codex: Verified the current registry versions for `hyperframes`,
  `@hyperframes/player`, `@hyperframes/core`, and `@hyperframes/studio`.
- [x] 2026-04-26 / Codex: Pinned the HyperFrames package family to exact
  `0.4.30` versions in `package.json` and `bun.lock`.
- [x] 2026-04-26 / Codex: Implemented a main-process-approved player source
  contract through `trpc.hyperframes.getPlayerSource`.
- [x] 2026-04-26 / Codex: Registered a `ripple-preview:` Electron protocol for
  validated project assets and the local HyperFrames runtime file.
- [x] 2026-04-26 / Codex: Implemented
  `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx` around the
  official `@hyperframes/player` custom element.
- [x] 2026-04-26 / Codex: Wired Ripple project preview availability into the
  existing desktop and mobile preview-pane entry points.
- [x] 2026-04-26 / Codex: Ran focused source tests, `bun run test:ripple`,
  `bun run build`, `bun run ts:check`, and `git diff --check`.
- [x] 2026-04-26 / Codex: Completed live Electron QA against the existing
  `~/Ripple/test1` starter project. The player reaches ready state, reports a
  `0:06` duration after legacy timing normalization, plays through the
  composition, and no longer logs the preview-load errors from the first smoke.
- [x] 2026-04-26 / Codex: Recorded the next architecture direction after
  implementation review: evolve from Ripple-built `srcdoc` toward a
  HyperFrames-prepared preview URL while preserving Ripple-owned UI, comments,
  chat, widgets, and future assets/compositions/timeline surfaces.
- [ ] Spike the official player's `src` mode against a HyperFrames-prepared
  local preview URL and document the exact ready/play/seek/timeupdate behavior
  in Electron.
- [ ] Prototype a main-process preview-serving adapter that uses HyperFrames
  preview/core primitives without opening external Studio or exposing arbitrary
  project files.
- [ ] Decide whether the Phase 4 player should fully switch from `srcdoc` to
  `src`, or keep `srcdoc` as a temporary fallback while the prepared preview
  URL path hardens.

## Surprises & Discoveries

- Observation: The current preview pane is a good placement pattern for Phase 4.
  Evidence: `src/renderer/features/agents/main/active-chat.tsx` renders a right
  `ResizableSidebar` for preview, and
  `src/renderer/features/agents/ui/agent-preview.tsx` has compact controls that
  can inform the Ripple player chrome.
- Observation: The existing preview detector is coding-agent specific.
  Evidence: `AgentsContent` and `active-chat.tsx` decide preview availability
  from `chatData.sandbox_id` and `chatMeta.sandboxConfig.port`, then build a
  CodeSandbox-style URL.
- Observation: Phase 3 already provides the main-process HyperFrames lifecycle
  surface needed around the player.
  Evidence: `src/main/lib/trpc/routers/hyperframes.ts` exposes `doctor`,
  `listCompositions`, `startPreview`, `stopPreview`, `getPreviewStatus`,
  `snapshot`, `render`, `getRenderStatus`, and `cancelRender`.
- Observation: The installed local `hyperframes@0.4.28` package is CLI-first in
  this checkout.
  Evidence: `package.json` lists `hyperframes` and `gsap`; there is no
  installed `node_modules/@hyperframes` directory.
- Observation: `@hyperframes/player` is the right preview primitive for this
  phase.
  Evidence: Official docs describe a custom-element player with `play`,
  `pause`, `seek`, `currentTime`, `duration`, `ready`, and `timeupdate`.
- Observation: The official player can consume a source document while Ripple
  serves nested composition files, media, fonts, and the runtime through a
  controlled local protocol.
  Evidence: `@hyperframes/player` observes `srcdoc`; the implemented
  `getPlayerSource` route returns `srcDoc`, and `ripple-preview:` serves only
  paths validated against the selected project boundary.
- Observation: `@hyperframes/studio` should be used selectively, not as the
  full Studio app in Phase 4.
  Evidence: Official docs expose React components and hooks for player
  controls, timeline, file tree, source editor, element picking, and full
  `StudioApp`; using the full app would pull later shell work into this phase.
- Observation: `@hyperframes/core` is the right source for structured metadata
  and future timeline/assets models.
  Evidence: Official docs expose parsing, HTML generation, composition metadata
  extraction, linting, runtime helpers, and schemas.
- Observation: The package root for `@hyperframes/core@0.4.30` should not be
  imported directly from the Electron main process in this CJS build.
  Evidence: production build externalizes main-process dependencies as
  `require(...)`, while `require("@hyperframes/core")` fails because the
  package root is import-only. The implementation reads the exported
  `@hyperframes/core/runtime` file instead.
- Observation: Electron custom protocols must be registered for the renderer's
  actual session partition.
  Evidence: the main BrowserWindow uses `partition: "persist:main"`. Registering
  `ripple-preview:` only on the default protocol registry let tests pass but
  produced `ERR_UNKNOWN_URL_SCHEME` in the live app. Registering the handler on
  both default and `persist:main` resolves project assets and the local runtime.
- Observation: Existing generated starter projects can carry an older
  `gsap-lite.js` shim and frame-count timing values.
  Evidence: `~/Ripple/test1` loaded `assets/vendor/gsap-lite.js` and
  `data-start` / `data-duration` values like `72` and `180`. The official
  runtime expects real GSAP timeline methods and seconds-based timings, so the
  player initially crashed on load or play until the preview source upgraded
  that legacy starter shape at load time.
- Observation: The remaining live-console messages after the QA fixes are
  warnings, not preview-load blockers.
  Evidence: DevTools showed no `ERR_UNKNOWN_URL_SCHEME`, CDN CSP block,
  `window.gsap.timeline` failure, play-time runtime error, or React
  `transform-origin` warning. Remaining warnings are the official player iframe
  sandbox warning, the existing Jotai `atomFamily` deprecation, and the Electron
  development CSP warning.
- Observation: The current implementation is a good first native player pass,
  but Ripple still owns too much composition-document compatibility.
  Evidence: `trpc.hyperframes.getPlayerSource` returns `srcDoc`, and
  `buildHyperframesPlayerSourceDocument` injects the runtime, rewrites selected
  references, and normalizes older starter-project timing before the official
  player sees the composition.
- Observation: The stronger long-term shape is a HyperFrames-prepared preview
  URL, not a full Studio embed and not a Ripple-authored parallel runtime.
  Evidence: `@hyperframes/player` supports loading a composition URL through
  `src`, and HyperFrames owns preview routes, runtime behavior, nested
  composition handling, Studio timeline/player semantics, and render-preview
  consistency.
- Observation: The HyperFrames CLI preview process is useful as a reference,
  but it is not the ideal app-embedded interface.
  Evidence: the CLI preview flow is designed to launch/open Studio externally.
  Ripple needs a main-process adapter that serves the preview document for the
  embedded player without opening the user's browser or exposing broad Studio
  mutation routes.
- Observation: The largest known blocker for the next step is player readiness
  and origin behavior when using `src`.
  Evidence: the official player can post play, pause, seek, and time messages
  to an iframe, but its ready-state detection may inspect iframe internals. A
  local URL with a different origin could play visually while still failing the
  player's `ready` path unless the serving strategy preserves the expected
  access pattern.
- Observation: The same adapter direction should support Phase 5 assets,
  compositions, and future timeline UI.
  Evidence: the roadmap says HyperFrames remains the source of truth for
  composition structure, timeline semantics, preview, and render behavior.
  Ripple's panes should read structured HyperFrames/project data through
  main-process tRPC APIs instead of each renderer surface parsing files on its
  own.

## Decision Log

- Decision: Phase 4 is only the HyperFrames preview player.
  Rationale: A working motion preview is the foundation for assets,
  composition switching, comments, review, and export. Building the whole shell
  first produced too much UI before the central experience was ready.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Build on the existing preview-pane placement instead of replacing
  the whole shell.
  Rationale: The app already has a mature preview-pane interaction model.
  Ripple should adapt the useful local UI pattern while replacing the preview
  engine with HyperFrames-native playback.
  Date/Author: 2026-04-26 / User + Codex

- Decision: The Phase 4 implementation must use official HyperFrames player
  primitives.
  Rationale: The user rejected an implementation that looked and behaved like
  an embedded Studio surface. Phase 4 should either deliver the ideal
  player architecture or stop for a product/architecture decision.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Pin the HyperFrames package family exactly during the integration
  spike.
  Rationale: These are `0.x` packages and appear to move as a coordinated
  family. Ripple should not mix `hyperframes`, `@hyperframes/player`,
  `@hyperframes/studio`, and `@hyperframes/core` versions or leave them on
  broad caret ranges once the official-package path is adopted.
  Date/Author: 2026-04-26 / Codex

- Decision: Ripple owns the visual chrome and product model.
  Rationale: HyperFrames should supply runtime, parsing, player, timeline, and
  editor primitives. Ripple should supply the app shell, buttons, tabs, loading
  and error states, composition terminology, comment/revision flows, and
  current UI styling.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Use a Ripple-owned source contract instead of launching or embedding
  HyperFrames Studio.
  Rationale: The preview pane should open from selected Ripple project state,
  not from a separate browser tab or a Studio workspace. The renderer asks the
  main process for approved composition source data, then the official player
  handles timing and playback.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Serve player assets through `ripple-preview:` instead of exposing
  absolute filesystem paths.
  Rationale: Project files, nested compositions, media, and the local runtime
  need browser-loadable URLs, but all path resolution must remain in the main
  process and inside the project boundary.
  Date/Author: 2026-04-26 / Codex

- Decision: Preserve preview compatibility for older generated starter projects
  inside the official player source adapter.
  Rationale: The current scaffold writes `gsap.min.js` and seconds-based clip
  timings, but projects already created during Phase 2/3 can still contain the
  earlier `gsap-lite.js` shim and frame-count timings. Preview-load
  normalization keeps those projects playable without changing the project files
  or introducing another player architecture.
  Date/Author: 2026-04-26 / Codex

- Decision: Evolve Phase 4 toward the Level 2 architecture: Ripple UI around
  `@hyperframes/player`, with the player loading a HyperFrames-prepared preview
  URL.
  Rationale: This keeps Ripple feeling like one native app while letting
  HyperFrames own the moving pieces it is best positioned to evolve: runtime
  injection, composition loading, nested compositions, asset resolution, timeline
  semantics, and render-preview consistency.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Treat a full HyperFrames Studio embed as an escape hatch, not the
  default product direction.
  Rationale: Full Studio embedding would inherit HyperFrames features fastest,
  but it would also make Ripple feel like a wrapper around another app and make
  frame comments, chat, widgets, revisions, and future native controls harder to
  integrate cleanly.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Leave a future framework-adapter seam conceptually open, but do not
  optimize Phase 4 for Remotion or another framework.
  Rationale: Ripple may support additional motion frameworks later, but
  HyperFrames is the current source of truth. Over-generalizing now would add
  abstraction before the HyperFrames product path is solid.
  Date/Author: 2026-04-26 / User + Codex

## Outcomes & Retrospective

The temporary non-player implementation has been removed. The current working
tree contains an official-player Phase 4 implementation:

- exact `0.4.30` HyperFrames package pins
- `trpc.hyperframes.getPlayerSource` for project/composition-owned source data
- `ripple-preview:` protocol serving validated project assets and local runtime
- `ripple-preview:` registration for both the default Electron protocol scope
  and the app renderer's `persist:main` session
- preview-load compatibility for older generated starter projects that still
  reference `gsap-lite.js` and frame-count clip timings
- `HyperFramesPreviewPlayer` wrapping the official custom element with Ripple
  controls and states
- desktop and mobile preview-pane wiring from selected Ripple project state

Automated validation passed for focused source tests, `bun run test:ripple`,
`bun run build`, and `git diff --check`. `bun run ts:check` still fails on the
existing baseline type errors in legacy/main agent surfaces; no new Phase 4
files are implicated in that output. Live Electron QA passed against
`~/Ripple/test1`: the preview reaches ready state, renders the composition,
reports the normalized `0:06` duration, and plays through using the official
player controls.

The next iteration should not replace the Ripple-owned player UI. It should
replace the way the player source is prepared. Today, Ripple creates an
`srcdoc` document for the player. The target is for Ripple to ask a
main-process adapter for an approved preview URL, and for that URL to serve a
HyperFrames-prepared composition document. If that target works in Electron,
Ripple keeps its native controls while HyperFrames owns more of the preview
pipeline.

## Context and Orientation

Ripple is being rebuilt from a 1Code-shaped Electron app into a local-first
motion graphics app. Phase 1 removed mandatory auth/provider gates. Phase 2
created a project-first flow that writes HyperFrames project files under
`~/Ripple/<project-name>`. Phase 3 added main-process HyperFrames orchestration
and typed tRPC calls for runtime checks, composition discovery, preview,
snapshot, render, and cancellation.

The existing renderer still has 1Code preview machinery. In desktop chat,
`src/renderer/features/agents/main/active-chat.tsx` can open a right
`ResizableSidebar` containing `AgentPreview`. On mobile,
`src/renderer/features/agents/ui/agents-content.tsx` has a full-screen preview
mode. Those surfaces are the right entry points for Phase 4, but their current
source of truth is coding-agent preview metadata rather than Ripple project
state.

The HyperFrames player should use the selected Ripple project and official
HyperFrames player primitives. The renderer must not spawn shell commands or
trust arbitrary absolute paths. Main-process routes should resolve selected
projects, validate project/composition ownership, and return only structured
data or approved source descriptors needed by the player.

## Plan of Work

First, run the official-package integration spike. Verify the current package
versions, then install or pin the HyperFrames package family as one exact
version. The expected package set is:

- `hyperframes`
- `@hyperframes/player`
- `@hyperframes/core`
- `@hyperframes/studio`, only if a focused primitive is required

Second, prove the smallest renderer smoke. Import the official player
primitive, load a scaffolded Ripple composition through a
main-process-approved source, and prove `ready`, `timeupdate`, `play`,
`pause`, `seek`, `currentTime`, and `duration` work in Electron.

Third, design the main-process source contract. The renderer should pass a
`projectId` and optional `compositionId`. The main process should resolve the
project, reject archived or missing projects, select a saved composition, and
return the structured source data required by the official player. Do not
expose arbitrary file paths.

Fourth, implement `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`.
The component should be a Ripple wrapper around the official player primitive,
not a copy of Studio and not a parallel timing engine. It should provide:

- compact header with project/composition identity
- loading, ready, stopped, and error states
- play, pause, seek, restart, and reload controls
- frame/time display
- viewport, scale, and aspect-ratio controls where they still make sense

Fifth, wire preview availability into the existing desktop and mobile preview
entry points. Ripple projects should open the HyperFrames player; existing
coding-agent preview behavior should remain unchanged.

Sixth, validate live in Electron. Phase 4 is not complete until a scaffolded
project visibly plays in the app and the player controls work there.

If the official player cannot be imported, packaged, loaded, or controlled in
Electron, stop and record the exact blocker. Do not ship another substitute
player path without an explicit user decision.

Next, run the Level 2 architecture spike. The goal is not to change the visual
UI. The goal is to move from `@hyperframes/player` plus Ripple-built `srcdoc`
to `@hyperframes/player` plus a HyperFrames-prepared local preview URL. Start
with a throwaway smoke that compares three source modes in Electron:

- the current `srcdoc` path
- a `ripple-preview:` prepared preview URL
- a loopback `http://127.0.0.1:<port>` prepared preview URL, only if protocol
  origin behavior blocks `ripple-preview:`

For each mode, record whether the player reaches `ready`, reports `duration`,
emits `timeupdate`, and responds to `play`, `pause`, and `seek`. Also record
whether nested compositions, assets, media, fonts, and runtime scripts load
without CDN requests.

If `src` mode works, prototype the main-process preview-serving adapter. The
adapter should resolve the Ripple `projectId` to a validated project directory,
select the active composition, and serve only read-oriented preview assets
needed by the player. It should reuse HyperFrames preview/core/studio-api
primitives where possible. It should not shell out from the renderer, open
external Studio, expose absolute filesystem paths, or mount broad Studio
mutation routes.

Once the adapter exists, update `HyperFramesPreviewPlayer` to prefer the
prepared URL through the official player's `src` attribute. Keep the current
`srcdoc` path behind a small fallback switch until the prepared URL path passes
live Electron QA on starter projects and at least one nested-composition
project.

Use the same adapter shape as the foundation for Phase 5. The assets,
compositions, and timeline panes should ask main-process APIs for structured
HyperFrames/project data, then render Ripple-styled UI. HyperFrames should own
composition structure, timing rules, preview-serving behavior, and future
framework updates; Ripple should own the user-facing panels, controls, chat,
comments, revisions, widgets, and export workflow.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple` unless noted otherwise.

1. Completed. Re-check package availability:
   `npm view hyperframes version`,
   `npm view @hyperframes/player version`,
   `npm view @hyperframes/core version`, and
   `npm view @hyperframes/studio version`.

2. Completed. Inspect official package entry points after installation:
   `node_modules/@hyperframes/player/package.json`,
   `node_modules/@hyperframes/core/package.json`, and
   `node_modules/@hyperframes/studio/package.json`.

3. Completed. Pin the package family exactly in `package.json` and `bun.lock`.

4. Completed in the renderer component path. Build a small local smoke for the official player. The smoke should load a
   scaffolded Ripple composition, report readiness, expose duration, respond to
   play/pause, and seek to a requested time.

5. Completed. Add a main-process tRPC procedure for the official player source contract.
   It must resolve project/composition ownership and return only the data the
   official player needs.

6. Completed. Implement `HyperFramesPreviewPlayer` around the official player primitive.

7. Completed. Wire `HyperFramesPreviewPlayer` into:
   `src/renderer/features/agents/main/active-chat.tsx` and
   `src/renderer/features/agents/ui/agents-content.tsx`.

8. Completed. Add focused tests for pure utilities and main-process source selection.

9. Completed. Run automated validation and update this plan with exact results.

10. Completed. Ran Electron smoke validation and updated this plan with live
    player notes.

11. Not started. Create a small local spike that exercises
    `@hyperframes/player` with `src` against a prepared preview URL. Compare
    `ripple-preview:`, loopback HTTP, and the current `srcdoc` path.

12. Not started. Inspect the installed HyperFrames preview/core/studio-api
    routes and identify the smallest read-only subset Ripple can reuse for
    embedded preview serving.

13. Not started. Prototype a main-process adapter that maps Ripple `projectId`
    and `compositionId` to a HyperFrames-prepared preview document URL without
    opening external Studio.

14. Not started. Update CSP and protocol/session registration only as required
    by the selected serving strategy. Keep the policy as narrow as practical.

15. Not started. Teach `HyperFramesPreviewPlayer` to prefer the prepared URL
    path and retain the current `srcdoc` path as a temporary fallback until the
    URL path is proven.

16. Not started. Add validation coverage for source selection, project-boundary
    enforcement, no-CDN runtime loading, nested compositions, and player
    readiness events.

## Validation and Acceptance

Automated validation:

- focused `bun test` for new preview/source utilities
- `bun run test:ripple`
- `bun run build`
- `bun run ts:check`, recording the existing baseline failures if they remain
  and confirming no new Phase 4 files are implicated
- `git diff --check`

Manual/Electron validation:

- Start the app with `bun run dev`.
- Create or open a Ripple project with the default scaffold.
- Open the preview pane using the existing preview affordance.
- Confirm the pane shows the Ripple HyperFrames player, not a blank workspace
  and not a copied Studio page.
- Confirm the preview uses the selected project and active composition.
- Confirm loading, ready, reload/restart, stopped, close, and error states.
- Confirm play, pause, seek, frame/time display, and duration are driven by the
  official HyperFrames player API.
- Confirm the player preserves the correct composition aspect ratio and does
  not overlap controls at narrow or wide pane widths.
- Confirm the implementation does not unexpectedly open the user's external
  browser.
- Confirm normal local use does not require CDN runtime assets.
- Confirm existing non-Ripple coding-agent preview behavior is unaffected.

Manual result, 2026-04-26:

- Opened `~/Ripple/test1` in the live Electron app with DevTools attached.
- Confirmed the player no longer logs `ERR_UNKNOWN_URL_SCHEME`, CDN CSP
  runtime loading blocks, missing GSAP timeline errors, play-time runtime
  errors, or React `transform-origin` warnings.
- Confirmed the preview reaches ready state, plays, exposes a `0:06` duration,
  and lets the user restart/pause through Ripple-owned controls.
- Confirmed the remaining console warnings are the official player iframe
  sandbox warning, existing Jotai deprecation, and Electron development CSP
  warning.

Acceptance for Phase 4:

- Ripple projects can be previewed from the existing preview pane.
- The player is powered by official HyperFrames player/runtime primitives.
- The player has app-owned controls and clear states in Ripple's current UI
  style.
- The renderer does not spawn HyperFrames, FFmpeg, shell commands, or arbitrary
  filesystem operations.
- The renderer receives only main-process-approved project/composition source
  data.
- The implementation does not introduce the assets/compositions pane, the
  right chat/comment review sidebar, persistent comments, revision workflow, or
  export UI.
- If the official player architecture is blocked, Phase 4 stops at a documented
  blocker and next-step decision.

Acceptance for the next Level 2 architecture pass:

- The user-visible player still looks and behaves like Ripple, not embedded
  HyperFrames Studio.
- `@hyperframes/player` loads an approved local preview URL through `src` and
  reaches `ready` in Electron.
- HyperFrames-owned preview preparation handles runtime loading, nested
  compositions, asset references, and timeline semantics without Ripple
  duplicating those rules in renderer code.
- The app does not open an external browser or full Studio window during normal
  preview.
- The serving adapter exposes only preview-safe read paths for the selected
  Ripple project and composition.
- Normal preview does not request CDN scripts or other network runtime assets.
- Phase 5 can reuse the adapter/project metadata path for the
  assets/compositions pane and future timeline controls.

## Idempotence and Recovery

The official player wrapper should be restartable without leaking listeners,
timers, or player instances. Opening and closing the preview pane should not
leave orphaned playback state.

If package installation creates a version mismatch, revert only the Phase 4
dependency edits and either pin the entire HyperFrames family to one working
version or stop with the exact incompatibility recorded.

If a refactor of `AgentPreview` risks existing coding-agent preview behavior,
keep the HyperFrames player in a separate component until a shared abstraction
is proven safe.

The Level 2 spike should be additive. Keep the current working `srcdoc` source
path available until the prepared preview URL path is proven. If `src` mode
fails because of player origin/readiness behavior, preserve the evidence,
including console messages and event traces, and decide whether to keep
`srcdoc`, adjust the serving origin, or upstream/patch the player readiness
bridge.

If a local HTTP serving adapter is introduced, it must have explicit lifecycle
ownership in the main process. Starting, restarting, and stopping the adapter
for the same project should be repeatable. It must not leave orphaned preview
servers after the project changes, the preview pane closes, or the app quits.

If HyperFrames changes package exports or preview route behavior, prefer
adapting the small main-process adapter over pushing compatibility hacks into
renderer UI components.

## Interfaces and Dependencies

Existing interfaces to use:

- `selectedProjectAtom` from `src/renderer/features/agents/atoms`
- `agentsPreviewSidebarOpenAtom` and `agentsPreviewSidebarWidthAtom`
- preview-pane helpers in `src/renderer/features/agents/ui/`
- `ResizableSidebar`
- `trpc.hyperframes.doctor`
- `trpc.hyperframes.listCompositions`
- `window.desktopApi.openExternal`, only for explicit user actions

New interfaces:

- `HyperFramesPreviewPlayer`
- `trpc.hyperframes.getPlayerSource`
- `ripple-preview:` Electron protocol
- `buildHyperframesPlayerSourceDocument`
- `selectHyperframesPlayerComposition`

Candidate next interfaces:

- `trpc.hyperframes.getPreparedPreviewSource` or an evolution of
  `getPlayerSource` that returns an approved local preview URL
- main-process HyperFrames preview-serving adapter
- read-only project/composition/asset metadata APIs for Phase 5
- narrow CSP/protocol allowances for the selected prepared-preview origin

Dependencies and constraints:

- Use React 19, Jotai, tRPC/React Query, Radix wrappers, Tailwind, and lucide
  icons already present in the app.
- Prefer official HyperFrames packages for the player architecture:
  `hyperframes`, `@hyperframes/player`, `@hyperframes/core`, and optionally
  selected `@hyperframes/studio` primitives.
- Pin the HyperFrames package family to exact `0.4.30` versions.
- Keep filesystem and process orchestration in the main process.
- Keep local-first usage free of mandatory auth, GitHub, repo setup, manual
  dependency installs, and provider selection.
- Avoid normal-path CDN dependency for HyperFrames player/runtime assets.
- For the next architecture pass, prefer HyperFrames-owned preparation through
  `@hyperframes/core` / `@hyperframes/studio` preview primitives or the smallest
  equivalent preview-serving subset. Avoid launching the full CLI preview flow
  if it opens an external Studio/browser window.
- Keep a future motion-framework adapter in mind, but do not introduce a broad
  abstraction until the HyperFrames-backed path is stable.

## Artifacts and Notes

Source inspection evidence gathered while creating this plan:

- `src/renderer/features/agents/main/active-chat.tsx` already renders the
  preview pane as a right `ResizableSidebar`.
- `src/renderer/features/agents/ui/agent-preview.tsx` already implements useful
  preview UI patterns: loading, reload, viewport, scale, device presets,
  sizing controls, URL/path display, and external open.
- `src/renderer/features/agents/ui/agents-content.tsx` currently derives
  preview availability from CodeSandbox chat metadata.
- `src/main/lib/trpc/routers/hyperframes.ts` exposes the Phase 3 service calls
  the player-adjacent source contract should build on.
- Local package inspection confirmed `hyperframes@0.4.28` is installed and
  `@hyperframes/player`, `@hyperframes/studio`, and `@hyperframes/core` are not
  installed in this checkout.
- Registry checks on 2026-04-26 found `hyperframes`,
  `@hyperframes/player`, `@hyperframes/studio`, and `@hyperframes/core` at
  `0.4.30`; the package family is now pinned to that version.
- User feedback on 2026-04-26 rejected the temporary non-player implementation
  because it opened HyperFrames Studio externally and did not play in the app.
  Phase 4 must now proceed through the official player architecture or stop for
  discussion.
- `@hyperframes/player` is imported only in the renderer. The main process does
  not import the `@hyperframes/core` package root; it serves the exported
  runtime file through the local protocol.
- Architecture review on 2026-04-26 selected the middle path for the next pass:
  Ripple remains the UI layer, `@hyperframes/player` remains the embedded
  player, and HyperFrames should prepare/serve the preview document wherever
  practical.
- Known blockers to investigate before switching fully to `src`: official
  player readiness across iframe origins, CSP for the selected preview origin,
  avoiding external Studio/browser launches, limiting preview-server routes to
  safe read operations, and proving nested compositions/assets/media work
  without CDN runtime requests.
