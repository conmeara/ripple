# Phase 3: HyperFrames Service Layer

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple has a main-process HyperFrames service layer that can
prepare and run motion tooling for a local Ripple project without exposing
developer setup to the user. The app can check motion-runtime readiness,
discover compositions from the real HyperFrames CLI, start and stop a preview
server for a project or revision context, capture frame snapshots, render an MP4
from a test project, and cancel long-running preview or render work.

The visible product win is not the full Phase 4 shell yet. The visible win is
that later UI surfaces can depend on typed, app-owned operations instead of
renderer-launched commands or repo/dev-server assumptions. A motion designer
should eventually see preview, snapshot, and export states in Ripple language;
this phase creates the safe backend contract that makes those surfaces possible.

This phase builds on Phase 2 project creation. It should not reintroduce manual
dependency installation, GitHub, repo selection, branch/worktree terminology, or
renderer access to privileged shell commands. It also should not implement the
full four-pane editor shell from Phase 4, comment revision workflow from Phase
5, or persistent export job model from Phase 6 unless a tiny internal type is
needed to manage in-memory render status.

## Progress

- [x] 2026-04-25 / Codex: Created this ExecPlan from `ROADMAP.md`,
  `PLANS.md`, the completed Phase 2 plan, current source inspection, and the
  installed HyperFrames CLI surface.
- [x] 2026-04-25 / Codex: Prototyped the app-managed HyperFrames command
  environment against the installed CLI. The shared environment prepends the
  app-managed FFmpeg and FFprobe directories to `PATH` and disables update,
  telemetry, and auto-install behavior.
- [x] 2026-04-25 / Codex: Extracted reusable runtime and command-resolution
  helpers into `src/main/lib/hyperframes/runtime.ts`, then refactored
  `src/main/lib/ripple-projects/environment.ts` to use the same candidates.
- [x] 2026-04-25 / Codex: Added main-process HyperFrames service modules and
  unit tests for command resolution, composition JSON parsing, preview state,
  and render completion/cancellation.
- [x] 2026-04-25 / Codex: Added a typed `hyperframes` tRPC router and wired it
  into the root app router.
- [x] 2026-04-25 / Codex: Replaced metadata-only composition refresh for the
  new runtime path with CLI-backed discovery, parser validation, project-bound
  path checks, row upserts, and stale-row pruning.
- [x] 2026-04-25 / Codex: Added preview lifecycle management with start, stop,
  status, stdout/stderr tails, idempotent stop, and stop-all cleanup support.
- [x] 2026-04-25 / Codex: Added snapshot capture and MP4 render orchestration
  with project-local artifacts, nonempty output validation, and cancellation.
- [x] 2026-04-25 / Codex: Wired managed preview shutdown and render
  cancellation into Electron `before-quit` cleanup.
- [x] 2026-04-25 / Codex: Expanded `bun run test:ripple` to include the focused
  HyperFrames service tests.
- [x] 2026-04-25 / Codex: Validated with local CLI smoke checks,
  `bun run test:ripple`, and `bun run ts:check`. Typecheck still fails on the
  existing repo-wide baseline, but no new Phase 3 files appear in the error
  list.
- [x] 2026-04-25 / Codex: Full QA pass found and fixed three Phase 3 issues:
  runtime env overrides were ignored during command resolution, render tRPC
  accepted FPS as strings instead of numbers, and metadata-declared
  composition paths were seeded before project-boundary validation.
- [x] 2026-04-25 / Codex: Deferred full Electron renderer-to-tRPC smoke to
  Phase 4 because there are no UI callers for these routes yet. Bun import
  smoke is not representative because existing main-process routers import
  Electron's CJS package with named imports.
- [x] 2026-04-25 / Codex: Final completion check passed `bun test`,
  `bun run build`, and `git diff --check`; `bun run ts:check` still fails only
  on the existing repo-wide baseline, with no errors in the new HyperFrames
  service or router files.

## Surprises & Discoveries

- Observation: Phase 2 already installed app-managed HyperFrames, GSAP, FFmpeg,
  and FFprobe dependencies.
  Evidence: `package.json` includes `hyperframes`, `gsap`,
  `@ffmpeg-installer/ffmpeg`, and `@ffprobe-installer/ffprobe`; Electron
  packaging already unpacks those packages.
- Observation: The installed local CLI is `hyperframes` version `0.4.28`.
  Evidence: `node_modules/.bin/hyperframes --version` returned `0.4.28`, and
  `node_modules/hyperframes/package.json` reports the same package version.
- Observation: HyperFrames command help confirms the Phase 3 surface area.
  Evidence: `hyperframes preview --help` supports `--port`, `--force-new`,
  `--list`, and `--kill-all`; `hyperframes compositions --help` supports
  `--json`; `hyperframes snapshot --help` supports frame count and timestamp
  arguments; `hyperframes render --help` supports `mp4`, `webm`, and `mov`
  formats, `--output`, `--fps`, `--quality`, workers, Docker, HDR, GPU, and
  strict lint flags.
- Observation: Running `hyperframes doctor` directly does not see Phase 2's
  app-managed FFmpeg/FFprobe binaries because the CLI looks on `PATH`.
  Evidence: `node_modules/.bin/hyperframes doctor` reported FFmpeg and FFprobe
  as not found on this machine.
- Observation: Prepending the app-managed installer directories to `PATH` lets
  the same doctor command find FFmpeg and FFprobe.
  Evidence: running `hyperframes doctor` with
  `node_modules/@ffmpeg-installer/darwin-arm64` and
  `node_modules/@ffprobe-installer/darwin-arm64` prepended to `PATH` reported
  both tools ready. Docker remained missing, which should be optional for local
  preview/export.
- Observation: Phase 2 composition discovery is metadata-driven, not CLI-driven.
  Evidence: `src/main/lib/ripple-projects/metadata.ts` reads
  `hyperframes.json` and declared composition paths, while
  `src/main/lib/ripple-projects/service.ts` upserts those rows without running
  `hyperframes compositions --json`.
- Observation: There is no `hyperframes` tRPC namespace yet.
  Evidence: `src/main/lib/trpc/routers/index.ts` wires project, chat, Claude,
  Codex, terminal, file, and plugin routers, but no HyperFrames router.
- Observation: The existing security boundary already knows how to accept
  direct project paths as registered local workspaces.
  Evidence: `src/main/lib/git/security/path-validation.ts` accepts
  `projects.localPath` and `projects.path` in addition to chat worktree paths.
- Observation: The installed `hyperframes compositions --json` output reports
  nested/external composition source paths only when the host element has both a
  `data-composition-id` and `data-composition-src`.
  Evidence: the generated Phase 3 smoke project returned `main` plus
  `lower-third` with `source: "./compositions/lower-third.html"` after the
  starter scaffold included both attributes on the lower-third host.
- Observation: HyperFrames interprets `data-duration` values as seconds, not
  frames.
  Evidence: the original starter used values such as `180`, causing
  `hyperframes render` to start a 5400-frame render. The scaffold now uses a
  six-second composition, and app-managed FFprobe reports the final MP4 as
  6.000000 seconds and 180 frames at 30fps.
- Observation: `hyperframes snapshot`, `hyperframes render`, and
  `hyperframes preview` start a local HTTP/file server that binds to
  `0.0.0.0`. The Codex sandbox blocks that bind.
  Evidence: direct snapshot/render/preview smoke commands failed with
  `listen EPERM: operation not permitted 0.0.0.0`; the same commands succeeded
  when run with sandbox escalation for the disposable smoke project.
- Observation: `hyperframes preview` has no advertised no-browser/no-open flag.
  Evidence: `hyperframes preview --help` lists `--port`, `--force-new`,
  `--list`, and `--kill-all` only. The Phase 3 preview smoke therefore used a
  short managed process and terminated it after startup output.
- Observation: The generated starter produced avoidable render noise.
  Evidence: a lower-third GSAP `.set("#lower-third", ...)` call warned because
  HyperFrames did not expose that wrapper selector during capture, and worker
  pages emitted favicon 404s. Removing the selector-only set and adding an
  inline empty favicon produced a clean render log.
- Observation: QA found path validation had to cover both CLI-reported paths
  and `hyperframes.json` declared paths.
  Evidence: `mergeCliAndDeclaredCompositions` now validates declared paths with
  the same project-local/file-existence checks as CLI sources. Tests cover
  missing declared files and `../outside.html` traversal.
- Observation: QA found command env overrides and render FPS input needed
  tightening before renderer callers exist.
  Evidence: `resolveHyperframesCommand` now merges caller env overrides into
  candidate envs, and `hyperframes.render` accepts numeric `24`, `30`, or `60`
  FPS values instead of string enums.

## Decision Log

- Decision: Add a separate `hyperframes` tRPC router instead of overloading the
  existing `projects` router with preview, snapshot, and render operations.
  Rationale: Project lifecycle and motion-runtime orchestration are different
  responsibilities. `projects` can continue to own create/open/archive and
  stored project metadata, while `hyperframes` exposes runtime operations later
  renderer surfaces can call directly.
  Date/Author: 2026-04-25 / Codex.
- Decision: Treat the roadmap's candidate `hyperframes.createProject` endpoint
  as already satisfied by Phase 2's `projects.createRippleProject` unless
  implementation discovers a concrete need for a private CLI-scaffold helper.
  Rationale: Creating the Ripple project folder, scaffold, database row, and
  selected project state is already a project-service concern. Duplicating it in
  a runtime router would create two creation paths.
  Date/Author: 2026-04-25 / Codex.
- Decision: Centralize HyperFrames command resolution in a new main-process
  module and have Phase 2 setup checks use the same resolver.
  Rationale: The current environment checks can find app-managed tools, but the
  HyperFrames CLI itself needs `PATH` adjusted so its internal `ffmpeg` and
  `ffprobe` calls find the bundled packages. One resolver should define the CLI
  command, Node/Electron invocation, environment flags, and app-managed binary
  paths for doctor, compositions, preview, snapshot, and render.
  Date/Author: 2026-04-25 / Codex.
- Decision: Renderer inputs must use registered project or revision IDs, not
  renderer-supplied absolute paths.
  Rationale: HyperFrames commands read and write project files. The main process
  must resolve project paths from SQLite or a registered revision context, then
  validate relative composition, snapshot, and export paths before passing them
  to child processes.
  Date/Author: 2026-04-25 / Codex.
- Decision: Keep Phase 3 render jobs in memory and project-local output folders;
  defer persistent export jobs and full export UI to Phase 6.
  Rationale: Phase 3 needs to prove render orchestration and cancellation. Phase
  6 owns the durable export job model, destination chooser, progress UI, and
  recovery semantics.
  Date/Author: 2026-04-25 / Codex.
- Decision: Docker readiness is optional for this phase.
  Rationale: The roadmap calls Docker optional for deterministic renders, while
  Phase 3 acceptance requires local readiness, composition discovery, preview,
  snapshots, and at least MP4 rendering. Missing Docker should not block local
  preview or MP4 smoke validation.
  Date/Author: 2026-04-25 / Codex.

## Outcomes & Retrospective

Phase 3 implemented the main-process service layer under
`src/main/lib/hyperframes/`:

- `runtime.ts` resolves local/packaged/package-script/global HyperFrames CLI
  candidates, builds the app-managed environment, and exposes one-shot and
  spawned command helpers.
- `project-context.ts` resolves project IDs to local project paths from SQLite
  and validates project-relative artifact paths before filesystem access.
- `compositions.ts` runs `hyperframes compositions --json`, parses the CLI
  shape, merges CLI facts with declared metadata, and upserts/prunes saved
  composition rows.
- `preview-manager.ts` tracks one managed preview per project context with
  start, running, stopped, and error states.
- `snapshot.ts` captures project-local PNG snapshots and returns relative
  artifact paths.
- `render-manager.ts` starts cancellable in-memory render jobs, writes unique
  outputs under `exports/`, captures log tails, and verifies nonempty output.
- `snapshot.test.ts` covers repeated snapshot calls that rewrite existing CLI
  output names.
- `index.ts` exports the service surface for tRPC and future main-process
  callers.

The new `src/main/lib/trpc/routers/hyperframes.ts` exposes:

- `hyperframes.doctor`
- `hyperframes.listCompositions`
- `hyperframes.startPreview`
- `hyperframes.stopPreview`
- `hyperframes.getPreviewStatus`
- `hyperframes.snapshot`
- `hyperframes.render`
- `hyperframes.getRenderStatus`
- `hyperframes.cancelRender`

`src/main/lib/trpc/routers/index.ts` wires the router into the app router.
`package.json` now includes `src/main/lib/hyperframes` in `bun run
test:ripple`. `src/main/lib/ripple-projects/environment.ts` now uses the same
HyperFrames runtime helpers as preview/render so readiness and execution agree
about the app-managed FFmpeg/FFprobe `PATH`.
`src/main/index.ts` stops managed previews and cancels in-memory renders during
Electron `before-quit` cleanup.

The Phase 2 starter scaffold was adjusted while validating Phase 3. The root
composition now lasts six seconds, the lower-third timing is expressed in
seconds, and the starter HTML includes an inline empty favicon to prevent
browser worker noise during render. This keeps the default generated project
small enough for repeatable smoke renders.

Validation run on 2026-04-25 from `/Users/comeara/Projects/ripple`:

- `bun test src/main/lib/hyperframes` passed: 12 tests.
- `bun test src/main/lib/ripple-projects/scaffold.test.ts` passed: 3 tests.
- `bun test` passed: 52 tests.
- `bun run test:ripple` passed: 52 tests.
- `bun run build` passed. Build emitted existing warnings about `gray-matter`
  `eval` and dynamic imports for analytics/db chunking.
- `hyperframes doctor` with the app-managed `PATH` found HyperFrames 0.4.28,
  Node.js, FFmpeg, FFprobe, and Chrome. Docker was missing, which remains
  optional for local preview/export.
- `hyperframes compositions --json
  /var/folders/04/p10shm7d3p1_0wz2m2nd8cjw0000gn/T/ripple-phase3-smoke-oAo4RL`
  returned `main` and `lower-third`.
- `hyperframes lint --json` against that smoke project returned `ok: true`
  with zero errors and zero warnings.
- `hyperframes snapshot --frames 2` against that smoke project created
  `snapshots/frame-00-at-0pct.png` and
  `snapshots/frame-01-at-100pct.png`.
- `hyperframes preview --port 43921 --force-new` started Studio at
  `http://localhost:43921` and shut down cleanly after the managed smoke.
- `hyperframes render --format mp4 --quality draft --output
  <smoke>/exports/smoke.mp4 <smoke>` created a 227 KB MP4.
- App-managed FFprobe read the MP4 as H.264, 1920x1080, 30fps, 6.000000
  seconds, 180 frames.
- A fresh QA smoke project at
  `/var/folders/04/p10shm7d3p1_0wz2m2nd8cjw0000gn/T/ripple-phase3-qa-SacCiR`
  repeated doctor, composition discovery, lint, snapshot, preview start/stop,
  render, and FFprobe validation successfully.
- `bun run ts:check` still fails on pre-existing repo-wide baseline errors in
  `src/main/index.ts`, Claude transform/router files, credential manager
  missing modules, git watcher typings, and renderer agent surfaces. The
  reported errors did not include `src/main/lib/hyperframes/*` or
  `src/main/lib/trpc/routers/hyperframes.ts`.

Remaining risks:

- Phase 3 uses the CLI for preview/snapshot/render. The preview CLI may still
  open HyperFrames Studio externally because the installed version has no
  no-open flag.
- Preview and render jobs are intentionally in memory for this phase. Durable
  export history and recovery belong to Phase 6.
- Snapshot output is normalized from the CLI's default `snapshots/` behavior
  because the installed help does not expose an output directory flag.
- Full renderer-to-tRPC UI exercise is deferred to Phase 4, where the shell
  will actually call these routes.

## Context and Orientation

Ripple is being rebuilt from a 1Code-shaped Electron app into a local-first
motion graphics app. Phase 1 removed mandatory auth/provider gates. Phase 2
created a Ripple project-first flow that writes HyperFrames project folders
under `~/Ripple/<project-name>`, records them in SQLite, seeds composition rows,
and checks local setup readiness without blocking creation.

The current Phase 2 project service lives in
`src/main/lib/ripple-projects/service.ts`. It creates or opens project folders,
reads `hyperframes.json`, writes/updates rows in `projects` and `compositions`,
and stores setup status on the project row. `src/main/lib/ripple-projects`
also contains:

- `environment.ts`, which checks Node, FFmpeg, FFprobe, HyperFrames, and GSAP
  readiness.
- `metadata.ts`, which parses `hyperframes.json` and declared composition paths.
- `scaffold.ts`, which writes the offline starter project.
- `lifecycle.ts`, which validates destructive project file operations.
- `types.ts`, which defines setup and project result types.

The current database schema is in `src/main/lib/db/schema/index.ts`. `projects`
has Ripple-native fields such as `slug`, `localPath`,
`activeCompositionId`, `templateId`, `setupStatus`, and `archivedAt`, while
keeping legacy `path` for compatibility. `compositions` stores
`projectId`, `name`, `filePath`, `dataCompositionId`, `width`, `height`,
`parentCompositionId`, and `kind`.

The tRPC root router is created in `src/main/lib/trpc/routers/index.ts`.
`projects` routes currently expose create/open/list/setup-status and
composition-list operations from `src/main/lib/trpc/routers/projects.ts`.
Phase 3 adds a `hyperframes` router for runtime operations.

The installed HyperFrames CLI package is `hyperframes@0.4.28`. Useful commands
verified locally on 2026-04-25:

- `hyperframes doctor`
- `hyperframes compositions --json [DIR]`
- `hyperframes preview --port <port> --force-new [DIR]`
- `hyperframes snapshot --frames <count> [DIR]`
- `hyperframes snapshot --at <seconds,...> [DIR]`
- `hyperframes render --format mp4 --fps 30 --quality standard --output <path> [DIR]`

HyperFrames compositions are plain HTML files. The root composition element
needs `data-composition-id`, `data-width`, and `data-height`. Timed visible
elements need `class="clip"`, `data-start`, `data-duration`, and
`data-track-index`. GSAP timelines must be paused and registered on
`window.__timelines` by composition ID. The starter follows these rules,
copies a local GSAP runtime into generated projects, and uses seconds-based
timing for repeatable preview and render behavior.

## Plan of Work

First, build a command/runtime foundation under `src/main/lib/hyperframes/`.
The foundation should resolve the HyperFrames CLI script, choose the safest way
to invoke it from Electron, set `HYPERFRAMES_NO_TELEMETRY=1`,
`HYPERFRAMES_NO_UPDATE_CHECK=1`, and `HYPERFRAMES_NO_AUTO_INSTALL=1`, and
prepend app-managed FFmpeg/FFprobe directories to `PATH`. It should expose
small helpers for one-shot commands, long-running commands, JSON parsing,
timeout handling, child-process cleanup, and normalized error objects.

Second, refactor `src/main/lib/ripple-projects/environment.ts` so setup checks
use the same resolver. The setup report should continue to use Ripple language
such as "Motion runtime" and "preview and export tools", but under the hood it
should prove the exact environment used by HyperFrames commands. This is where
doctor output should be interpreted so missing Docker is not a local-preview
blocker.

Third, add project-context helpers that resolve a `projectId` to a local path
from SQLite, reject archived or missing projects when appropriate, and validate
all relative composition, snapshot, and render paths before filesystem access.
This module should be the only place runtime operations move from IDs to local
paths. It should be designed so Phase 5 can add `revisionId` or isolated
context IDs without letting renderer-supplied absolute paths through.

Fourth, implement CLI-backed composition discovery. Add a service function that
runs `hyperframes compositions --json <projectPath>`, parses the output into
typed composition records, validates that listed files are inside the project,
upserts `compositions` rows, prunes rows no longer reported by the CLI, and
updates `projects.activeCompositionId` only when the current active composition
is missing. Keep `projects.listCompositions` DB-backed, but let the new
`hyperframes.listCompositions` route refresh from the CLI and return the saved
rows.

Fifth, implement preview lifecycle management. A `PreviewManager` should keep
an in-memory map keyed by project or future revision context. `startPreview`
resolves the project, allocates a localhost port, starts
`hyperframes preview --port <port> --force-new <projectPath>`, captures stdout
and stderr, returns `http://localhost:<port>`, and records status as
`starting`, `running`, `stopped`, or `error`. `getPreviewStatus` returns the
current state without spawning new work. `stopPreview` kills the managed child
process and is safe to call repeatedly. App shutdown should stop managed
previews; it should not use `hyperframes preview --kill-all` except as a
documented manual recovery step because that can affect previews not launched
by Ripple.

Sixth, implement snapshot and render orchestration. Snapshot should create a
project-local `.ripple/snapshots/<id>` record or folder and call
`hyperframes snapshot` with frame-count or timestamp arguments. Because the
current CLI help does not advertise an output directory option, begin this
milestone with a prototype against a disposable fixture to observe where files
are written, then normalize the returned paths into project-local snapshot
artifacts. Render should create a unique output path under
`<project>/exports/`, call `hyperframes render --format mp4 --fps <fps>
--quality <quality> --output <path> <projectPath>`, capture status and logs in
memory, support cancellation by job ID, and verify that the output exists and is
nonzero before reporting success. WebM and MOV options can be typed now if the
CLI supports them, but MP4 is the required smoke proof for this phase.

Seventh, expose the service through a typed tRPC router in
`src/main/lib/trpc/routers/hyperframes.ts` and add it to
`src/main/lib/trpc/routers/index.ts`. Keep the initial renderer integration
minimal. A debug or smoke route is acceptable if needed, but the full Ripple
shell is Phase 4. The API should be clear enough for later renderer work to
consume without knowing about CLI commands, ports, child processes, FFmpeg, or
absolute paths.

Finally, validate the feature with focused tests and real CLI smoke checks. The
focused test suite should mock child-process execution for deterministic unit
tests, and at least one local smoke should use the installed CLI and a
disposable generated or fixture project to prove composition discovery,
preview start/stop, snapshot capture, MP4 render, and cancellation behavior.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple` unless noted otherwise.

1. Inspect the working tree:

       git status --short

2. Reconfirm the installed CLI surface before implementation:

       node_modules/.bin/hyperframes --version
       node_modules/.bin/hyperframes preview --help
       node_modules/.bin/hyperframes compositions --help
       node_modules/.bin/hyperframes snapshot --help
       node_modules/.bin/hyperframes render --help

3. Create `src/main/lib/hyperframes/types.ts` with runtime check, composition
   discovery, preview status, snapshot result, render job, quality, format, and
   normalized error types.

4. Create `src/main/lib/hyperframes/runtime.ts`.

   Implement command discovery for:

   - packaged `resources/bin/<platform>-<arch>/hyperframes`
   - installed package script from `hyperframes/package.json`
   - repository `node_modules/.bin/hyperframes` in development
   - global `hyperframes` as a last fallback

   Implement environment construction that prepends app-managed FFmpeg and
   FFprobe directories to `PATH`, disables telemetry/update/auto-install
   behavior, and invokes package scripts through Electron's embedded Node with
   `ELECTRON_RUN_AS_NODE=1` when needed.

5. Add tests for `runtime.ts` using mocked command candidates and environment
   builders. Expected assertions:

   - app-managed FFmpeg and FFprobe directories appear before the inherited
     `PATH`.
   - HyperFrames update and telemetry flags are set.
   - package-script invocation can be represented without downloading anything.
   - missing commands produce a typed readiness error instead of throwing raw
     child-process errors.

6. Refactor `src/main/lib/ripple-projects/environment.ts` to reuse the runtime
   resolver and app-managed `PATH`. Preserve the existing setup report shape so
   current renderer callers keep working.

7. Add `src/main/lib/hyperframes/project-context.ts`.

   It should resolve `projectId` to the current project row, derive the local
   project path from `localPath ?? path`, reject missing projects, reject
   archived projects for preview/render, verify `index.html` and
   `hyperframes.json` where needed, and expose helpers for safe project-local
   output paths.

8. Add `src/main/lib/hyperframes/compositions.ts`.

   Run `hyperframes compositions --json <projectPath>`, parse the JSON shape
   found in the installed CLI, normalize file paths and data composition IDs,
   upsert/prune `compositions` rows, and return saved rows. If CLI JSON shape
   differs from Phase 2 assumptions, record the shape in
   `Surprises & Discoveries` before adapting.

9. Add `src/main/lib/hyperframes/preview-manager.ts`.

   Use `spawn` for long-running preview processes. Track child PID, port, URL,
   status, startedAt, stoppedAt, stderr tail, and last error. Add cleanup for
   process exit, stop calls, and app shutdown.

10. Add `src/main/lib/hyperframes/snapshot.ts`.

    Prototype output behavior first. Then implement safe snapshot calls and
    return project-local artifact paths plus command logs or normalized errors.

11. Add `src/main/lib/hyperframes/render-manager.ts`.

    Start render jobs with unique IDs and output paths under `exports/`.
    Capture process state, parse useful progress text when available, support
    cancellation, and verify output existence/nonzero size before success.
    Use `ffprobe` from the app-managed path for smoke validation where possible.

12. Add `src/main/lib/trpc/routers/hyperframes.ts` and wire it into
    `src/main/lib/trpc/routers/index.ts`.

    Initial router shape:

        hyperframes.doctor({ projectId?: string })
        hyperframes.listCompositions({ projectId: string, refresh?: boolean })
        hyperframes.startPreview({ projectId: string, forceRestart?: boolean })
        hyperframes.stopPreview({ projectId: string })
        hyperframes.getPreviewStatus({ projectId: string })
        hyperframes.snapshot({ projectId: string, frames?: number, at?: number[] })
        hyperframes.render({ projectId: string, format?: "mp4" | "webm" | "mov", fps?: 24 | 30 | 60, quality?: "draft" | "standard" | "high" })
        hyperframes.getRenderStatus({ jobId: string })
        hyperframes.cancelRender({ jobId: string })

    Add `compositionId` inputs where implementation needs a specific active
    composition. Add `revisionId` only after a registered revision context
    exists in Phase 5.

13. Expand `bun run test:ripple` in `package.json` to include the focused
    HyperFrames service test files.

14. Run focused validation:

        bun test src/main/lib/hyperframes src/main/lib/ripple-projects/environment.test.ts
        bun run test:ripple

15. Run typecheck:

        bun run ts:check

    Expected result is success. If the existing repo-wide baseline still fails,
    record exact failure paths and confirm no new Phase 3 files are implicated.

16. Run local CLI smoke checks with the exact app-managed environment used by
    the service:

        node_modules/.bin/hyperframes doctor
        node_modules/.bin/hyperframes compositions --json <fixture-project>
        node_modules/.bin/hyperframes preview --port <chosen-port> --force-new <fixture-project>
        node_modules/.bin/hyperframes snapshot --frames 3 <fixture-project>
        node_modules/.bin/hyperframes render --format mp4 --quality draft --output <fixture-project>/exports/smoke.mp4 <fixture-project>

    For the first command, also run through the service/app-managed `PATH` so
    FFmpeg and FFprobe are found without relying on a global install.

17. Update this ExecPlan with completed progress, real command outputs,
    discoveries, final decisions, and remaining risks.

## Validation and Acceptance

Acceptance for Phase 3:

- `hyperframes.doctor` returns structured readiness for Node, HyperFrames,
  FFmpeg, FFprobe, and optional Docker/Chrome facts using the same environment
  preview/render commands will use.
- App-managed FFmpeg and FFprobe are available to the HyperFrames CLI through
  the service environment even when global `ffmpeg` and `ffprobe` are missing.
- Missing optional Docker does not mark local preview or MP4 render unavailable.
- `hyperframes.listCompositions` can refresh composition rows from
  `hyperframes compositions --json` for a created Ripple project.
- Composition discovery never trusts renderer-supplied absolute paths and never
  registers files outside the active project boundary.
- `hyperframes.startPreview` starts one managed preview per project context and
  returns a localhost URL.
- `hyperframes.getPreviewStatus` accurately reports starting, running, stopped,
  or error state.
- `hyperframes.stopPreview` is idempotent and leaves no managed preview process
  alive.
- `hyperframes.snapshot` captures frame artifacts from the default project or
  records a clear blocker if the installed CLI cannot produce controllable
  output paths.
- `hyperframes.render` can create a nonempty MP4 under the project `exports/`
  folder from the default Phase 2 scaffold.
- `hyperframes.cancelRender` can stop an in-flight render job without leaving a
  permanently running child process.
- The renderer has no new direct shell-command launch path for HyperFrames.
- Primary user-facing language remains project, composition, preview, snapshot,
  render, export, and local setup. No new primary-path repo, branch, worktree,
  dependency-install, or dev-server language is introduced.

Automated validation should include:

- Unit tests for command resolution, environment construction, CLI JSON parsing,
  project-path validation, preview manager state transitions, render manager
  cancellation, and setup-status interpretation.
- `bun run test:ripple`.
- `bun run ts:check`, or a documented repo-wide baseline failure with proof
  that Phase 3 files are not involved.

Manual or smoke validation should include:

- Doctor with app-managed `PATH`, showing FFmpeg and FFprobe ready.
- CLI-backed composition discovery against a created Ripple project.
- Preview start/status/stop against a disposable project.
- Snapshot capture against a disposable project.
- Draft MP4 render into `<project>/exports/` and verification that the file
  exists, is nonzero, and can be read by app-managed FFprobe.

## Idempotence and Recovery

Runtime checks and composition discovery must be safe to run repeatedly.
Repeated discovery should update existing composition rows, add newly reported
rows, prune rows that the CLI no longer reports, and preserve the active
composition when still valid.

Starting preview for a project that already has a running managed preview should
return the existing status unless `forceRestart` is true. Stopping preview
should succeed whether the process is running, already exited, or was never
started in the current app process.

Render output paths should be unique by default. Cancelling a render should mark
the job as cancelled and remove incomplete temporary files when they are safely
inside the project. Completed render files should not be deleted by status
polling or repeated calls.

If a child process exits unexpectedly, store the exit code, signal, and stderr
tail in the manager state. The next start call should be able to recover without
restarting the app.

If HyperFrames CLI JSON shape changes, fail with a typed parsing error, record
the observed shape in this plan, and update the parser with tests before
continuing.

If packaged resources are missing in development or production, the service
should report `needs_environment` or a typed runtime error rather than falling
back to network downloads or prompting users to install tools manually.

If a partial implementation leaves preview processes alive, recover by stopping
the tracked process IDs first. Use `hyperframes preview --kill-all` only as a
last-resort manual recovery step and document that it can stop previews not
launched by Ripple.

## Interfaces and Dependencies

New or changed main-process modules:

- `src/main/lib/hyperframes/types.ts`
- `src/main/lib/hyperframes/runtime.ts`
- `src/main/lib/hyperframes/project-context.ts`
- `src/main/lib/hyperframes/compositions.ts`
- `src/main/lib/hyperframes/preview-manager.ts`
- `src/main/lib/hyperframes/snapshot.ts`
- `src/main/lib/hyperframes/render-manager.ts`
- `src/main/lib/hyperframes/index.ts`
- `src/main/lib/trpc/routers/hyperframes.ts`
- `src/main/lib/trpc/routers/index.ts`
- `src/main/lib/ripple-projects/environment.ts`
- `src/main/lib/ripple-projects/service.ts`, if composition refresh integration
  needs to call the new discovery helper.

Existing dependencies to use:

- `hyperframes@0.4.28`
- `@ffmpeg-installer/ffmpeg`
- `@ffprobe-installer/ffprobe`
- `gsap`
- Electron's embedded Node runtime via `process.execPath` and
  `ELECTRON_RUN_AS_NODE=1` where appropriate.
- SQLite/Drizzle schema in `src/main/lib/db/schema/index.ts`.
- tRPC helpers from `src/main/lib/trpc/index.ts`.
- Existing path-boundary ideas from `src/main/lib/git/security/*` and
  `src/main/lib/ripple-projects/lifecycle.ts`.

Potential tRPC API:

- `hyperframes.doctor`
- `hyperframes.listCompositions`
- `hyperframes.startPreview`
- `hyperframes.stopPreview`
- `hyperframes.getPreviewStatus`
- `hyperframes.snapshot`
- `hyperframes.render`
- `hyperframes.getRenderStatus`
- `hyperframes.cancelRender`

External command dependencies:

- HyperFrames CLI must be local to the app or explicitly configured.
- FFmpeg and FFprobe should be resolved from app-managed packages before system
  tools.
- Chrome/headless browser readiness must be observed and reported. Docker is
  optional for this phase.

## Artifacts and Notes

Planning inspection on 2026-04-25:

- `git status --short` was clean before creating this plan.
- Existing phase plans: `plans/phase-1-local-first-boot.md` and
  `plans/phase-2-ripple-project-creation.md`.
- `node --version` returned `v25.9.0` in the local shell.
- `node_modules/.bin/hyperframes --version` returned `0.4.28`.
- Direct `node_modules/.bin/hyperframes doctor` reported system FFmpeg and
  FFprobe missing.
- Running doctor with app-managed FFmpeg/FFprobe directories prepended to
  `PATH` reported FFmpeg and FFprobe ready. Docker remained missing; keep it
  optional.
- `node_modules/.bin/hyperframes preview --help` confirms `--port`,
  `--force-new`, `--list`, and `--kill-all`.
- `node_modules/.bin/hyperframes compositions --help` confirms `--json`.
- `node_modules/.bin/hyperframes snapshot --help` confirms `--frames`, `--at`,
  and `--timeout`, but no output-directory option. Prototype this before
  finalizing snapshot artifact handling.
- `node_modules/.bin/hyperframes render --help` confirms `mp4`, `webm`, and
  `mov`, plus `--output`, `--fps`, `--quality`, `--workers`, `--docker`,
  `--strict`, and `--strict-all`.
