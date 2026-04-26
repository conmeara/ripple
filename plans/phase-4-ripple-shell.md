# Phase 4: Ripple Shell

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, selecting a Ripple project opens a motion-design workspace
instead of the old workspace/chat/dev-preview layout. The user can see their
projects, assets/compositions/templates area, a central HyperFrames
preview/timeline workspace, and a right sidebar that combines chat, frame
comments, chat history, and the existing details/files/widgets surfaces. They
can switch the active composition, refresh or restart preview, understand
preview readiness and errors, and open the same project in HyperFrames Studio
as an escape hatch.

This phase does not implement the full frame-comment revision system, durable
export jobs, or HyperFrames-aware agent prompts. Those belong to later phases.
The Phase 4 shell should still make the later work obvious: chat and comments
live in the same right review sidebar as details/widgets, comments are visually
anchored to the active HyperFrames composition, and all preview/editor actions
go through the main-process HyperFrames service created in Phase 3.

## Progress

- [x] 2026-04-26 / Codex: Created this ExecPlan from `ROADMAP.md`,
  `PLANS.md`, the completed Phase 3 plan, and current renderer/main-process
  source inspection.
- [x] 2026-04-26 / Codex: Updated the layout direction from user-provided
  Frame.io and current Ripple screenshots: the right sidebar remains and gains
  Chat/Comments on top; the central chat area becomes the main HyperFrames
  preview/timeline workspace; the existing chat list area becomes
  assets/compositions/templates.
- [x] 2026-04-26 / User + Codex: Confirmed two right-sidebar UX decisions:
  `Chat` / `Comments` is the primary top switcher, and details/files/widgets
  are a secondary layer inside the same sidebar.
- [ ] Build the first Ripple shell module and wire it into the selected-project
  path.
- [ ] Replace the sub-chat sidebar as the primary left-of-chat surface with a
  compositions/assets/templates pane.
- [ ] Replace generic sandbox preview assumptions with a project/composition
  based HyperFrames preview pane.
- [ ] Add active composition switching, preview refresh/restart/error states,
  and the HyperFrames Studio escape hatch.
- [ ] Validate the desktop shell with automated checks plus Electron/manual
  smoke coverage.

## Surprises & Discoveries

- Observation: The installed `hyperframes@0.4.28` package exposes a CLI and a
  bundled static Studio under `node_modules/hyperframes/dist/studio`, but this
  app does not currently depend on importable `@hyperframes/studio` or
  `@hyperframes/player` renderer packages.
  Evidence: `package.json` lists `hyperframes` and `gsap`; `ls
  node_modules/@hyperframes` returned no package directory; `node_modules/hyperframes/package.json`
  lists `@hyperframes/studio` only as a workspace dev dependency.
- Observation: The current desktop content path is still centered on chats,
  sub-chats, and coding-agent sidebars. The generic `AgentPreview` is tied to
  CodeSandbox-style `sandbox_id` plus port metadata, not Ripple projects or
  HyperFrames compositions.
  Evidence: `src/renderer/features/agents/ui/agents-content.tsx` renders
  `AgentsSubChatsSidebar`, `ChatView`, and `NewChatForm` for desktop, while
  `AgentPreview` computes `https://<sandbox>-<port>.csb.app` URLs.
- Observation: Phase 3 gives Phase 4 the safe backend contract it needs.
  Evidence: `src/main/lib/trpc/routers/hyperframes.ts` exposes `doctor`,
  `listCompositions`, `startPreview`, `stopPreview`, `getPreviewStatus`,
  `snapshot`, `render`, `getRenderStatus`, and `cancelRender`.
- Observation: The existing generic files router is not safe enough for primary
  Ripple project-file UI because several procedures accept renderer-supplied
  absolute paths.
  Evidence: `src/main/lib/trpc/routers/files.ts` has `search`, `readFile`, and
  `readTextFile` inputs based on `projectPath` or `filePath`; Phase 4 primary
  asset/file operations should use `projectId` and main-process path
  resolution.
- Observation: Project and composition persistence already exist.
  Evidence: `src/main/lib/db/schema/index.ts` defines `projects` with
  `activeCompositionId` and `compositions` with project, file, size, parent,
  and kind fields; `src/main/lib/ripple-projects/service.ts` provides
  `listProjectCompositions` and `setActiveComposition`.
- Observation: The desired interaction model is closer to Frame.io review than
  to a coding IDE. The right sidebar should host a top segmented control like
  `Chat` / `Comments`, retain chat history, and keep existing widgets such as
  details, files, changes, plan, terminal, and MCP servers available in that
  same sidebar.
  Evidence: User-provided screenshots show Frame.io's right-side
  `Comments`/`Fields` segmented control and the current Ripple right sidebar's
  `Details`/`Files` plus widget menu.

## Decision Log

- Decision: Implement the Phase 4 shell as a new renderer feature under
  `src/renderer/features/ripple-shell/`, then route selected-project desktop
  content through it.
  Rationale: Keeping the new shell module separate lets the implementation
  preserve useful 1Code chat components while avoiding another layer of
  chat-specific branching inside `AgentsContent`.
  Date/Author: 2026-04-26 / Codex

- Decision: Use the Phase 3 managed preview URL in an iframe for the first
  `HyperFramesStudioPane`, rather than importing `@hyperframes/studio` or
  rebuilding Studio panels in React.
  Rationale: The local dependency surface is CLI-first. The safe, tested path is
  `hyperframes.startPreview`, which starts the CLI-managed Studio/player server
  with the app-managed runtime environment.
  Date/Author: 2026-04-26 / Codex

- Decision: Keep the existing `ChatView` and `NewChatForm` inside a new
  Ripple-labeled right review sidebar for this phase.
  Rationale: Phase 4 is a shell and preview/editor integration. Rewriting
  agent streaming, prompt context, and comment revision execution belongs to
  Phases 5 and 7.
  Date/Author: 2026-04-26 / Codex

- Decision: Preserve the current right sidebar concept and merge chat/comment
  UX into it, instead of creating a separate chat/comment middle pane.
  Rationale: Frame.io's review UX keeps comments close to review metadata while
  leaving the center canvas for the asset. For Ripple, the active composition
  and timeline need the main workspace; chat, comments, history, and widgets
  should live in the right rail.
  Date/Author: 2026-04-26 / Codex

- Decision: Make `Chat` / `Comments` the primary top switcher in the right
  sidebar.
  Rationale: This keeps the highest-frequency review actions one click away and
  mirrors the Frame.io pattern the user wants to borrow.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Keep Details, Files, Changes, Plan, Terminal, MCP, and other
  widgets as a secondary layer inside the same right sidebar.
  Rationale: Ripple should not lose the useful existing widget surface. It
  should sit beneath or behind the primary review mode, as collapsible sections,
  a secondary tab row, or an equivalent compact widget control.
  Date/Author: 2026-04-26 / User + Codex

- Decision: Do not use renderer-provided absolute paths for the primary assets
  or project-file pane. Add or adapt project-ID-based main-process procedures
  when the shell needs file data.
  Rationale: Ripple project files are trusted through the selected project
  record, not arbitrary renderer strings. This matches the repository security
  rule for filesystem operations.
  Date/Author: 2026-04-26 / Codex

## Outcomes & Retrospective

Not started.

## Context and Orientation

Ripple is being rebuilt from a 1Code-shaped Electron app into a local-first
motion graphics app. Phase 1 removed mandatory auth and provider gates. Phase 2
created the project-first flow that writes a HyperFrames project under
`~/Ripple/<project-name>`. Phase 3 added the main-process HyperFrames service
layer and tRPC router.

Today `src/renderer/App.tsx` chooses between `ProjectEntryPage` and
`AgentsLayout` based on `selectedProjectAtom`. `AgentsLayout` owns the app
chrome, settings/sidebar state, hotkeys, modals, traffic-light handling, and
then renders `AgentsContent`. `AgentsContent` is still mostly the old agent
workspace: it handles selected chat state, quick switchers, sub-chat sidebars,
settings/automations views, and `ChatView`/`NewChatForm`.

The project rail should replace the old "repo/chat list" mental model with
Ripple project language. The assets/compositions/templates pane should replace
the current chat-list/sub-chat area as the primary secondary pane.

The central workspace should be HyperFrames-native. It takes over the space
currently occupied by the chat transcript and shows the active preview/player
with the timeline underneath, matching HyperFrames Studio's visual hierarchy.
In the first phase of implementation, "HyperFrames-native" means the pane is
driven by the Phase 3 router and embeds the managed CLI preview/Studio URL. It
should not render a CodeSandbox URL, launch shell commands from the renderer,
or pretend generic web-app preview state is the motion preview state.

The right sidebar should remain a real sidebar, not be removed. It should gain
a Frame.io-inspired top segmented control for `Chat` and `Comments`, keep chat
history selection available, and preserve the existing details/files/widgets
surfaces as a secondary layer inside the same sidebar. In other words, Phase 4
moves chat/comment work to the review sidebar; it does not throw away the
details widgets that are already useful.

The active composition is the composition currently selected for preview and
future agent/comment context. It is persisted on `projects.activeCompositionId`
and can be changed through `projects.setActiveComposition`. Composition rows
are discovered and refreshed through `hyperframes.listCompositions`.

## Plan of Work

Create a new renderer feature folder, likely:

- `src/renderer/features/ripple-shell/RippleShell.tsx`
- `src/renderer/features/ripple-shell/RippleProjectRail.tsx`
- `src/renderer/features/ripple-shell/RippleLibraryPane.tsx`
- `src/renderer/features/ripple-shell/HyperFramesStudioPane.tsx`
- `src/renderer/features/ripple-shell/RippleReviewSidebar.tsx`
- `src/renderer/features/ripple-shell/RippleChatPanel.tsx`
- `src/renderer/features/ripple-shell/RippleCommentsPanel.tsx`
- `src/renderer/features/ripple-shell/RippleWidgetsPanel.tsx`
- `src/renderer/features/ripple-shell/ripple-shell-atoms.ts`
- `src/renderer/features/ripple-shell/ripple-shell-utils.ts`
- focused tests for pure utilities under the same folder

The first implementation pass should wire `AgentsLayout` or `AgentsContent` so
the normal selected-project desktop path renders `RippleShell`. Existing
settings, automations, inbox, login modals, hotkeys, project entry, and update
banner behavior should keep working. Mobile can keep the current simpler agent
layout unless a small responsive Ripple shell is low-risk; the desktop shell is
the Phase 4 acceptance target.

`RippleShell` should own the selected project and selected composition state.
It should query `trpc.hyperframes.listCompositions` with refresh behavior,
falling back to saved rows when the CLI refresh fails. It should use
`trpc.projects.setActiveComposition` to persist active composition changes and
update local query caches so the preview pane and library pane agree.

`RippleProjectRail` should show project selection and project-level actions in
Ripple language: new project, project list, settings, help, and optional
profile/sign-in state. Reuse `AgentsSidebar` logic and project mutations where
helpful, but do not keep repo, branch, PR, sandbox, or GitHub as primary visual
language.

`RippleLibraryPane` should start with compositions as the reliable core and
should occupy the space that currently functions as the chat/sub-chat list. It
can include lightweight assets/templates sections if the data can be read
safely by project ID. If a file listing is needed, add a new main-process
procedure such
as `projects.listProjectFiles` or `rippleProjectFiles.list` that accepts
`projectId`, resolves the trusted project path in the main process, filters
allowed project files, and returns relative paths. Do not build this pane on the
current absolute-path `filesRouter` procedures without adding project-boundary
validation.

`RippleReviewSidebar` should wrap the existing right sidebar surfaces and add a
top mode control for `Chat` and `Comments`. `Chat` should preserve the existing
chat history and reuse `ChatView`/`NewChatForm` where possible. `Comments`
should be a Phase 4 shell affordance only: it can show empty states, selected
composition/time context, and a composer shape, but it must not create
persistent comment threads, isolated revisions, or accept/reject flows yet.
Those are Phase 5. Existing details, files, changes, plan, terminal, MCP, and
widget controls should remain reachable in this right sidebar rather than being
deleted or hidden behind developer-only language.

`HyperFramesStudioPane` should be the central workspace and call
`trpc.hyperframes.startPreview` for the selected project. It should display
startup/loading/error/stopped states, iframe the returned preview URL, support
reload/restart through `forceRestart`, stop managed previews when appropriate,
and poll or query `getPreviewStatus` so stdout/stderr tails can be shown in a
concise error details disclosure. It should offer an "Open in HyperFrames
Studio" action via `window.desktopApi.openExternal(preview.url)`. The timeline
should live directly underneath the preview/player, using the embedded Studio
timeline at first and becoming more native only when HyperFrames exposes the
right renderer primitives or later phases justify deeper integration.

The shell should keep dimensions stable. Use constrained grid/flex tracks for
the project rail, library pane, central preview/timeline workspace, and right
review sidebar so composition names, loading states, and buttons do not resize
the whole app. Use icons for compact commands and tooltips for less obvious
actions. Keep the UI dense and app-like.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple` unless noted otherwise.

1. Read current layout, sidebar, chat, tRPC, and HyperFrames service files:
   `src/renderer/App.tsx`,
   `src/renderer/features/layout/agents-layout.tsx`,
   `src/renderer/features/agents/ui/agents-content.tsx`,
   `src/renderer/features/sidebar/agents-sidebar.tsx`,
   `src/renderer/features/sidebar/agents-subchats-sidebar.tsx`,
   `src/renderer/features/agents/main/active-chat.tsx`,
   `src/main/lib/trpc/routers/hyperframes.ts`, and
   `src/main/lib/ripple-projects/service.ts`.

2. Add `src/renderer/features/ripple-shell/` with pure utility/state modules
   first. Keep cross-component state small: selected composition, chat/comment
   mode, preview lifecycle state, and pane visibility only.

3. Build `RippleShell` with fixed regions:
   project rail, library pane, central HyperFrames preview/timeline workspace,
   and right review sidebar. Initially hard-code the shell regions behind the
   selected-project path while preserving settings/automations routes.

4. Implement composition data flow:
   call `hyperframes.listCompositions({ projectId, refresh: true })`, show
   saved rows and CLI refresh status, and persist changes with
   `projects.setActiveComposition`.

5. Implement `HyperFramesStudioPane`:
   start preview for the selected project, iframe the preview URL, expose
   refresh/restart/stop/status affordances, and open the same URL externally.
   Treat missing runtime, failed preview startup, stopped previews, and iframe
   load timeout as first-class states.

6. Implement the first library pane:
   list compositions, mark the active composition, show basic dimensions/source
   file metadata, and include assets/templates sections only if they can be
   driven by project-ID-safe data.

7. Implement the right review sidebar wrapper:
   keep existing chat creation/selection and chat history working, add `Chat`
   and `Comments` modes, preserve details/files/widgets, and pass selected
   project/composition context to future extension points without changing the
   agent execution model yet.

8. Adjust `AgentsLayout`/`AgentsContent` integration:
   replace the primary chat-list/sub-chat pane with the Ripple library pane,
   move chat/comment interaction into the right sidebar, preserve quick
   switchers only if they still make sense, and keep settings, onboarding, and
   project entry flows reachable.

9. Add targeted tests for pure state and utility logic:
   composition selection fallback, preview status labeling, shell mode
   transitions, and project-file filtering if a safe file route is added.

10. Run validation commands and update this ExecPlan with exact outcomes,
    surprises, and any deferred work.

## Validation and Acceptance

Automated validation:

- `bun run test:ripple`
- focused `bun test` for any new `src/renderer/features/ripple-shell/*.test.ts`
  files
- `bun run build`
- `bun run ts:check`, recording the existing baseline failures if they remain
  and confirming no new Phase 4 files are implicated
- `git diff --check`

Electron/manual validation:

- Start the app with `bun run dev`.
- From a clean local state, create or open a Ripple project and confirm the
  selected project opens directly into the four-part shell.
- Confirm the far-left project rail can switch projects and create a new
  project without repo/GitHub language in the primary path.
- Confirm the library pane, in the old chat-list area, lists compositions for
  the active project and can switch the active composition.
- Confirm the central workspace starts a HyperFrames preview, shows a loading
  state, shows a usable iframe when ready, can refresh/restart, and can open the
  same URL externally in HyperFrames Studio.
- Confirm the right sidebar can switch between `Chat` and `Comments`, keeps
  chat history reachable, and still exposes the existing details/files/widgets
  surfaces.
- Confirm preview startup failures show Ripple/motion-language errors with a
  concise details disclosure, not raw generic sandbox language.
- Confirm existing chat still sends messages, chat selection remains stable,
  and comment mode is visible without creating Phase 5 revision data.
- Resize the desktop window across narrow and wide layouts and verify no text
  or controls overlap.

Acceptance for Phase 4:

- The normal selected-project route shows a four-part Ripple shell.
- The project rail, library pane, central HyperFrames preview/timeline
  workspace, and right review sidebar are visible and usable on desktop.
- Composition switching works and persists through `projects.activeCompositionId`.
- The preview/editor region is powered by Phase 3 HyperFrames routes, not
  renderer shell commands or CodeSandbox preview assumptions.
- Chat and comments live in the right sidebar with a Frame.io-style segmented
  control, while chat history and existing widgets/details remain reachable.
- Preview refresh, restart, loading, stopped, and error states are clear.
- The "Open in HyperFrames Studio" escape hatch opens the managed preview URL.
- Primary UX language says project, composition, assets, templates, chat,
  comment, preview, and Studio. It does not center repo, branch, worktree,
  sandbox, PR, clone, or dependency installation.
- No new primary-path `1Code`, `21st.dev`, auth-gated, or Remotion-style
  assumptions are introduced.

## Idempotence and Recovery

The shell integration should be additive until the final routing switch. New
components under `src/renderer/features/ripple-shell/` can be created and
tested without disturbing the old chat shell. If the shell route needs to be
backed out during development, switch `AgentsContent` back to rendering
`ChatView`/`NewChatForm` while keeping the new files in place for iteration.

Starting preview should be idempotent. Calling `hyperframes.startPreview` for a
project with an existing managed preview should return the existing state unless
the user requests restart. Stopping preview should use the Phase 3
`stopPreview` route and should tolerate already-stopped previews.

If a preview process is left running during development, use the app route to
stop it first. Use the documented HyperFrames `preview --kill-all` recovery
only as a last resort, because it can affect previews not launched by Ripple.

If a composition refresh fails, keep the last saved composition rows visible and
show a refresh error state. Do not clear the active composition just because the
CLI command failed.

If a safe project-file route is added, all file paths returned to the renderer
should be relative display paths plus typed metadata. Any later read/open action
must resolve the trusted `projectId` and relative path in the main process.

## Interfaces and Dependencies

Existing interfaces to use:

- `selectedProjectAtom` and `toSelectedProject` from
  `src/renderer/features/agents/atoms`
- `trpc.projects.list`
- `trpc.projects.createRippleProject`
- `trpc.projects.openRippleProjectFolder`
- `trpc.projects.listCompositions`
- `trpc.projects.setActiveComposition`
- `trpc.hyperframes.doctor`
- `trpc.hyperframes.listCompositions`
- `trpc.hyperframes.startPreview`
- `trpc.hyperframes.stopPreview`
- `trpc.hyperframes.getPreviewStatus`
- `window.desktopApi.openExternal`
- `ChatView` and `NewChatForm` from `src/renderer/features/agents/main/`

Likely new renderer interfaces:

- `RippleShell`
- `RippleProjectRail`
- `RippleLibraryPane`
- `HyperFramesStudioPane`
- `RippleReviewSidebar`
- `RippleChatPanel`
- `RippleCommentsPanel`
- `RippleWidgetsPanel`
- `useHyperframesPreview`
- `useRippleCompositions`

Possible new main-process interface:

- `projects.listProjectFiles` or a dedicated `rippleProjectFiles` router that
  accepts `projectId` and returns validated relative project file entries for
  assets/templates display.

Dependencies and constraints:

- React 19, Jotai, React Query/tRPC, Radix wrappers, Tailwind, and lucide icons
  are already available.
- `hyperframes@0.4.28` is available as a CLI package and is the preview/render
  source of truth.
- The renderer must not spawn HyperFrames, FFmpeg, shell commands, or arbitrary
  filesystem operations.
- The shell must preserve local-first usage without mandatory auth, GitHub,
  provider selection, dependency installation, or repo setup.

## Artifacts and Notes

Source inspection evidence gathered while creating this plan:

- `ROADMAP.md` defines Phase 4 as the move from workspace/chat/dev-preview to
  project/assets/chat-comment/HyperFrames editor.
- `src/renderer/App.tsx` currently routes selected projects to `AgentsLayout`.
- `src/renderer/features/layout/agents-layout.tsx` owns global app chrome,
  settings/sidebar state, provider/login modals, and hotkeys.
- `src/renderer/features/agents/ui/agents-content.tsx` is the current desktop
  content hub and is still chat/sub-chat-first.
- `src/renderer/features/agents/ui/agent-preview.tsx` is sandbox URL based and
  should be superseded for Ripple preview.
- `src/main/lib/trpc/routers/hyperframes.ts` exposes the Phase 3 preview,
  composition, snapshot, and render routes.
- `src/main/lib/ripple-projects/service.ts` persists active composition and
  project setup state.
- `node_modules/hyperframes/package.json` confirms the local CLI package
  version is `0.4.28` and requires Node `>=22`.
- User-provided Frame.io screenshots establish the intended right-review-rail
  interaction: a top segmented control, comments beside the asset, and a
  central preview/player area. User-provided current Ripple screenshot
  establishes what should be preserved: project list, chat history, and right
  details/files/widgets.
