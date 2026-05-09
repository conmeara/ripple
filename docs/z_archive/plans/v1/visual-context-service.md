# V1 Refactor: Visual Context Service

This ExecPlan must be maintained according to `plans/PLANS.md`.

## Purpose / Big Picture

Ripple already gives agents visual context through the Phase 14 `ripple
frame-sheet` command and automatic comment screenshots. That path works, but
the capture logic is split across the CLI, comment helpers, and snapshot
helpers, and the app still pays extra cost when each feature starts its own
browser or subprocess. This refactor turns visual capture into one app-owned
Visual Context Service.

In this plan, "Visual Context Service" means a long-lived main-process service
inside the Ripple desktop app. It owns warm browser sessions, HyperFrames
capture sessions, project-safe file serving, frame-sheet manifests, comment
visual storage, and local agent-tool requests. If the implementation uses an
internal daemon-like loopback endpoint, that remains plumbing; normal product
UI and agent instructions should talk about visual context, snapshots, current
frames, frame sheets, preview, and comments. After this refactor, a user should
be able to leave a frame comment, select a time range, ask an agent for visual
sanity checks, or run `ripple visual sheet` and have every path reuse the same
fast, tested, HyperFrames-aware capture layer.

The goal is quality and speed together. The best long-term architecture is:
Ripple-owned Visual Context Service; app preview capture only for "what the user
is seeing right now"; `@hyperframes/engine` for deterministic snapshots, frame
sheets, and agent context after a capture-contract spike proves it; Producer
capture as the correctness and complex-media rung; `@hyperframes/producer` as
the final render/export authority and pixel QA oracle; the current fast-browser
path as the proven fallback and benchmark; and HyperFrames CLI as the
external/debug fallback. Do not wrap the whole HyperFrames Studio app as an
agent CLI. Studio is UI reference material and a source of reusable
renderer-side components, while Engine and Producer are the programmatic
capture/render boundaries.

## Progress

- [x] 2026-05-07T02:02Z / User + Codex: Chose a new v1 ExecPlan instead of
  rewriting the completed Phase 14 plan, and scoped it as a Visual Context
  Service refactor inside Ripple.
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
- [x] 2026-05-07T02:02Z / Codex: Added `@hyperframes/engine` as an explicit
  pinned dependency beside the rest of the HyperFrames family, included it in
  packaged `asarUnpack`, updated the lockfile root dependency list, and
  extended package-config tests.
- [x] 2026-05-07T02:02Z / User + Oracle + Codex: Reviewed the plan with Oracle
  and accepted the stronger long-term target: Visual Context Service,
  capture-contract spike, Engine adoption gated by QA, Producer capture as a
  correctness rung, hard composition targeting, hard project-server security,
  conservative pooling, and deferred artifact cache.
- [x] Extract the current fast capture, guarded project server, sampling, and
  manifest code into a reusable visual-context core module.
- [x] 2026-05-07T04:13Z / Codex: Extracted frame-sheet sampling, column
  selection, frame math, and summary text into `src/main/lib/visual-context`
  while preserving the legacy `resolveFrameSheetTimestamps(...)` export from
  `src/cli/frame-sheet.ts`.
- [x] 2026-05-07T04:02Z / Codex: Completed the remaining core extraction:
  frame-sheet manifests, the guarded project server, fast-browser capture, WS
  fallbacks, and FFmpeg sheet assembly now live under
  `src/main/lib/visual-context`, while `src/cli/frame-sheet.ts` keeps
  compatibility wrappers for the existing command/test surface.
- [x] Add a HyperFrames capture-contract spike that compares direct Engine,
  Producer capture, Ripple fast-browser capture, and HyperFrames CLI snapshot
  before any default switch.
- [x] 2026-05-07T02:02Z / Codex: Extended the deterministic visual QA fixture
  so direct `@hyperframes/engine` capture is imported dynamically, captures the
  same 1920x1080 frame as Producer, and is pixel-compared against Producer
  using the existing tolerances.
- [x] Complete the rest of the capture-contract spike: packaged Engine
  import/capture smoke and the final default-readiness decision. Non-entry
  composition routing, media/transparency fixtures, and recorded benchmark
  numbers are now covered.
- [x] Add composition targeting and project-server contract modules with
  symlink, hidden-path, active-composition, and generated-change regressions.
- [x] 2026-05-07T02:02Z / Codex: Added
  `src/main/lib/visual-context/composition-targeting.ts` with focused tests for
  entry/default targeting, non-entry composition targeting, traversal rejection,
  symlink escape rejection, renderer identity mismatch, missing
  generated-change workspace fallback, and separate source workspace targeting.
- [x] 2026-05-07T02:02Z / Codex: Added
  `src/main/lib/visual-context/project-server.ts` with a realpath-guarded
  loopback server and tests for content types, symlinked entry/asset escapes,
  hidden/generated/credential-like path denial, traversal, missing files,
  nested relative assets, host validation, and method validation.
- [x] Implement a HyperFrames Engine capture backend and benchmark it against
  Ripple fast capture, HyperFrames Producer capture, Producer capture adapter,
  and HyperFrames CLI snapshot.
- [x] 2026-05-07T02:02Z / Codex: Added reusable Engine and Producer capture
  backends under `src/main/lib/visual-context/backends/`, a backend registry,
  and spike tests proving deterministic PNG capture plus non-entry composition
  routing through Ripple's guarded project server.
- [x] Implement the main-process Visual Context Service with warm session
  pooling, invalidation, request queueing, metrics, and graceful shutdown.
- [x] 2026-05-07T02:02Z / Codex: Added the first main-process
  `RippleVisualContextService` boundary with backend fallback warnings,
  same-target request serialization, global concurrency limiting, and graceful
  backend disposal on shutdown.
- [x] 2026-05-07T03:45Z / Codex: Implemented true warm Engine/Producer
  capture-session reuse with idle TTL cleanup, service-driven backend
  invalidation, failure discard, explicit backend disposal, and focused tests
  proving second-capture reuse plus invalidation teardown.
- [x] 2026-05-07T02:02Z / Codex: Added Visual Context metrics and lifecycle
  modules, wired service capture/invalidation/shutdown metric events, and added
  lifecycle tests for idempotent reverse-order shutdown.
- [x] 2026-05-07T04:05Z / Codex: Added source-watcher invalidation binding for
  app-spawned visual context endpoints so HyperFrames source changes invalidate
  warm sessions without blocking endpoint creation if the watcher cannot start.
- [x] Route comment visuals, `hyperframes.snapshot`, and `ripple frame-sheet`
  through the service while preserving standalone fallback behavior.
- [x] 2026-05-07T02:02Z / Codex: Routed `hyperframes.snapshot` app capture
  and automatic comment frame/range visuals through the Visual Context Service
  backend ladder while preserving the existing fast-browser first and
  HyperFrames CLI fallback behavior. `ripple frame-sheet` remains a
  compatibility command over the shared visual-context primitives.
- [x] Add the new `ripple visual ...` CLI commands and keep `ripple frame-sheet`
  as a compatibility alias.
- [x] 2026-05-07T02:02Z / Codex: Added `ripple visual snapshot`,
  `ripple visual sheet`, and `ripple visual context` to the CLI. The new sheet
  command wraps the existing frame-sheet implementation for compatibility and
  can use service-backed Engine/Producer capture when a backend or composition
  is requested.
- [x] 2026-05-07T04:08Z / Codex: Routed top-level `ripple frame-sheet` and
  `ripple framesheet` through `ripple visual sheet` while keeping
  `runFrameSheetCommand(...)` as the lower-level compatibility implementation.
- [x] 2026-05-07T02:02Z / Codex: Added a token-protected loopback visual
  context endpoint with workspace-root validation, plus snapshot CLI delegation
  when `RIPPLE_VISUAL_CONTEXT_ENDPOINT` and `RIPPLE_VISUAL_CONTEXT_TOKEN` are
  present.
- [x] Update agent skill/context guidance so agents prefer the app-managed
  service-backed visual commands and report generated paths/manifests.
- [x] 2026-05-07T02:02Z / Codex: Updated Codex and Claude visual-context skill
  bodies, app policy text, Claude auto-allowed commands, and agent tool
  environment support so agents prefer `ripple visual sheet` while
  `ripple frame-sheet` remains allowed.
- [x] 2026-05-07T02:02Z / Codex: App-spawned Codex app-server and Claude SDK
  runs now create a scoped visual-context endpoint for the run, pass endpoint
  env vars into the agent tool environment, and close the endpoint when the run
  finishes.
- [x] 2026-05-07T02:02Z / Codex: Extended the packaged-app smoke script so it
  asserts unpacked `@hyperframes/engine`, Producer, and CLI packages exist and
  the packaged `ripple visual --help` surface exposes snapshot/sheet commands.
- [x] 2026-05-07T02:02Z / Codex: Added a transparency spike fixture proving
  both Engine and Producer capture preserve PNG alpha on a deterministic
  transparent composition.
- [x] 2026-05-07T03:16Z / Codex: Added `bun run benchmark:visual-context`
  for deterministic backend timing on the visual-capture QA fixture and
  recorded the first local measurements in this plan.
- [x] 2026-05-07T03:27Z / Codex: Updated the visual-context benchmark to
  measure cold and warm Engine/Producer captures and record whether the warm
  session was reused, then recorded the post-reuse timing results in this plan.
- [x] 2026-05-07T03:32Z / Codex: Added a media capture spike that builds a
  temporary HyperFrames project with real MP4 and MP3 assets from existing
  Ripple resources, then captures three frame samples through Engine and
  Producer capture.
- [x] 2026-05-07T03:36Z / Codex: Ran a production build, rebuilt the packaged
  macOS app with current visual-context changes, and passed packaged smoke
  validation for unpacked Engine/Producer/CLI packages plus packaged
  `ripple visual --help`.
- [x] 2026-05-07T03:42Z / Codex: Hardened packaged smoke to run a real
  packaged `ripple visual snapshot --backend engine` capture, found that direct
  packaged Engine import can be unavailable under Node/Electron package
  resolution, and added an Engine runtime importer fallback to Producer's
  Engine-compatible capture exports.
- [x] 2026-05-07T03:16Z / Codex: Added `src/main/lib/visual-context` to the
  named `test:hyperframes` and `test:ripple` suites so the new service tests
  are part of normal regression coverage.
- [x] 2026-05-07T03:16Z / Codex: Made endpoint-backed
  `ripple visual snapshot --at current` fail closed with
  `CURRENT_FRAME_UNAVAILABLE` until a verified preview identity backend exists,
  rather than falling back to standalone capture.
- [x] Complete visual QA, package smoke, live provider smoke, and regression
  validation before making the service-backed path the default.
- [x] 2026-05-07T04:13Z / Codex: Completed the final validation bundle:
  full `bun test`, `test:quality`, `test:ripple`, `test:hyperframes`,
  TypeScript, build/package/package-smoke, manual visual CLI smoke, and live
  provider connectivity smoke for Codex and Claude.

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

- Observation: Frame-sheet sampling, manifest creation, guarded project serving,
  fast-browser capture, and FFmpeg tiling are now shared visual-context core
  logic rather than only CLI-local logic.
  Evidence: `src/main/lib/visual-context/sampling.ts` owns timestamp
  de-duplication, range sampling, interval sampling, column selection, frame
  math, and sheet summaries; `manifest.ts` owns generated manifest shape;
  `project-server.ts` owns the realpath-guarded server; `fast-browser-capture.ts`
  owns warm-browser-independent fast capture; and `sheet-assembly.ts` owns
  FFmpeg tiling. `src/cli/frame-sheet.ts` preserves the old exports by
  delegating to these core functions.

- Observation: The installed HyperFrames Engine package is the right
  programmatic capture layer, but Ripple does not yet pin it directly.
  Evidence: `node_modules/@hyperframes/engine/dist/index.d.ts` exports
  `createCaptureSession`, `initializeSession`, `captureFrame`,
  `captureFrameToBuffer`, `prepareCaptureSessionForReuse`,
  `createFileServer`, and browser pool helpers, while `package.json` currently
  pins `@hyperframes/core`, `@hyperframes/player`, `@hyperframes/producer`,
  `@hyperframes/studio`, and `hyperframes` but not `@hyperframes/engine`.

- Observation: Studio should not be the capture service.
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

- Observation: Direct Engine capture is the right target but not automatically
  equivalent to Producer.
  Evidence: Engine exposes low-level capture/session/browser APIs, while
  Producer owns the complete render/export orchestration used by Ripple exports.
  The plan must prove runtime injection, readiness, composition targeting,
  media, transparency, and pixel parity before making Engine the default.

- Observation: The endpoint is useful, but agents should see the CLI rather
  than learning local endpoint details.
  Evidence: Phase 14 already made app-managed bare `ripple` commands available
  to Codex and Claude. The service endpoint should be an implementation detail
  used by `ripple visual ...`, with standalone CLI fallback when Ripple is
  closed.

- Observation: Engine was already present transitively, so Milestone 0 did not
  require a network install.
  Evidence: `bun.lock` already contained the `@hyperframes/engine@0.4.40`
  package record through Producer; the Milestone 0 change made it a direct root
  dependency and package/build invariant.

- Observation: Direct Engine capture works in the Bun test environment on the
  deterministic visual fixture.
  Evidence: `src/main/lib/hyperframes/visual-capture-qa.test.ts` now dynamically
  imports `@hyperframes/engine`, calls `createCaptureSession`,
  `initializeSession`, `captureFrame`, and `closeCaptureSession`, and compares
  the captured PNG to Producer with the existing pixel tolerances.

- Observation: Composition targeting can be made useful before any capture
  backend changes.
  Evidence: `src/main/lib/visual-context/composition-targeting.test.ts` now
  proves entry/default behavior, non-entry identity, symlink escape rejection,
  renderer mismatch rejection, and generated-change workspace fallback without
  launching a browser.

- Observation: The reusable visual project server can preserve the Phase 14
  safety posture outside the CLI.
  Evidence: `src/main/lib/visual-context/project-server.test.ts` proves
  realpath-guarded serving, generated/hidden path denial, credential-like file
  denial, symlink escape rejection, nested asset serving, host validation, and
  method validation.

- Observation: HyperFrames Engine and Producer capture sessions expect the
  capture server root, then append `/index.html` internally.
  Evidence: The first backend spike failed by serving the selected entry URL
  directly. `serveVisualProject(...)` now provides a virtual `/index.html`
  entry for selected nested compositions and injects a `<base>` tag so relative
  composition assets still resolve against the selected composition directory.

- Observation: The first service boundary can centralize fallback and request
  sequencing before true warm-session reuse is implemented.
  Evidence: `src/main/lib/visual-context/service.test.ts` proves fallback from
  Engine to Producer capture, explicit fallback warnings, same-target
  serialization, different-target concurrency up to the global cap, and
  shutdown rejection.

- Observation: The future-facing CLI can ship incrementally without breaking
  the existing `ripple frame-sheet` contract.
  Evidence: `src/cli/visual.test.ts` proves `ripple visual snapshot`,
  `ripple visual sheet`, `ripple visual context`, and top-level
  `ripple visual --help`, plus top-level `ripple frame-sheet` as a
  compatibility alias. `src/cli/frame-sheet.test.ts` remains green for the
  lower-level command implementation.

- Observation: Endpoint delegation must fail closed for app-spawned agents.
  Evidence: `src/main/lib/visual-context/endpoint.test.ts` rejects missing
  tokens and out-of-workspace project paths, while `src/cli/visual.test.ts`
  proves snapshot calls delegate to the app endpoint when endpoint env vars are
  present.

- Observation: The service needs the same local GSAP rewrite as the Phase 14
  fast-browser server before it can cover real bundled templates.
  Evidence: `src/main/lib/visual-context/project-server.test.ts` now proves CDN
  GSAP references are rewritten to `/__ripple_vendor/gsap.min.js` and served
  from the bundled local package.

- Observation: Transparent PNG stills are viable through both direct Engine and
  Producer capture with screenshot mode.
  Evidence: `src/main/lib/visual-context/backends/transparency-spike.test.ts`
  captures a transparent composition through both backends and asserts the
  corner alpha is 0 while a semi-transparent foreground box preserves partial
  alpha.

- Observation: Warm runtime sessions now work for direct Engine capture.
  Evidence: `src/main/lib/visual-context/backends/hyperframes-engine-spike.test.ts`
  captures the same target twice with a fresh `HyperframesEngineVisualBackend`,
  asserts `sessionReused` moves from 0 to 1, verifies the warm session count is
  1, then calls `invalidateProject(...)` and verifies the warm session count is
  0.

- Observation: Engine and Producer capture can handle a local video/audio
  composition through Ripple's guarded visual project server.
  Evidence: `src/main/lib/visual-context/backends/media-spike.test.ts` copies
  existing MP4 and MP3 resources into a temporary HyperFrames project and
  captures samples at 0ms, 500ms, and 1000ms through both runtime backends.

- Observation: Packaged direct `@hyperframes/engine` import is not guaranteed
  under the packaged Node/Electron runtime even though the package is unpacked.
  Evidence: the hardened package-smoke attempt to import the packaged Engine
  dist entry directly failed while resolving `@hyperframes/core` extensionless
  dist imports. `src/main/lib/visual-context/backends/shared-capture.ts` now
  falls back to Producer's Engine-compatible capture exports when direct Engine
  import is unavailable, and packaged `ripple visual snapshot --backend engine`
  smoke passes.

- Observation: Warm-session invalidation is now connected to Ripple's existing
  HyperFrames source watcher for app-spawned visual endpoints.
  Evidence: `src/main/lib/visual-context/source-invalidation.test.ts` proves a
  watcher change calls `VisualContextService.invalidateProject(...)`, and
  `src/main/lib/agent-runtime/visual-context-endpoint.ts` attaches that
  invalidation handle best-effort for each app-managed agent visual endpoint.

## Decision Log

- Decision: Build a Visual Context Service inside Ripple instead of making agents
  drive HyperFrames Studio or shelling out to the HyperFrames CLI for every
  still/frame sheet.
  Rationale: Agents need a simple, stable visual tool surface. Ripple needs
  warm sessions, caching, app-managed browser selection, project-boundary
  safety, comment storage, manifests, and metrics. HyperFrames Engine provides
  the programmatic capture API; Studio is not designed as a capture RPC service.
  Date/Author: 2026-05-07 / User + Codex.

- Decision: Add `@hyperframes/engine` as a direct dependency, pinned to the same
  version as the rest of the HyperFrames family.
  Rationale: The service should lean on official Engine APIs rather than a
  transitive dependency hidden under Producer. Direct pinning makes packaging,
  tests, and future package upgrades explicit.
  Date/Author: 2026-05-07 / Codex.

- Decision: Use a measured backend ladder: `preview` for currently visible app
  frames when identity is proven, `engine` for deterministic capture after the
  capture-contract spike passes, `producer-capture` for correctness and complex
  media/HDR/transparency regressions, `fast-browser` as the proven current
  fallback/benchmark path, and `hyperframes-cli` as the external fallback/debug
  baseline.
  Rationale: No single path wins every case. The service should choose by user
  intent, project capability, and measured reliability rather than by ideology.
  Date/Author: 2026-05-07 / Codex, updated after Oracle review.

- Decision: Keep Producer for final renders and validation, not everyday agent
  frame sheets.
  Rationale: Producer owns FFmpeg render/export semantics and should remain the
  output authority. Engine exposes lower-level capture sessions that are better
  suited to repeated stills and sheets.
  Date/Author: 2026-05-07 / Codex.

- Decision: Add a Producer capture adapter or test harness before Engine
  becomes default.
  Rationale: Direct Engine capture may lag Producer on runtime injection,
  readiness, media, transparency, or HDR behavior. Producer capture gives Ripple
  a correctness rung and a stable QA oracle when lower-level capture drifts.
  Date/Author: 2026-05-07 / Oracle + Codex.

- Decision: Make Ripple's realpath-guarded project server the initial server
  for all visual backends.
  Rationale: The current Phase 14 project server has Ripple-specific workspace
  and symlink safety tests. Engine's `createFileServer` can be considered later
  only if it passes the same hidden-path, symlink, host, method, and workspace
  boundary tests.
  Date/Author: 2026-05-07 / Oracle + Codex.

- Decision: Implement composition targeting before service pooling.
  Rationale: Capturing the wrong composition is worse than omitting visual
  context. The service needs a validated mapping from active Ripple composition
  and source workspace to the exact capture entry before reuse, caching, or
  backend defaults matter.
  Date/Author: 2026-05-07 / Oracle + Codex.

- Decision: Introduce `ripple visual ...` commands while preserving
  `ripple frame-sheet`.
  Rationale: `ripple frame-sheet` is already shipped and agent-guided.
  `ripple visual snapshot`, `ripple visual sheet`, and
  `ripple visual context` make the larger service-backed tool family easier to
  grow without breaking existing instructions.
  Date/Author: 2026-05-07 / Codex.

- Decision: The service endpoint should be local, token-protected, and scoped to
  app-spawned agent environments.
  Rationale: App-spawned agents can use a fast local endpoint through
  environment variables. External terminal users should still get a standalone
  CLI fallback without needing the app to be open.
  Date/Author: 2026-05-07 / Codex.

- Decision: Defer artifact cache; implement session reuse first.
  Rationale: Warm sessions are the main speed win and are easier to invalidate
  safely. Returning cached image artifacts adds stale-output risk until source
  signatures, generated-change workspace identity, package versions, and
  renderer dirty state are all proven.
  Date/Author: 2026-05-07 / Oracle + Codex.

## Outcomes & Retrospective

Not implemented yet. This plan records the intended refactor from the completed
Phase 14 CLI-first implementation to a v1 Visual Context Service. Completion
means comment visuals, app snapshots, frame sheets, QA captures, and in-app
agent visual commands all share one measured capture service, while the shipped
Phase 14 commands continue to work. The Oracle review on 2026-05-07 tightened
the plan around a capture-contract spike, composition targeting, Producer
capture correctness, project-server safety, conservative session pooling, and
deferred artifact caching.

Milestone 0 package-boundary validation now passes:

    bun test src/main/lib/hyperframes/package-config.test.ts
    13 pass, 0 fail

Capture-contract spike validation now includes the first Engine proof:

    bun test src/main/lib/hyperframes/visual-capture-qa.test.ts
    2 pass, 0 fail

Composition-targeting validation now passes:

    bun test src/main/lib/visual-context/composition-targeting.test.ts
    9 pass, 0 fail

Project-server contract validation now passes:

    bun test src/main/lib/visual-context/project-server.test.ts
    6 pass, 0 fail

Reusable backend/service/CLI and compatibility validation now passes:

    bun test src/main/lib/visual-context src/cli/visual.test.ts src/cli/frame-sheet.test.ts src/main/lib/agent-runtime/cli-tools-env.test.ts src/main/lib/agent-runtime/agent-run-context-resolver.test.ts src/main/lib/agent-runtime/providers/claude-agent-sdk-approval.test.ts src/main/lib/agent-runtime/providers/claude-runtime-capabilities.test.ts src/main/lib/hyperframes/package-config.test.ts src/main/lib/hyperframes/snapshot.test.ts src/main/lib/revisions/comment-visuals.test.ts
    plus src/main/lib/hyperframes/visual-capture-qa.test.ts
    95 pass, 0 fail

TypeScript validation now passes:

    bun run ts:check
    0 errors

Diff whitespace validation now passes:

    git diff --check
    0 errors

Packaged smoke script syntax/package invariant validation now passes:

    bun test src/main/lib/hyperframes/package-config.test.ts && node --check scripts/smoke-packaged-ripple.mjs && git diff --check
    13 pass, 0 fail

Visual backend benchmark, 2026-05-07T03:16Z on
`test/fixtures/hyperframes/visual-capture-qa`:

    bun run benchmark:visual-context
    fastBrowser3SampleMs: 292
    fastBrowser8SampleMs: 404
    engine3SampleMs: 449
    engine8SampleMs: 628
    producerCapture3SampleMs: 418
    cliSnapshotMs: 7393

Visual backend benchmark after warm runtime reuse, 2026-05-07T03:27Z on the
same fixture:

    bun run benchmark:visual-context
    fastBrowser3SampleMs: 298
    fastBrowser8SampleMs: 430
    engine3SampleMs: 501
    engine3SampleWarmMs: 160
    engine3SampleWarmSessionReused: 1
    engine8SampleMs: 756
    engine8SampleWarmMs: 456
    engine8SampleWarmSessionReused: 1
    producerCapture3SampleMs: 521
    producerCapture3SampleWarmMs: 172
    producerCapture3SampleWarmSessionReused: 1
    cliSnapshotMs: 7417

Visual backend benchmark after core extraction, 2026-05-07T04:02Z on the same
fixture:

    bun run benchmark:visual-context
    fastBrowser3SampleMs: 224
    fastBrowser8SampleMs: 393
    engine3SampleMs: 699
    engine3SampleWarmMs: 151
    engine3SampleWarmSessionReused: 1
    engine8SampleMs: 642
    engine8SampleWarmMs: 415
    engine8SampleWarmSessionReused: 1
    producerCapture3SampleMs: 379
    producerCapture3SampleWarmMs: 149
    producerCapture3SampleWarmSessionReused: 1
    cliSnapshotMs: 7270

Current interpretation: Engine is correct, far faster than the CLI, and warm
8-sample Engine capture remains within about 6 percent of the current
fast-browser path on the deterministic fixture. This satisfies the rough warm
latency gate for deterministic service-backed snapshots and sheets. It does
not change the separate preview rule: "current frame as the user sees it" still
requires a verified preview identity backend before `--at current` can succeed.

Warm runtime reuse validation now passes:

    bun test src/main/lib/visual-context/backends/hyperframes-engine-spike.test.ts src/main/lib/visual-context/backends/producer-capture-spike.test.ts src/main/lib/visual-context/backends/transparency-spike.test.ts src/main/lib/visual-context/service.test.ts
    12 pass, 0 fail

Media capture spike validation now passes:

    bun test src/main/lib/visual-context/backends/media-spike.test.ts
    2 pass, 0 fail

Post-reuse visual-context suite validation now passes:

    bun test src/main/lib/visual-context
    36 pass, 0 fail

Core extraction visual-context and CLI validation now passes:

    bun test src/main/lib/visual-context src/cli/frame-sheet.test.ts src/cli/visual.test.ts
    67 pass, 0 fail

Compatibility QA for the pre-service visual paths now passes:

    bun test src/main/lib/hyperframes/visual-capture-qa.test.ts src/main/lib/hyperframes/snapshot.test.ts src/main/lib/revisions/comment-visuals.test.ts
    13 pass, 0 fail

Focused Ripple regression validation after core extraction now passes:

    bun run test:ripple
    477 pass, 0 fail

Source invalidation validation now passes:

    bun test src/main/lib/visual-context/source-invalidation.test.ts src/main/lib/visual-context/service.test.ts
    6 pass, 0 fail

CLI alias validation now passes:

    bun test src/cli/visual.test.ts src/cli/frame-sheet.test.ts
    21 pass, 0 fail

Sampling extraction validation now passes:

    bun test src/main/lib/visual-context/sampling.test.ts src/cli/frame-sheet.test.ts src/cli/visual.test.ts
    25 pass, 0 fail

Post-reuse TypeScript and whitespace validation now passes:

    bun run ts:check
    0 errors

    git diff --check
    0 errors

Build and package smoke now pass:

    bun run build
    success

    bun run package
    success, skipped notarization because notarize options were unavailable

    bun run test:package:smoke
    [package-smoke] release/mac-arm64/Ripple.app OK (1.7G)

The same build/package/package-smoke validation was rerun after the core
extraction and still passed.

The package smoke now includes a real packaged Engine-backend visual snapshot
capture on a temporary HyperFrames project, in addition to checking package
presence and `ripple visual --help`.

Final full regression validation now passes:

    bun test
    529 pass, 0 fail

Quality workflow validation now passes:

    bun run test:quality
    Bun quality tests: 4 pass, 0 fail
    [quality-platform] verified 37 workflow rows and 17 package scripts

Focused named suites now pass:

    bun run test:ripple
    477 pass, 0 fail

    bun run test:hyperframes
    226 pass, 0 fail

Final TypeScript, build, package, package-smoke, and whitespace validation now
pass:

    bun run ts:check
    0 errors

    bun run build
    success

    bun run package
    success, skipped notarization because notarize options were unavailable

    bun run test:package:smoke
    [package-smoke] release/mac-arm64/Ripple.app OK (1.7G)

    git diff --check
    0 errors

Manual standalone CLI smoke on `test/fixtures/hyperframes/visual-capture-qa`
now passes:

    bun scripts/ripple-cli.ts visual snapshot --dir test/fixtures/hyperframes/visual-capture-qa --at 0.5s --backend engine --json
    ok true, backend engine

    bun scripts/ripple-cli.ts visual sheet --dir test/fixtures/hyperframes/visual-capture-qa --range 0s..2s --samples 3 --columns 3 --backend engine --json
    ok true, backend engine

    bun scripts/ripple-cli.ts visual context --dir test/fixtures/hyperframes/visual-capture-qa --range 0s..2s --samples 3 --columns 3 --backend engine --json
    ok true, backend engine

    bun scripts/ripple-cli.ts frame-sheet --dir test/fixtures/hyperframes/visual-capture-qa --range 0s..2s --samples 3 --columns 3 --json
    ok true, backend fast-browser compatibility path

Live provider connectivity smoke now passes for both supported providers:

    RIPPLE_LIVE_PROVIDER_SMOKE=1 RIPPLE_LIVE_PROVIDER=codex bun run test:live
    Codex connected with hasAccount true and requiresOpenaiAuth true

    RIPPLE_LIVE_PROVIDER_SMOKE=1 RIPPLE_LIVE_PROVIDER=claude bun run test:live
    Claude connected with authMethod claude.ai and apiProvider firstParty

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
- Visual Context Service: a long-lived main-process service inside Ripple that
  keeps browser and HyperFrames capture sessions warm. It is not a separate
  installed background app. If it exposes a local endpoint to app-spawned CLI
  processes, that endpoint is implementation plumbing, not user-facing product
  language.
- Backend: one implementation of capture. In this plan the backends are
  `preview`, `engine`, `producer-capture`, `fast-browser`, and
  `hyperframes-cli`.
- Warm session: an already-launched browser/page/capture session that can seek
  and capture without paying full startup cost again.
- Canonical project storage: generated visuals copied under the main project,
  usually `.ripple/comment-visuals/<threadId>/`, so comment context survives
  discarded generated-change workspaces.

The current package boundary is important. `@hyperframes/engine` is the
official lower-level capture package. It opens a browser, serves or loads a
composition, seeks by frame/time, and captures images. `@hyperframes/producer`
is the higher-level render/export pipeline and remains the final render
authority; it also provides the capture correctness rung for QA, complex media,
transparency, and HDR investigations. `@hyperframes/studio` is a React UI/editor
package; it can inspire or supply renderer components, but the service must not
depend on the Studio app as its capture engine. The `hyperframes` CLI is useful
for external debugging and fallback, but app hot paths should not pay its
process/bundling/fixed-wait cost for every visual request.

## Plan of Work

### Milestone 0: Baseline And Package Boundary

Start by locking down the current behavior so the refactor can move safely.
Add `@hyperframes/engine` to `package.json` with the exact same version as
`@hyperframes/core`, `@hyperframes/player`, `@hyperframes/producer`,
`@hyperframes/studio`, and `hyperframes`. Update
`src/main/lib/hyperframes/package-config.test.ts` so it asserts Engine is
pinned, installed, exported, and unpacked for packaged builds. Add
`node_modules/@hyperframes/engine/**/*` to `build.asarUnpack`, update the
lockfile, and add a packaged smoke that proves the packaged app can import the
Engine package or run a tiny Engine API health check. Do not remove the current
fast-capture or CLI paths in this milestone.

Run focused tests before and after this package-boundary change:

    bun test src/main/lib/hyperframes/package-config.test.ts
    bun run ts:check

Acceptance for this milestone: the dependency is explicit, package tests prove
the HyperFrames family is in sync, packaged resources include Engine, and no
visual behavior changes yet.

### Milestone 0.5: HyperFrames Capture Contract Spike

Before Engine becomes any default, run a capture-contract spike that compares
the four capture routes on the same deterministic fixtures:

- direct `@hyperframes/engine`
- Producer capture-session APIs through `@hyperframes/producer`
- current Ripple fast-browser capture
- `hyperframes snapshot`

Create or extend:

- `src/main/lib/visual-context/backends/hyperframes-engine-spike.test.ts`
- `src/main/lib/visual-context/backends/producer-capture-spike.test.ts`
- `src/main/lib/hyperframes/visual-capture-qa.test.ts`

The spike must answer these questions with tests or short evidence in this
plan:

- What exact Engine API shape works in this Electron/Bun/packaged context?
- Does direct Engine capture load the same runtime and readiness hooks as
  Producer for the fixture?
- Does Producer capture differ from direct Engine capture on pixels, timings,
  media, transparency, or readiness?
- Can non-entry compositions be targeted without lying about what was captured?
- Which backend is fastest for a cold single snapshot, warm single snapshot,
  3-sample sheet, and 8-sample sheet?
- What warnings or fallback reasons should be returned when a backend is
  unavailable?

The acceptance gate is not "Engine exists." The acceptance gate is: Engine,
Producer capture, fast-browser capture, and CLI snapshot have documented API
behavior, pixel parity or explained differences, timing measurements, packaged
import behavior, and non-entry composition evidence. Only after this milestone
can the implementation decide whether Engine is the default for deterministic
snapshots and sheets.

### Milestone 1: Extract A Visual Context Core

Move the shared low-level pieces out of `src/cli/frame-sheet.ts` into a
Node-only visual-context core that can be used by the app service, CLI
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

### Milestone 1.5: Composition Targeting And Project Server Contract

Solve capture identity and project serving before backend pooling. Wrong
composition capture is worse than no visual context.

Create:

- `src/main/lib/visual-context/composition-targeting.ts`
- `src/main/lib/visual-context/composition-targeting.test.ts`
- `src/main/lib/visual-context/project-server.test.ts`

`composition-targeting.ts` must validate and return a capture target containing:

- canonical project root
- source workspace root
- active composition file path
- default entry fallback
- nested composition entry URL when relevant
- renderer-reported project/composition/time identity when present
- source revision ID when the request comes from a generated-change workspace
- canonical output project for comment visual storage

Tests must cover:

- `index.html`
- `compositions/lower-third.html`
- composition files with relative assets
- symlinked composition escape
- active renderer composition mismatch
- deleted generated-change workspace fallback
- default-entry fallback
- non-entry composition capture returning a clear unsupported result when no
  backend can prove correctness

`project-server.test.ts` must keep Ripple's realpath-guarded project server as
the initial server for all backends. It must reject:

- symlinked entry escape
- symlinked asset escape
- hidden `.ripple` and `.git` reads
- `.env`, `.pem`, `.key`, and `.crt` reads
- Windows cross-drive containment escapes
- invalid host headers
- non-`GET` / non-`HEAD` methods

It must allow nested entry relative asset resolution inside the project. Engine
`createFileServer` may be considered later only if it passes the same contract.

### Milestone 2: Add A HyperFrames Engine Backend

Implement an Engine-backed capture backend that uses `@hyperframes/engine`
directly. The first version can be a standalone session per request, but it must
be written so the service can later keep sessions warm.

Create:

- `src/main/lib/visual-context/backends/hyperframes-engine.ts`
- `src/main/lib/visual-context/backends/producer-capture.ts`
- `src/main/lib/visual-context/backends/types.ts`
- `src/main/lib/visual-context/backend-registry.ts`

The backend interface should look like this in spirit:

    export interface VisualCaptureBackend {
      readonly id: "preview" | "engine" | "producer-capture" | "fast-browser" | "hyperframes-cli"
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
2. Serve the project with Ripple's realpath-guarded project server. Engine's
   `createFileServer` is deferred until it passes the same security contract.
3. Call Engine capture-session APIs such as `createCaptureSession`,
   `initializeSession`, `captureFrame` or `captureFrameToBuffer`, and
   `closeCaptureSession`.
4. Force screenshot mode on macOS/Windows when BeginFrame is not supported or
   when transparency/format requirements demand it.
5. Return frames that can feed the same frame-sheet assembly and comment visual
   storage paths.

The Producer capture adapter can be production code or test-only in the first
pass. It exists to preserve a correctness rung for parity tests, Engine API
regressions, media/HDR/transparency edge cases, and future upstream changes
where Producer improves capture orchestration before direct Engine usage is
simple. It does not need to become the everyday hot-path default.

Add QA tests that capture deterministic visual fixtures through Engine and
Producer capture and compare them to the existing Producer oracle / fast path.
The first acceptance threshold should match the existing fast-capture QA unless
Engine reveals a documented difference:

- width and height match expected viewport
- known timestamp pixels match fixture expectations
- mean channel delta stays at or below the existing tolerance
- changed-pixel ratio stays at or below the existing tolerance
- max channel delta stays at or below the existing tolerance

Acceptance for this milestone: Engine capture works on the deterministic
fixture, Producer capture works as a correctness rung, both produce valid PNGs,
and the test records timing against fast capture and CLI snapshot without
making Engine the default yet.

### Milestone 3: Build The Main-Process Service

Create the Visual Context Service as a main-process service. It should own warm
sessions and route requests to the right backend.

Create:

- `src/main/lib/visual-context/service.ts`
- `src/main/lib/visual-context/session-pool.ts`
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
- The first default is conservative: max active sessions 2, at most one active
  request per same project/composition/session key, queued same-project
  requests serialized, and independent projects allowed only within the global
  cap.
- Sessions are keyed by project realpath, source workspace realpath, entry file,
  source revision ID when applicable, viewport, fps, format, backend, browser
  path, browser version, and HyperFrames package versions.
- Sessions have an idle TTL between 60 and 120 seconds.
- Any failed capture discards the affected warm session before retry/fallback.
- File changes invalidate affected sessions.
- Do not implement artifact cache by default. If `cache.ts` is created early,
  keep it as a stub or session-metadata helper, not as image-output reuse.
- `shutdown()` closes browser/session resources and clears local endpoint
  state.

Reuse or connect to existing source change signals in
`src/main/lib/hyperframes/source-watcher.ts` and renderer source-refresh paths
where appropriate. The service should not depend on renderer state for
correctness. Renderer state can tell it what the user is looking at, but the
main process must validate project paths and composition paths before capture.

Acceptance for this milestone: service tests prove warm-session reuse,
invalidation, cleanup, concurrent project safety, same-project serialization,
unhealthy-session discard, and graceful shutdown. No renderer UI is required
yet, and no artifact cache is required.

### Milestone 4: Local Agent And CLI Access

Expose the service to agents and the Ripple CLI without making external users
depend on the app being open.

Add a local, token-protected app endpoint or equivalent local IPC bridge as an
implementation detail for the CLI. Agents should not reason about the endpoint;
they should run app-managed bare commands. The recommended first shape is a
loopback HTTP server bound to `127.0.0.1` with an unpredictable token and
workspace scoping, because app-spawned CLI processes can read endpoint
information from environment variables. If an existing app-local RPC surface is
a better fit during implementation, use it only if it works from external agent
subprocesses.

Environment variables for app-spawned agents:

    RIPPLE_VISUAL_CONTEXT_ENDPOINT=http://127.0.0.1:<port>
    RIPPLE_VISUAL_CONTEXT_TOKEN=<random per app session>
    RIPPLE_AGENT_WORKSPACE_ROOT=<validated workspace root>

Update `src/main/lib/agent-runtime/cli-tools-env.ts` so Codex and Claude runs
receive the endpoint variables when the service is available. The endpoint must
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

- If service endpoint variables are present and healthy, use the service.
- If no endpoint is present, use standalone capture through the visual-context
  core, preferring Engine when available and falling back to fast-browser or CLI
  according to the backend ladder.
- If the endpoint returns an auth, workspace, or project mismatch error, do not
  silently fall back to broader standalone access inside app-spawned agents.
  Return the error so Ripple can fix the context.
- `--at current` works only when the app endpoint can prove active preview
  project, source workspace, composition, time/frame, viewport, and dirty-state
  identity. Outside the app, return a clear error that asks for an explicit
  timestamp.
- JSON output must include backend id, elapsed timings, sheet/snapshot paths,
  manifest path, dimensions, sample count, warnings, and fallback reason when a
  fallback was used.

Acceptance for this milestone: app-spawned Codex and Claude runs can call the
service-backed visual commands; external terminal use still works with the app
closed; and `ripple frame-sheet` remains compatible with current agent skill
instructions.

### Milestone 5: Route App Features Through The Service

Replace feature-specific capture calls with service calls.

Update:

- `src/main/lib/revisions/comment-visuals.ts`
- `src/main/lib/hyperframes/snapshot.ts`
- `src/cli/frame-sheet.ts`
- any tRPC route under `src/main/lib/trpc/routers/hyperframes.ts` that exposes
  snapshot behavior
- runtime attachment loading in `src/main/lib/agent-runtime/service.ts` only if
  service result metadata changes the prompt-context shape

Behavior changes:

- Frame comments ask the service for a current-frame visual. If the renderer can
  provide a current preview frame that is truly what the user sees, use the
  `preview` backend. If not, use Engine for the validated entry/composition
  after the capture-contract spike passes, or use fast-browser / Producer
  capture fallback according to the backend ladder.
- Range comments ask the service for a 3-column, 6-sample sheet with endpoints
  included.
- App snapshot requests ask the service for deterministic snapshots.
- `ripple frame-sheet` and `ripple visual sheet` ask the service when available.
- Automatic comment visuals continue to be copied into canonical project
  storage and loaded as runtime-only attachments. Do not store base64 images in
  transcript history.
- Existing active-composition correctness rules must stay conservative. If a
  backend cannot prove it captured the selected composition, skip the automatic
  visual or fall back to a composition-aware path instead of sending the wrong
  frame.
- The `preview` backend must have a strict trust contract. It can only be used
  when the renderer/main bridge proves active project, active source workspace,
  active composition, current time/frame, viewport, and dirty-state identity.
  If any part of that identity is missing or stale, use a deterministic backend
  or return a clear unsupported result.

Acceptance for this milestone: comment visual tests still pass, snapshot tests
still pass, frame-sheet tests still pass, and new tests prove the service is the
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
service state, keep the language user-facing: "Preparing visual context",
"Captured current frame", "Created frame sheet", "Visual capture unavailable".
Do not show "daemon", "backend", "worktree", or "RPC" in normal UI.

Acceptance for this milestone: app-managed skill tests pass, live provider
smokes show agents choose `ripple visual sheet` or the compatibility
`ripple frame-sheet` command from generic visual-context prompts, and normal UI
language remains motion-review oriented.

Keep `ripple visual context` modest in the first implementation. It should
return a frame sheet path, manifest path, composition path, fps, duration if
known, sample mapping, backend, fallback reason, warnings, and optionally a
HyperFrames inspect summary only when explicitly requested. Defer richer
timeline reasoning, UI state summaries, or provider-specific prose until
snapshot and sheet capture are stable.

### Milestone 7: QA, Benchmarks, And Default Selection

Expand the visual QA suite before changing defaults.

Add or extend tests under `src/main/lib/hyperframes/` or
`src/main/lib/visual-context/` so they measure:

- cold first snapshot
- warm first snapshot
- current preview capture
- time for a 3-sample sheet
- time for an 8-sample sheet
- non-entry composition sheet
- media-heavy sheet
- packaged app snapshot
- failure fallback time
- max resident Chrome/session count
- average and p95 elapsed time
- output dimensions
- file size
- pixel parity against Producer for deterministic fixtures
- parity between app-visible preview capture and service current-frame capture
  when the preview is available
- fallback behavior when Engine fails
- behavior with non-entry compositions
- behavior with media assets, fonts, nested composition assets, and symlinked
  paths
- packaged app behavior with the app-managed browser and unpacked packages

Add a capability matrix before choosing defaults:

- SDR PNG stills: Engine target after spike passes.
- Transparent PNG stills: Engine only after alpha tests pass.
- WebM alpha visual preview: Producer or CLI-backed validation.
- HDR still/sheet: deferred or Producer-assisted SDR preview with a warning.
- Video/audio source timing: Engine only after media fixture tests pass.
- Final render/export: Producer only.

Do not make Engine the default until the tests support it. The intended default
policy is:

1. For "current frame as the user sees it", use `preview` when the active app
   preview can supply a trustworthy image.
2. For deterministic snapshots and frame sheets, use `engine` if quality parity
   and speed are acceptable.
3. Use `producer-capture` as a correctness rung for parity tests, Engine
   regressions, and complex media/transparency/HDR cases.
4. Fall back to `fast-browser` if Engine is unavailable or slower for the
   specific request.
5. Fall back to `hyperframes-cli` when the programmatic paths fail and CLI
   fallback is safe.

A reasonable first promotion rule is: Engine can become default for
deterministic sheets only if warm 8-sample sheets are faster than fast-browser
or within about 25 percent of fast-browser while matching Producer pixels within
the existing QA tolerances.

Record benchmark results in the `Outcomes & Retrospective` section before
closing the plan. Include actual sample numbers, not just "faster" or
"slower".

Acceptance for this milestone: the test suite proves the selected default
backend for each request kind, and failures produce clear warnings rather than
wrong visual context.

### Milestone 8: Cleanup And Retire Duplicated Paths

After the service-backed path is proven, remove duplicate capture code and keep
only compatibility wrappers.

Cleanup targets:

- `src/cli/frame-sheet.ts` should retain CLI parsing and compatibility, not
  low-level browser/session logic.
- `src/main/lib/revisions/comment-visuals.ts` should call the service,
  not choose among fast capture, frame-sheet CLI, and HyperFrames CLI itself.
- `src/main/lib/hyperframes/snapshot.ts` should call the service for
  app snapshots while keeping a thin CLI fallback helper if needed.
- Tests that assert implementation details such as direct
  `captureFramesWithFastBrowser` usage should be rewritten to assert behavior
  and backend selection instead.

Do not remove the HyperFrames CLI fallback, the `ripple frame-sheet` command, or
the existing generated file layout until a release has shipped with the service
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

7. Add the service, session pool, metrics, lifecycle management,
   and service tests.

8. Add composition targeting and project-server contract tests before service
   pooling.

9. Add local endpoint or IPC access for app-spawned CLI processes, then thread
   endpoint env vars through `buildRippleAgentToolEnvironment(...)`.

10. Add `ripple visual snapshot`, `ripple visual sheet`, and
   `ripple visual context`, and make `ripple frame-sheet` delegate to
   `ripple visual sheet`.

11. Route comment visual capture, app snapshot capture, and frame-sheet capture
    through the service.

12. Update visual-context skills, app policy, and provider tests.

13. Run the full validation bundle and record benchmark results in this plan.

## Validation and Acceptance

Focused commands:

    bun test src/main/lib/visual-context
    bun test src/main/lib/visual-context/project-server.test.ts
    bun test src/main/lib/visual-context/composition-targeting.test.ts
    bun test src/main/lib/visual-context/endpoint.test.ts
    bun test src/cli/frame-sheet.test.ts
    bun test src/cli/visual.test.ts
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
  Visual Context Service in app-open paths.
- External CLI use still works when Ripple is closed.
- Engine-backed capture is either the measured default for deterministic
  snapshots/sheets or is explicitly deferred with recorded benchmark evidence.
- Producer capture is available as a correctness rung or test harness for
  Engine parity, complex media, transparency, and HDR cases.
- Producer remains the final export path and pixel QA oracle.
- HyperFrames CLI remains a fallback and debug path.
- Studio is not wrapped as an agent CLI or imported into main-process capture
  code.
- Visual outputs remain under `.ripple/frame-sheets/` or
  `.ripple/comment-visuals/` and are excluded from generated-change diffs.
- App-spawned agent endpoints are token-protected and workspace-bounded, while
  agents themselves only need to run app-managed CLI commands.
- User-facing UI copy stays about previews, comments, frames, sheets, visual
  context, and export rather than daemon/backend/worktree terminology.

## Idempotence and Recovery

This refactor should be done in additive stages. Keep existing commands and
capture paths working until the service path has passed the full validation
bundle.

Safe retry rules:

- Running the same visual command creates a new output bundle in the first
  service implementation. Artifact cache is deferred.
- Session identity must be keyed by project realpath, source workspace realpath,
  entry/composition, timestamps where relevant, viewport, fps, backend version,
  browser path, browser version, HyperFrames package versions, source revision
  ID where applicable, and relevant file-change signature.
- Failed captures should close or mark the affected warm session unhealthy.
- Cleanup should remove only temp files created by the failed request.
- Comment visuals copied into canonical project storage must not be deleted by
  future cache cleanup.
- If the service endpoint is unavailable, external CLI calls can fall back to
  standalone capture. App-spawned agent calls with a service auth/workspace error
  should fail clearly rather than broadening access.
- If Engine capture is unavailable after a HyperFrames package upgrade, fall
  back to the existing fast-browser path and record the package/version failure
  in the test output or warning result.
- On app shutdown, call `VisualContextService.shutdown()` and wait for browsers,
  sessions, and local endpoint sockets to close.

Recovery if the refactor destabilizes app capture:

1. Keep `ripple frame-sheet --capture fast` working.
2. Keep `hyperframes snapshot` fallback working.
3. Feature-flag service default selection with an internal env var such as
   `RIPPLE_VISUAL_CONTEXT_SERVICE=0` until QA is stable.
4. Preserve the generated artifact layout so existing comments and sheets remain
   readable.

## Interfaces and Dependencies

New direct dependency:

- `@hyperframes/engine`, pinned to the same exact version as the rest of the
  HyperFrames family.

Existing dependencies and roles:

- `@hyperframes/producer`: final render/export authority and pixel QA oracle.
  It may also provide a Producer capture adapter or test harness for correctness
  checks, Engine regressions, and complex media cases.
- `@hyperframes/studio`: UI/player/editor reference. Do not use it as the
  service capture engine.
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
      | "producer-capture"
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
      sourceRevisionId?: string
      expectedPreviewIdentity?: {
        projectId: string
        compositionPath: string
        timeMs: number
        viewportWidth: number
        viewportHeight: number
        dirtyGeneration: string
      }
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
- current preview capture
- 3-sample sheet
- 8-sample sheet
- non-entry composition sheet
- media-heavy sheet
- CLI fallback snapshot
- packaged app capture
- failure fallback elapsed time
- max Chrome/session count

Capability notes to keep current:

- SDR PNG stills: target Engine after the capture-contract spike passes.
- Transparent PNG stills: gated by alpha fixture tests.
- HDR visual context: defer or use Producer-assisted SDR preview with an
  explicit warning.
- Video/audio timing: gated by media fixture tests.
- Final render/export: Producer only.

Revision note, 2026-05-07 / Codex: Created this plan from the completed Phase
14 visual-context implementation and the user decision to refactor toward an
inside-Ripple Visual Context Service that leans on HyperFrames Engine for
long-term quality, speed, control, and upstream alignment.

Revision note, 2026-05-07 / Codex: Folded in Oracle second-opinion guidance.
The plan now gates Engine adoption behind a capture-contract spike, adds
Producer capture as a correctness rung, makes composition targeting and
project-server security P0 work, keeps agents on CLI commands rather than
endpoint details, defers artifact cache, and records capability/performance
gates before any default switch.
