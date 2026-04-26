# Phase 4: HyperFrames Preview Player

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple has a usable HyperFrames preview player inside the
existing preview-pane pattern. A user can open a Ripple project, ask to preview
the active composition, and see the motion work play in an app-native player
surface with clear loading, refresh, stop, and error states.

This phase intentionally steps back from the full Ripple shell redesign. It
does not add the assets/compositions pane, the right chat/comment review rail,
persistent comments, revisions, or export UX. Those are later phases. The goal
is to make the preview player real first, because the rest of the shell should
compose around a working motion preview instead of around a blank center panel.

The player should borrow HyperFrames' runtime and preview semantics, but it
should look and feel like the current Ripple app. That means compact panels,
existing Radix/Tailwind components, familiar preview controls where reusable,
and no wholesale copy of HyperFrames Studio's visual chrome.

## Progress

- [x] 2026-04-26 / Codex: Re-scoped Phase 4 after the first broad shell
  implementation screenshot showed the plan had moved too quickly. Phase 4 now
  focuses only on a HyperFrames preview player built from the existing preview
  pane pattern.
- [x] 2026-04-26 / Codex: Inspected the existing preview path:
  `active-chat.tsx` opens a right `ResizableSidebar` when preview is available,
  and `AgentPreview` already handles iframe loading, reload, viewport controls,
  scale, device sizing, path persistence, and external open.
- [x] 2026-04-26 / Codex: Ran parallel research on the official HyperFrames
  packages, the existing Ripple preview-pane architecture, and the installed
  local HyperFrames package. Verified the current npm package family is
  `0.4.30`, while the checked-out app currently has `hyperframes@0.4.28`
  installed from the lockfile.
- [x] 2026-04-26 / Codex: Selected Option 4 as the target architecture:
  official HyperFrames packages behind a Ripple-owned adapter, with the CLI
  preview server retained as the local serving and hot-reload backbone until the
  direct player path is validated.
- [ ] Run the focused package integration spike and record exact install,
  import, CSP, and package-smoke results.
- [ ] Extract or adapt reusable preview-pane primitives from `AgentPreview`.
- [ ] Implement `HyperFramesPreviewPlayer` for Ripple projects.
- [ ] Wire HyperFrames preview availability into the existing preview-pane
  trigger path.
- [ ] Validate with a real scaffolded Ripple project and update this plan with
  outcomes.

## Surprises & Discoveries

- Observation: The current preview pane is already a good base for Phase 4.
  Evidence: `src/renderer/features/agents/main/active-chat.tsx` renders a right
  `ResizableSidebar` for preview when `canOpenPreview` is true, and
  `src/renderer/features/agents/ui/agent-preview.tsx` owns iframe load state,
  reload, viewport mode, scale, device presets, resize handles, URL/path state,
  and external-open controls.
- Observation: The existing preview detector is coding-agent specific.
  Evidence: `AgentsContent` and `active-chat.tsx` decide preview availability
  from `chatData.sandbox_id` and `chatMeta.sandboxConfig.port`, then build a
  CodeSandbox-style URL.
- Observation: Phase 3 already provides the safe main-process HyperFrames
  lifecycle calls needed by a player.
  Evidence: `src/main/lib/trpc/routers/hyperframes.ts` exposes `doctor`,
  `listCompositions`, `startPreview`, `stopPreview`, `getPreviewStatus`,
  `snapshot`, `render`, `getRenderStatus`, and `cancelRender`.
- Observation: The installed `hyperframes@0.4.28` package is CLI-first in this
  checkout.
  Evidence: `package.json` lists `hyperframes` and `gsap`; there is no
  installed `node_modules/@hyperframes` package directory. The package contains
  CLI output, bundled runtime files, and a static Studio build under
  `node_modules/hyperframes/dist/`.
- Observation: The currently published HyperFrames package family is `0.4.30`.
  Evidence: `npm view hyperframes version`,
  `npm view @hyperframes/player version`,
  `npm view @hyperframes/studio version`, and
  `npm view @hyperframes/core version` all returned `0.4.30` on
  2026-04-26.
- Observation: `@hyperframes/player` is the right preview primitive for a
  native Ripple player surface.
  Evidence: Official docs describe a `<hyperframes-player>` custom element
  with `play`, `pause`, `seek`, `currentTime`, `duration`, `ready`,
  `timeupdate`, and an `iframeElement` bridge for editor/timeline integrations.
- Observation: `@hyperframes/studio` should be used selectively, not embedded
  wholesale in Phase 4.
  Evidence: Official docs expose React components and hooks for player
  controls, timeline, file tree, source editor, element picking, and full
  `StudioApp`; using the full app would fight Ripple's current UI style and
  pull Phase 5 and later shell work into this phase.
- Observation: `@hyperframes/core` is the right source for structured metadata
  and future timeline/assets models.
  Evidence: Official docs expose parsing, HTML generation, composition
  metadata extraction, linting, runtime helpers, and schemas.
- Observation: The current renderer CSP likely needs a `frame-src` entry before
  an app-owned local preview iframe or player can reliably load
  `http://localhost:<port>` content.
  Evidence: `src/renderer/index.html` allows local `connect-src`, but does not
  declare `frame-src`; fallback to `default-src 'self'` can block preview
  frames.
- Observation: The CLI preview server is still useful even with Option 4.
  Evidence: The installed CLI bundle serves Studio assets, runtime endpoints,
  SSE events, and project files from safe local routes. Direct `file://` loading
  would bypass those routes and risks missing runtime injection, hot reload, and
  path handling.
- Observation: The broad shell implementation makes the center workspace feel
  empty when the player is not real yet.
  Evidence: The user-provided screenshot showed the attempted four-part shell
  with composition cards and a chat/comment right rail, but the central preview
  region was blank. The user requested splitting the work so Phase 4 starts
  with the preview player only.

## Decision Log

- Decision: Phase 4 is now only the HyperFrames preview player.
  Rationale: A working motion preview is the foundation for assets,
  composition switching, comments, review, and export. Building the whole shell
  first produced too much UI before the central experience was ready.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Build on the existing `AgentPreview`/preview-sidebar pattern rather
  than replacing the whole shell.
  Rationale: 1Code already has a mature preview-pane interaction: iframe,
  loading state, refresh, viewport/scale controls, resize behavior, and a
  preview sidebar trigger. Ripple should adapt that proven local pattern for
  HyperFrames.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Validate the Option 4 player stack through a prototype milestone
  before committing to final implementation details.
  Rationale: The target architecture is official HyperFrames packages behind a
  Ripple-owned adapter, but the exact serving path still needs proof. The
  player may load a URL from the Phase 3 managed preview server, a direct
  runtime/player route, or a hybrid. The implementation should follow observed
  behavior, not assumptions.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Adopt Option 4 as the target Phase 4 architecture, but implement it
  through a small adapter that can fall back to the managed CLI preview iframe.
  Rationale: The official packages map directly to Ripple's future needs:
  `@hyperframes/player` for the preview surface, `@hyperframes/core` for
  composition/timeline metadata, and selected `@hyperframes/studio` primitives
  for later timeline/editor behavior. The current app does not yet install
  those scoped packages, and the installed CLI is `0.4.28` while current npm is
  `0.4.30`, so the integration must prove exact-version compatibility before
  the UI depends on it.
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
  current UI styling. This applies to the player now and to the future
  assets/compositions pane and timeline.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Keep Phase 5 for assets/compositions and defer the full shell and
  review sidebar until after the player exists.
  Rationale: The next useful layer after a working player is the composition
  and asset browser that drives it. Chat/comments/widgets should be integrated
  after those two surfaces are stable.
  Date/Author: 2026-04-26 / User + Codex

## Outcomes & Retrospective

Architecture direction selected; implementation not started.

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
mode. `AgentPreview` builds a CodeSandbox-style URL from `sandboxId` and
`port`, then renders an iframe with app-native controls. It also uses helper
components like `PreviewUrlInput`, `ViewportToggle`, `ScaleControl`,
`DevicePresetsBar`, `ResizeHandle`, and `MobileCopyLinkButton`.

The HyperFrames player should reuse that interaction model where it still
fits, but change the source of truth. Instead of relying on
`chatData.sandbox_id` and `sandboxConfig.port`, it should use the selected
Ripple project and Phase 3 `hyperframes` routes. A Ripple project is
previewable when the main process can resolve the project, find a valid
HyperFrames entry/composition, and start or reuse a managed preview session.

The phrase "native HyperFrames preview player" does not mean rewriting all of
HyperFrames Studio in React in this phase. It means Ripple owns the player
chrome, states, controls, and placement, while HyperFrames remains the source
of truth for loading, timing, seeking, preview, and render behavior. If the only
reliable first stack is an iframe backed by `hyperframes preview`, that is
acceptable as long as the app chrome and lifecycle are Ripple-owned and the plan
records what remains to make it more native later.

## Plan of Work

First, run a focused Option 4 integration spike. The preferred stack is:

- `@hyperframes/player` for `HyperFramesPreviewPlayer`. Ripple should import
  the custom element, provide a main-process-approved composition `src`, listen
  for `ready`, `timeupdate`, `play`, `pause`, `ended`, and `error`, and build
  app-owned controls around `play()`, `pause()`, `seek()`, `currentTime`, and
  `duration`.
- `@hyperframes/core` for metadata and future model extraction. Use it for
  structured composition metadata, clip/timeline parsing, validation, and later
  assets/compositions pane data where it is more reliable than ad hoc HTML
  scraping.
- `@hyperframes/studio` selectively, not as `StudioApp`. Use helpers such as
  `resolveIframe`, timeline/player hooks, or the Timeline component only after
  they are proven to work with the player iframe and can be styled within
  Ripple's current UI.
- `hyperframes` CLI preview server as the local serving and hot-reload
  backbone unless the official player can load the project with equivalent
  runtime injection, asset resolution, and local-first behavior. The player can
  still point at a safe URL served by the managed preview server.

The spike must pin or upgrade the HyperFrames package family as one exact
version. Current npm registry checks show `hyperframes`, `@hyperframes/player`,
`@hyperframes/studio`, and `@hyperframes/core` at `0.4.30`; the existing
lockfile currently installs `hyperframes@0.4.28`. Do not mix those versions.

Keep the managed preview iframe as the recovery path. If the scoped packages
fail to import, rely on CDN fallbacks, require same-origin access that the app
cannot provide, or fail packaging, Phase 4 should still ship the existing
main-process-managed preview URL inside Ripple-owned chrome and record what
blocked the full native player path.

Second, extract reusable preview primitives if needed. `AgentPreview` may be
split into a generic `PreviewFrame` plus CodeSandbox-specific and
HyperFrames-specific wrappers, or it may remain intact while a new
`HyperFramesPreviewPlayer` reuses the smaller controls. Do not break existing
CodeSandbox/coding-agent preview behavior while doing this.

Third, implement the HyperFrames player surface under
`src/renderer/features/hyperframes/`. Likely files:

- `HyperFramesPreviewPlayer.tsx`
- `hyperframes-player-bridge.ts`
- `hyperframes-preview-state.ts`
- `hyperframes-preview-utils.ts`
- `hyperframes-preview-utils.test.ts`

The player should accept a trusted `projectId` and optional active composition
metadata, call `trpc.hyperframes.startPreview`, resolve a safe composition URL
through the main process, show iframe/player loading state, call
`trpc.hyperframes.getPreviewStatus` for health/errors, support reload/restart,
and call `trpc.hyperframes.stopPreview` when the user closes or stops the
managed preview. The renderer must never derive file paths or absolute
composition URLs directly.

Fourth, wire preview availability into the existing preview trigger path.
Where the old path checks `sandbox_id` and `sandboxConfig.port`, add a
Ripple-project path that uses `selectedProjectAtom` and project setup state.
The preview pane should still behave like the current app: it opens as a pane,
can be resized, can be closed, and does not force the full shell layout.

Fifth, make the player feel like Ripple, not a pasted-in Studio page. Reuse the
current app's buttons, tooltips, compact headers, loading patterns, and
resizable panel behavior. Borrow only HyperFrames concepts: composition,
preview, frame/time, play/pause/seek, aspect ratio, refresh, and Studio escape
hatch.

Sixth, preserve the architecture for later phases. The same boundary should be
used for Phase 5 assets/compositions and the later timeline: main process
validates the selected project and returns structured HyperFrames models;
official HyperFrames packages provide parsing/player/editor primitives; Ripple
renders the panes in the app's current UI style.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple` unless noted otherwise.

1. Inspect the existing preview implementation:
   `src/renderer/features/agents/main/active-chat.tsx`,
   `src/renderer/features/agents/ui/agents-content.tsx`,
   `src/renderer/features/agents/ui/agent-preview.tsx`,
   `src/renderer/features/agents/ui/preview-url-input.tsx`,
   `src/renderer/features/agents/ui/viewport-toggle.tsx`, and
   `src/renderer/features/agents/atoms/index.ts`.

2. Inspect HyperFrames runtime/player possibilities in the installed package:
   `node_modules/hyperframes/package.json`,
   `node_modules/hyperframes/dist/cli.js`,
   `node_modules/hyperframes/dist/hyperframe-runtime.js`,
   `node_modules/hyperframes/dist/hyperframe.runtime.iife.js`, and
   `node_modules/hyperframes/dist/studio/index.html`.

3. Verify package availability and versioning:
   `npm view hyperframes version`,
   `npm view @hyperframes/player version`,
   `npm view @hyperframes/studio version`, and
   `npm view @hyperframes/core version`. Install or pin the package family only
   as one exact version in the implementation step.

4. Prototype the smallest official-player path against a scaffolded Ripple
   project. Prove that `@hyperframes/player` imports in the renderer, can load a
   main-process-approved local composition URL, emits ready/time/error events,
   and supports app-owned play, pause, seek, reload, and aspect-ratio behavior.

5. Prototype the managed-preview fallback against the same project. Start with
   `trpc.hyperframes.startPreview` or the underlying Phase 3 service and prove
   the iframe can show the default composition if the official-player path
   fails.

6. Add or adapt a main-process URL contract such as
   `getPreviewCompositionUrl({ projectId, compositionId })`. It must resolve
   root and external composition files safely, avoid confusing Ripple database
   IDs with HyperFrames composition IDs, and return only URLs derived from a
   validated project context.

7. Record the selected stack in this ExecPlan with evidence: commands run,
   files inspected, package versions, CSP changes, and what the player can and
   cannot control.

8. Implement `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`
   and supporting utilities. Keep the component focused on project preview,
   not assets, comments, chat, or export.

9. Adapt or reuse the current preview sidebar trigger so Ripple projects can
   show `HyperFramesPreviewPlayer` in the existing preview pane. Keep existing
   coding-agent preview behavior working.

10. Add focused tests for utility decisions such as preview availability,
   status-to-label mapping, aspect-ratio sizing, and URL/reload state.

11. Run validation, update this ExecPlan, and leave Phase 5 assets/compositions
   work clearly separate.

## Validation and Acceptance

Automated validation:

- `bun run test:ripple`
- focused `bun test` for new HyperFrames preview utility tests
- `bun run build`
- `bun run ts:check`, recording the existing baseline failures if they remain
  and confirming no new Phase 4 files are implicated
- `git diff --check`

Manual/Electron validation:

- Start the app with `bun run dev`.
- Create or open a Ripple project with the default scaffold.
- Open the preview pane using the existing preview affordance/path.
- Confirm the pane shows the HyperFrames preview player, not a blank center
  workspace.
- Confirm the preview uses the selected project and active composition.
- Confirm loading, ready, reload/restart, stopped, close, and error states.
- Confirm player controls are Ripple-owned and driven through the
  HyperFrames player/runtime API, not through hidden renderer shell commands.
- Confirm any iframe/player content preserves the correct composition aspect
  ratio and does not overlap controls at narrow or wide pane widths.
- Confirm "Open in HyperFrames Studio" opens the managed preview URL when that
  URL exists.
- Confirm local preview frames are allowed by CSP and no required runtime/player
  asset is loaded from a CDN during normal local use.
- Confirm app-managed preview does not unexpectedly open the user's external
  browser, or record the mitigation required before shipping.
- Run a package smoke when practical and confirm HyperFrames package assets are
  available in `app.asar.unpacked` or the selected packaged-app location.
- Confirm existing non-Ripple coding-agent preview behavior still works or is
  unaffected by the new path.

Acceptance for Phase 4:

- Ripple projects can be previewed from the existing preview pane.
- The preferred player path uses official HyperFrames packages through a
  Ripple-owned adapter, with exact-version compatibility documented.
- If the official package path is blocked, the player is powered by Phase 3
  main-process HyperFrames routes and the managed preview iframe fallback, with
  the blocker recorded in this plan.
- The player has app-owned controls and clear states in Ripple's current UI
  style.
- The renderer does not spawn HyperFrames, FFmpeg, shell commands, or arbitrary
  filesystem operations.
- The renderer receives only main-process-approved preview URLs and never
  trusts absolute file paths for project or composition access.
- The implementation does not introduce the assets/compositions pane, the
  right chat/comment review sidebar, persistent comments, revision workflow, or
  export UI.

## Idempotence and Recovery

Starting preview should be idempotent. If a managed preview already exists for
the project, the player should reuse it unless the user explicitly restarts.
Stopping preview should call the Phase 3 stop route and tolerate already
stopped previews.

If a preview process is left running during development, stop it through the app
route first. Use `hyperframes preview --kill-all` only as a last-resort manual
recovery step because it can stop previews not launched by Ripple.

If the technology spike proves the official package path is not ready, record
the evidence and proceed with the managed preview iframe as the Phase 4
implementation. Do not block Phase 4 on a perfect native player if the app can
ship a reliable preview pane first.

If package installation or import creates a version mismatch, revert only the
Phase 4 dependency edits and either pin the entire HyperFrames family to one
working version or stay on the installed CLI package until the mismatch is
understood.

If a partial refactor of `AgentPreview` breaks existing preview behavior,
restore the old CodeSandbox wrapper and keep the HyperFrames path in a separate
component until the shared abstraction is safe.

## Interfaces and Dependencies

Existing interfaces to use:

- `selectedProjectAtom` from `src/renderer/features/agents/atoms`
- `agentsPreviewSidebarOpenAtom` and `agentsPreviewSidebarWidthAtom`
- `AgentPreview` and preview control helpers in
  `src/renderer/features/agents/ui/`
- `ResizableSidebar`
- `trpc.hyperframes.doctor`
- `trpc.hyperframes.listCompositions`
- `trpc.hyperframes.startPreview`
- `trpc.hyperframes.stopPreview`
- `trpc.hyperframes.getPreviewStatus`
- `window.desktopApi.openExternal`

Likely new interfaces:

- `HyperFramesPreviewPlayer`
- `HyperFramesPlayerBridge`
- `useHyperFramesPreview`
- `getPreviewCompositionUrl` or equivalent tRPC route
- `getHyperFramesPreviewAvailability`
- `mapHyperFramesPreviewStatus`
- optional shared `PreviewFrame` if extraction from `AgentPreview` is cleaner
  than duplication

Dependencies and constraints:

- Use React 19, Jotai, tRPC/React Query, Radix wrappers, Tailwind, and lucide
  icons already present in the app.
- Prefer official HyperFrames packages for the player architecture:
  `hyperframes`, `@hyperframes/player`, `@hyperframes/core`, and optionally
  `@hyperframes/studio`. Pin the package family to one exact version after the
  spike verifies the version to use.
- Keep filesystem and process orchestration in the main process.
- Keep local-first usage free of mandatory auth, GitHub, repo setup, manual
  dependency installs, and provider selection.
- Avoid normal-path CDN dependency for HyperFrames player/runtime assets.

## Artifacts and Notes

Source inspection evidence gathered while creating this revised plan:

- `src/renderer/features/agents/main/active-chat.tsx` already renders the
  preview pane as a right `ResizableSidebar`.
- `src/renderer/features/agents/ui/agent-preview.tsx` already implements iframe
  loading, reload, viewport, scale, device presets, resize handles, URL/path
  display, and external open.
- `src/renderer/features/agents/ui/agents-content.tsx` currently derives
  preview availability from CodeSandbox chat metadata.
- `src/main/lib/trpc/routers/hyperframes.ts` exposes the Phase 3 service calls
  the player should use.
- Official docs inspected on 2026-04-26:
  `@hyperframes/player` provides the custom-element player and iframe bridge;
  `@hyperframes/studio` provides editor, player, timeline, and file-tree
  primitives; `@hyperframes/core` provides parsing and metadata helpers; the
  CLI provides preview, compositions, snapshot, render, lint, and doctor
  commands.
- Local package inspection confirmed `hyperframes@0.4.28` is installed,
  `@hyperframes/player`, `@hyperframes/studio`, and `@hyperframes/core` are not
  installed, and `src/renderer/index.html` lacks `frame-src`.
- npm registry checks on 2026-04-26 confirmed `hyperframes`,
  `@hyperframes/player`, `@hyperframes/studio`, and `@hyperframes/core` are all
  currently published at `0.4.30`.
- User-provided screenshot of the first broad Phase 4 implementation showed the
  shell arrived before the preview player, leaving the central motion workspace
  too empty. This plan narrows Phase 4 to the player so later shell phases have
  something real to compose around.
