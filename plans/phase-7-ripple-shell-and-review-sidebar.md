# Phase 7: Center-Stage Ripple Shell And Review Sidebar

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple's normal desktop workspace feels like a motion-review
tool instead of a coding-agent workspace with a preview attached. The
HyperFrames preview and timeline become the center stage. Assets, compositions,
chat, comments, and utilities become toggleable context around that stage.

The visible product change is a new shell hierarchy:

- the Codex-inspired far-left app sidebar remains the place for projects,
  search, recent chats, settings, and global navigation
- the assets/compositions panel can be shown or hidden; when hidden, it
  disappears and the center stage expands, with recovery through top-right panel
  toggles and keyboard shortcuts
- the main editor region owns the HyperFrames preview, player controls,
  timeline, composition context, export entry point, and "Open in HyperFrames
  Studio" escape hatch; it also has a top-right panel toggle matching
  Frame.io's asset-viewer panel control
- the right review pane switches between `Chat`, `Comments`, and utility modes
  such as Details, Files, Changes, Plan, Terminal, and MCP through a vertical
  three-dot control next to the `Comments` tab

The important design decision is that panels are not drawers. A panel is either
visible and connected to the workspace layout, or it is gone and the center
stage uses the space. Users can bring hidden panels back from the top-right
panel toggles or keyboard shortcuts.

This phase does not implement persistent comments, frame-anchored revision
storage, accept/reject revision workflows, or export jobs. It prepares the shell
for those phases by putting the preview/timeline in the middle and moving chat,
comments, and utility context into a disciplined right-pane model.

## Progress

- [x] 2026-04-27 / User + Codex: Chose the Phase 7 shell direction: center-stage
  preview/timeline, Codex-inspired left app sidebar, no assets drawer, top-right
  panel toggles, and a right pane with `Chat`, `Comments`, and utility modes.
- [x] 2026-04-27 / Codex: Inspected the current renderer layout and chose a new
  `src/renderer/features/ripple-shell/` boundary rather than moving the full
  legacy `ChatView` layout.
- [x] 2026-04-27 / Codex: Implemented a first center-stage desktop shell for
  selected local Ripple projects while preserving the existing non-Ripple agent
  workspace.
- [x] 2026-04-27 / Codex: Added pure layout-state tests for panel visibility,
  right-pane modes, and keyboard recovery.
- [x] 2026-04-27 / Codex: Smoke-tested the built Electron preview against a
  local Ripple project and verified assets/review panel toggles, Comments mode,
  utility menu selection, and center-stage preview expansion.
- [x] 2026-04-27 / Codex: Reverted the hard rail-specific color tokens and
  switched the global app rail experiment to existing surfaces with lowered
  alpha and backdrop blur.
- [x] 2026-04-27 / Codex: Added the missing center-stage panel toggle so the
  top-right panel controls now cover assets, preview/player, and review.
- [x] 2026-04-27 / Codex: Added a top-left project-rail recovery button,
  simplified the project title area, and restyled the panel toggles toward the
  Frame.io rounded-square control style.
- [x] 2026-04-27 / Codex: Replaced the heavy VS Code pane-toggle glyphs with
  neutral Tabler outline layout icons from `react-icons/tb` and removed the
  purple active treatment from the top-bar panel buttons.
- [x] 2026-04-27 / User + Codex: Chose the top-bar project identity option that
  treats the left square as a rail-control button, with a subtle divider before
  the project name rather than a project thumbnail/avatar.
- [x] 2026-04-27 / User + Codex: Refined the rail-control behavior so the
  top-bar button only appears when the project rail is closed, the open rail
  uses its own close button, and the close affordance uses the same panel icon
  instead of double chevrons.
- [x] 2026-04-27 / User + Codex: Kept the project rail close control visible at
  all times instead of revealing it only on sidebar hover.
- [x] 2026-04-27 / User + Codex: Restored the macOS traffic-light hit area in
  the Ripple top bar when the project rail is closed and offset the reopen
  control so it does not collide with the native window buttons.
- [x] 2026-04-27 / User + Codex: Updated the root traffic-light visibility rule
  so native macOS controls stay visible for the Ripple shell even when the
  project rail is closed.
- [x] 2026-04-27 / User + Codex: Refined the Codex-inspired top chrome with a
  shorter Ripple top bar, smaller panel-control icons, and smoother project
  rail open/close animation.
- [x] 2026-04-27 / Codex: Fixed the expanded review-pane chat body so hiding
  the center preview no longer leaves the chat/input shrink-wrapped with a large
  empty gutter on the right.
- [x] 2026-04-27 / Codex: Replaced the temporary right-pane utility placeholders
  with the existing Details, Files, Changes, Plan, Terminal, and MCP surfaces.
- [x] 2026-04-27 / Codex: Added a compact MCP settings layout for the Ripple
  right pane so the server list and empty-state actions fit the locked review
  width without changing the normal Settings dialog.
- [x] 2026-04-27 / Codex: Fixed review findings from the utility transfer:
  "Open in HyperFrames Studio" now waits for a running preview state before
  opening the external URL, and the embedded Files utility mode now renders the
  existing file viewer when a file is selected.
- [x] 2026-04-27 / Codex: Moved the Ripple embedded chat toolbar and utility
  pane adapters out of legacy `active-chat.tsx` and into
  `src/renderer/features/ripple-shell/`, keeping behavior the same while making
  the right-pane code a Ripple-owned extension point for later comments and
  revisions.

## Surprises & Discoveries

- Observation: The roadmap's older "four-part layout" language is too rigid for
  the desired shell behavior.
  Evidence: The chosen design keeps the same durable surfaces, but assets and
  the right review pane are visibility-controlled panels rather than four
  always-present equal regions.

- Observation: Phase 6 intentionally placed the assets/compositions pane
  conservatively and deferred the full shell migration.
  Evidence: `plans/phase-6-assets-compositions-pane.md` says the first
  placement should reuse the current left-of-main-content area and keep chat
  available until Phase 7 reworks the full right-side chat/comment layout.

- Observation: The current renderer shell still concentrates many side surfaces
  inside the chat path.
  Evidence: `src/renderer/features/agents/main/active-chat.tsx` owns preview,
  diff, file viewer, plan, details, and terminal side/bottom surfaces, while
  `src/renderer/features/agents/ui/agents-content.tsx` decides whether the
  Ripple project pane replaces the old sub-chat pane.

- Observation: The safest first pass is to suppress legacy secondary sidebars
  inside the Ripple review pane rather than extracting every utility surface at
  once.
  Evidence: `ChatView` still owns details, files, changes, plan, terminal,
  preview, and diff behavior. The new `suppressSecondarySidebars` prop keeps
  those surfaces available in non-Ripple workspaces while the Ripple shell
  provides utility-mode placeholders for follow-up extraction.

- Observation: `bun run dev` built successfully but launched Electron's default
  app screen in this environment, while `bun run preview` launched the built
  Ripple app correctly.
  Evidence: The dev command showed the default Electron welcome window. The
  preview command loaded `out/renderer/index.html#windowId=main` and displayed
  the selected local Ripple project shell.

- Observation: Frame.io V4's public docs describe the workspace as a
  three-panel system controlled by three square top-right icons.
  Evidence: Frame.io's Panel Overview names the Project Navigation Panel, Asset
  Viewer Panel, and Asset Details Panel, and says each top-right icon expands
  or collapses the corresponding panel.

- Observation: The Frame.io player/commenting direction favors keeping tools in
  consistent, low-distraction positions while the media remains the focus.
  Evidence: Frame.io's V4 player article says playback/commenting/zoom tools
  are pinned in the same bottom player position across media types to minimize
  visual distraction.

- Observation: The apparent right-side padding in the expanded Chat pane was
  caused by the embedded `ChatView` shrink-wrapping inside a flex row slot, not
  by the chat message/input padding itself.
  Evidence: With the center preview hidden, the `Chat` / `Comments` switcher
  stretched across the expanded pane, while the chat title and input stopped at
  the child view's intrinsic width.

- Observation: The MCP settings page was already reusable, but its normal
  two-column settings width clipped empty-state actions inside the right review
  pane.
  Evidence: The live preview showed the `Add your first server` action cut off
  in MCP utility mode until `AgentsMcpTab` gained a compact width and shorter
  empty-state label for embedded use.

- Observation: The built preview can auto-resume a previous agent chat and emit
  Claude authentication noise unrelated to shell rendering.
  Evidence: `bun run preview` loaded the selected local Ripple project and the
  utility panes, while the log also showed `Not logged in · Please run /login`
  from an existing Claude Code session.

- Observation: The utility transfer exposed two lifecycle seams that tests did
  not cover on the first pass.
  Evidence: `startPreview` returned while HyperFrames Studio was still in the
  `starting` state, and the embedded Files mode updated `fileViewerPath` while
  all legacy file-viewer surfaces were suppressed inside `ChatView`.

## Decision Log

- Decision: Make the HyperFrames preview/timeline the center-stage default for
  selected local Ripple projects.
  Rationale: Motion users should experience the video/composition as the object
  of work. Chat and comments should provide context beside it, not push the
  preview into a secondary right sidebar.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Do not make the assets/compositions panel a drawer.
  Rationale: Drawers create an overlay mental model and can cover the work.
  Ripple should use a calmer app-layout model: the panel is visible and
  connected, or hidden and the center stage expands.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Use top-right panel toggles and keyboard shortcuts to recover hidden
  panels.
  Rationale: This follows the Frame.io-inspired reference while avoiding a
  permanent collapsed edge rail. Users must never get stranded after hiding the
  assets/compositions panel.
  Date/Author: 2026-04-27 / User + Codex

- Decision: Treat Details, Files, Changes, Plan, Terminal, MCP, and similar
  tools as right-pane utility modes, not equal primary panes.
  Rationale: These surfaces are useful, but they should not compete with the
  preview/timeline as permanent columns. The vertical three-dot utility control
  next to `Comments` opens or selects these modes, and each utility view offers
  a clear path back to `Chat`.
  Date/Author: 2026-04-27 / User + Codex

## Outcomes & Retrospective

First Phase 7 shell pass is implemented for selected local Ripple projects.
The app now has a Ripple-specific desktop workspace boundary that places the
HyperFrames preview and timeline in the center, keeps the assets/compositions
pane as a connected hideable panel, and moves Chat/Comments/utility context
into a disciplined right review pane.

The new right pane has a compact Chat/Comments switcher and a vertical utility
menu for Details, Files, Changes, Plan, Terminal, and MCP. Those utility modes
now mount the existing built surfaces inside the Ripple review pane: Details
uses the project, task, plan, terminal, changes, and MCP widgets; Files uses the
file tree and opens selected files in the same embedded pane; Changes uses the
changes panel; Plan and Terminal use their expanded surfaces; and MCP uses the
server settings page in compact embedded mode. The
legacy surfaces are not removed; they are suppressed only inside the Ripple
review pane, so non-Ripple agent workspaces keep their existing preview, diff,
files, details, plan, and terminal behavior.

The shell includes top-right panel toggles plus keyboard-driven recovery
through the shared layout-state helper. The built Electron preview smoke
verified that hiding assets expands the center stage, hiding review expands the
stage to the right, Comments mode renders the Frame.io-inspired empty comment
pane, and selecting a utility mode changes the same right pane rather than
opening another permanent column.

After the Frame.io panel pass, the top-right controls now represent all three
major panels: assets/compositions, preview/player, and review. The hard
rail-specific color experiment was reverted; the current rail experiment keeps
the original app surfaces but lowers the background alpha and adds backdrop blur
for a lighter, more glass-like feel.

The shell top bar now keeps the project rail recovery affordance at the far
left, removes the decorative primary-color marker before the project name, and
drops the redundant `/ Preview` breadcrumb text. Panel toggles are larger
rounded-square controls with monochrome active states, closer to the Frame.io
reference than the earlier purple-accented treatment.

Validation:

- `bun test src/renderer/features/ripple-shell` passed.
- `bun run test:ripple` passed.
- `bun run build` passed.
- `git diff --check` passed.
- `bun run ts:check` still fails on the known repo-wide baseline. No
  `src/renderer/features/ripple-shell/*` files appear in the failure list.
- `bun run preview` launched the built Electron app and supported the live
  shell smoke. `bun run dev` opened Electron's default welcome screen in this
  environment and was not useful for visual QA.
- After the expanded-chat fix, `bun test src/renderer/features/ripple-shell`
  passed, `git diff --check` passed, and `bun run preview` plus Computer Use
  verified the chat title/input stretch across the expanded review pane with
  the center preview hidden.
- After the utility-page transfer, `bun test src/renderer/features/ripple-shell`
  passed, `bun run test:ripple` passed, `bun run build` passed, and
  `git diff --check` passed. `bun run preview` plus Computer Use verified the
  Details, Files, and MCP utility modes in the locked review-pane layout.
- After the review-findings fix, `bun test
  src/main/lib/hyperframes/preview-manager.test.ts
  src/renderer/features/ripple-shell` passed, `bun run test:ripple` passed,
  `bun run build` passed, and `git diff --check` passed.
- After the organization pass, `bun test src/renderer/features/ripple-shell
  src/main/lib/hyperframes/preview-manager.test.ts
  src/renderer/components/ui/resizable-sidebar.test.ts` passed and
  `git diff --check` passed.

## Context and Orientation

Ripple is being migrated from the 1Code desktop/chat/agent foundation into a
local-first motion graphics app. Phases 4, 5, and 6 establish the pieces Phase 7
must compose:

- `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx` wraps the
  HyperFrames player, preview controls, and timeline surface for the active
  composition.
- `src/renderer/features/hyperframes/HyperFramesTimeline.tsx` and
  `src/renderer/features/hyperframes/timeline-player-adapter.ts` provide the
  read-only HyperFrames timeline model and synchronized player state.
- `src/renderer/features/hyperframes/HyperFramesProjectPane.tsx` provides the
  assets/compositions pane from Phase 6.
- `src/renderer/features/agents/ui/agents-content.tsx` currently chooses
  desktop layout, places the Ripple project pane, and renders `ChatView` as the
  main content.
- `src/renderer/features/agents/main/active-chat.tsx` currently owns the main
  chat surface and many side surfaces: preview, diff, file viewer, details,
  plan, terminal, and bottom terminal.
- `src/renderer/features/layout/agents-layout.tsx` wraps the global
  Codex-inspired app sidebar and the main content area.

In this plan, "center stage" means the central editor surface containing the
active composition preview, player chrome, timeline, and export context. "Right
review pane" means one right-side panel whose mode can be `Chat`, `Comments`, or
a utility view. "Utility mode" means a secondary tool such as Details, Files,
Changes, Plan, Terminal, or MCP shown inside that same right pane rather than as
another permanent column.

The existing non-Ripple agent workspace should continue to use its current
layout. Phase 7 should branch on selected local Ripple projects and avoid
breaking generic coding-agent chats, sandbox previews, file review, or terminal
flows outside the Ripple path.

## Plan of Work

First, define the new shell state model in a small pure module before moving UI.
The model should describe:

- whether the assets/compositions panel is visible
- whether the center preview/player panel is visible
- whether the right pane is visible
- the current right-pane mode, such as `chat`, `comments`, `details`, `files`,
  `changes`, `plan`, `terminal`, or `mcp`
- top-right panel toggle behavior
- keyboard shortcut behavior, with recovery even when a panel is hidden
- which legacy sidebars are still allowed for non-Ripple workspaces

Second, introduce a Ripple-specific desktop shell boundary. Prefer a new
`src/renderer/features/ripple-shell/` module if the existing agent layout is too
entangled; otherwise keep the first pass local to `AgentsContent` behind a
well-named component. The shell boundary should receive selected project/chat
state and compose the Phase 4-6 pieces without making the renderer launch shell
commands or trust absolute project paths.

Third, move the HyperFrames preview/timeline into the center editor region for
selected local Ripple projects. In this path, `HyperFramesPreviewPlayer` should
not be opened as a right `ResizableSidebar`. It should occupy the main central
workspace by default and be controlled by the middle top-right panel toggle.

Fourth, adapt the Phase 6 assets/compositions pane into a true layout panel. It
should be visible or hidden, not overlaid as a drawer. When hidden, the center
stage expands. The top-right panel toggles and a keyboard shortcut restore it.
Keep the last width if the existing resizable state is useful, but do not expose
a collapsed edge rail as the primary recovery mechanism.

Fifth, build the right review pane. Its top bar should contain a compact
Frame.io-style segmented switcher for `Chat` and `Comments`, with a vertical
three-dot utility control to the right. Selecting a utility changes the same
pane to that utility view. A utility view must provide a clear way back to
`Chat`, either through the persistent top switcher or a back affordance that
returns to the prior review mode.

Sixth, move or wrap existing secondary surfaces into right-pane utility modes.
Start with the safest read-oriented surfaces: Details, Files, Changes, Plan, and
Terminal. Terminal can remain available as a bottom or expanded view for
advanced use if needed, but its normal entry point in the Ripple shell should be
through the utility control inside the right pane.

Seventh, add top-right panel controls to the connected shell top bar. The
controls should be icon-first and tooltiped. They should toggle the
assets/compositions panel and right review pane without adding explanatory
in-app text. Keyboard shortcuts should use the same state transitions as the
buttons.

Eighth, preserve mobile and legacy behavior. Mobile can keep the existing
full-screen mode switching until a later dedicated mobile shell pass. Non-Ripple
coding-agent chats should keep their current preview, terminal, file, details,
and diff behavior unless this phase explicitly ports a safe shared utility
component.

Ninth, do a visual QA pass. The shell should feel like one connected app surface
with a top bar, not floating cards. At wide widths, the preview/timeline should
read as the primary workspace. At laptop widths, hiding assets should give the
preview enough room. Text and controls must not overlap when panels are narrow.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple` unless noted otherwise.

1. Re-read this ExecPlan, `ROADMAP.md`, and `plans/phase-6-assets-compositions-pane.md`.

2. Inspect current layout files:
   `src/renderer/features/layout/agents-layout.tsx`,
   `src/renderer/features/agents/ui/agents-content.tsx`,
   `src/renderer/features/agents/main/active-chat.tsx`,
   `src/renderer/features/agents/atoms/index.ts`,
   `src/renderer/features/agents/utils/project-pane-layout.ts`,
   `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`, and
   `src/renderer/features/hyperframes/HyperFramesProjectPane.tsx`.

3. Add pure layout-state helpers and tests, likely under
   `src/renderer/features/ripple-shell/`, for panel visibility, right-pane mode,
   toggle behavior, and keyboard recovery.

4. Add or extract a `RippleShell` component for selected local Ripple projects.
   It should render the main connected shell: optional assets/compositions
   panel, center HyperFrames preview/timeline region, and right review pane.

5. Wire `AgentsContent` so selected local Ripple projects use `RippleShell`,
   while non-Ripple chats continue through the existing `ChatView` layout.

6. Move `HyperFramesPreviewPlayer` into the center stage for the Ripple path and
   remove the right-preview-sidebar path only for selected local Ripple projects.

7. Render `HyperFramesProjectPane` as a visible-or-hidden left panel controlled
   by the new shell state. Make closing the panel expand the center stage, and
   make the top-right panel toggle plus keyboard shortcut restore it.

8. Create the right review pane with `Chat`, `Comments`, and a vertical
   three-dot utility control. Reuse existing chat components where possible, but
   keep the pane surface distinct from the center stage.

9. Add initial utility modes by wrapping existing Details, Files, Changes, Plan,
   Terminal, and MCP surfaces. If a surface is too tightly coupled to current
   `ChatView`, add a placeholder utility mode with a clear empty state and record
   the extraction follow-up in this plan before expanding scope.

10. Add top-right panel toggle buttons with tooltips and keyboard shortcuts for
    assets, preview/player, and review. The same reducer/helper should drive
    clicks and shortcuts.

11. Run focused tests for layout helpers and any extracted utilities. Then run
    `bun run test:ripple`, `bun run build`, `git diff --check`, and
    `bun run ts:check` if useful against the known repo-wide baseline.

12. Run live Electron QA with `bun run dev`. Verify a selected Ripple project,
    a non-Ripple local chat, and a narrow laptop-sized window. Update this
    ExecPlan with progress, discoveries, validation evidence, and any deferred
    extraction work.

## Validation and Acceptance

Automated validation:

- Pure layout tests cover panel visibility, no-drawer behavior, center-stage
  visibility, right-pane mode transitions, utility-to-chat return behavior, and
  keyboard shortcut recovery.
- Existing Phase 4-6 HyperFrames tests continue to pass.
- `bun run test:ripple` passes.
- `bun run build` passes.
- `git diff --check` passes.
- `bun run ts:check` is run or the existing repo-wide baseline failures are
  recorded with confirmation that new Phase 7 files are not implicated.

Manual/Electron acceptance:

- Opening a local Ripple project shows the HyperFrames preview/timeline in the
  main center region, not in a right preview sidebar.
- The assets/compositions panel can be hidden. When hidden, it disappears and
  the center stage expands rather than showing an overlay drawer or collapsed
  edge rail.
- The assets/compositions panel can be restored by a top-right panel toggle and
  keyboard shortcut.
- The center preview/player panel can be hidden and restored by the middle
  top-right panel toggle and keyboard shortcut.
- The right pane can switch between `Chat` and `Comments`.
- The vertical three-dot utility control next to `Comments` can switch the same
  right pane into utility views such as Details, Files, Changes, Plan, Terminal,
  or MCP.
- Utility views provide a clear way back to `Chat`.
- Details, Files, Changes, Plan, Terminal, and MCP do not appear as simultaneous
  permanent columns in the normal Ripple shell.
- The connected shell top bar and panel borders feel app-like and compact, not
  like nested cards or a marketing page.
- The "Open in HyperFrames Studio" escape hatch remains visible from the center
  editor context or an appropriate utility menu.
- Existing non-Ripple agent chats still support their prior preview, details,
  diff, file viewer, and terminal workflows.
- Mobile behavior remains usable, even if it keeps the previous full-screen mode
  switching for now.
- User-facing primary-path language uses project, composition, asset, preview,
  timeline, chat, comment, version, accept, reject, and export language. It does
  not foreground repo, branch, worktree, dev server, or dependency terminology.

## Idempotence and Recovery

Panel state changes must be safe to repeat. Toggling the assets/compositions
panel on and off should not reload the selected composition, lose active
composition state, or clear chat input. Toggling the center preview/player pane
should hide or reveal that panel without changing the selected composition.
Toggling the right pane should not stop or restart preview playback unless the
user explicitly reloads the preview.

If the user hides both contextual panels, the top bar must remain visible so the
panels can be restored. Keyboard shortcuts must use the same state transitions
as the buttons, so a broken visual affordance does not strand the user.

Persisted panel preferences should have safe defaults. If an old localStorage
value or atom state refers to a removed sidebar mode, the Ripple shell should
fall back to assets visible, right pane visible, and right mode `chat`.

If moving a utility surface into the right pane uncovers tight coupling to
`ChatView`, keep the legacy surface available outside the Ripple path, ship a
minimal placeholder or adapter for the Ripple path, and record the extraction
work in this plan. Do not break non-Ripple agent workspaces to finish the
visual shell.

If the center-stage player layout exposes size or timing regressions, recover by
temporarily gating the new shell behind selected local Ripple projects only and
keeping the existing preview sidebar for all other chats.

## Interfaces and Dependencies

Existing dependencies:

- React 19, Jotai, React Query, Radix, Tailwind, lucide icons, and the existing
  app component wrappers.
- Phase 4 `HyperFramesPreviewPlayer` and `ripple-preview:` source loading.
- Phase 5 `HyperFramesTimeline` and `RippleTimelinePlayerAdapter`.
- Phase 6 `HyperFramesProjectPane` and project browser tRPC routes.
- Existing details, file viewer, changes, plan, MCP, and terminal components.

Likely new or changed renderer interfaces:

- `src/renderer/features/ripple-shell/RippleShell.tsx`
- `src/renderer/features/ripple-shell/ripple-shell-layout.ts`
- `src/renderer/features/ripple-shell/ripple-shell-atoms.ts`
- `src/renderer/features/ripple-shell/RippleReviewPane.tsx`
- `src/renderer/features/ripple-shell/RippleShellTopBar.tsx`
- utility adapters around existing details, files, changes, plan, terminal, and
  MCP surfaces where direct reuse is not clean

Existing files likely to change:

- `src/renderer/features/agents/ui/agents-content.tsx`
- `src/renderer/features/agents/main/active-chat.tsx`
- `src/renderer/features/agents/atoms/index.ts`
- `src/renderer/features/agents/utils/project-pane-layout.ts`, if its Phase 6
  helper survives into the new shell
- `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`, only if it
  needs host layout props for center-stage use
- `src/renderer/features/hyperframes/HyperFramesProjectPane.tsx`, only if it
  needs host layout/top-bar integration props

No new main-process filesystem, preview, render, or export APIs are required for
the first shell pass. If a utility mode performs filesystem, process, preview,
render, or export behavior, it must continue to use the existing main-process
tRPC or Electron boundaries.

## Artifacts and Notes

The conversation that created this plan explored rough layout sketches, but the
sketches are not source-of-truth artifacts. The durable decisions are recorded
in the Decision Log above:

- no drawer for assets/compositions
- panels are visible or gone
- center-stage preview/timeline
- Frame.io-style top-right panel toggles
- `Chat` / `Comments` / vertical-dot utility mode model in the right pane
- Details, Files, Changes, Plan, Terminal, MCP, and similar tools are secondary
  right-pane modes, not equal primary panes

This phase should keep future Phase 8 comments and revisions in mind. The right
pane should be ready to show frame/time comment threads later, but it should not
fake persistence or isolated revision behavior before Phase 8 implements those
data and execution paths.

2026-04-27 first-pass artifacts:

- Added `src/renderer/features/ripple-shell/ripple-shell-layout.ts` and
  `ripple-shell-layout.test.ts` for panel and right-pane state transitions.
- Added `src/renderer/features/ripple-shell/ripple-shell-atoms.ts` for
  persisted window-scoped shell panel preferences.
- Added `src/renderer/features/ripple-shell/RippleShell.tsx` and
  `RippleReviewPane.tsx` for the center-stage shell and review sidebar.
- Added `src/renderer/features/ripple-shell/RippleEmbeddedChatToolbar.tsx` and
  `RippleEmbeddedUtilityPane.tsx` for the Ripple-owned adapters that let the
  legacy chat engine render inside the new right-pane shell without keeping
  utility-page UI inside `active-chat.tsx`.
- Updated `src/renderer/features/agents/ui/agents-content.tsx` so selected
  local Ripple projects render `RippleShell`, while settings, automations,
  mobile, new-chat, and non-Ripple chat paths stay on the existing layout.
- Updated `src/renderer/features/agents/main/active-chat.tsx` with
  `suppressSecondarySidebars` so embedded Chat can live inside the right review
  pane without spawning legacy sidebars.
- Added `src/renderer/features/ripple-shell` to `bun run test:ripple`.
