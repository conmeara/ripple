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
- [x] 2026-05-03 / Codex: Implemented Milestone 0: CLI entrypoint and
  frame-sheet prototype.
- [x] 2026-05-03 / Codex: Implemented Milestone 1: CLI contract, manifest, and
  tests.
- [x] 2026-05-03 / Codex: Implemented Milestone 2: exposed HyperFrames and
  Ripple CLI tools to app chat/comment agents.
- [x] 2026-05-03 / Codex: Implemented Milestone 3: app comment screenshot
  integration using HyperFrames snapshot for the verified entry/default
  composition path.
- [x] 2026-05-03 / Codex: Implemented Milestone 4: app comment range-sheet
  integration using `ripple frame-sheet`.
- [x] 2026-05-03 / Codex: Implemented Milestone 5: bundled
  `ripple-visual-context` skill/context guidance.
- [x] 2026-05-03 / Codex: Implemented Milestone 6: diff hygiene, cleanup
  boundaries, and thin path persistence.
- [x] 2026-05-03 / Codex: Validated Phase 14 with focused tests, full tests,
  type check, build, package smoke, direct CLI smoke, direct comment visual
  smoke, and packaged CLI wrapper smoke.
- [x] 2026-05-03 / User + Codex: Reopened Phase 14 after review found two
  practical gaps: the documented `ripple frame-sheet` command needed a tracked
  app-managed wrapper on agent PATH, and comment visual storage needed to reject
  `.ripple` / `comment-visuals` symlink escapes before any recursive directory
  creation.
- [x] 2026-05-03 / Codex: Completed review remediation and packaged-runtime
  validation. The tracked `ripple` wrapper now works from the packaged app
  bundle, and packaged `ripple frame-sheet` generated a real 8-sample sheet.
- [x] 2026-05-04 / User + Codex: Reopened Phase 14 after review found three
  hardening issues: `file://` fast capture could bypass project-boundary checks
  through symlinked assets, the path-boundary helper missed Windows cross-drive
  relative results, and automatic comment visuals could push runtime
  attachments past the user-accepted limit.
- [x] 2026-05-04 / Codex: Hardened the frame-sheet capture server, shared path
  boundary helper, and runtime attachment merge behavior, with focused
  regressions plus full Ripple/default test validation.
- [x] 2026-05-04 / Codex: Completed live provider proof for Phase 14. Codex App
  Server and Claude Agent SDK both chose the app-managed `ripple frame-sheet`
  tool from generic visual-context prompts, generated real sheets, and reported
  the artifact paths without the user naming the CLI.

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

- Observation: HyperFrames `snapshot` in 0.4.40 does not expose a composition
  selector, so Phase 14 v1 only auto-captures when the active composition maps
  to the project entry/default composition. For other active compositions,
  comment submit still works and visual capture returns no attachment instead
  of silently sending the wrong frame.
  Evidence: `hyperframes snapshot --help` exposes `--frames`, `--at`,
  `--timeout`, and the project directory argument, but no composition flag; the
  `comment visual context` tests verify the default-composition guard.

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

- Observation: Running real HyperFrames snapshot smoke in this sandbox can fail
  with `listen EPERM: operation not permitted 0.0.0.0`. The CLI logic worked
  after rerunning the same smoke with approved escalation, which allowed the
  local preview/snapshot server path to bind.

- Observation: Electron Builder copies `resources/bin/darwin-arm64/*` into
  packaged `Contents/Resources/bin/*`, not a nested `bin/darwin-arm64/`
  folder. The runtime helper covers that packaged location through
  `process.resourcesPath`, while dev/test uses the platform-arch resource
  directory.

- Observation: The packaged CLI wrappers run successfully from the built app
  bundle, but unsigned local execution prints Electron's macOS
  `SecCodeCheckValidity` warning. The wrappers still exit 0 and return the
  expected CLI output.

- Observation: The packaged fast frame-sheet path initially failed inside the
  bundled Puppeteer/ws dependency with `bufferUtil$1.mask is not a function`.
  Vite replaces the optional native `bufferutil` peer with an empty module in
  the packaged bundle, so the CLI now forces ws's JS fallback flags
  (`WS_NO_BUFFER_UTIL=1` and `WS_NO_UTF_8_VALIDATE=1`) for capture processes.

- Observation: A live Codex app-server smoke showed that generic "visual sanity
  check" wording can push the model toward `npx hyperframes` or unavailable
  image-view tools if the app-managed skill guidance is too soft. The
  visual-context skill and app policy now explicitly say to use app-managed
  bare commands, default to `ripple frame-sheet`, and report the generated
  sheet path when image viewing is unavailable.

- Observation: `ripple frame-sheet` can still require Codex's on-failure
  unsandboxed retry path because Chromium launch is blocked inside the
  app-server workspace sandbox on this macOS host. The app adapter already
  auto-accepts command retries inside the active workspace, and the live Codex
  smoke verified that path generates the sheet without a user tool mention.

- Observation: Claude Agent SDK plugin/skill loading was not enough by itself.
  Claude selected the right `ripple frame-sheet` command from the
  `ripple-visual-context` skill, but the SDK could stall behind an invisible
  shell-tool approval. Ripple now auto-allows only the exact app-managed frame
  sheet command patterns, not arbitrary shell access.

- Observation: HyperFrames' own snapshot/inspect paths generally use temporary
  loopback HTTP servers for browser capture, but the installed HyperFrames
  server guards inspected in this checkout are mostly lexical path checks rather
  than realpath/symlink-boundary checks.
  Evidence: `node_modules/hyperframes/dist/cli.js` serves snapshot assets over
  `http://127.0.0.1:<port>/` and checks `relative(projectDir, filePath)`, while
  Ripple now realpath-checks every served project file before reading it.

- Observation: Automatic comment visual context is helpful but must be
  opportunistic. User-supplied attachments are the explicit request, so they
  should keep their full accepted limit even when Ripple has generated a
  screenshot or frame sheet for the same comment.
  Evidence: `appendOptionalAgentRuntimeAttachments(...)` now appends automatic
  visuals only while the combined list still passes
  `validateAgentRuntimeAttachments(...)`.

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

- Decision: Fast `ripple frame-sheet` capture uses Ripple's guarded loopback
  server, not `file://`.
  Rationale: Browser `file://` loading can follow symlinked project assets
  without returning to Node-side boundary checks. A short-lived `127.0.0.1`
  server gives Ripple one path gate for HTML, scripts, CSS, images, nested
  compositions, fonts, and future resource types. Each project file request is
  realpath-checked against the project root before `readFile`, and the browser
  request layer aborts unexpected origins.
  Date/Author: 2026-05-04 / User + Codex

- Decision: Runtime automatic visual attachments are optional after explicit
  user attachments.
  Rationale: Comment submission already validates the user's attachments.
  Ripple-generated screenshots/sheets should not make a generated-change run
  fail later when the user supplied the maximum accepted files. If the combined
  list would exceed count or byte limits, drop the automatic visual and omit its
  prompt context.
  Date/Author: 2026-05-04 / User + Codex

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

Phase 14 shipped the CLI-first visual-context path described in this plan.

What shipped:

- Added the importable Ripple CLI at `src/cli/ripple.ts` and
  `src/cli/frame-sheet.ts`, the dev wrapper `scripts/ripple-cli.ts`, and macOS
  app resource wrappers for `ripple` and `hyperframes`.
- Implemented `ripple frame-sheet` with explicit timestamp, range/sample,
  time-interval, and frame-interval sampling; project-local output under
  `.ripple/frame-sheets/`; FFmpeg tile assembly; `manifest.json`; JSON
  success/error output; capture locking; workspace-root bounds; and symlink
  escape checks.
- Optimized `ripple frame-sheet` for agent-loop speed by making the default
  capture path render directly at agent-sized cell dimensions before tiling.
  The slower full-resolution HyperFrames `snapshot` path remains available as
  `--capture hyperframes`, while the default `--capture fast` path uses the
  app-managed browser, local project server, bundled GSAP rewrite for common
  CDN starters, and a short settle delay.
- Added `buildRippleAgentToolEnvironment(...)` and composed it with both Codex
  App Server and Claude SDK provider env builders so chat and comment runs get
  HyperFrames, Ripple CLI, FFmpeg/FFprobe, local-first HyperFrames env flags,
  and `RIPPLE_AGENT_WORKSPACE_ROOT`.
- Added the bundled app-managed skill root
  `resources/agent-skills/ripple-visual-context/SKILL.md` and taught the
  Phase 13 context resolver plus Claude capability loader to expose multiple
  app-managed skill roots without copying them into user projects.
- Wired comment creation to request automatic visual context by default. Frame
  comments capture a current-frame PNG through HyperFrames snapshot when the
  selected composition is the project entry/default composition. Range comments
  generate a compact frame sheet through the same `ripple frame-sheet` code
  path.
- Copied app-owned comment visuals into canonical project storage under
  `.ripple/comment-visuals/<threadId>/`, stored only the project-relative path,
  and loaded those visuals at generated-change execution time as in-memory
  provider attachments plus prompt context.
- Kept generated visual output out of user-visible revision proposals and
  accept patches, and added `.ripple/frame-sheets/` plus
  `.ripple/comment-visuals/` to scaffolded and managed project `.gitignore`
  handling.

What changed from the original plan:

- Active-composition screenshots are intentionally narrower in v1. HyperFrames
  `snapshot` has no composition selector in 0.4.40, so automatic comment
  screenshots are only claimed for the entry/default composition. Non-entry
  active compositions can still submit comments; they simply do not receive an
  automatic visual attachment until Ripple adds a composition-aware capture
  path.
- The app uses the existing `comment_threads.screenshot_path` column as a thin
  path reference for both current-frame PNGs and range-sheet PNGs. No visual
  artifact table was added.
- Cleanup for old unreferenced frame-sheet bundles remains deferred. Phase 14
  guarantees that proposal/accept diffs ignore generated visual output and that
  failed comment capture does not block user comments.
- The original HyperFrames `snapshot` CLI was too slow for agent-loop frame
  sheets because it captures 1920x1080 frames, waits before capture, and only
  then lets Ripple downscale. The optimized default captures each 16:9 cell
  around 360x203 for a 4-column 1440px-wide sheet, which keeps cell height just
  over Claude's small-image caution while staying below common model resize
  thresholds and avoiding discarded pixels.
- The documented `ripple` command now resolves through a tracked
  `resources/cli/ripple` wrapper in development and is packaged into
  `Resources/bin` with the rest of the app-managed agent tools. The agent PATH
  puts `resources/cli` ahead of ignored/generated binary directories so the
  skill does not depend on an untracked local wrapper.
- `ripple-visual-context` now has provider-readable skill metadata. Codex loads
  it from the app-managed `resources/agent-skills` root and the Codex adapter
  includes it as a default typed skill input for Ripple turns, so the user does
  not need to mention the skill. Claude loads the same skill body through a
  small app-managed local plugin at
  `resources/claude-plugins/ripple-visual-context`.
- Comment visual storage now checks `.ripple`, `.ripple/comment-visuals`, and
  the target thread directory for symlink escapes before calling recursive
  `mkdir`, preventing an out-of-project write side effect before the realpath
  guard runs.
- The tracked packaged `ripple` wrapper now checks for `app.asar` itself rather
  than a normal filesystem path inside the archive. The packaged fast capture
  path also forces ws's JS fallback flags so the bundled Puppeteer connection
  does not call an empty optional native dependency.
- The fast frame-sheet capture path now always goes through Ripple's temporary
  `127.0.0.1` project server instead of a `file://` capture document. The server
  validates the host, rejects non-`GET`/`HEAD`, denies sensitive hidden paths,
  resolves every requested project file with `realpath`, and returns `403` for
  symlink escapes before reading the file. Puppeteer request interception also
  allows only the capture origin plus `data:`, `blob:`, and `about:` resources.
- Shared path-boundary checks now reject absolute `path.relative(...)` results,
  covering Windows cross-drive paths in both the CLI and main-process project
  helpers.
- Generated-change runs now append automatic comment visual attachments only
  when the combined attachment list still satisfies the runtime limits. Explicit
  user attachments keep priority, and dropped automatic visuals no longer add
  misleading prompt context.
- The visual-context skill and app policy now tell agents not to use `npx`,
  `bunx`, package installs, or unavailable image-view/open/browser tools for
  generated sheets. In app-server runs, the correct fallback is to report the
  generated sheet path and manifest details so Ripple can show the artifact.
- Claude runtime setup now grants a narrow automatic allowance for
  `Bash(ripple frame-sheet)` and `Bash(ripple frame-sheet *)`. This keeps the
  visual-context path from hanging on an invisible approval while preserving the
  normal approval boundary for other shell commands.

Validation evidence:

- `bun test src/cli/frame-sheet.test.ts`: 9 pass.
- `bun test src/main/lib/ripple-projects/project-git.test.ts src/main/lib/revisions/comment-visuals.test.ts src/main/lib/revisions/comment-revisions.test.ts src/cli/frame-sheet.test.ts src/main/lib/agent-runtime/cli-tools-env.test.ts src/main/lib/agent-runtime/agent-run-context-resolver.test.ts src/main/lib/agent-runtime/providers/codex-app-server-adapter.test.ts src/main/lib/agent-runtime/providers/claude-runtime-capabilities.test.ts`:
  44 pass.
- `bun run test:ripple`: 342 pass, 0 fail.
- `bun run test:hyperframes`: 148 pass, 0 fail.
- `bun test`: 339 pass, 0 fail.
- `bun run ts:check`: pass.
- `bun run build`: pass.
- `bun run package`: pass for `electron-builder --dir`; notarization skipped
  because notarize options are not configured.
- `git diff --check`: pass.
- Review remediation tests: `bun test src/main/lib/agent-runtime/cli-tools-env.test.ts
  src/main/lib/agent-runtime/agent-run-context-resolver.test.ts
  src/main/lib/agent-runtime/providers/codex-app-server-adapter.test.ts
  src/main/lib/agent-runtime/providers/claude-runtime-capabilities.test.ts
  src/main/lib/revisions/comment-visuals.test.ts`: 23 pass.
- Final review remediation tests after packaged-runtime fixes:
  `bun test src/cli/frame-sheet.test.ts src/main/lib/agent-runtime/providers/codex-app-server-adapter.test.ts
  src/main/lib/agent-runtime/agent-run-context-resolver.test.ts
  src/main/lib/agent-runtime/providers/claude-runtime-capabilities.test.ts
  src/main/lib/agent-runtime/cli-tools-env.test.ts
  src/main/lib/revisions/comment-visuals.test.ts`: 32 pass. This covers the
  tracked `ripple` wrapper, packaged resource copy, Codex/Claude visual-context
  skill roots, proactive visual skill guidance, Codex default typed skill
  input, the Claude plugin registration path, both symlink-escape regressions,
  and ws JS-fallback env flags for frame-sheet capture.
- Provider-boundary audit tests:
  `bun test src/main/lib/agent-runtime/providers/codex-app-server-adapter.test.ts
  src/main/lib/agent-runtime/providers/claude-runtime-capabilities.test.ts`:
  14 pass. Codex now asserts `buildCodexTurnSkillInputs([], skills)` includes
  `ripple-visual-context` without a user skill mention, and Claude now asserts
  `loadClaudeRuntimeCapabilities(...)` resolves the app-managed
  `ripple-visual-context` plugin, exposes `skills: "all"`, lists the skill, and
  appends the proactive visual-context policy.
- Claude frame-sheet allowlist regression:
  `bun test src/main/lib/agent-runtime/providers/claude-runtime-capabilities.test.ts`:
  3 pass, 21 expects. The focused test asserts the SDK options include only
  `Bash(ripple frame-sheet)` and `Bash(ripple frame-sheet *)` for automatic
  approval, and still do not include `Bash(*)` or
  `allowDangerouslySkipPermissions`.
- Security hardening tests after the follow-up review:
  `bun test src/shared/path-boundary.test.ts src/cli/frame-sheet.test.ts
  src/main/lib/agent-runtime/runtime-attachments.test.ts`: 19 pass. This covers
  Windows cross-drive containment, frame-sheet project-server symlinked
  entry/asset escapes, output symlink escapes, and optional automatic visual
  attachment dropping when user attachments fill the limit.
- Follow-up hardening validation:
  `bun run ts:check`: pass.
- Follow-up hardening validation:
  `bun run test:ripple`: 347 pass, 0 fail.
- Follow-up hardening validation:
  `bun test`: 354 pass, 0 fail.
- Follow-up hardening validation:
  `git diff --check`: pass.
- Codex app-server smoke: `skills/list` with
  `perCwdExtraUserRoots=[resources/agent-skills]` now returns enabled
  `ripple-visual-context`, and `buildCodexTurnSkillInputs([], skills)` produces
  a default `{ type: "skill", name: "ripple-visual-context" }` input without any
  user skill mention.
- Claude plugin smoke: `claude plugin validate
  resources/claude-plugins/ripple-visual-context` passes. A Claude
  `--plugin-dir resources/claude-plugins/ripple-visual-context` stream-json
  initialization lists plugin `ripple-visual-context` and skill
  `ripple-visual-context:ripple-visual-context`; the run then stops at auth
  (`Not logged in`) before any model call, so this verifies plugin/skill
  loading but not a full Claude completion in the current auth state.
- Earlier local Claude CLI auth check before dev-app validation:
  `resources/bin/darwin-arm64/claude auth status --json` reports
  `"loggedIn": false`, `"authMethod": "none"`, so the direct shell plugin
  probe could not complete a model call in that environment.
- Live Codex app-server smoke, first pass: with a generic "quick visual sanity
  check" prompt and no user skill/CLI mention, Codex initially used
  `npx hyperframes lint` and tried an unavailable image-view tool. This exposed
  the need for stronger no-`npx` and no-image-view fallback guidance.
- Live Codex app-server smoke, corrected pass: with the strengthened app policy
  and `ripple-visual-context` skill loaded as a default typed skill input, a
  generic "prepare quick visual context" prompt caused Codex to run
  `ripple frame-sheet --range 0s..8s --samples 8 --columns 4 --json`, retry via
  the app-server on-failure approval path inside the workspace, complete the
  turn, and report
  `/private/tmp/ripple-framesheet-example-MUBbnP/.ripple/frame-sheets/fs_e630ab2279c1/sheet.png`.
- Live Claude dev-app smoke, corrected pass: with the packaged
  `ripple-visual-context` plugin loaded through the dev app, a generic "quick
  visual sanity check" prompt caused Claude to run `ripple frame-sheet --range
  0s..8s --samples 8 --columns 4 --json` against `new-timeline` /
  `apple-money-count`, complete run `moqfi13wu3e1ykrb`, and report
  `.ripple/frame-sheets/fs_00f44b95b8af/sheet.png` with manifest
  `.ripple/frame-sheets/fs_00f44b95b8af/manifest.json`. The generated sheet
  exists at
  `/Users/conmeara/Ripple/new-timeline/.ripple/frame-sheets/fs_00f44b95b8af/sheet.png`
  and is 1440x406.
- Final packaged validation after the live provider smokes: `bun run ts:check`
  passed, `bun run package` passed for the packaged directory build with
  notarization skipped because notarize options are not configured, and
  `git diff --check` passed.
- PATH smoke: `PATH="/Users/conmeara/code/ripple/resources/cli:$PATH" ripple
  --help` resolves the documented bare `ripple` command from the tracked
  wrapper in a project directory.
- PATH frame-sheet smoke: the same PATH-driven `ripple frame-sheet --range
  0s..8s --samples 8 --columns 4 --json` generated
  `.ripple/frame-sheets/fs_4eaf2a467229/sheet.png` at 1440x406. The first
  sandboxed attempt failed because local 127.0.0.1 server binding was blocked;
  rerunning with approved local-server permission succeeded.
- Real CLI smoke: `bun scripts/ripple-cli.ts frame-sheet --dir <sample project>
  --range 0s..1s --samples 2 --json` generated a nonzero `sheet.png`,
  `manifest.json`, and two frame PNGs after running with approved sandbox
  escalation for the local HyperFrames snapshot server.
- Optimized CLI smoke: `bun scripts/ripple-cli.ts frame-sheet --dir
  /private/tmp/ripple-framesheet-example-MUBbnP --range 0s..8s --samples 8
  --columns 4 --json` completed in about 1.3s from a temp HyperFrames/Ripple
  title-card project. The output sheet was 1440x406, non-solid by
  `signalstats`, and mapped 8 samples in `manifest.json`.
- Project-cwd smoke: `bun /Users/conmeara/code/ripple/scripts/ripple-cli.ts
  frame-sheet --range 0s..8s --samples 8 --columns 4 --json` succeeded from
  the temp project directory when run with normal local-server permissions,
  proving the dev wrapper no longer depends on the repo being the current
  working directory.
- Direct comment visual smoke generated
  `.ripple/comment-visuals/thread-smoke/frame.png` and
  `.ripple/comment-visuals/thread-range-smoke/sheet.png` from the same sample
  project.
- Packaged CLI smoke: packaged `Contents/Resources/bin/ripple --help` returned
  the Ripple CLI help and packaged `Contents/Resources/bin/hyperframes
  --version` returned `0.4.40`. Local unsigned execution printed Electron's
  macOS codesign validity warning but exited successfully.
- Packaged resource smoke: packaged
  `Contents/Resources/bin/ripple`,
  `Contents/Resources/agent-skills/ripple-visual-context/SKILL.md`, and
  `Contents/Resources/claude-plugins/ripple-visual-context/.claude-plugin/plugin.json`
  are present in the `release/mac-arm64/1Code.app` bundle; the packaged Claude
  plugin validates successfully.
- Packaged frame-sheet smoke after wrapper/runtime fixes: packaged
  `/Users/conmeara/code/ripple/release/mac-arm64/1Code.app/Contents/Resources/bin/ripple
  frame-sheet --range 0s..8s --samples 8 --columns 4 --json` succeeded from
  `/private/tmp/ripple-framesheet-example-MUBbnP` after approved local-server
  permission and produced
  `/private/tmp/ripple-framesheet-example-MUBbnP/.ripple/frame-sheets/fs_430fcbac296c/sheet.png`
  at 1440x406, 177K.
- Packaged frame-sheet smoke after file-based fast capture: packaged
  `/Users/conmeara/code/ripple/release/mac-arm64/1Code.app/Contents/Resources/bin/ripple
  frame-sheet --range 0s..8s --samples 8 --columns 4 --json` succeeded from
  `/private/tmp/ripple-framesheet-example-MUBbnP` after approved browser-launch
  permission and produced
  `/private/tmp/ripple-framesheet-example-MUBbnP/.ripple/frame-sheets/fs_8ce88e8e7e35/sheet.png`
  at 1440x406, 177K.

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

- HyperFrames snapshot composition targeting was verified for 0.4.40: there is
  no composition selector in the current CLI help. Phase 14 v1 therefore uses
  snapshot only for entry/default-composition automatic comment screenshots and
  does not claim arbitrary active-composition capture.
- Packaged wrapper strategy was verified on macOS arm64 with
  `electron-builder --dir` and direct packaged wrapper smoke. Windows and Linux
  wrappers remain a release-packaging follow-up before those targets should
  claim the same packaged CLI support.
