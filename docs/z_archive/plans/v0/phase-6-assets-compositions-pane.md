# Phase 6: Assets And Compositions Pane

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple has a project browser pane for the selected motion
project. A user can see the project's compositions and media assets in Ripple
language, select a composition, and have the Phase 4 preview player and Phase 5
timeline reload to that composition.

This phase should follow the blueprint that worked in Phase 5. Ripple owns the
visible app surface: pane layout, tabs, labels, loading/error states, active
selection, compact assets display, and the way this fits beside chat and the
preview. HyperFrames owns the motion-project semantics: composition discovery,
composition IDs, source files, project-local media paths, preview-serving
behavior, and future framework features.

The goal is not to embed HyperFrames Studio's whole `LeftSidebar`. Studio is
useful reference material for information architecture, media type handling,
and composition-card behavior, but Ripple needs a main-process-safe project
browser model and a concise native pane that fits the existing app shell.

## Progress

- [x] 2026-04-26 / Codex: Read `ROADMAP.md`, `PLANS.md`, the completed Phase 5
  notes, current Phase 5 implementation files, and the relevant HyperFrames
  Studio sidebar files.
- [x] 2026-04-26 / Codex: Created this Phase 6 ExecPlan around the Phase 5
  adapter pattern: main-process project/file truth plus Ripple-owned renderer
  UI.
- [x] 2026-04-26 / Codex: Implemented a main-process project browser model for
  compositions and assets.
- [x] 2026-04-26 / Codex: Implemented the Ripple project browser pane and wired
  active composition switching into selected project state.
- [x] 2026-04-26 / Codex: Added guarded image, video, and audio import plus
  asset-pane drop handling through a main-process copy route. Rename, delete,
  and timeline drag/drop remain later guarded flows.
- [x] 2026-04-26 / Codex: Validated with focused tests, `bun run test:ripple`,
  `bun run build`, `git diff --check`, and live Electron QA against a local
  Ripple project.
- [x] 2026-04-26 / Codex: Replaced placeholder composition thumbnails with
  sampled, scaled prepared HyperFrames preview iframes and loosened pane
  spacing.
- [x] 2026-04-26 / Codex: Restored the old chats-pane collapse pattern for
  the Ripple project pane: a close button in the pane and a matching reopen
  control in the chat header, without adding a collapsed edge rail.
- [x] 2026-04-26 / Codex: Added focused pure regressions for the closed
  Ripple pane state and stable active-composition selection, then wired the
  new agents utility test into `bun run test:ripple`.
- [x] 2026-04-26 / Codex: Fixed follow-up review findings: thumbnail preview
  source narrowing, thumbnail iframe origin isolation, and archived-project
  media import guarding.
- [x] 2026-04-26 / Codex: Added a project-rail recovery control to the project
  pane header so hiding the far-left rail is reversible from the visible
  Ripple workspace.
- [x] 2026-04-26 / Codex: Fixed follow-up review findings for media imports
  through symlinked destination asset folders and stale runtime timeline data
  after preview source changes.
- [x] 2026-04-26 / Codex: Fixed final preview source handoff findings by
  pausing/detaching the active player before new source fetches and revoking
  stale preview blob URLs after source swaps.

## Surprises & Discoveries

- Observation: Phase 5 leaves a reusable selection contract for Phase 6.
  Evidence: `HyperFramesPreviewPlayer` receives `projectId` and optional
  `compositionId`, while `selectedProject.activeCompositionId` already flows
  into the player and timeline through `agents-content.tsx` and
  `active-chat.tsx`.

- Observation: Composition persistence and active-composition mutation already
  exist.
  Evidence: `projects.setActiveComposition` calls
  `setActiveComposition(input)` in `src/main/lib/ripple-projects/service.ts`,
  and `hyperframes.listCompositions` can refresh DB composition rows from the
  HyperFrames CLI.

- Observation: Phase 6 should add a project-ID-safe asset model because no
  general asset listing route exists yet.
  Evidence: Phase 4 and Phase 5 serve project files through the validated
  `ripple-preview:` protocol, but the renderer currently has no typed route
  that lists project-local assets without relying on an absolute path.

- Observation: HyperFrames Studio's sidebar is a strong reference but not a
  safe product import.
  Evidence: `@hyperframes/studio/src/components/sidebar/LeftSidebar.tsx` owns
  `compositions`, `assets`, and `code` tabs, but it expects string file lists,
  browser `/api/projects/...` routes, Studio dark styling, file editing
  callbacks, and direct import/delete/rename handlers that do not match
  Ripple's tRPC/main-process boundary.

- Observation: Studio filters the asset pane to user media, not every file in
  the project.
  Evidence: `AssetsTab.tsx` filters with `MEDIA_EXT`, and
  `mediaTypes.ts` treats image, video, and audio extensions as the default
  visible asset set. Ripple should avoid showing generated runtime/vendor
  files as primary assets.

- Observation: The existing preview and timeline path already reloads cleanly
  when `projects.activeCompositionId` changes.
  Evidence: Live Electron QA against `~/Ripple/test1` switched from `Main`
  (`index.html`, six-second timeline) to `Lower Third`
  (`compositions/lower-third.html`, three-second timeline), and both the
  preview frame and Phase 5 timeline updated without opening HyperFrames Studio.

- Observation: Asset listing can ship before asset mutation.
  Evidence: The model and pane can show project-local media from `assets/`
  through `ripple-preview:` URLs, while import/delete/rename require additional
  collision, size, extension, and source-patching rules.

- Observation: HyperFrames Studio does not reorder compositions on selection.
  Evidence: `CompositionsTab.tsx` maps the `compositions` array as-is and marks
  the active item with `bg-studio-accent/10 border-l-2 border-studio-accent`.
  Ripple now uses stable file-path ordering plus a soft selected-row highlight
  instead of moving the active row to the top, showing a checkmark, or adding a
  separate left accent.

- Observation: Selection should not force a full preview/timeline invalidation.
  Evidence: Studio's composition handler explicitly avoids incrementing the
  preview refresh key. Ripple now lets the `compositionId` query key select the
  next source, keeps previous source/timeline data while the next document is
  fetched, and avoids broad preview/timeline invalidations from the pane click.

- Observation: Composition thumbnails can reuse Ripple's prepared preview source
  instead of inventing a separate snapshot path.
  Evidence: `HyperFramesProjectPane` now requests `hyperframes.getPlayerSource`
  for each visible composition, fetches the prepared `ripple-preview:` document,
  wraps it as a local blob document, and scales it inside the row thumbnail.

- Observation: Studio's visible thumbnails are sampled after the opening frame.
  Evidence: Studio's sidebar asks for `/thumbnail/<composition>?t=2`, and the
  HyperFrames thumbnail route seeks `window.__player` or the registered GSAP
  timeline before screenshotting. Ripple now mirrors that behavior in miniature
  by seeking the row preview iframe to a representative sample frame before
  fading it in.

## Decision Log

- Decision: Build a Ripple-owned `HyperFramesProjectPane` instead of importing
  Studio's `LeftSidebar`.
  Rationale: The Studio sidebar carries code editor, API route, styling, and
  mutation assumptions. Ripple needs the same conceptual tabs with app-native
  UI and main-process-validated data.
  Date/Author: 2026-04-26 / Codex

- Decision: Add a typed project browser model in the main process.
  Rationale: The renderer should ask for project/composition/asset facts by
  `projectId`. It should not scan absolute paths, infer project boundaries, or
  construct filesystem reads itself.
  Date/Author: 2026-04-26 / Codex

- Decision: Make composition switching the first user-visible milestone.
  Rationale: Phase 4 and Phase 5 already react to `activeCompositionId`, so
  composition switching proves the whole preview/timeline chain before broader
  asset mutation work.
  Date/Author: 2026-04-26 / Codex

- Decision: Treat asset rename, delete, timeline drag/drop, and source patching
  as guarded follow-on milestones after Phase 6.
  Rationale: Listing and copying media assets can be bounded safely. Editing
  existing asset references or inserting assets into timelines needs additional
  source-patching and accept/reject rules.
  Date/Author: 2026-04-26 / Codex

- Decision: Include media import in Phase 6, but keep it as a bounded
  main-process copy operation.
  Rationale: The pane looked incomplete without the Studio-style import/drop
  affordance. Import can be guarded safely now by validating Electron-provided
  source file paths in the main process, rejecting symlinks and unsupported
  extensions, resolving collisions, and copying only into project `assets/`.
  Date/Author: 2026-04-26 / Codex

## Outcomes & Retrospective

Implemented the Phase 6 read/select milestone. Ripple now has a native
project-browser pane for local Ripple projects in the selected-project workspace
route. The pane replaces the old chat-adjacent secondary navigation for that
route, keeps chat available next to it, and exposes Compositions and Assets tabs
with compact Ripple UI rather than importing HyperFrames Studio.

The main process now owns the project browser model. The renderer asks for facts
by `projectId`; the route resolves the project, validates HyperFrames project
files, returns saved or refreshed compositions, scans only the project `assets/`
directory, filters generated/vendor files, classifies visible media, and serves
asset preview URLs through `ripple-preview:`.

Composition switching is wired end to end with Studio-like selection behavior.
Selecting a composition calls `projects.setActiveComposition`, updates
`selectedProjectAtom`, keeps the list order stable, highlights the selected row
with a soft row state, and lets the Phase 4 preview plus Phase 5 timeline switch
by `compositionId` without broad query invalidation from the pane.

Composition rows now show actual miniature previews from the same prepared
HyperFrames player-source path as the main preview, replacing the starter
placeholder art. The miniature previews seek to a sampled frame so compositions
with black first frames still reveal their visible lower-thirds/title content.
The row sizing, tab height, list padding, and assets import zone spacing were
loosened to keep the pane from feeling cramped or top-heavy.

The project pane can be closed and reopened using the same interaction pattern
as the old chats pane. The pane owns a small close button in its tab header, and
the closed state shows a matching reopen button in the chat header rather than
inserting a new collapsed rail between panes.

The Assets tab now has an Import media button and drop handling. Imports copy
image, video, and audio files into project-local `assets/` subfolders from the
main process after validating source paths, rejecting symlinks/unsupported
extensions, and resolving destination collisions. Rename, delete, timeline
drag/drop, and source patching remain later guarded flows.

Validation:

- `bun run test:hyperframes` passed.
- `bun run test:ripple` passed.
- `bun run build` passed.
- `git diff --check` passed.
- Follow-up thumbnail/spacing polish was revalidated with
  `bun run test:hyperframes` and `bun run build`.
- Sampled thumbnails and restored pane close/reopen controls were revalidated
  with `bun run test:hyperframes`, `bun run test:ripple`, `bun run build`, and
  `git diff --check`.
- Follow-up pure regression tests for pane close/reopen state and stable active
  composition marking were added to the durable `bun run test:ripple` suite.
- Follow-up review fixes were revalidated with `bun run test:hyperframes`,
  `bun run test:ripple`, `bun run build`, `bun run ts:check`, and
  `git diff --check`. `ts:check` still reports the repo's existing baseline
  errors outside `HyperFramesProjectPane.tsx`; the new thumbnail source
  narrowing error is gone.
- The project-rail recovery control was covered by the pure project-pane layout
  regression and revalidated with the focused Ripple suite.
- The symlinked asset-destination guard and runtime timeline source-change
  reset were revalidated with focused regressions, `bun run test:ripple`,
  `bun run build`, `bun run ts:check`, and `git diff --check`. `ts:check`
  still reports the repo's existing broad baseline errors; the latest
  guard/reset files do not appear in that failure list.
- The final preview handoff fixes were covered by focused
  `timeline-player-adapter` regressions and revalidated with
  `bun run test:ripple`.
- Live Electron QA against `~/Ripple/test1` verified the headerless pane,
  Studio-like selected composition rows, stable ordering, asset import/drop
  affordances, asset count state, and switching from `index` to `lower-third`.
- `bun run ts:check` still fails on the repo's known baseline type errors
  outside this Phase 6 surface; no new Phase 6 file errors were observed.

## Context and Orientation

Ripple currently has a HyperFrames service layer, a preview player, and an
embedded timeline, but it does not yet have the left/middle motion-project pane
from the target shell. The existing app shell is still mostly the 1Code agents
layout: a far-left project rail, chat content, optional sub-chat sidebar, and a
preview sidebar opened from chat.

Relevant existing pieces:

- `src/main/lib/hyperframes/compositions.ts` discovers and persists
  HyperFrames compositions. It merges metadata and CLI output, prunes missing
  rows, and keeps `projects.activeCompositionId` valid when possible.
- `src/main/lib/trpc/routers/hyperframes.ts` exposes
  `hyperframes.listCompositions`, `getPlayerSource`, and `getTimelineModel`.
  These routes resolve the project by ID and validate HyperFrames project files
  before returning data.
- `src/main/lib/trpc/routers/projects.ts` exposes
  `projects.listCompositions` and `projects.setActiveComposition`.
- `src/renderer/features/agents/utils/selected-project.ts` defines the
  `SelectedProject` shape, including `activeCompositionId` and setup status
  fields.
- `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx` accepts
  `projectId` and `compositionId`, then uses the Phase 5 adapter and timeline.
- `src/main/lib/hyperframes/player-source-protocol.ts` serves approved project
  files, media, and prepared preview documents through `ripple-preview:` after
  resolving paths in the main process.

Definitions for this plan:

- Project browser model: a typed data object returned by the main process that
  contains the current project's compositions, visible assets, setup status,
  and active IDs.
- Composition item: a persisted HyperFrames composition row with Ripple labels,
  dimensions, kind, relative source file, and active state.
- Asset item: a project-local file under `assets/` that is safe to show in the
  UI with a relative path, kind, size, modified time, and a `ripple-preview:`
  display URL when applicable.

## Plan of Work

First, add a shared project browser model. Create a small shared module such as
`src/shared/hyperframes-project-model.ts` with types and pure helpers for asset
kind detection, display labels, extension groups, sorting, and filtering. Keep
it similar in spirit to Phase 5's
`src/shared/hyperframes-timeline-model.ts`: no renderer-only APIs, no Electron
imports, and enough pure functions to test.

Second, add a main-process asset scanner under `src/main/lib/hyperframes/`,
for example `project-browser.ts`. It should resolve the project with
`resolveHyperframesProjectContext`, scan only project-relative paths under
`assets/`, ignore directories and generated vendor/runtime files by default,
and return asset items with safe metadata. It should normalize paths with the
existing HyperFrames project-context helpers and never return arbitrary
absolute paths to the renderer.

Third, expose the model through tRPC, likely as
`trpc.hyperframes.getProjectBrowserModel({ projectId, refreshCompositions? })`.
When `refreshCompositions` is true, the route should call
`refreshHyperframesCompositions`; otherwise it can use saved composition rows
for a fast pane render. The route should return `project`, `compositions`,
`assets`, and any setup warning the pane needs to show.

Fourth, implement a renderer pane, likely
`src/renderer/features/hyperframes/HyperFramesProjectPane.tsx`. It should use
Ripple/Radix/Tailwind/lucide patterns and present compact tabs or segmented
sections for Compositions and Assets. It should include loading, empty,
setup-warning, and refresh states. The component should be native Ripple UI,
not nested cards and not Studio's hard-coded dark palette.

Fifth, wire composition switching. Selecting a composition should call
`trpc.projects.setActiveComposition`, update `selectedProjectAtom` through
`toSelectedProject`, invalidate project and HyperFrames queries, and cause
existing `HyperFramesPreviewPlayer` instances to receive the new
`compositionId`. This is the central acceptance path: click a composition in
the pane and see the preview/timeline switch without opening Studio.

Sixth, place the pane conservatively in the current shell. The first placement
should reuse the current left-of-main-content area in `AgentsContent`, where
the sub-chat sidebar already proves a resizable pane can live. The far-left
project rail stays in `AgentsSidebar`; chat stays available; the preview
sidebar and Phase 5 timeline continue to work. If the existing sub-chat sidebar
conflicts, prefer showing the Ripple project pane for local Ripple projects and
keep sub-chat navigation available from chat until Phase 7 reworks the full
right-side chat/comment layout.

Seventh, add asset import only after read/list/select works. The safest first
mutation is a main-process dialog or drop/import route that copies selected
image, video, audio, and font files into `assets/`, resolves filename
collisions, rejects unsupported or oversized files with useful messages, and
refreshes the project browser model. Do not add timeline drag/drop insertion or
source patching in this phase unless the read/select milestone finishes with
time and the writes can be fully validated in the main process.

Eighth, use HyperFrames Studio as reference material, not as a runtime
dependency for the pane. Useful Studio references are:
`node_modules/@hyperframes/studio/src/components/sidebar/LeftSidebar.tsx`,
`CompositionsTab.tsx`, `AssetsTab.tsx`,
`utils/mediaTypes.ts`, and `utils/timelineAssetDrop.ts`. Copy concepts only
when they fit Ripple's project-boundary and UI rules; do not deep-import these
files into production code.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple` unless noted otherwise.

1. Re-read the current Phase 5 artifacts before editing:
   `plans/phase-5-hyperframes-timeline.md`,
   `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`,
   `src/renderer/features/hyperframes/timeline-player-adapter.ts`,
   `src/main/lib/trpc/routers/hyperframes.ts`, and
   `src/shared/hyperframes-timeline-model.ts`.

2. Read the current project/composition seams:
   `src/main/lib/hyperframes/compositions.ts`,
   `src/main/lib/ripple-projects/service.ts`,
   `src/main/lib/trpc/routers/projects.ts`,
   `src/renderer/features/agents/utils/selected-project.ts`,
   `src/renderer/features/agents/atoms/index.ts`,
   `src/renderer/features/agents/ui/agents-content.tsx`, and
   `src/renderer/features/agents/main/active-chat.tsx`.

3. Add shared model types and helpers in
   `src/shared/hyperframes-project-model.ts`.

4. Add main-process project browser helpers in
   `src/main/lib/hyperframes/project-browser.ts` and tests in
   `src/main/lib/hyperframes/project-browser.test.ts`.

5. Export the helper from `src/main/lib/hyperframes/index.ts` and add
   `hyperframes.getProjectBrowserModel` to
   `src/main/lib/trpc/routers/hyperframes.ts`.

6. Implement the renderer pane in
   `src/renderer/features/hyperframes/HyperFramesProjectPane.tsx`, with small
   pure helper tests near the component if filtering/sorting logic lives in the
   renderer.

7. Wire the pane into `src/renderer/features/agents/ui/agents-content.tsx` for
   selected local Ripple projects. Keep the existing chat and preview flows
   available.

8. Wire composition selection through `projects.setActiveComposition`, update
   `selectedProjectAtom`, and invalidate `projects.list`,
   `projects.listCompositions`, `hyperframes.getProjectBrowserModel`,
   `hyperframes.getPlayerSource`, and `hyperframes.getTimelineModel` as needed.

9. If included in this phase, add main-process asset import with tests for
   extension filtering, collision naming, path-boundary validation, and
   refresh behavior.

10. Run focused validation:
    `bun test src/main/lib/hyperframes src/renderer/features/hyperframes`,
    then `bun run test:ripple`, `bun run build`, `git diff --check`, and
    `bun run ts:check` if it is useful to compare against the known repo-wide
    baseline.

11. Run live Electron QA with `bun run dev`, open a Ripple project with at
    least `index.html`, `compositions/lower-third.html`, and a few media
    assets, then verify the pane, composition switching, preview reload, and
    timeline reload.

12. Update this ExecPlan with actual progress, validation evidence,
    screenshots or observations, and any scope deferred to Phase 7.

## Validation and Acceptance

Automated validation:

- Shared project model tests cover media/font/other classification, generated
  vendor filtering, label generation, sorting, and empty states.
- Main-process tests cover project-ID resolution, asset scanning under
  `assets/`, path normalization, symlink/path-boundary rejection, unsupported
  file handling, composition refresh behavior, and active composition stability.
- Renderer-side tests cover the local Ripple pane close/reopen decision,
  legacy chats-pane suppression, stable active composition marking, asset
  filter display, and composition ordering where the existing pure test stack
  supports it.
- `bun run test:ripple` passes.
- `bun run build` passes.
- `git diff --check` passes.
- `bun run ts:check` is run or the existing repo-wide baseline failures are
  recorded with confirmation that new Phase 6 files are not implicated.

Manual/Electron acceptance:

- The app shows a Ripple project pane for the selected local project without
  opening HyperFrames Studio.
- The pane has Compositions and Assets surfaces or tabs with compact app-native
  styling.
- The Compositions surface lists persisted/discovered compositions with name,
  relative source, size/aspect facts, kind, and active state.
- Selecting a composition updates the selected project state and the Phase 4
  preview plus Phase 5 timeline reload to that composition.
- Refreshing compositions updates the list without leaving stale active rows.
- The Assets surface lists user-facing project assets from `assets/`, hides
  generated runtime/vendor noise by default, and uses `ripple-preview:` or a
  main-process-safe URL for thumbnails/previews.
- Empty projects show clear empty states rather than broken file paths.
- Asset import, if included, copies files into the project safely, refreshes
  the asset list, and never writes outside the project.
- The existing chat and preview workflows still work on desktop and mobile.
- User-facing language says project, composition, asset, preview, and timeline.
  It does not expose repo, branch, worktree, dev server, or manual dependency
  terminology in the primary path.

## Idempotence and Recovery

The project browser query must be safe to run repeatedly. Repeated composition
refresh should preserve the active composition when it still exists, prune
missing composition rows, and choose the root or first composition only when
the previous active one is gone.

Asset scanning is read-only and should be repeatable. If a file disappears
between scan and display, the pane should show the next refreshed state rather
than throwing a renderer error.

Asset import, if implemented, must be transactional enough for local use: copy
only files that pass validation, avoid overwriting by default, report skipped
files, and recover by refreshing the browser model. Partial import failure
should leave already copied safe files visible and unsupported files reported.

If the renderer pane causes layout problems in the current agents shell, gate
its placement behind selected local Ripple projects and keep the previous chat
layout as the fallback. Do not refactor the full shell into Phase 7 scope
unless the user explicitly expands the phase.

If HyperFrames Studio internals change, Ripple's Phase 6 code should keep
working because production behavior depends on tRPC, saved composition rows,
`ripple-preview:`, and local helpers rather than deep Studio imports.

## Interfaces and Dependencies

Existing dependencies:

- `hyperframes@0.4.30`
- `@hyperframes/core@0.4.30`
- `@hyperframes/player@0.4.30`
- `@hyperframes/studio@0.4.30` as reference material only
- `ripple-preview:` project file serving from Phase 4
- `RippleTimelinePlayerAdapter` and `HyperFramesTimeline` from Phase 5
- `projects.activeCompositionId` and the `compositions` table in
  `src/main/lib/db/schema/index.ts`

Existing APIs to reuse:

- `trpc.hyperframes.listCompositions`
- `trpc.hyperframes.getPlayerSource`
- `trpc.hyperframes.getTimelineModel`
- `trpc.projects.listCompositions`
- `trpc.projects.setActiveComposition`
- `selectedProjectAtom` and `toSelectedProject`

New or changed interfaces:

- `src/shared/hyperframes-project-model.ts`
- `src/main/lib/hyperframes/project-browser.ts`
- `trpc.hyperframes.getProjectBrowserModel`
- `src/renderer/features/hyperframes/HyperFramesProjectPane.tsx`
- Optional main-process asset import route, if the implementation includes
  safe imports in this phase.

Not in scope for the first Phase 6 milestone:

- Full HyperFrames Studio embed.
- Code editor/file tree replacement.
- Timeline drag/drop asset insertion.
- Timeline trim/move/delete source patching.
- Frame comments, review revisions, accept/reject, and export queue UI.
- The full Phase 7 shell/sidebar rework.

## Artifacts and Notes

Phase 5 blueprint to preserve:

- Use typed adapter/model boundaries.
- Let HyperFrames own runtime semantics and project file interpretation.
- Let Ripple own compact UI and app state.
- Keep iframe or Studio internals behind explicit adapters, not as the product
  architecture.
- Validate project paths in the main process before exposing data to the
  renderer.

HyperFrames Studio reference files inspected on 2026-04-26:

- `node_modules/@hyperframes/studio/src/components/sidebar/LeftSidebar.tsx`
- `node_modules/@hyperframes/studio/src/components/sidebar/CompositionsTab.tsx`
- `node_modules/@hyperframes/studio/src/components/sidebar/AssetsTab.tsx`
- `node_modules/@hyperframes/studio/src/utils/mediaTypes.ts`
- `node_modules/@hyperframes/studio/src/utils/timelineAssetDrop.ts`

Important current Ripple files inspected on 2026-04-26:

- `plans/phase-5-hyperframes-timeline.md`
- `ROADMAP.md`
- `src/main/lib/hyperframes/compositions.ts`
- `src/main/lib/trpc/routers/hyperframes.ts`
- `src/main/lib/trpc/routers/projects.ts`
- `src/main/lib/ripple-projects/service.ts`
- `src/main/lib/hyperframes/player-source-protocol.ts`
- `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`
- `src/renderer/features/agents/ui/agents-content.tsx`
- `src/renderer/features/agents/main/active-chat.tsx`
- `src/renderer/features/agents/utils/selected-project.ts`
