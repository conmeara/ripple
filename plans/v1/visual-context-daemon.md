# V1 Refactor: Visual Context Daemon

This ExecPlan must be maintained according to `plans/PLANS.md`.

## Purpose / Big Picture

Ripple already gives agents visual context through the Phase 14 `ripple
frame-sheet` command and automatic comment screenshots. That path works, but
the capture logic is split across the CLI, comment helpers, and snapshot
helpers, and the app still pays extra cost when each feature starts its own
browser or subprocess. This refactor turns visual capture into one app-owned
service: a Visual Context Daemon.

In this plan, "daemon" means a long-lived main-process service inside the
Ripple desktop app, not a separate operating-system background process. It owns
warm browser sessions, HyperFrames Engine capture sessions, project-safe file
serving, frame-sheet manifests, comment visual storage, and local agent-tool
requests. After this refactor, a user should be able to leave a frame comment,
select a time range, ask an agent for visual sanity checks, or run `ripple
visual sheet` and have every path reuse the same fast, tested, HyperFrames-aware
capture layer.

The goal is quality and speed together. Ripple should use the current warm
preview/browser path when the user literally means "the frame I am seeing right
now"; use `@hyperframes/engine` for deterministic snapshots, frame sheets, and
batch capture; keep `@hyperframes/producer` as the final render/export authority
and QA oracle; keep the HyperFrames CLI as a fallback and debug baseline; and
avoid wrapping the whole HyperFrames Studio app as an agent CLI. Studio is UI
reference material and a source of reusable renderer-side components, while
Engine is the programmatic capture boundary.

## Progress

- [x] 2026-05-07T02:02Z / User + Codex: Chose a new v1 ExecPlan instead of
  rewriting the completed Phase 14 plan, and scoped it as a Visual Context
  Daemon refactor inside Ripple.
- [x] 2026-05-07T02:02Z / Codex: Inspected the current Phase 14 implementation
  boundaries: `src/cli/frame-sheet.ts`, `src/main/lib/hyperframes/snapshot.ts`,
  `src/main/lib/revisions/comment-visuals.ts`,
  `src/main/lib/agent-runtime/cli-tools-env.ts`, and the existing visual QA
  tests.
- [x] 2026-05-07T02:02Z / Codex: Verified the local HyperFrames package shape:
  `@hyperframes/producer` and `@hyperframes/studio` are direct dependencies,
  `@hyperframes/engine` is present in `node_modules` but is not yet a direct
  Ripple dependency, Studio root exports UI/player/editor pieces, and Producer
  re-exports capture-session APIs plus render orchestration.
- [ ] Add `@hyperframes/engine` as an explicit pinned dependency beside the
  rest of the HyperFrames family and update packaging/package-config tests.
- [ ] Extract the current fast capture, guarded project server, sampling, and
  manifest code into a reusable visual-context core module.
- [ ] Implement a HyperFrames Engine capture backend and benchmark it against
  Ripple fast capture, HyperFrames Producer capture, and HyperFrames CLI
  snapshot.
- [ ] Implement the main-process Visual Context Daemon with warm session
  pooling, invalidation, request queueing, metrics, and graceful shutdown.
- [ ] Route comment visuals, `hyperframes.snapshot`, and `ripple frame-sheet`
  through the daemon while preserving standalone fallback behavior.
- [ ] Add the new `ripple visual ...` CLI commands and keep `ripple frame-sheet`
  as a compatibility alias.
- [ ] Update agent skill/context guidance so agents prefer the app-managed
  daemon-backed visual commands and report generated paths/manifests.
- [ ] Complete visual QA, package smoke, live provider smoke, and regression
  validation before making the daemon-backed path the default.

## Surprises & Discoveries

- Observation: The shipped Phase 14 path already proved that warm browser
  capture can be fast and pixel-equivalent to HyperFrames Producer on the
  deterministic QA fixture.
  Evidence: `src/main/lib/hyperframes/visual-capture-qa.test.ts` compares
  `captureFramesWithFastBrowser(...)` against Producer capture at 1920x1080 and
  asserts tiny pixel deltas, healthy CLI snapshot behavior, and faster fast
  capture than CLI snapshot.

- Observation: The current visual-context logic is useful but scattered.
  Evidence: `src/cli/frame-sheet.ts` owns sampling, fast capture, FFmpeg sheet
  assembly, and CLI JSON; `src/main/lib/hyperframes/snapshot.ts` wraps fast
  snapshot plus CLI fallback; `src/main/lib/revisions/comment-visuals.ts`
  duplicates single-frame and range-sheet capture choices for comments.

- Observation: The installed HyperFrames Engine package is the right
  programmatic capture layer, but Ripple does not yet pin it directly.
  Evidence: `node_modules/@hyperframes/engine/dist/index.d.ts` exports
  `createCaptureSession`, `initializeSession`, `captureFrame`,
  `captureFrameToBuffer`, `prepareCaptureSessionForReuse`,
  `createFileServer`, and browser pool helpers, while `package.json` currently
  pins `@hyperframes/core`, `@hyperframes/player`, `@hyperframes/producer`,
  `@hyperframes/studio`, and `hyperframes` but not `@hyperframes/engine`.

- Observation: Studio should not be the capture daemon.
  Evidence: `node_modules/@hyperframes/studio/src/index.ts` exports React UI,
  player, editor, timeline, and utility modules. Existing
  `src/main/lib/hyperframes/package-config.test.ts` currently asserts that
  production Ripple source does not import `@hyperframes/studio`, which matches
  the idea that Studio is UI reference or renderer integration material, not a
  main-process capture API.

- Observation: Producer should stay the final render/export authority and QA
  baseline.
  Evidence: `src/main/lib/exports/producer-executor.ts` already uses
  `@hyperframes/producer` for exports, and the current visual QA test uses
  Producer capture as the pixel oracle for the fast capture path.

## Decision Log

- Decision: Build a Visual Context Daemon inside Ripple instead of making agents
  drive HyperFrames Studio or shelling out to the HyperFrames CLI for every
  still/frame sheet.
  Rationale: Agents need a simple, stable visual tool surface. Ripple needs
  warm sessions, caching, app-managed browser selection, project-boundary
  safety, comment storage, manifests, and metrics. HyperFrames Engine provides
  the programmatic capture API; Studio is not designed as a capture RPC service.
  Date/Author: 2026-05-07 / User + Codex.

- Decision: Add `@hyperframes/engine` as a direct dependency, pinned to the same
  version as the rest of the HyperFrames family.
  Rationale: The daemon should lean on official Engine APIs rather than a
  transitive dependency hidden under Producer. Direct pinning makes packaging,
  tests, and future package upgrades explicit.
  Date/Author: 2026-05-07 / Codex.

- Decision: Use a backend ladder: `preview` for currently visible app frames,
  `engine` for deterministic capture and batch frame sheets, `fast-browser` as
  the proven current fallback/benchmark path, and `hyperframes-cli` as the
  external fallback/debug baseline.
  Rationale: No single path wins every case. The service should choose by user
  intent, project capability, and measured reliability rather than by ideology.
  Date/Author: 2026-05-07 / Codex.

- Decision: Keep Producer for final renders and validation, not everyday agent
  frame sheets.
  Rationale: Producer owns FFmpeg render/export semantics and should remain the
  output authority. Engine exposes lower-level capture sessions that are better
  suited to repeated stills and sheets.
  Date/Author: 2026-05-07 / Codex.

- Decision: Introduce `ripple visual ...` commands while preserving
  `ripple frame-sheet`.
  Rationale: `ripple frame-sheet` is already shipped and agent-guided.
  `ripple visual snapshot`, `ripple visual sheet`, and
  `ripple visual context` make the larger daemon-backed tool family easier to
  grow without breaking existing instructions.
  Date/Author: 2026-05-07 / Codex.

- Decision: The daemon API should be local, token-protected, and scoped to
  app-spawned agent environments.
  Rationale: App-spawned agents can use a fast local endpoint through
  environment variables. External terminal users should still get a standalone
  CLI fallback without needing the app to be open.
  Date/Author: 2026-05-07 / Codex.

## Outcomes & Retrospective

Not implemented yet. This plan records the intended refactor from the completed
Phase 14 CLI-first implementation to a v1 Visual Context Daemon. Completion
means comment visuals, app snapshots, frame sheets, QA captures, and in-app
agent visual commands all share one measured capture service, while the shipped
Phase 14 commands continue to work.

## Context and Orientation

Ripple is a local-first Electron/Vite/Bun desktop app for HyperFrames motion
projects. The main process lives under `src/main/`, the renderer under
`src/renderer/`, shared types under `src/shared/`, and CLI commands under
`src/cli/`. HyperFrames project folders contain HTML compositions, a
`hyperframes.json` manifest, assets, and generated Ripple folders such as
`.ripple/frame-sheets/` and `.ripple/comment-visuals/`.

The completed Phase 14 implementation added:

- `src/cli/frame-sheet.ts`: the current `ripple frame-sheet` implementation,
  including timestamp parsing, guarded project serving, fast browser capture,
  HyperFrames CLI fallback, FFmpeg sheet assembly, manifests, JSON output, and
  workspace safety.
- `src/main/lib/hyperframes/snapshot.ts`: app snapshot capture that tries
  Ripple fast browser capture first and falls back to `hyperframes snapshot`.
- `src/main/lib/revisions/comment-visuals.ts`: automatic single-frame and
  range-sheet capture for comment threads, plus runtime-only visual attachment
  resolution for agent runs.
- `src/main/lib/agent-runtime/cli-tools-env.ts`: app-managed PATH/env setup so
  Codex and Claude agents can run `ripple`, `hyperframes`, FFmpeg, and FFprobe
  inside the validated workspace.
- `resources/agent-skills/ripple-visual-context/SKILL.md` and
  `resources/claude-plugins/ripple-visual-context/skills/ripple-visual-context/SKILL.md`:
  app-managed visual-context guidance for agents.
- `src/main/lib/hyperframes/visual-capture-qa.test.ts`: deterministic browser
  QA comparing Ripple fast capture with HyperFrames Producer and CLI snapshot
  health.

Terms used in this plan:

- Visual context: a still image, frame sheet, manifest, or timeline/context
  summary that helps an agent understand motion work visually.
- Frame sheet: one image containing multiple sampled frames, plus a manifest
  mapping each cell to a time and frame number.
- Daemon: a long-lived main-process service inside Ripple that keeps browser
  and HyperFrames capture sessions warm. It is not a separate installed
  background app.
- Backend: one implementation of capture. In this plan the backends are
  `preview`, `engine`, `fast-browser`, and `hyperframes-cli`.
- Warm session: an already-launched browser/page/capture session that can seek
  and capture without paying full startup cost again.
- Canonical project storage: generated visuals copied under the main project,
  usually `.ripple/comment-visuals/<threadId>/`, so comment context survives
  discarded generated-change workspaces.

The current package boundary is important. `@hyperframes/engine` is the
official lower-level capture package. It opens a browser, serves or loads a
composition, seeks by frame/time, and captures images. `@hyperframes/producer`
is the higher-level render/export pipeline and remains the final render
authority. `@hyperframes/studio` is a React UI/editor package; it can inspire
or supply renderer components, but the daemon must not depend on the Studio app
as its capture engine. The `hyperframes` CLI is useful for external debugging
and fallback, but app hot paths should not pay its process/bundling/fixed-wait
cost for every visual request.

## Plan of Work

### Milestone 0: Baseline And Package Boundary

Start by locking down the current behavior so the refactor can move safely.
Add `@hyperframes/engine` to `package.json` with the exact same version as
`@hyperframes/core`, `@hyperframes/player`, `@hyperframes/producer`,
`@hyperframes/studio`, and `hyperframes`. Update
`src/main/lib/hyperframes/package-config.test.ts` so it asserts Engine is
pinned, installed, exported, and unpacked for packaged builds. Do not remove
the current fast-capture or CLI paths in this milestone.

Run focused tests before and after this package-boundary change:

    bun test src/main/lib/hyperframes/package-config.test.ts
    bun run ts:check

Acceptance for this milestone: the dependency is explicit, package tests prove
the HyperFrames family is in sync, and no visual behavior changes yet.

### Milestone 1: Extract A Visual Context Core

Move the shared low-level pieces out of `src/cli/frame-sheet.ts` into a
Node-only visual-context core that can be used by the app daemon, CLI
standalone fallback, and tests.

Create these files:

- `src/main/lib/visual-context/types.ts`
- `src/main/lib/visual-context/errors.ts`
- `src/main/lib/visual-context/sampling.ts`
- `src/main/lib/visual-context/manifest.ts`
- `src/main/lib/visual-context/project-server.ts`
- `src/main/lib/visual-context/ffmpeg-sheet.ts`
- `src/main/lib/visual-context/backends/fast-browser.ts`
- `src/main/lib/visual-context/index.ts`

The extracted core must stay free of Electron `app`, tRPC, DB access, renderer
state, and provider adapters. It may use Node, Bun-compatible APIs, app-managed
browser resolution from `src/main/lib/hyperframes/runtime.ts`, FFmpeg/FFprobe
helpers, and shared path-boundary helpers.

Move or wrap these concepts from `src/cli/frame-sheet.ts`:

- timestamp parsing and sampling math
- frame-sheet manifest creation
- safe project-relative path normalization
- guarded temporary project server
- fast browser capture
- FFmpeg sheet assembly
- cleanup path handling

After extraction, `src/cli/frame-sheet.ts` should become mostly argument
parsing and command presentation. `src/main/lib/revisions/comment-visuals.ts`
and `src/main/lib/hyperframes/snapshot.ts` should be able to call the same core
functions instead of duplicating capture choices.

Acceptance for this milestone: existing `ripple frame-sheet`, comment visual,
and snapshot tests still pass while the reusable core exists with focused unit
tests for sampling, manifest, path safety, and project-server safety.

### Milestone 2: Add A HyperFrames Engine Backend

Implement an Engine-backed capture backend that uses `@hyperframes/engine`
directly. The first version can be a standalone session per request, but it must
be written so the daemon can later keep sessions warm.

Create:

- `src/main/lib/visual-context/backends/hyperframes-engine.ts`
- `src/main/lib/visual-context/backends/types.ts`
- `src/main/lib/visual-context/backend-registry.ts`

The backend interface should look like this in spirit:

    export interface VisualCaptureBackend {
      readonly id: "preview" | "engine" | "fast-browser" | "hyperframes-cli"
      readonly supportsWarmSession: boolean
      captureFrames(input: VisualCaptureFramesRequest): Promise<VisualCaptureFramesResult>
      dispose?(): Promise<void>
    }

The exact TypeScript names may change during implementation, but the resulting
request and result types must include:

- project root
- source workspace root
- composition entry path when known
- timestamps in milliseconds
- viewport width and height
- fps
- output format
- timeout
- backend id
- elapsed timing breakdown
- captured frame paths or buffers
- cleanup paths
- warnings

The Engine backend should:

1. Resolve the app-managed browser path with the same browser discovery used by
   Producer and fast capture.
2. Serve the project with Ripple's realpath-guarded project server or Engine's
   `createFileServer` only if the same symlink and hidden-path protections are
   preserved.
3. Call Engine capture-session APIs such as `createCaptureSession`,
   `initializeSession`, `captureFrame` or `captureFrameToBuffer`, and
   `closeCaptureSession`.
4. Force screenshot mode on macOS/Windows when BeginFrame is not supported or
   when transparency/format requirements demand it.
5. Return frames that can feed the same frame-sheet assembly and comment visual
   storage paths.

Add a QA test that captures the deterministic visual fixture through the Engine
backend and compares it to the existing Producer oracle. The first acceptance
threshold should match the existing fast-capture QA unless Engine reveals a
documented difference:

- width and height match expected viewport
- known timestamp pixels match fixture expectations
- mean channel delta stays at or below the existing tolerance
- changed-pixel ratio stays at or below the existing tolerance
- max channel delta stays at or below the existing tolerance

Acceptance for this milestone: Engine capture works on the deterministic
fixture, produces valid PNGs, and the test records timing against fast capture,
Producer capture, and CLI snapshot without making Engine the default yet.

### Milestone 3: Build The Main-Process Daemon

Create the Visual Context Daemon as a main-process service. It should own warm
sessions and route requests to the right backend.

Create:

- `src/main/lib/visual-context/service.ts`
- `src/main/lib/visual-context/session-pool.ts`
- `src/main/lib/visual-context/cache.ts`
- `src/main/lib/visual-context/metrics.ts`
- `src/main/lib/visual-context/lifecycle.ts`
- `src/main/lib/visual-context/service.test.ts`

The service should expose methods like:

    warmProject(input)
    captureSnapshot(input)
    captureFrameSheet(input)
    captureCommentVisual(input)
    getTimelineContext(input)
    invalidateProject(input)
    shutdown()

The names can be adjusted, but the behavior must be explicit:

- A project/composition can be warmed before capture.
- Multiple timestamps for one frame sheet use one session when possible.
- Requests for the same source workspace are serialized when they would fight
  over a page/session, but independent projects can run concurrently up to a
  small cap.
- Sessions are keyed by project realpath, source workspace realpath, entry file,
  viewport, fps, format, backend, and browser path.
- Sessions have an idle TTL, such as 120 seconds, and a max pool size, such as
  two or three active sessions.
- File changes invalidate only affected sessions and cached outputs.
- `shutdown()` closes browser/session resources and clears local endpoint
  state.

Reuse or connect to existing source change signals in
`src/main/lib/hyperframes/source-watcher.ts` and renderer source-refresh paths
where appropriate. The daemon should not depend on renderer state for
correctness. Renderer state can tell it what the user is looking at, but the
main process must validate project paths and composition paths before capture.

Acceptance for this milestone: service tests prove warm-session reuse,
invalidation, cleanup, concurrent project safety, same-project serialization,
and graceful shutdown. No renderer UI is required yet.

### Milestone 4: Local Agent And CLI Access

Expose the daemon to agents and the Ripple CLI without making external users
depend on the app being open.

Add a local, token-protected app endpoint or equivalent local IPC bridge. The
recommended first shape is a loopback HTTP server bound to `127.0.0.1` with an
unpredictable token and workspace scoping, because app-spawned CLI processes can
read endpoint information from environment variables. If an existing app-local
RPC surface is a better fit during implementation, use it only if it works from
external agent subprocesses.

Environment variables for app-spawned agents:

    RIPPLE_VISUAL_CONTEXT_ENDPOINT=http://127.0.0.1:<port>
    RIPPLE_VISUAL_CONTEXT_TOKEN=<random per app session>
    RIPPLE_AGENT_WORKSPACE_ROOT=<validated workspace root>

Update `src/main/lib/agent-runtime/cli-tools-env.ts` so Codex and Claude runs
receive the endpoint variables when the daemon is available. The endpoint must
reject requests that are outside `RIPPLE_AGENT_WORKSPACE_ROOT` or the active
project context.

Add CLI commands:

    ripple visual snapshot --at current --json
    ripple visual snapshot --at 1.25s --json
    ripple visual sheet --range 2s..8s --samples 8 --columns 4 --json
    ripple visual context --range 2s..8s --json

Keep:

    ripple frame-sheet --range 2s..8s --samples 8 --json

as a compatibility alias that delegates to `ripple visual sheet`.

CLI behavior:

- If daemon endpoint variables are present and healthy, use the daemon.
- If no endpoint is present, use standalone capture through the visual-context
  core, preferring Engine when available and falling back to fast-browser or CLI
  according to the backend ladder.
- If the endpoint returns an auth, workspace, or project mismatch error, do not
  silently fall back to broader standalone access inside app-spawned agents.
  Return the error so Ripple can fix the context.
- JSON output must include backend id, elapsed timings, sheet/snapshot paths,
  manifest path, dimensions, sample count, warnings, and fallback reason when a
  fallback was used.

Acceptance for this milestone: app-spawned Codex and Claude runs can call the
daemon-backed visual commands; external terminal use still works with the app
closed; and `ripple frame-sheet` remains compatible with current agent skill
instructions.

### Milestone 5: Route App Features Through The Daemon

Replace feature-specific capture calls with daemon calls.

Update:

- `src/main/lib/revisions/comment-visuals.ts`
- `src/main/lib/hyperframes/snapshot.ts`
- `src/cli/frame-sheet.ts`
- any tRPC route under `src/main/lib/trpc/routers/hyperframes.ts` that exposes
  snapshot behavior
- runtime attachment loading in `src/main/lib/agent-runtime/service.ts` only if
  daemon result metadata changes the prompt-context shape

Behavior changes:

- Frame comments ask the daemon for a current-frame visual. If the renderer can
  provide a current preview frame that is truly what the user sees, use the
  `preview` backend. If not, use Engine for the validated entry/composition.
- Range comments ask the daemon for a 3-column, 6-sample sheet with endpoints
  included.
- App snapshot requests ask the daemon for deterministic snapshots.
- `ripple frame-sheet` and `ripple visual sheet` ask the daemon when available.
- Automatic comment visuals continue to be copied into canonical project
  storage and loaded as runtime-only attachments. Do not store base64 images in
  transcript history.
- Existing active-composition correctness rules must stay conservative. If a
  backend cannot prove it captured the selected composition, skip the automatic
  visual or fall back to a composition-aware path instead of sending the wrong
  frame.

Acceptance for this milestone: comment visual tests still pass, snapshot tests
still pass, frame-sheet tests still pass, and new tests prove the daemon is the
default app path with a working fallback path.

### Milestone 6: Agent Guidance And UI Integration

Update visual-context skill and app policy wording so agents use the new visual
commands naturally.

Update:

- `resources/agent-skills/ripple-visual-context/SKILL.md`
- `resources/claude-plugins/ripple-visual-context/skills/ripple-visual-context/SKILL.md`
- `src/main/lib/agent-runtime/agent-run-context-resolver.ts`
- related Codex and Claude capability tests

Guidance should say:

- Use `ripple visual sheet --range 0s..8s --samples 8 --columns 4 --json` for
  a compact overview of motion work.
- Use `ripple visual snapshot --at <time> --json` for one exact frame.
- Use `ripple visual context --range ... --json` when you need both visual
  output and timeline metadata.
- `ripple frame-sheet` remains accepted, but `ripple visual sheet` is the
  future-facing command.
- Do not use `npx`, `bunx`, package installs, or unavailable image-view tools
  inside app-managed agents.
- Report generated paths and manifest details when the model cannot inspect the
  image directly.

Renderer UI integration is optional for this refactor, but if the app shows
daemon state, keep the language user-facing: "Preparing visual context",
"Captured current frame", "Created frame sheet", "Visual capture unavailable".
Do not show "daemon", "backend", "worktree", or "RPC" in normal UI.

Acceptance for this milestone: app-managed skill tests pass, live provider
smokes show agents choose `ripple visual sheet` or the compatibility
`ripple frame-sheet` command from generic visual-context prompts, and normal UI
language remains motion-review oriented.

### Milestone 7: QA, Benchmarks, And Default Selection

Expand the visual QA suite before changing defaults.

Add or extend tests under `src/main/lib/hyperframes/` or
`src/main/lib/visual-context/` so they measure:

- time to first snapshot for `preview`, `engine`, `fast-browser`, and
  `hyperframes-cli`
- time for a 3-sample sheet
- time for an 8-sample sheet
- output dimensions
- file size
- pixel parity against Producer for deterministic fixtures
- parity between app-visible preview capture and daemon current-frame capture
  when the preview is available
- fallback behavior when Engine fails
- behavior with non-entry compositions
- behavior with media assets, fonts, nested composition assets, and symlinked
  paths
- packaged app behavior with the app-managed browser and unpacked packages

Do not make Engine the default until the tests support it. The intended default
policy is:

1. For "current frame as the user sees it", use `preview` when the active app
   preview can supply a trustworthy image.
2. For deterministic snapshots and frame sheets, use `engine` if quality parity
   and speed are acceptable.
3. Fall back to `fast-browser` if Engine is unavailable or slower for the
   specific request.
4. Fall back to `hyperframes-cli` when the programmatic paths fail and CLI
   fallback is safe.

Record benchmark results in the `Outcomes & Retrospective` section before
closing the plan. Include actual sample numbers, not just "faster" or
"slower".

Acceptance for this milestone: the test suite proves the selected default
backend for each request kind, and failures produce clear warnings rather than
wrong visual context.

### Milestone 8: Cleanup And Retire Duplicated Paths

After the daemon-backed path is proven, remove duplicate capture code and keep
only compatibility wrappers.

Cleanup targets:

- `src/cli/frame-sheet.ts` should retain CLI parsing and compatibility, not
  low-level browser/session logic.
- `src/main/lib/revisions/comment-visuals.ts` should call the daemon/service,
  not choose among fast capture, frame-sheet CLI, and HyperFrames CLI itself.
- `src/main/lib/hyperframes/snapshot.ts` should call the daemon/service for
  app snapshots while keeping a thin CLI fallback helper if needed.
- Tests that assert implementation details such as direct
  `captureFramesWithFastBrowser` usage should be rewritten to assert behavior
  and backend selection instead.

Do not remove the HyperFrames CLI fallback, the `ripple frame-sheet` command, or
the existing generated file layout until a release has shipped with the daemon
path and compatibility has been verified.

Acceptance for this milestone: there is one visual-context service boundary,
all previous user-facing commands still work, and package/test/build validation
passes.

## Concrete Steps

1. Run the current baseline tests from the repository root:

       bun test src/cli/frame-sheet.test.ts src/main/lib/hyperframes/snapshot.test.ts src/main/lib/hyperframes/visual-capture-qa.test.ts src/main/lib/revisions/comment-visuals.test.ts
       bun run test:hyperframes

2. Add `@hyperframes/engine` to `package.json` pinned to the same version as
   `@hyperframes/core`, then run `bun install` if the lockfile needs to change.

3. Update `src/main/lib/hyperframes/package-config.test.ts` to include
   `@hyperframes/engine` in version, installed package, export, and asar-unpack
   assertions.

4. Create the `src/main/lib/visual-context/` module family and move shared
   sampling, manifest, project-server, FFmpeg sheet, and fast-browser backend
   logic into it.

5. Keep `src/cli/frame-sheet.ts` green by importing the extracted core.

6. Add the Engine backend and a focused fixture test comparing Engine capture
   against Producer capture.

7. Add the daemon service, session pool, cache, metrics, lifecycle management,
   and service tests.

8. Add local endpoint or IPC access for app-spawned CLI processes, then thread
   endpoint env vars through `buildRippleAgentToolEnvironment(...)`.

9. Add `ripple visual snapshot`, `ripple visual sheet`, and
   `ripple visual context`, and make `ripple frame-sheet` delegate to
   `ripple visual sheet`.

10. Route comment visual capture, app snapshot capture, and frame-sheet capture
    through the daemon.

11. Update visual-context skills, app policy, and provider tests.

12. Run the full validation bundle and record benchmark results in this plan.

## Validation and Acceptance

Focused commands:

    bun test src/main/lib/visual-context
    bun test src/cli/frame-sheet.test.ts
    bun test src/main/lib/hyperframes/snapshot.test.ts
    bun test src/main/lib/hyperframes/visual-capture-qa.test.ts
    bun test src/main/lib/revisions/comment-visuals.test.ts
    bun test src/main/lib/agent-runtime/cli-tools-env.test.ts src/main/lib/agent-runtime/agent-run-context-resolver.test.ts src/main/lib/agent-runtime/providers/claude-runtime-capabilities.test.ts src/main/lib/agent-runtime/providers/codex-app-server-adapter.test.ts

Project-level commands:

    bun run test:hyperframes
    bun run test:ripple
    bun test
    bun run ts:check
    bun run build
    git diff --check

Packaging smoke:

    bun run package
    bun run test:package:smoke

Manual CLI smoke from a real HyperFrames/Ripple project:

    ripple visual snapshot --at 0.5s --json
    ripple visual sheet --range 0s..8s --samples 8 --columns 4 --json
    ripple visual context --range 0s..8s --json
    ripple frame-sheet --range 0s..8s --samples 8 --columns 4 --json

Live app smoke:

- Start Ripple with a project open.
- Leave a frame comment and confirm the comment gets a current-frame visual.
- Leave a range comment and confirm the comment gets a frame sheet.
- Ask a Codex app-server run for a generic "quick visual sanity check" without
  naming the command; expect it to use an app-managed visual command and report
  the sheet path and manifest.
- Ask a Claude run for the same generic visual check; expect the same behavior
  when Claude auth is available.
- Edit visible motion work and confirm the agent can request a new visual sheet
  without installing packages or using `npx`.

Acceptance criteria:

- Current-frame comments, range comments, snapshots, and frame sheets share the
  Visual Context Daemon in app-open paths.
- External CLI use still works when Ripple is closed.
- Engine-backed capture is either the measured default for deterministic
  snapshots/sheets or is explicitly deferred with recorded benchmark evidence.
- Producer remains the final export path and pixel QA oracle.
- HyperFrames CLI remains a fallback and debug path.
- Studio is not wrapped as an agent CLI or imported into main-process capture
  code.
- Visual outputs remain under `.ripple/frame-sheets/` or
  `.ripple/comment-visuals/` and are excluded from generated-change diffs.
- App-spawned agent endpoints are token-protected and workspace-bounded.
- User-facing UI copy stays about previews, comments, frames, sheets, visual
  context, and export rather than daemon/backend/worktree terminology.

## Idempotence and Recovery

This refactor should be done in additive stages. Keep existing commands and
capture paths working until the daemon path has passed the full validation
bundle.

Safe retry rules:

- Running the same visual command creates a new output bundle unless the cache
  explicitly returns a still-valid prior artifact.
- Cache entries must be keyed by project realpath, source workspace realpath,
  entry/composition, timestamps, viewport, fps, backend version, browser path,
  and relevant file-change signature.
- Failed captures should close or mark the affected warm session unhealthy.
- Cleanup should remove only temp files created by the failed request.
- Comment visuals copied into canonical project storage must not be deleted by
  cache cleanup.
- If the daemon endpoint is unavailable, external CLI calls can fall back to
  standalone capture. App-spawned agent calls with a daemon auth/workspace error
  should fail clearly rather than broadening access.
- If Engine capture is unavailable after a HyperFrames package upgrade, fall
  back to the existing fast-browser path and record the package/version failure
  in the test output or warning result.
- On app shutdown, call `VisualContextService.shutdown()` and wait for browsers,
  sessions, and local endpoint sockets to close.

Recovery if the refactor destabilizes app capture:

1. Keep `ripple frame-sheet --capture fast` working.
2. Keep `hyperframes snapshot` fallback working.
3. Feature-flag daemon default selection with an internal env var such as
   `RIPPLE_VISUAL_CONTEXT_DAEMON=0` until QA is stable.
4. Preserve the generated artifact layout so existing comments and sheets remain
   readable.

## Interfaces and Dependencies

New direct dependency:

- `@hyperframes/engine`, pinned to the same exact version as the rest of the
  HyperFrames family.

Existing dependencies and roles:

- `@hyperframes/producer`: final render/export authority and pixel QA oracle.
- `@hyperframes/studio`: UI/player/editor reference. Do not use it as the
  daemon capture engine.
- `hyperframes`: CLI fallback and external debugging baseline.
- `@ffmpeg-installer/ffmpeg`: frame-sheet tiling and image processing where
  needed.
- `@ffprobe-installer/ffprobe`: media validation and future metadata checks.
- `puppeteer` / `puppeteer-core`: browser control through HyperFrames Engine
  and existing fast capture.

Proposed TypeScript interfaces:

    export type VisualContextBackendId =
      | "preview"
      | "engine"
      | "fast-browser"
      | "hyperframes-cli"

    export interface VisualCaptureFramesRequest {
      projectPath: string
      sourcePath: string
      compositionPath?: string
      timestampsMs: number[]
      fps: number
      width: number
      height: number
      format: "png" | "jpeg" | "webp"
      timeoutMs: number
      reason: "comment-frame" | "comment-range" | "snapshot" | "frame-sheet" | "agent-context" | "qa"
      preferredBackend?: VisualContextBackendId
    }

    export interface VisualCaptureFramesResult {
      backend: VisualContextBackendId
      frames: Array<{
        index: number
        timeMs: number
        frame: number
        path: string
        width: number
        height: number
        sizeBytes: number
      }>
      elapsedMs: number
      timings: Record<string, number>
      warnings: string[]
      cleanupPaths: string[]
      fallbackFrom?: VisualContextBackendId
    }

    export interface VisualFrameSheetResult {
      backend: VisualContextBackendId
      id: string
      sheetPath: string
      manifestPath: string
      width: number
      height: number
      sampleCount: number
      elapsedMs: number
      warnings: string[]
    }

    export interface VisualContextService {
      warmProject(input: VisualWarmProjectInput): Promise<void>
      captureSnapshot(input: VisualSnapshotInput): Promise<VisualCaptureFramesResult>
      captureFrameSheet(input: VisualFrameSheetInput): Promise<VisualFrameSheetResult>
      captureCommentVisual(input: VisualCommentVisualInput): Promise<CommentVisualCaptureResult | null>
      getTimelineContext(input: VisualTimelineContextInput): Promise<VisualTimelineContextResult>
      invalidateProject(input: VisualInvalidateInput): Promise<void>
      shutdown(): Promise<void>
    }

The exact implementation can split these types across files, but the public
service boundary must preserve the concepts above.

## Artifacts and Notes

The current shipped commands remain valid during and after this refactor:

    ripple frame-sheet --range 0s..8s --samples 8 --columns 4 --json
    hyperframes snapshot --at 1.25 .

The new future-facing commands should look like:

    ripple visual snapshot --at current --json
    ripple visual snapshot --at 1.25s --json
    ripple visual sheet --range 0s..8s --samples 8 --columns 4 --json
    ripple visual context --range 0s..8s --json

Example success output:

    {
      "ok": true,
      "backend": "engine",
      "fallbackFrom": null,
      "sheet": {
        "path": ".ripple/frame-sheets/fs_abc123/sheet.png",
        "manifestPath": ".ripple/frame-sheets/fs_abc123/manifest.json",
        "width": 1440,
        "height": 406,
        "sampleCount": 8
      },
      "elapsedMs": 820,
      "warnings": []
    }

Example fallback output:

    {
      "ok": true,
      "backend": "fast-browser",
      "fallbackFrom": "engine",
      "sheet": {
        "path": ".ripple/frame-sheets/fs_def456/sheet.png",
        "manifestPath": ".ripple/frame-sheets/fs_def456/manifest.json",
        "width": 1440,
        "height": 406,
        "sampleCount": 8
      },
      "elapsedMs": 1040,
      "warnings": [
        "HyperFrames Engine capture was unavailable, so Ripple used fast browser capture."
      ]
    }

Keep benchmark notes here as implementation proceeds. Record actual numbers for
at least:

- first snapshot, app warm
- first snapshot, cold standalone CLI
- 3-sample sheet
- 8-sample sheet
- CLI fallback snapshot
- packaged app capture

Revision note, 2026-05-07 / Codex: Created this plan from the completed Phase
14 visual-context implementation and the user decision to refactor toward an
inside-Ripple Visual Context Daemon that leans on HyperFrames Engine for
long-term quality, speed, control, and upstream alignment.
