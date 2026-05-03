# Phase 14: Visual Context CLI

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple gives agents and users a simple way to see a motion
graphic without opening the app UI or reading the whole composition by hand.
HyperFrames already provides the main motion-graphics tool suite: agents can
use HyperFrames skills and CLI commands such as preview, inspect, compositions,
doctor, render, and snapshot when they need them. Ripple should not duplicate
or narrow that surface.

The v1 feature is deliberately small:

- agents can use the HyperFrames CLI and HyperFrames skills for native project
  inspection, preview, screenshots, and render-aware context
- agents can use `ripple frame-sheet` for contact sheets across time
- the app can call the same tools when a user leaves a comment
- chat agents and comment agents can both access the HyperFrames CLI and the
  Ripple CLI from the active project or generated-change workspace
- Ripple can later wrap these outputs into richer app attachment/history flows

This is not a new visual artifact platform, generic video-thumbnail system, or
large database subsystem. The first useful thing is a tiny, reliable CLI that
agents can call in a project directory and humans can understand:

```bash
ripple frame-sheet --range 2s..8s --samples 8
ripple frame-sheet --range 2s..8s --every 1s
ripple frame-sheet --at 0s,1.5s,3s,4.2s
```

The output is one image sheet plus a small manifest that maps cells to times and
frames. HyperFrames remains the source of truth for what the video looks like.
Ripple adds only the missing frame-sheet utility, app automation around comments,
and runtime/tool exposure so agents can choose the right command themselves.

## Progress

- [x] 2026-05-02 / User + Codex: Started Phase 14 planning around automatic
  comment screenshots, time-range comments, frame sheets, and agent visual
  context.
- [x] 2026-05-02 / Codex: Created an initial broader visual-context ExecPlan
  with project-local artifacts, runtime materialization, and app APIs.
- [x] 2026-05-03 / User + Codex: Re-centered Phase 14 around a simpler insight:
  HyperFrames already has screenshot capture, so Ripple should build the
  missing frame-sheet CLI first and use it from the app instead of building a
  large artifact system up front.
- [x] 2026-05-03 / Codex: Verified the installed HyperFrames CLI in this
  checkout is `0.4.40`; `hyperframes snapshot --help` supports `--frames`,
  `--at`, `--timeout`, and a project directory argument.
- [x] 2026-05-03 / User + Codex: Clarified that Phase 14 should not over-focus
  on `snapshot`. Agents will run with HyperFrames skills and should be able to
  choose from the broader HyperFrames CLI surface. Phase 14 is primarily about
  implementing Ripple's `frame-sheet` CLI and exposing both HyperFrames and
  Ripple CLI tools to chat and comment agents.
- [x] 2026-05-03 / User + Oracle + Codex: Ran a final Oracle review of the
  simplified plan. Verdict: the direction is implementation-ready if the plan
  explicitly fixes CLI packaging, provider PATH/env exposure, workspace safety,
  active-composition targeting, snapshot lock/copy/cleanup, canonical comment
  visual storage, runtime-only attachment loading, FFmpeg tile assembly, diff
  hygiene, and bundled skill fallback.
- [x] 2026-05-03 / User + Codex: Reviewed the completed Phase 13 implementation
  before starting Phase 14. Result: no conceptual conflict. Phase 14 should
  plug into Phase 13's `agent-run-context-resolver`, provider-native
  skill/context loading, `runtimeContextJson`, and centralized
  `executeAgentRun` flow instead of adding a parallel context or skill system.
- [ ] Implement Milestone 0: CLI entrypoint and frame-sheet prototype.
- [ ] Implement Milestone 1: CLI contract, manifest, and tests.
- [ ] Implement Milestone 2: expose HyperFrames and Ripple CLI tools to app
  chat/comment agents.
- [ ] Implement Milestone 3: app comment screenshot integration using
  HyperFrames snapshot.
- [ ] Implement Milestone 4: app comment range-sheet integration using
  `ripple frame-sheet`.
- [ ] Implement Milestone 5: agent skill/context documentation.
- [ ] Implement Milestone 6: diff hygiene, cleanup, and thin persistence.

## Surprises & Discoveries

- Observation: HyperFrames already has the screenshot feature we need for
  current-frame and sampled-frame capture.
  Evidence: `bunx hyperframes snapshot --help` reports:
  `hyperframes snapshot [OPTIONS] [DIR]`, `--frames`, `--at`, and `--timeout`.

- Observation: HyperFrames is more than screenshots. The local CLI also exposes
  project and motion-production commands such as preview, inspect,
  compositions, render, doctor, and skills. Phase 14 should assume agents can
  use that broader HyperFrames surface through bundled skills and provider
  runtime context.

- Observation: The useful missing piece is not screenshots; it is contact
  sheets. Agents need a compact overview across time, plus a manifest so they
  know which cell maps to which timestamp and frame.

- Observation: A v1 database table with many visual-context metadata columns is
  premature. For the CLI path, the filesystem manifest is the metadata source
  of truth. The app can store a small path/reference only when it needs to show
  a comment thumbnail or pass a file to the agent runtime.

- Observation: Existing runtime attachment plumbing can already send images to
  providers. Phase 14 does not need to redesign provider attachment handling
  unless automatic app-created screenshots become long-lived comment history.

- Observation: Bundling the CLI behavior as an agent skill is likely as
  important as the code. The skill should teach agents when to use
  `hyperframes snapshot`, when to use `ripple frame-sheet`, and how to interpret
  the generated manifest.

- Observation: The current app snapshot helper watches the shared `snapshots/`
  folder for changed files. That is fragile for concurrent comment capture and
  frame-sheet generation. Phase 14 must add a lock/copy/cleanup protocol before
  relying on multiple captures.

- Observation: Active-composition correctness is not proven yet. If
  HyperFrames snapshot only captures the default entry composition, app comment
  screenshots must not claim to capture arbitrary selected compositions until
  the app uses a composition-aware HyperFrames/player path.

- Observation: Phase 13 created the right runtime seam for Phase 14 visual
  context. `agent_runs.runtimeContextJson` stores validated live editor context,
  `buildAgentRuntimeContextPrompt` appends project/composition/frame/comment
  context inside `executeAgentRun`, and normal chat already passes preview
  time/frame/source from `RippleShell` through `AgentRuntimeChatTransport`.
  Phase 14 should extend this path rather than inventing a second renderer-fed
  context channel.

- Observation: Phase 13 moved agent policy and app-managed HyperFrames skill
  loading into `resolveAgentRunContext`. The Phase 14 visual-context guidance
  should be exposed by that resolver alongside the existing HyperFrames skills,
  not as an unrelated prompt append or project-file mutation.

- Observation: Provider env integration now has concrete entry points. Codex
  builds its App Server env through `buildCodexAppServerEnv`, while Claude
  builds its SDK env through `buildClaudeEnv`. Phase 14's CLI tool env helper
  should compose with those existing env builders.

- Observation: Comment generated-change runs do not currently receive
  renderer-supplied `runtimeContext`, but they do carry `commentThreadId` and
  `revisionId`. Automatic comment screenshots and sheets should therefore be
  resolved from the validated comment/project DB paths at execution time, not
  from conversation-message base64 or volatile renderer state.

- Observation: Diff hygiene is an implementation task, not just documentation.
  Existing project `.gitignore` handling already excludes `snapshots/`,
  `.ripple/snapshots/`, `.ripple/tmp/`, and `.ripple/agent-attachments/`, but
  it does not yet include `.ripple/frame-sheets/` or
  `.ripple/comment-visuals/`.

## Decision Log

- Decision: Phase 14 v1 will be CLI-first.
  Rationale: A reliable CLI helps both in-app agents and external agents such as
  Codex, Claude Code, and Codespaces. It also avoids premature app-specific
  database and runtime complexity.
  Date/Author: 2026-05-03 / User + Codex

- Decision: Ripple will rely on HyperFrames for screenshot capture.
  Rationale: HyperFrames owns composition rendering semantics. Its `snapshot`
  command already captures PNG frames from the project timeline, so Ripple
  should not rebuild screenshot capture in v1.
  Date/Author: 2026-05-03 / User + Codex

- Decision: Ripple will expose the broader HyperFrames CLI and skills to agents,
  not only the snapshot command.
  Rationale: Codex and Claude agents should be able to choose the appropriate
  HyperFrames tool for preview, inspection, screenshots, validation, and render
  context. Ripple's responsibility in this phase is to make those tools
  available in chat/comment runs and add the missing frame-sheet command.
  Date/Author: 2026-05-03 / User + Codex

- Decision: Ripple's new tool is `ripple frame-sheet`.
  Rationale: Frame sheets are the small missing agent utility. The command name
  is concrete, memorable, and understandable to motion/video users.
  Date/Author: 2026-05-03 / User + Codex

- Decision: `ripple frame-sheet` output is a simple bundle: a primary sheet
  image, optional sampled frames, and `manifest.json`.
  Rationale: The manifest can hold rich metadata without requiring a broad app
  schema. Agents can read the JSON, and humans can inspect the image.
  Date/Author: 2026-05-03 / Codex

- Decision: App comment automation should call the same primitives instead of
  growing a separate capture stack.
  Rationale: User comments only need a current-frame screenshot in v1, and
  range comments can call the frame-sheet CLI. This keeps app and agent behavior
  aligned.
  Date/Author: 2026-05-03 / User + Codex

- Decision: The `ripple` CLI entrypoint is part of Phase 14, not deferred.
  Rationale: Agents need a stable command in dev, tests, and packaged builds.
  The CLI core must be importable without Electron `app`, SQLite, tRPC, or
  renderer state.
  Target files:
  `src/cli/ripple.ts`, `src/cli/frame-sheet.ts`,
  `scripts/ripple-cli.ts`, and
  `src/main/lib/agent-runtime/cli-tools-env.ts`.
  Date/Author: 2026-05-03 / Oracle + Codex

- Decision: App-run agent environments use a shared tool-env helper.
  Rationale: HyperFrames and Ripple CLI tools must resolve in both Codex and
  Claude runs, not only in HyperFrames service calls.
  Target helper:
  `buildRippleAgentToolEnvironment({ baseEnv, repoRoot, workspaceRoot })`.
  The helper must compose with the Phase 13 provider env paths: wrap
  `buildCodexAppServerEnv(...)` for Codex and `buildClaudeEnv(...)` for Claude,
  then prepend CLI/binary directories and set visual-context env guards.
  Date/Author: 2026-05-03 / Oracle + Codex

- Decision: `ripple frame-sheet` is workspace-bounded when launched by Ripple.
  Rationale: External terminal use can be flexible, but app-run agents must
  stay inside the validated active project or generated-change workspace.
  When `RIPPLE_AGENT_WORKSPACE_ROOT` is present, `--dir` must realpath inside
  that root, and output must realpath inside `--dir/.ripple/frame-sheets`.
  Date/Author: 2026-05-03 / Oracle + Codex

- Decision: Active-composition targeting must be verified before app comment
  screenshots ship.
  Rationale: Capturing the wrong composition is worse than omitting visual
  context. If `hyperframes snapshot` cannot target the selected composition,
  app comments must use the existing composition-aware player/source path or
  clearly limit v1 to the default entry composition.
  Date/Author: 2026-05-03 / Oracle + Codex

- Decision: v1 sheet assembly uses FFmpeg `tile`.
  Rationale: The repo already includes app-managed FFmpeg/FFprobe packages.
  FFmpeg avoids adding native image dependencies such as `sharp` or `canvas`.
  The manifest and prompt text provide cell/time/frame mapping; no burned-in
  labels are required in v1.
  Date/Author: 2026-05-03 / Oracle + Codex

- Decision: App comment visuals are copied to the canonical project root.
  Rationale: A comment made while previewing a generated-change workspace must
  keep its visual context after that workspace is deleted or rejected.
  External CLI output stays under `<cwd>/.ripple/frame-sheets`; app comment
  visuals live under `<main project>/.ripple/comment-visuals/<id>/`.
  Date/Author: 2026-05-03 / Oracle + Codex

- Decision: Automatic comment visuals are loaded at runtime, not stored as
  base64 transcript history.
  Rationale: The existing runtime attachment path can send images. Automatic
  screenshots/sheets should be read from validated project paths at
  generated-change execution time and converted to `AgentRuntimeAttachment[]`
  in memory.
  Implementation seam: resolve them inside `executeAgentRun` before
  `adapter.run(...)`, merge them with explicit user attachments, and keep the
  provider adapters unaware of comment-visual storage details.
  Date/Author: 2026-05-03 / Oracle + Codex

- Decision: Agent visual-context guidance uses the Phase 13 app-managed
  skill/context resolver.
  Rationale: Phase 13 already separates app policy, project notes,
  app-managed skill roots, provider-native skill loading, and fallback
  instructions through `resolveAgentRunContext`. Phase 14 should add the
  visual-context guidance there instead of mutating project `AGENTS.md` /
  `CLAUDE.md` files or adding a separate prompt lane.
  Fallback path: `resources/agent-skills/ripple-visual-context/SKILL.md`.
  If provider-native skill loading cannot expose this guidance, append a
  compact runtime-context block from the same file through the existing
  resolver/app-policy path.
  Date/Author: 2026-05-03 / Oracle + Codex

## Outcomes & Retrospective

This section is intentionally empty until implementation begins. Update it with
what shipped, what changed from the plan, and what follow-up remains.

## Context and Orientation

Ripple is a local-first desktop app for creating short HyperFrames motion
graphics with chat, frame-anchored comments, generated changes, preview, and
export. Phase 14 should make the agent better at motion feedback and editing by
giving it visual context on demand.

The important existing pieces are:

- `hyperframes snapshot`: existing HyperFrames CLI command for screenshots.
- HyperFrames skills and CLI commands: existing agent-native motion-graphics
  tools for project inspection, preview, screenshots, validation, and rendering.
- `src/main/lib/hyperframes/snapshot.ts`: current app helper around HyperFrames
  snapshot.
- `src/main/lib/hyperframes/project-context.ts`: resolves Main, generated
  change, and chat-worktree preview contexts inside the app.
- `src/main/lib/revisions/comment-revisions.ts`: stores comment anchors,
  including `screenshotPath`.
- `src/main/lib/agent-runtime/runtime-attachments.ts`: prepares images/files
  for agent providers.
- `src/main/lib/agent-runtime/service.ts`: central `executeAgentRun` path where
  Phase 13 appends validated runtime context and where Phase 14 should resolve
  automatic screenshot/sheet attachments before calling provider adapters.
- `src/main/lib/agent-runtime/agent-run-context-resolver.ts`: Phase 13 resolver
  for app policy, project notes, app-managed skill roots, and provider-native
  context. Phase 14 visual-context guidance belongs here.
- `src/main/lib/agent-runtime/providers/codex-app-server-env.ts`: Codex App
  Server env builder that Phase 14 should wrap with CLI tool PATH/env entries.
- `src/main/lib/claude/env.ts`: Claude SDK env builder that Phase 14 should wrap
  with CLI tool PATH/env entries.
- `src/main/lib/ripple-projects/project-git.ts`: managed project `.gitignore`
  defaults that must add frame-sheet and comment-visual output paths.
- `src/shared/agent-runtime-attachments.ts`: attachment size and count limits.
- `package.json`: already includes HyperFrames and FFmpeg/FFprobe packages.

Primary user stories:

- As an agent, I can run one command to make a frame sheet for the project I am
  editing.
- As an agent, I can use the HyperFrames CLI/skills and Ripple CLI from chat or
  comment-generated-change runs, choosing the command that fits the task.
- As a user leaving a comment, Ripple automatically includes the current frame
  so the agent understands what I was pointing at.
- As a user leaving feedback over a time range, Ripple can generate a small
  frame sheet for that range.

## Plan of Work

### Milestone 0: CLI Entrypoint And Frame-Sheet Prototype

Build the smallest useful command before touching app comment flows.

Target files:

- `src/cli/ripple.ts`: top-level command dispatcher.
- `src/cli/frame-sheet.ts`: frame-sheet parser and command implementation.
- `scripts/ripple-cli.ts`: dev/test wrapper so `bun run ripple -- ...` or
  `bun scripts/ripple-cli.ts ...` can exercise the same command.
- packaged wrapper under `resources/bin/<platform-arch>/ripple[.exe|.cmd]`.

The CLI core must be importable without Electron `app`, SQLite, renderer state,
or tRPC. App adapters can call into it, but it cannot depend on app-only
process state.

Target command:

```bash
ripple frame-sheet --dir . --range 2s..8s --samples 8 --json
```

Minimum behavior:

- `--dir` defaults to the current working directory.
- Parse `--range`, `--samples`, and `--at`.
- Convert the sampling request into explicit sorted, deduped timestamps.
- Run or reuse HyperFrames snapshot to capture those timestamps.
- Acquire a project-local capture lock before snapshotting.
- Copy captured frames into the frame-sheet output bundle.
- Assemble one sheet image with FFmpeg `tile`.
- Write a manifest next to the sheet.
- Print machine-readable JSON to stdout.
- Release the capture lock and remove only intermediate snapshot files created
  by this run.

Initial output layout:

```text
.ripple/
  frame-sheets/
    fs_<id>/
      sheet.png
      manifest.json
      frames/
        000.png
        001.png
```

The prototype uses PNG frame captures and a PNG sheet. Later optimization can
switch sheets to WebP or JPEG if that is useful for model-token and file-size
limits.

Capture protocol:

1. Resolve `--dir` to a real project path.
2. When `RIPPLE_AGENT_WORKSPACE_ROOT` is present, reject `--dir` unless it
   resolves inside that root.
3. Create or wait on `.ripple/frame-sheets/.capture-lock` with stale-lock
   handling for cross-process CLI runs.
4. Run `hyperframes snapshot --at ... <dir>` for the requested timestamps.
5. Verify the number of captured files matches the requested sample count after
   timestamp dedupe.
6. Copy those files to `.ripple/frame-sheets/fs_<id>/frames/`.
7. Ensure the output root realpath stays inside `<dir>/.ripple/frame-sheets` and
   rejects symlink escapes.
8. Build `sheet.png` with FFmpeg `tile`.
9. Write `manifest.json`.
10. Remove only snapshot intermediates created by this frame-sheet run.

### Milestone 1: Stable CLI Contract

Harden the command shape so agents can depend on it.

Target commands:

```bash
ripple frame-sheet --dir . --range 2s..8s --samples 8 --json
ripple frame-sheet --dir . --range 2s..8s --every 1s --json
ripple frame-sheet --dir . --range 2s..8s --every-frames 5 --fps 30 --json
ripple frame-sheet --dir . --at 0s,1.5s,3s,4.2s --json
```

CLI rules:

- stdout is JSON when `--json` is passed.
- stderr is human-readable diagnostics.
- no interactive prompts.
- no app database access.
- no arbitrary output paths in v1.
- all output goes under the project-local `.ripple/frame-sheets/`.
- when `RIPPLE_AGENT_WORKSPACE_ROOT` is set, `--dir` must resolve inside it.
- generated output must resolve inside `--dir/.ripple/frame-sheets`.
- `ripple frame-sheet` is the only documented primary command; `ripple
  framesheet` may be added as an alias only if it is trivial.
- failure exits nonzero and returns a clear error code in JSON when possible.

Recommended success JSON:

```json
{
  "ok": true,
  "sheet": {
    "id": "fs_abc123",
    "path": ".ripple/frame-sheets/fs_abc123/sheet.png",
    "manifestPath": ".ripple/frame-sheets/fs_abc123/manifest.json",
    "sampleCount": 8,
    "summary": "Frame sheet with 8 samples from 00:02.000 to 00:08.000."
  }
}
```

Recommended JSON error:

```json
{
  "ok": false,
  "error": {
    "code": "WORKSPACE_OUTSIDE_AGENT_ROOT",
    "message": "--dir must be inside RIPPLE_AGENT_WORKSPACE_ROOT."
  }
}
```

Recommended manifest:

```json
{
  "version": 1,
  "id": "fs_abc123",
  "kind": "frame_sheet",
  "projectDir": ".",
  "rangeMs": [2000, 8000],
  "fps": 30,
  "columns": 4,
  "rows": 2,
  "sheetPath": ".ripple/frame-sheets/fs_abc123/sheet.png",
  "samples": [
    {
      "index": 0,
      "timeMs": 2000,
      "frame": 60,
      "path": ".ripple/frame-sheets/fs_abc123/frames/000.png"
    }
  ]
}
```

Frame and sampling rules:

- `timeMs = Math.round(seconds * 1000)`.
- `frame = Math.round((timeMs / 1000) * fps)`.
- FPS comes from project/composition metadata when available, otherwise 30.
- `--every-frames` requires `--fps` unless FPS can be inferred.
- Reject negative, NaN, infinite, or empty sample lists.
- Sort explicit `--at` timestamps and dedupe after rounding.
- Default explicit agent sheet: 4x2, 8 samples, max sheet width about 1280px.
- Hard cap: 12 samples, 4x3.
- Downscale cells before tiling so `sheet.png` stays comfortably under runtime
  image attachment limits.

### Milestone 2: Agent Tool Exposure In Chat And Comments

Make both CLI tool families available to agents running in Ripple.

Behavior:

- Normal chat agents can run HyperFrames CLI commands from the active project or
  generated-change workspace.
- Comment-generated-change agents can run HyperFrames CLI commands from the
  isolated generated-change workspace.
- Both normal chat and comment agents can run `ripple frame-sheet`.
- Provider context/skills explain that HyperFrames is the native motion toolkit
  and Ripple adds a frame-sheet helper.
- The app does not force the agent to use a specific visual-context command; it
  gives the agent the tools and lets it choose.

Implementation guidance:

- Add `src/main/lib/agent-runtime/cli-tools-env.ts` with:

  ```ts
  buildRippleAgentToolEnvironment({
    baseEnv,
    repoRoot,
    workspaceRoot,
  }): NodeJS.ProcessEnv
  ```

- Ensure the helper prepends:
  - `resources/bin/<platform-arch>`
  - `node_modules/.bin` in dev
  - HyperFrames package CLI path if needed
  - app-managed FFmpeg/FFprobe directories
  - the Ripple CLI wrapper directory
- Ensure the helper sets:
  - `HYPERFRAMES_NO_TELEMETRY=1`
  - `HYPERFRAMES_NO_UPDATE_CHECK=1`
  - `HYPERFRAMES_NO_AUTO_INSTALL=1`
  - `RIPPLE_AGENT_WORKSPACE_ROOT=<validated workspace root>`
- Use the helper in both Codex and Claude provider adapters.
- For Codex, call `buildCodexAppServerEnv(...)` first, then pass that result as
  `baseEnv` to `buildRippleAgentToolEnvironment(...)` before constructing the
  App Server client.
- For Claude, call `buildClaudeEnv(...)` first, then pass that result as
  `baseEnv` to `buildRippleAgentToolEnvironment(...)` before calling the SDK.
- Ensure commands execute in the validated active project or generated-change
  workspace, not an arbitrary user path.
- Reuse Phase 13 provider instruction/skills decisions so this is presented as
  tool context, not a large pasted prompt.
- Add a small smoke path that proves an app-run agent can see or call both
  `hyperframes --help` and `ripple frame-sheet --help`.

### Milestone 3: App Comment Screenshot Integration

For frame comments, use HyperFrames snapshot directly.

Behavior:

- When a user anchors a comment at a frame/time, Ripple captures that exact
  frame.
- The comment composer shows the screenshot as a small removable visual chip.
- Submitting the comment stores the screenshot path in the existing
  `comment_threads.screenshot_path`.
- Generated-change execution loads the screenshot from the validated project
  path and passes it as an in-memory `AgentRuntimeAttachment`.
- If capture fails, the comment still submits, but Ripple does not pretend it
  sent visual context.

Implementation guidance:

- Before shipping app comment screenshots, verify one active-composition
  targeting outcome:
  - If `hyperframes snapshot` supports composition selection, document the exact
    flag/argument and wire it through app and CLI where appropriate.
  - If `hyperframes snapshot` only captures the default/entry composition,
    document that v1 limitation and do not claim arbitrary active-composition
    screenshots.
  - If selected-composition correctness is required and snapshot cannot target
    it, use the existing HyperFrames player/source path for app comments while
    keeping snapshot for CLI/default-project cases.
- Prefer capture-on-anchor-lock. When the user freezes the comment time/frame,
  start capture with a client request id.
- Do not capture repeatedly on every playhead tick.
- Do not require a new broad artifact table for the first screenshot path.
- Capture from the selected source workspace, but copy final app-owned visuals
  to the canonical project root under
  `<main project>/.ripple/comment-visuals/<id>/`.
- Store only project-relative paths such as `comment_threads.screenshot_path`.
- Do not serialize automatic screenshots as base64 conversation history.
- Add a runtime-only resolver, for example:

  ```ts
  resolveCommentVisualAttachmentsForRun({
    db,
    run,
    project,
    projectPath,
    cwd,
  }): Promise<{
    attachments: AgentRuntimeAttachment[]
    promptContext: string | null
  }>
  ```

- Call the resolver inside `executeAgentRun` after the Phase 13 live-context
  prompt is built and before `adapter.run(...)`.
- Merge the resolved visual attachments with explicit `options.attachments` so
  manual user uploads keep working.
- Add the manifest/cell mapping summary to the provider prompt through the same
  runtime prompt path, not through saved conversation message parts.
- For generated-change runs, resolve visuals from `run.threadId` /
  `comment_threads.screenshot_path` and any range-sheet metadata stored on the
  comment, because the scheduler does not carry renderer `runtimeContext`.
- Inside the app, path validation and preview context resolution still belong
  in the main process.
- Use an in-memory mutex keyed by real source workspace path for app captures.

### Milestone 4: App Range-Sheet Integration

For time-range comments, call the Ripple frame-sheet utility.

Behavior:

- A selected range can create a range comment.
- Ripple stores `startTime`, `endTime`, `startFrame`, and `endFrame`.
- Ripple can generate a small default sheet, likely 3x2 / 6 samples with
  endpoints included.
- The final sheet, copied frames, and manifest are copied to canonical project
  storage under `<main project>/.ripple/comment-visuals/<id>/`.
- Generated-change execution sends one image attachment for `sheet.png` and a
  prompt text summary of the manifest's cell-to-time/frame mapping.
- Do not attach every sampled frame by default.

Default sampling:

- frame comment: one PNG screenshot
- range comment: 3x2, 6 samples, endpoints included, max sheet width about
  1280px
- chat/agent explicit sheet: 4x2, 8 samples by default, max sheet width about
  1280px
- hard cap: 12 samples / 4x3 in v1

### Milestone 5: Agent Skill And Prompt Context

Bundle the tool guidance as agent context or a skill.

The skill should teach agents:

- HyperFrames is the native CLI/tooling surface for Ripple motion projects.
- Use HyperFrames commands such as preview, inspect, compositions, doctor,
  render, and snapshot when those fit the task.
- Use `hyperframes snapshot --at ...` for exact screenshots when visual stills
  are useful.
- Use `hyperframes snapshot --frames ...` for quick evenly spaced frames.
- Use `ripple frame-sheet ...` when you need a compact overview across time.
- Read `manifest.json` to map cells to timestamps and frames.
- Prefer small sheets first, then request more frames only when needed.
- Avoid generic video/FFmpeg extraction for HyperFrames composition state unless
  the user is explicitly inspecting an exported video file.

Location and fallback:

- Source the bundled guidance from
  `resources/agent-skills/ripple-visual-context/SKILL.md`.
- Register the guidance through the Phase 13 app-managed skill/context resolver
  path, alongside the app-managed HyperFrames skills already exposed by
  `resolveAgentRunContext`.
- Extend the resolver's `skillRoots.appManaged` handling to support multiple
  app-managed skill roots. Add the containing root, such as
  `resources/agent-skills`, not the individual `ripple-visual-context` skill
  directory, to provider APIs that expect a root containing skill folders.
- Keep the existing HyperFrames skill root behavior intact; this phase adds one
  Ripple visual-context skill root instead of moving or copying HyperFrames
  skills.
- For Codex, make the skill visible through the same `skills/list`
  `perCwdExtraUserRoots` flow used for app-managed HyperFrames skills.
- For Claude, update capability loading to scan every app-managed skill root and
  expose the visual-context skill through the same app/plugin skill surface
  reported by `loadClaudeRuntimeCapabilities`.
- If provider-native skill loading is unavailable or rejects the extra skill,
  append a compact runtime-context block with the same guidance through the
  existing app-policy fallback path.
- Do not require `npx skills add ...`, network installation, or external skill
  setup for local-first operation.

This skill should be usable by in-app agents, Codex, Claude Code, and
Codespaces without requiring the user to understand HyperFrames internals.

### Milestone 6: Diff Hygiene, Cleanup, And Thin Persistence

Keep generated visual files out of generated-change proposals and only add thin
app persistence where it is required.

Required:

- Ensure `.ripple/frame-sheets/`, `.ripple/tmp/`,
  `.ripple/comment-visuals/`, and transient HyperFrames snapshot intermediates
  are ignored by scaffolded project `.gitignore` files where applicable.
- Update `DEFAULT_PROJECT_GITIGNORE` in `src/main/lib/ripple-projects/project-git.ts`
  and related scaffold/project-git tests to include `.ripple/frame-sheets/` and
  `.ripple/comment-visuals/`.
- Exclude these paths from generated-change proposal diffs and acceptance patch
  construction even if a project lacks the expected `.gitignore`.
- Add cleanup that never deletes files referenced by comments.
- Keep any app persistence path-shaped and small. Do not add a broad
  visual-context artifact table in v1.

Possible later additions:

- A tiny table indexing generated frame sheets used by comments.
- Cleanup for old `.ripple/frame-sheets/*` outputs.
- A chat composer control to include current frame or generate a sheet.

Do not build these before the simple CLI, tool exposure, and comment screenshot
flow are useful.

## Concrete Steps

1. Confirm current `hyperframes snapshot` behavior on a sample Ripple project,
   including whether it can target an active composition.
2. Add the `ripple` CLI entrypoint, dev/test wrapper, and packaged wrapper path.
3. Implement `ripple frame-sheet` as the first command without app-only
   dependencies.
4. Add parsing for `--at`, `--range`, `--samples`, `--every`,
   `--every-frames`, `--fps`, `--dir`, and `--json`.
5. Implement time/frame sampling math, validation, sorting, dedupe, defaults,
   and hard caps.
6. Use HyperFrames snapshot with a lock/copy/cleanup protocol to produce
   sampled PNGs.
7. Assemble sampled PNGs into `sheet.png` with FFmpeg `tile`.
8. Write `manifest.json` and JSON success/error output.
9. Add focused tests for sampling math, workspace safety, manifest output, and
   nonzero generated files.
10. Smoke-test the command against a real HyperFrames project.
11. Add `buildRippleAgentToolEnvironment(...)`, compose it with
    `buildCodexAppServerEnv(...)` and `buildClaudeEnv(...)`, and use it in
    Codex and Claude adapters.
12. Prove app-run agents can resolve both HyperFrames CLI and Ripple CLI.
13. Wire app comment current-frame capture through the main-process path, with
    active-composition behavior verified and canonical project storage.
14. Add runtime-only visual attachment resolution from stored comment paths in
    `executeAgentRun`, merging automatic visuals with explicit attachments.
15. Add range comment sheet generation after current-frame comments work.
16. Exclude frame-sheet/comment-visual output from generated-change diffs.
17. Write the bundled skill/context documentation for the broader HyperFrames
    CLI surface and Ripple frame sheets, then register it through the Phase 13
    app-managed skill/context resolver.

## Validation and Acceptance

Focused validation:

- Sampling tests:
  - explicit `--at` timestamps
  - `--range` plus `--samples`
  - `--range` plus `--every`
  - `--range` plus `--every-frames`
  - hard cap enforcement
- CLI tests:
  - JSON success output
  - JSON error output when possible
  - manifest includes sample mapping
  - output stays under `.ripple/frame-sheets`
  - `RIPPLE_AGENT_WORKSPACE_ROOT` rejects out-of-root `--dir`
  - symlink escapes are rejected
  - generated files are nonzero
  - manifest sample count equals requested deduped sample count
- App tests:
  - chat/comment agent runtime can resolve HyperFrames CLI
  - chat/comment agent runtime can resolve Ripple frame-sheet CLI
  - Codex and Claude adapters receive the same tool environment behavior while
    preserving their Phase 13 provider env defaults
  - visual-context guidance appears through the Phase 13 app-managed
    skill/context resolver, with fallback prompt context if provider-native
    skill loading is unavailable
  - comment screenshot path is stored
  - comment visuals are copied to canonical project storage
  - automatic screenshot/sheet paths are loaded at generated-change execution
    without base64 transcript storage
  - explicit user attachments and automatic comment visuals are both delivered
    to `prepareRuntimeAttachments`
  - failed screenshot does not block comment submit
  - range comments preserve start/end anchors
  - generated visual outputs do not appear in generated-change proposal diffs

Project-level commands:

```bash
bun run test:hyperframes
bun run test:ripple
bun test
bun run ts:check
git diff --check
```

Manual smoke:

```bash
bun scripts/ripple-cli.ts frame-sheet --range 2s..8s --samples 8 --json
bunx hyperframes snapshot --at 2.4 .
ripple frame-sheet --range 2s..8s --samples 8 --json
ripple frame-sheet --at 0s,1.5s,3s,4.2s --json
```

Acceptance criteria:

- An agent can generate a frame sheet from a HyperFrames project with one Ripple
  command.
- The sheet manifest maps each cell/frame to timestamp and frame data.
- The command works without app database access.
- Chat agents and comment-generated-change agents can access both HyperFrames
  CLI tooling and `ripple frame-sheet`.
- `ripple frame-sheet` is workspace-bounded when launched from Ripple-provided
  agent environments.
- Active-composition behavior is verified and documented before app comment
  screenshots ship.
- The app can attach a current-frame screenshot to a new comment.
- Range comments can produce a small sheet after the current-frame path is
  stable.
- Automatic screenshots/sheets reach providers through runtime-only attachment
  loading, not base64 transcript history.
- Phase 14 visual-context guidance is exposed through the Phase 13 app-managed
  skill/context system, not by mutating project notes.
- Generated visual files are ignored/excluded from proposal diffs.
- Primary UI and docs use motion-review language and do not expose worktree,
  branch, or artifact-system terminology.

## Idempotence and Recovery

- The CLI should create a new output folder per run.
- Use a `.tmp` folder and atomic rename for finished frame-sheet bundles where
  practical.
- Failed runs should leave either no folder or a clearly marked partial folder
  that cleanup can remove.
- Re-running the same command should not destroy prior outputs.
- Cross-process CLI capture should use `.ripple/frame-sheets/.capture-lock`
  with stale-lock recovery.
- App capture should use an in-memory mutex keyed by real source workspace path.
- The lock/copy/cleanup protocol should remove only intermediates created by
  the current run.
- App comment capture should use a client request id so duplicate comment
  submits do not create mismatched screenshots.
- If screenshot capture fails, comments still submit without screenshot context.
- Cleanup can be manual or deferred in v1; automatic cleanup should not delete
  sheets referenced by comments.
- Comment visuals captured from generated-change workspaces must be copied into
  canonical project storage before storing paths.

## Interfaces and Dependencies

Required:

- HyperFrames CLI `snapshot`
- Node/Bun runtime already used by Ripple
- FFmpeg tile assembly

Available dependencies:

- `hyperframes`
- `@hyperframes/*`
- `@ffmpeg-installer/ffmpeg`
- `@ffprobe-installer/ffprobe`

Preferred dependency order:

1. HyperFrames for frame capture.
2. FFmpeg for scaling and tiling copied frames.
3. Manifest and prompt text for cell/time/frame labels.

Do not introduce PySceneDetect or generic video contact-sheet packages in v1.
They are references, not core dependencies.

Do not introduce `sharp`, `canvas`, or another native image-composition
dependency in v1 unless FFmpeg tiling proves impossible.

## Artifacts and Notes

Use examples like these in the bundled skill:

```bash
# Capture exact screenshots with HyperFrames.
hyperframes snapshot --at 1.25,2.5,4 .

# Create a quick overview of a section.
ripple frame-sheet --range 2s..8s --samples 8 --json

# Inspect a transition more densely.
ripple frame-sheet --range 2.2s..3.4s --every 0.2s --json
```

Known implementation gates:

- Verify whether HyperFrames snapshot can target a selected composition. This
  decides whether app comment screenshots can use snapshot directly for every
  active composition or need the existing composition-aware player path.
- Verify the packaged wrapper strategy on macOS first, then map Windows/Linux
  wrappers before release packaging.
