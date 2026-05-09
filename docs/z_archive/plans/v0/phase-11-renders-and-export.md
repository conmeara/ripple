# Phase 11: Export

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple users can export finished motion graphics from the
desktop app without opening a terminal or learning HyperFrames commands. A user
can open the `Renders` surface, choose the active composition, pick MP4, MOV, or
WebM, choose practical quality settings, start an export, watch progress, cancel
if needed, and open or reveal the completed file.

This phase turns the existing Phase 3 HyperFrames render primitive into a
durable product workflow. The current backend can spawn `hyperframes render`
and write a video under a project-local `exports/` folder, but the job is
in-memory and there is no renderer UI. Phase 11 adds the missing export job
model, job history, safe destination handling, progress and recovery states, and
a Ripple-styled queue UI inspired by HyperFrames Studio's `Renders` panel.

The visible product should borrow the useful Studio behavior under its
`Renders` button: a compact queue, format and quality controls, render count,
progress rows, thumbnails, hover preview for completed outputs, clear completed,
open/reveal/download-style actions, and concise error states. Ripple should not
copy Studio's renderer-launched REST routes or private package internals.
Ripple's normal path must remain main-process-owned, local-first, project-ID
safe, and friendly to non-developer users.

## Progress

- [x] 2026-04-27 / User + Codex: Started Phase 11 planning for renders/export.
  User direction: explore HyperFrames Studio's Renders UI and copy the useful
  render functionality under Ripple's renders/export surface.
- [x] 2026-04-27 / Codex: Read `PLANS.md`, `ROADMAP.md`, Phase 3 render
  service plan, Phase 4 preview-player plan, and the current Phase 8
  comments/revisions plan before drafting this plan.
- [x] 2026-04-27 / Codex: Ran parallel read-only exploration of HyperFrames
  Studio Renders UI, installed HyperFrames render/producer/CLI behavior,
  current Ripple backend/schema gaps, and renderer shell integration points.
- [x] 2026-04-27 / Codex: Verified the installed `hyperframes` CLI is `0.4.30`
  and `hyperframes render --help` supports MP4, MOV, WebM, FPS, quality,
  workers, Docker, HDR, CRF, bitrate, GPU, quiet, strict, and producer
  concurrency flags.
- [x] 2026-04-27 / User + Codex: Clarified the layout target: the `Renders`
  button should open the render/export pane in the existing right review-pane
  area where Chat, Comments, Details, Files, and the other utility pages live.
- [x] 2026-04-28 / User + Codex: Chose the better long-term architecture:
  prefer direct `@hyperframes/producer` integration pinned to the same
  HyperFrames package-family version.
- [x] 2026-04-28 / User + Codex: Removed the CLI fallback executor from the
  target plan. If Producer fails validation, Phase 11 should resolve that
  blocker instead of carrying two render execution paths.
- [x] 2026-04-30 / User + Codex: Upgraded the HyperFrames package family to
  `0.4.40` and added `@hyperframes/producer@0.4.40` as a direct dependency.
  `node_modules/.bin/hyperframes --version` reports `0.4.40`, and
  `hyperframes render --help` still exposes MP4, MOV, WebM, FPS, quality,
  workers, Docker, HDR/SDR, CRF, bitrate, GPU/browser GPU, strict, and max
  concurrent producer render flags.
- [x] 2026-04-30 / Codex: Validated the installed Producer public API. The
  public exports are `createRenderJob`, `executeRenderJob`,
  `RenderCancelledError`, and logger/server helpers; `executeRenderJob(job,
  projectDir, outputPath, onProgress, abortSignal)` is the target integration
  point.
- [x] 2026-04-30 / Codex: Implemented the persistent Phase 11 export stack:
  shared export contract, Drizzle `export_jobs` table and migration,
  Producer-backed export service, product-level `exports` tRPC router,
  startup recovery, and the right-pane Renders UI.
- [x] 2026-04-30 / Codex: Validated real Producer outputs. A direct Node-based
  smoke rendered MP4, MOV, and WebM with nonzero outputs; FFprobe confirmed MOV
  as ProRes in a QuickTime container and WebM as VP9 in a WebM container, both
  at 640x360 and 1.0s.
- [x] 2026-05-01 / Codex: Ran live Electron QA with Computer Use. The Renders
  pane exported MP4, MOV, WebM, and a `Current Preview` revision export from
  the actual UI; progress, cancellation, retry, open, and reveal paths were
  exercised. The format picker and source block were polished after the first
  pass exposed cramped/overlapping copy in the right pane.
- [x] Implement Milestone 0: Producer public API, cancellation,
  composition-targeting, and packaging verification.
- [x] Implement Milestone 1: persistent export job model, shared types, and
  migration.
- [x] Implement Milestone 2: DB-backed export manager around HyperFrames render
  with recovery, cancellation, and FFprobe validation.
- [x] Implement Milestone 3: product-level `exports` tRPC router with safe
  destination, reveal/open, retry, and job-history operations.
- [x] Implement Milestone 4: Ripple `Renders` pane and top-bar entry point.
- [x] Implement Milestone 5: validation, smoke renders, packaging checks, and
  recovery hardening.
- [x] Implement Milestone 6: MP4, MOV, and WebM real-output validation.
- [x] Implement Milestone 7: narrow Producer boundary without a CLI fallback.
- [x] 2026-05-01 / Codex: Remediated the Phase 11 audit findings: default
  export paths now reject symlink escapes, export readiness includes the
  Producer browser runtime, `Current Preview` exports support chat worktree
  previews as well as comment revisions, completion requires FFprobe media
  facts, the legacy public HyperFrames render route is removed, and explicit
  stale composition IDs fail instead of falling back.

## Surprises & Discoveries

- Observation: HyperFrames Studio already has a private Renders panel that is a
  good UI sketch, but it is not exported as public package API.
  Evidence:
  `node_modules/@hyperframes/studio/src/components/renders/RenderQueue.tsx`,
  `RenderQueueItem.tsx`, and `useRenderQueue.ts` implement the panel, while
  `node_modules/@hyperframes/studio/src/index.ts` does not export those modules.

- Observation: Studio's `Renders` button toggles a right panel and displays the
  job count.
  Evidence: `node_modules/@hyperframes/studio/src/App.tsx` creates
  `renderQueue = useRenderQueue(projectId)`, toggles `rightCollapsed`, renders
  `Renders`, and mounts `RenderQueue` in the right panel.

- Observation: Studio's visible render UI is intentionally small.
  Evidence: The panel exposes format selection, quality selection, an info
  tooltip, `Export`, `Clear`, job rows, progress, thumbnails, hover preview,
  download/open, and remove. It does not expose composition selection, output
  destination, FPS, workers, Docker, GPU, HDR, CRF, bitrate, strict mode, or
  max concurrent renders. Studio hardcodes `fps = 30`.

- Observation: Studio's render queue does not have true job cancellation.
  Evidence: `useRenderQueue` uses REST/SSE endpoints and a remove action.
  The core Studio route can delete job/file state, but the inspected UI path
  does not kill an active render process. Ripple's existing `RenderManager`
  already sends `SIGTERM`, so Ripple can offer a real `Cancel` action.

- Observation: Ripple already has a disabled `Renders` button in the shell.
  Evidence: `src/renderer/features/ripple-shell/RippleShell.tsx` renders a
  disabled top-bar button labeled `Renders` with a play-like icon.

- Observation: Ripple's current render backend is useful but intentionally
  temporary.
  Evidence: `src/main/lib/hyperframes/render-manager.ts` starts in-memory jobs,
  writes under `exports/<slug>-<jobId>.<format>`, captures log tails, cancels
  with `SIGTERM`, and verifies nonempty output, while the database schema has
  no `export_jobs` table.

- Observation: Current render tRPC accepts only project-level jobs.
  Evidence: `src/main/lib/trpc/routers/hyperframes.ts` has
  `hyperframes.render({ projectId, format, fps, quality })`; preview and
  timeline routes already know about revision contexts, but export does not.

- Observation: Earlier Phase 11 planning could not locally validate the
  standalone `@hyperframes/producer` package because it was not installed. The
  package is now installed, so the remaining work is to validate its actual
  public API and Electron behavior before relying on it.
  Evidence: The earlier audit found no installed Producer dependency. The
  2026-04-30 package update added `@hyperframes/producer@0.4.40`.

- Observation: Official HyperFrames docs and installed CLI agree on the core
  export surface.
  Evidence: The docs describe MP4, MOV, and WebM rendering; local and Docker
  modes; FPS, quality, CRF, bitrate, workers, GPU/browser GPU, SDR/HDR, and
  producer concurrency options. Installed `hyperframes render --help` reported
  the same main flags for version `0.4.30`, and the 2026-04-30 `0.4.40`
  upgrade retained them and added explicit `--sdr` / `--browser-gpu` help.

- Observation: The standalone `@hyperframes/producer` package is now installed
  and pinned with the rest of the HyperFrames package family.
  Evidence: On 2026-04-30, `bun add hyperframes@0.4.40
  @hyperframes/core@0.4.40 @hyperframes/player@0.4.40
  @hyperframes/studio@0.4.40 @hyperframes/producer@0.4.40` updated
  `package.json` and `bun.lock`; `bun pm ls @hyperframes/producer` reports
  `@hyperframes/producer@0.4.40`.

- Observation: Producer's public API is usable directly from Ripple's main
  process boundary, but a static type import pulls in
  `@hyperframes/engine/src` declarations that break the current TypeScript
  check. The implementation uses a dynamic import boundary with local minimal
  types in `producer-executor.ts`.
  Evidence: `node_modules/@hyperframes/producer/dist/index.d.ts` exports
  `createRenderJob`, `executeRenderJob`, and `RenderCancelledError`; `bun x tsc
  --noEmit` passes after keeping Producer types behind the executor boundary.

- Observation: Bun-based direct Producer smoke is not reliable in this
  checkout, but Node-based Producer smoke succeeds when local server/browser
  binding is allowed.
  Evidence: A Bun smoke stalled/fell over with `Failed to start server. Is port
  0 in use?`; the Node smoke initially failed under the sandbox with `listen
  EPERM: operation not permitted 0.0.0.0`, then succeeded with escalation and
  produced MP4/MOV/WebM outputs.

- Observation: Producer requires a page implementing the seek protocol, not
  just HyperFrames clip markup.
  Evidence: A malformed smoke fixture failed with `window.__hf not ready after
  45000ms. Page must expose window.__hf = { duration, seek }`; adding
  `window.__hf = { duration, seek }` made MP4/MOV/WebM smokes pass.

- Observation: Export path validation must use filesystem facts, not only
  lexical path checks.
  Evidence: The Phase 11 audit found that a project-local `exports` symlink
  could resolve outside the project. `createExportOutputPath` now validates the
  export directory with `lstat` and `realpath`, and
  `ExportService` has a regression that rejects the symlink escape before
  Producer starts.

- Observation: HyperFrames Studio does not expose a composition-specific render
  choice in its Renders UI.
  Evidence: Studio's `RenderQueue` calls
  `renderQueue.startRender(30, quality, format)`, and `useRenderQueue` posts
  `{ fps, quality, format }` to `/api/projects/:projectId/render` without a
  composition id or batch target. It is effectively a project-entry render
  surface, while its preview can drill into composition files separately.

## Decision Log

- Decision: Phase 11 should create a Ripple-owned `Renders` pane rather than
  embedding HyperFrames Studio's full app or importing its private render
  components.
  Rationale: Studio's private Renders files are a useful reference, but Ripple
  needs project/revision safety, durable export jobs, destination handling, and
  local-first product language.
  Date/Author: 2026-04-27 / Codex

- Decision: The existing shell `Renders` button is the primary entry point.
  Rationale: Users expect export to be first-class. The button already exists in
  the top bar, and Studio also exposes Renders as a top-level editor control.
  The button should open the `renders` page inside the existing right
  review-pane area, alongside Chat, Comments, Details, Files, and the other
  utility pages. The primary action inside that pane is `Export`.
  Date/Author: 2026-04-27 / Codex

- Decision: Phase 11 targets the `0.4.40` HyperFrames package family.
  Rationale: The local checkout has been moved to `hyperframes`,
  `@hyperframes/core`, `@hyperframes/player`, `@hyperframes/studio`, and
  `@hyperframes/producer` at `0.4.40`. The implementation should keep those
  versions pinned together, avoid mixed package-family assumptions, and run the
  HyperFrames-focused regression tests after touching the adapter boundary.
  Date/Author: 2026-04-30 / User + Codex

- Decision: Add a product-level `exports` tRPC router instead of growing
  `hyperframes.render` into a UI workflow.
  Rationale: `hyperframes` is the low-level runtime namespace. Phase 11 needs
  job history, destinations, reveal/open, retry, recovery, and user-facing view
  models. Those belong to a Ripple product service that wraps HyperFrames.
  Date/Author: 2026-04-27 / Codex

- Decision: Start with a simple visible settings set, and keep advanced encoder
  flags behind an explicit advanced section or later milestone.
  Rationale: Studio only exposes format and quality, and Ripple's MVP needs a
  clean export path more than every encoder switch. The implementation should
  still store advanced settings in `settingsJson` so FPS, workers, CRF,
  bitrate, GPU, HDR, Docker, and strict mode can be added without schema churn.
  Date/Author: 2026-04-27 / Codex

- Decision: Completed files should be discoverable from Ripple even when the
  render source is a revision context.
  Rationale: If a user exports the currently previewed generated changes, the
  final output must not be stranded in a hidden worktree. The DB should record a
  product-visible destination and final output path.
  Date/Author: 2026-04-27 / Codex

- Decision: Prefer direct `@hyperframes/producer` integration for Phase 11.
  Rationale: This matches Ripple's existing direction of pinning the
  HyperFrames package family and adapting official primitives through
  Ripple-owned boundaries. Producer gives the export service structured
  progress, cleaner cancellation, render metadata, and future flexibility for
  queues, advanced settings, revision exports, and deterministic render modes.
  Date/Author: 2026-04-28 / User + Codex

- Decision: Do not implement a CLI fallback executor for Phase 11.
  Rationale: A fallback would preserve the older shell-command architecture,
  add duplicate behavior to test, and make progress/cancellation semantics
  inconsistent. The implementation can use the CLI for comparison or manual
  diagnostics during the Producer spike, but the shipped export service should
  have one primary execution path. If Producer fails a required Electron or
  packaging validation, record and fix the blocker before continuing.
  Date/Author: 2026-04-28 / User + Codex

- Decision: Keep Producer package access behind a dynamic executor boundary.
  Rationale: Ripple needs a stable main-process integration point that shields
  the renderer and tRPC router from Producer internals and avoids current
  upstream declaration leakage into the app TypeScript build.
  Date/Author: 2026-04-30 / Codex

- Decision: Phase 11 exports one selected composition/source at a time.
  Rationale: Studio keeps rendering project-level and simple; Ripple has a
  stronger composition model, so the pane should make the selected composition
  and source (`Main` or `Current Preview`) explicit. Batch export across
  multiple compositions should be a later Renders queue enhancement, not hidden
  behind the first export button.
  Date/Author: 2026-05-01 / Codex

## Outcomes & Retrospective

Phase 11 is implemented as a durable product export workflow.

The implementation adds `src/shared/ripple-exports.ts`,
`src/main/lib/exports/`, `src/main/lib/trpc/routers/exports.ts`,
`src/renderer/features/renders/`, and the Drizzle migration
`drizzle/0015_big_dorian_gray.sql`. The `export_jobs` table records project,
composition, optional revision, source label/context, format, FPS, quality,
settings JSON, output/destination paths, progress, log tails, errors, output
facts, and timestamps. The main process owns project/revision resolution,
destination tokens, output path safety, Producer execution, cancellation,
retry, open/reveal, and startup interruption recovery.

The renderer now has a first-class right-pane Renders surface opened by the
existing top-bar `Renders` button. It offers MP4, MOV, and WebM; FPS choices
24/30/60; draft/standard/high quality where meaningful; project-local output by
default; main-process save dialog support; active job count; progress rows;
cancel; retry; clear completed; open; reveal; and remove. When a revision
preview is active, the pane exposes `Main` vs `Current Preview` and defaults to
`Main`.

Validation completed:

- `bun test src/shared/ripple-exports.test.ts src/main/lib/exports src/renderer/features/ripple-shell/ripple-shell-layout.test.ts src/renderer/features/renders/export-target.test.ts`
  passed.
- `bun run test:ripple` passed with 254 tests.
- `bun x tsc --noEmit` passed.
- `bun run build` passed.
- Direct Node Producer smoke rendered MP4, MOV, and WebM. FFprobe confirmed MOV
  `mov,mp4,m4a,3gp,3g2,mj2` / ProRes / 640x360 / 1.0s and WebM
  `matroska,webm` / VP9 / 640x360 / 1.0s.
- `bun run ts:check` now passes after switching the script to the local
  TypeScript compiler (`tsc --noEmit`).
- Live app QA exported MP4, MOV, WebM, and Current Preview MP4 from the Renders
  pane. Cancel, Retry, Open, and Reveal controls were exercised through the UI.

Retrospective notes:

- The narrow Producer executor boundary was the right pressure valve. It kept
  the product service clean while absorbing public API and declaration quirks.
- The destination-token model keeps renderer inputs product-level and avoids
  trusting arbitrary absolute paths.
- Revision export is implemented through the same validated preview-context
  resolver as revision preview, so export does not silently fall back to Main if
  isolation fails.
- The right-pane Renders surface needs especially terse trigger text. Select
  descriptions belong inside the menu rows, not inside the collapsed trigger.

## Context and Orientation

Ripple is a local-first desktop app for creating short motion graphics with
HyperFrames. Earlier phases created local Ripple projects, added a HyperFrames
service layer, wrapped the official player for preview, built timeline and
project panes, moved into a Ripple shell, and began comment/revision workflows.

The current target project shape includes an `exports/` folder:

```text
~/Ripple/<project-name>/
├── index.html
├── compositions/
├── assets/
├── hyperframes.json
├── meta.json
└── exports/
```

Relevant current files:

- `src/main/lib/hyperframes/runtime.ts` resolves the local HyperFrames command
  and app-managed FFmpeg/FFprobe environment.
- `src/main/lib/hyperframes/project-context.ts` resolves project and revision
  contexts and validates project-local output paths.
- `src/main/lib/hyperframes/render-manager.ts` starts cancellable in-memory
  HyperFrames render jobs.
- `src/main/lib/hyperframes/types.ts` defines current low-level render formats,
  qualities, FPS values, and statuses.
- `src/main/lib/trpc/routers/hyperframes.ts` exposes low-level render,
  status, and cancel routes.
- `src/main/lib/db/schema/index.ts` currently has projects, compositions,
  chats, comment threads, revisions, and comment messages, but no export jobs.
- `src/renderer/features/ripple-shell/RippleShell.tsx` owns the selected
  project, active composition, right-pane state, preview time, timeline
  selection, and active revision preview state.
- `src/renderer/features/ripple-shell/ripple-shell-layout.ts` defines right
  pane modes and does not yet include `renders`.
- `src/renderer/features/ripple-shell/RippleReviewPane.tsx` renders chat,
  comments, and related right-pane content. Renders should become another
  first-class right-pane page in this same review-pane area.
- `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx` displays the
  active project or revision preview and should not become the primary export
  settings surface.

Terms:

- A render is the HyperFrames process that turns a composition into a video
  file.
- An export is the user-facing product action and durable job record.
- An export job is a persisted SQLite row describing source, settings, output,
  status, progress, logs, and timestamps.
- The source context is the validated project or revision workspace used for
  the render.
- The destination is the product-visible final output location. It may start as
  project-local `exports/` and later copy or save to a user-selected file path.

Installed HyperFrames `0.4.40` render command:

```bash
hyperframes render [OPTIONS] [DIR]
```

Verified options:

```text
-o, --output
-f, --fps="30"                 24, 30, 60
-q, --quality="standard"       draft, standard, high
--format="mp4"                 mp4, webm, mov
-w, --workers                  number or auto
--docker
--hdr
--sdr
--crf
--video-bitrate
--gpu
--browser-gpu
--quiet
--strict
--strict-all
--max-concurrent-renders
```

Format behavior to carry into UX:

- MP4 is the default sharing format.
- MOV uses ProRes 4444 and is the best transparent overlay/editor format.
- WebM uses VP9 alpha and is useful for transparent browser playback, but not
  reliable in most video editors.
- MOV quality is effectively fixed by ProRes settings, so a quality selector
  should be hidden or explained for MOV.
- HDR is MP4-oriented and should not be shown in the default export surface
  until validation and UI copy are ready.

## Plan of Work

Milestone 0 proves the Producer integration. `@hyperframes/producer` is now
installed and pinned to the exact `0.4.40` HyperFrames package-family version
used by `hyperframes`, `@hyperframes/core`, `@hyperframes/player`, and
`@hyperframes/studio`. Build a small main-process-adjacent prototype that
imports the public Producer API, renders the default Ripple project to MP4,
emits structured progress, verifies the actual public cancellation mechanism,
uses Ripple's app-managed FFmpeg/FFprobe and browser paths, and passes a
packaged-resource check. Package configuration now unpacks
`@hyperframes/producer` beside the other HyperFrames packages. If Producer
fails a must-have Electron, cancellation, composition-targeting, or packaging
constraint, record the blocker and resolve it before proceeding with the Phase
11 implementation.

Milestone 1 creates the durable export model. Add shared export types in
`src/shared/ripple-exports.ts`, then add `exportJobs` to
`src/main/lib/db/schema/index.ts` and generate a Drizzle migration. The schema
must capture project, composition, optional revision, source context key,
format, FPS, quality preset, advanced settings JSON, output path, destination,
status, progress, label, process/log facts, error message, file size, and
timestamps. The first implementation should use statuses:
`queued`, `preparing`, `running`, `completed`, `cancelled`, `failed`, and
`interrupted`.

Milestone 2 builds a persistent export service under
`src/main/lib/exports/`. This service should use a Producer-backed executor as
the single target execution path. It writes job state at every transition,
resolves project, composition, and revision IDs in the main process, creates
safe project-local output paths, starts HyperFrames rendering with the
app-managed environment, captures structured progress, maps Producer stages to
Ripple export statuses, supports the verified Producer cancellation mechanism,
marks stale running jobs as interrupted at startup, and uses app-managed
FFprobe to verify completed outputs.

Milestone 3 adds a product-level `exports` router. The router should expose
`list`, `get`, `start`, `cancel`, `retry`, `clearCompleted`, `chooseDestination`,
`revealOutput`, and `openOutput` or equivalent operations. It should keep the
low-level `hyperframes.render` route available for internal tests/debug only,
or migrate callers into the new export service. Renderer inputs must use
`projectId`, `compositionId`, and `revisionId`; they must not provide arbitrary
absolute paths. Destination selection should happen through the main process,
either as a save dialog token or a validated main-process path returned by a
trusted desktop API.

Milestone 4 builds the Ripple Renders UI. Enable the existing top-bar
`Renders` button in `RippleShell.tsx`, add a `renders` right-pane mode in
`ripple-shell-layout.ts`, and render a new feature under
`src/renderer/features/renders/` inside the same right review-pane area that
already hosts Chat, Comments, Details, Files, Changes, Plan, Terminal, and MCP.
The UI should adapt Studio's pattern: header with export controls, format info,
quality selector, job count, clear completed, list rows with
thumbnail/progress/error/success, cancel for running jobs, remove for
completed/failed/cancelled rows, and open/reveal actions for completed outputs.
It should use Ripple components, lucide icons, tRPC, and motion-design
language.

Milestone 5 hardens export targets. The default export target is the selected
project's active composition. If the center preview is showing a revision,
the pane should clearly indicate that the user is viewing generated changes and
offer an explicit choice: export `Main` or export `Current Preview`. The
default should remain `Main` unless the user intentionally chooses the current
revision. Revision export must resolve through `revisionId` and registered
worktree validation, never through a renderer-supplied path.

Milestone 6 validates real outputs. MP4 is the required smoke path. MOV and
WebM should be tested against a fixture that can prove transparency or at least
format metadata. Validation should include nonzero output size, FFprobe format
and dimensions, duration matching the composition, representative nonblank
frames where possible, clear missing-environment errors, cancellation cleanup,
and restart recovery for interrupted jobs.

Milestone 7 preserves a narrow Producer boundary. Keep Producer access behind a
small `producer-executor` module so the renderer and `exports` router never
depend on package internals. This boundary is for isolation, tests, and future
Producer API changes, not for carrying a second CLI execution path.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Re-read the planning and current implementation context:

       sed -n '1,260p' PLANS.md
       sed -n '240,780p' ROADMAP.md
       sed -n '1,260p' plans/phase-3-hyperframes-service-layer.md
       sed -n '1,220p' plans/phase-8-comments-and-revisions.md
       git status --short

2. Reconfirm the installed HyperFrames render surface:

       node_modules/.bin/hyperframes --version
       node_modules/.bin/hyperframes render --help
       node_modules/.bin/hyperframes doctor

   Also run doctor through the app-managed environment if the raw CLI cannot
   see bundled FFmpeg/FFprobe.

3. Inspect Studio Renders behavior before changing UI:

       sed -n '1360,1630p' node_modules/@hyperframes/studio/src/App.tsx
       sed -n '1,260p' node_modules/@hyperframes/studio/src/components/renders/RenderQueue.tsx
       sed -n '1,260p' node_modules/@hyperframes/studio/src/components/renders/useRenderQueue.ts
       sed -n '1,260p' node_modules/@hyperframes/studio/src/components/renders/RenderQueueItem.tsx

4. Prototype and verify Producer:

       bun pm ls @hyperframes/producer

   If the package family is not pinned together, update all HyperFrames
   packages to the same exact version before continuing. Then build a focused
   main-process-adjacent smoke that imports the public Producer API, renders a
   default Ripple fixture to MP4, reports structured progress, verifies the
   public cancellation mechanism, and verifies the output with app-managed
   FFprobe. Keep `src/main/lib/hyperframes/package-config.test.ts` covering the
   Producer package surface and `asarUnpack`. If the package API, cancellation
   behavior, composition targeting, or Electron build path fails, record the
   exact blocker in `Surprises & Discoveries` and resolve it before moving past
   this milestone.

5. Create `src/shared/ripple-exports.ts` with shared statuses, format labels,
   quality labels, settings, and renderer view-model helpers.

6. Add `exportJobs` to `src/main/lib/db/schema/index.ts`.

   Suggested fields:

       id
       projectId
       compositionId
       revisionId
       sourceContextKey
       format
       fps
       qualityPreset
       settingsJson
       outputPath
       destinationPath
       status
       progress
       progressLabel
       pid
       stdoutTail
       stderrTail
       errorMessage
       outputSizeBytes
       startedAt
       createdAt
       updatedAt
       completedAt
       cancelledAt

   Suggested indexes:

       export_jobs_project_created_idx(projectId, createdAt)
       export_jobs_project_status_idx(projectId, status)
       export_jobs_composition_id_idx(compositionId)
       export_jobs_revision_id_idx(revisionId)

7. Generate and inspect the migration:

       bun run db:generate

8. Add `src/main/lib/exports/` with:

   - `types.ts` or imports from `src/shared/ripple-exports.ts`
   - `paths.ts` for safe output and destination handling
   - `progress.ts` for stdout/stderr progress parsing
   - `service.ts` for DB-backed job creation, state transitions, cancellation,
     retry, startup reconciliation, and FFprobe validation
   - `producer-executor.ts` for the direct Producer execution path
   - tests near those files

9. Keep the low-level HyperFrames render path narrow:

   - do not grow `hyperframes.render` into the product export workflow
   - keep it available for tests/debug while product exports use the new
     `exports` router and Producer-backed service
   - validate composition targeting in the Producer spike, likely through a
     public Producer option or prepared project entry source rather than a
     renderer-supplied path
   - keep revision resolution and output creation inside trusted main-process
     helpers

10. Add `src/main/lib/trpc/routers/exports.ts` and wire it into
   `src/main/lib/trpc/routers/index.ts`.

   Candidate route shape:

       exports.list({ projectId })
       exports.get({ jobId })
       exports.start({
         projectId,
         compositionId,
         revisionId,
         format,
         fps,
         qualityPreset,
         destinationToken,
         settings
       })
       exports.cancel({ jobId })
       exports.retry({ jobId })
       exports.clearCompleted({ projectId })
       exports.chooseDestination({ projectId, compositionId, format })
       exports.revealOutput({ jobId })
       exports.openOutput({ jobId })

11. Build `src/renderer/features/renders/`.

    Suggested files:

       RippleRendersPane.tsx
       ExportSettingsBar.tsx
       ExportJobList.tsx
       ExportJobRow.tsx
       ExportFormatTooltip.tsx
       ExportVideoThumbnail.tsx
       export-formatting.ts
       export-state.ts
       export-target.ts
       *.test.ts or *.test.tsx

12. Wire the shell:

    - Add `renders` to `RippleRightPaneMode` and storage validation in
      `src/renderer/features/ripple-shell/ripple-shell-layout.ts`.
    - Add a label and icon in `RippleReviewPane.tsx`.
    - Enable the disabled `Renders` button in `RippleShell.tsx`.
    - Make the button switch `rightPaneMode` to `renders` and open the existing
      review pane, not create a separate fourth export panel.
    - Pass `projectId`, active `compositionId`, and active `revisionId` into
      `RippleRendersPane`.
    - Ensure chat/comments state is preserved when the renders pane opens.

13. Implement the first visible UX:

    - `Renders` button opens the Renders pane and shows job count.
    - Empty state says `No renders yet`.
    - Format options are MP4, MOV, and WebM with Studio-derived explanations.
    - Quality options are Draft, Standard, and High; hide or disable quality
      for MOV with a short explanation.
    - Default FPS is 30, with 24 and 60 available only if the UI remains clean.
    - Default destination is project-local `exports/`.
    - Optional `Save As...` uses a main-process save dialog.
    - Running jobs show stage, percent when known, and `Cancel`.
    - Completed jobs show thumbnail, duration, file size, and open/reveal.
    - Failed/interrupted jobs show concise error and `Retry`.

14. Add startup recovery.

    On app startup or router initialization, mark `queued`, `preparing`, and
    `running` export rows from prior app processes as `interrupted`, unless a
    live child process is registered in the current `ExportManager`.

15. Add validation tests:

       bun test src/main/lib/exports src/shared/ripple-exports.test.ts
       bun test src/main/lib/hyperframes src/main/lib/ripple-projects src/main/lib/revisions
       bun test src/renderer/features/renders src/renderer/features/ripple-shell
       bun run test:ripple
       bun run build
       git diff --check

    `bun run ts:check` should be run if practical. If it still reports the
    known repo-wide baseline, record exact changed-file relevance.

16. Run render/export smoke checks with a disposable project or a created
    Ripple project:

       node_modules/.bin/hyperframes render --format mp4 --quality draft --output <fixture>/exports/smoke.mp4 <fixture>
       node_modules/.bin/hyperframes render --format mov --output <fixture>/exports/smoke.mov <fixture>
       node_modules/.bin/hyperframes render --format webm --output <fixture>/exports/smoke.webm <fixture>

    These commands may require sandbox escalation because HyperFrames render
    starts local browser/server processes that bind to `0.0.0.0`.

17. Use app-managed FFprobe or FFmpeg metadata checks to verify:

    - file exists
    - file is nonzero
    - format matches the requested container
    - width and height match composition metadata
    - duration matches expected composition duration within tolerance
    - frame count is plausible for duration and FPS

18. Update this ExecPlan with real progress, command results, decisions, and
    remaining risks before stopping.

## Validation and Acceptance

Acceptance criteria:

- The existing top-bar `Renders` button is enabled for Ripple projects and opens
  a Renders pane without hiding the normal preview, assets, chat, or comments
  workflows.
- A user can export the selected composition as MP4 with default settings from
  the renderer.
- A user can choose MOV and WebM when the installed HyperFrames render path
  validates those outputs.
- The export path uses main-process tRPC, never renderer-launched shell
  commands.
- Export jobs are persisted in SQLite and survive app restart as completed,
  failed, cancelled, or interrupted history.
- Running exports show progress or at least a meaningful stage and log-derived
  activity.
- Running exports can be cancelled from the UI.
- Completed exports can be opened or revealed from the UI.
- Failed and interrupted exports show clear errors and can be retried.
- The final output path is recorded.
- Project-local output paths remain inside the project or validated revision
  context; user-chosen destinations are obtained and validated by the main
  process.
- Revision export is only possible through a validated `revisionId`, and the UI
  makes it clear whether it is exporting `Main` or `Current Preview`.
- Missing FFmpeg/FFprobe/Node/HyperFrames readiness produces a Ripple-facing
  error, not raw command noise.
- No primary-path `1Code`, repo, branch, PR, or manual dependency language is
  introduced.

Automated validation:

- Unit tests cover export settings, format labels, state transitions, retry,
  cancellation, stale-running recovery, destination validation, path escaping,
  and progress parsing.
- Main-process tests cover project and revision context resolution for export.
- Renderer tests cover disabled/running states, format/quality behavior, cancel,
  retry, clear completed, empty state, and target ambiguity messaging.
- `bun run test:ripple` passes.
- `bun run build` passes.
- `git diff --check` passes.

Manual or smoke validation:

- Create or open a Ripple project and export MP4 from the Renders pane.
- Cancel a long-running export and verify it stops, records `cancelled`, and
  leaves no active render process.
- Export MOV and WebM from a fixture and verify the resulting container with
  FFprobe.
- Restart the app with a mocked or interrupted running row and verify the row
  becomes `interrupted`.
- Export while viewing a comment-generated revision and verify the UI states
  whether the export source is Main or Current Preview.
- Reveal/open a completed file from the Renders pane.

## Idempotence and Recovery

Listing export jobs is safe to run repeatedly. It should read SQLite rows and
optionally verify completed output files still exist. Missing completed files
should become a recoverable `failed` or `missing` UI state without deleting the
row.

Starting an export creates a new job by default. Retrying creates a new attempt
linked to the prior job or reuses the prior row only if the service can do so
without ambiguity. Output filenames should be collision-safe.

Cancellation must be idempotent. Calling cancel on a completed, failed,
cancelled, or interrupted job should return the current state. Calling cancel on
a running job should mark it cancelling/cancelled, stop the child process or
abort the producer render, and remove only temporary files that are definitely
inside the trusted output directory.

On app startup, any persisted `queued`, `preparing`, or `running` jobs from a
previous process should be marked `interrupted` with a clear recovery message.
If future work adds a background render service that can survive renderer
reloads, this rule should only apply to jobs whose process is not registered in
the current main process.

Destination handling must be repeatable. Project-local `exports/` should be
created if missing. If a user-selected destination is unavailable, the job
should fail before rendering or fall back only after explicit user choice; it
must not silently write somewhere unexpected.

If `@hyperframes/producer` proves unstable in Electron or packaging, recovery
is to keep the DB-backed export router plan, record the exact blocker, and fix
the Producer integration before continuing rather than carrying a second
shipped render executor.

## Interfaces and Dependencies

Existing dependencies:

- `hyperframes@0.4.40`
- `@hyperframes/core@0.4.40`
- `@hyperframes/player@0.4.40`
- `@hyperframes/producer@0.4.40`
- `@hyperframes/studio@0.4.40`
- `@ffmpeg-installer/ffmpeg`
- `@ffprobe-installer/ffprobe`
- Electron main process, tRPC, Drizzle, SQLite, React, Jotai, TanStack Query,
  Radix/Tailwind, Sonner, and lucide-react.

Packaging note:

- `@hyperframes/producer` is unpacked with the other HyperFrames packages in
  `package.json` so packaged render experiments can use its runtime files.

Likely new main-process interfaces:

- `src/shared/ripple-exports.ts`
- `src/main/lib/db/schema/index.ts` `exportJobs`
- `src/main/lib/exports/service.ts`
- `src/main/lib/exports/paths.ts`
- `src/main/lib/exports/progress.ts`
- `src/main/lib/exports/producer-executor.ts`
- `src/main/lib/trpc/routers/exports.ts`
- startup recovery call from the main process or router initialization

Likely changed main-process interfaces:

- `src/main/lib/hyperframes/render-manager.ts`
- `src/main/lib/hyperframes/project-context.ts`
- `src/main/lib/hyperframes/types.ts`
- `src/main/lib/trpc/routers/hyperframes.ts`
- `src/main/lib/trpc/routers/index.ts`
- `package.json` `test:ripple`

Likely new renderer interfaces:

- `src/renderer/features/renders/RippleRendersPane.tsx`
- `src/renderer/features/renders/ExportSettingsBar.tsx`
- `src/renderer/features/renders/ExportJobList.tsx`
- `src/renderer/features/renders/ExportJobRow.tsx`
- `src/renderer/features/renders/ExportFormatTooltip.tsx`
- `src/renderer/features/renders/ExportVideoThumbnail.tsx`
- `src/renderer/features/renders/export-formatting.ts`
- `src/renderer/features/renders/export-state.ts`
- `src/renderer/features/renders/export-target.ts`

Likely changed renderer interfaces:

- `src/renderer/features/ripple-shell/RippleShell.tsx`
- `src/renderer/features/ripple-shell/RippleReviewPane.tsx`
- `src/renderer/features/ripple-shell/ripple-shell-layout.ts`
- `src/renderer/features/ripple-shell/ripple-shell-atoms.ts`

External references checked during planning:

- HyperFrames rendering guide:
  `https://hyperframes.heygen.com/guides/rendering`
- HyperFrames Studio package docs:
  `https://hyperframes.heygen.com/packages/studio`
- HyperFrames Producer package docs:
  `https://hyperframes.heygen.com/packages/producer`

## Artifacts and Notes

Research summary:

- Studio's `RenderQueue` has the right compact queue shape, but it is private
  package source and uses `/api/projects/:projectId/render` plus
  `/api/render/:jobId/progress` SSE, not Ripple tRPC.
- Studio supports MP4, MOV, and WebM in the UI. It hides quality for MOV and
  hardcodes 30 FPS.
- Studio's queue row includes thumbnail, hover playback preview, filename,
  duration, progress stage, percent, failure text, timestamp, download, and
  remove.
- Ripple already has stronger cancellation than Studio's visible UI because the
  current `RenderManager` kills the child process.
- Current Ripple render jobs are not durable, cannot target revisions, and have
  no renderer UI.
- Official docs say Studio preview and render use the same seek-driven runtime
  model, so successful preview is a good pre-export confidence signal but not a
  substitute for real output validation.
- Official docs say MOV/WebM support transparency. The UI should explain MOV as
  the editor/overlay format and WebM as the browser transparency format.
- Docker is optional for local export. Missing Docker should not block MP4
  export. Docker mode can be advanced/future unless the user explicitly wants
  deterministic production renders in Phase 11.
- The chosen long-term architecture is direct Producer integration through a
  Ripple-owned executor. This mirrors the preview/timeline/assets approach:
  pin official HyperFrames packages to one exact version and consume them
  through Ripple adapters rather than importing private Studio internals or
  rebuilding HyperFrames behavior.

Resolved implementation questions:

- The top-bar label stays `Renders` to match Studio and the queue/history
  mental model; the primary action inside the pane is `Export`.
- Phase 11 supports exporting either `Main` or `Current Preview` when a revision
  preview is active, but defaults to `Main` for safety.
