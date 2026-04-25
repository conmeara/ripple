# AGENTS.md

This repository is being rebuilt from the 1Code desktop/chat/agent foundation into
Ripple: a local-first desktop app for creating short motion graphics with
HyperFrames, plain-English chat, frame-anchored comments, reviewable revisions,
and export.

For execution-plan guidance, read `PLANS.md`. For the Ripple roadmap, migration
plan, product specification, release criteria, and testing strategy, read
`ROADMAP.md`.

## Product Direction

- Ripple is not 1Code with a custom preview tab.
- Preserve useful 1Code foundations: Electron shell, chat/agent streaming,
  provider support, local state, revision isolation, diff/review primitives,
  MCP/plugins, file viewer, terminal, automations, kanban, and voice surfaces
  where they still serve Ripple.
- Replace the primary product model with HyperFrames-native motion creation:
  project, composition, asset, timeline, frame, comment, revision, preview, and
  export.
- Local use must not require account creation, provider selection, GitHub, repo
  setup, branch knowledge, manual dependency installation, or mandatory auth.
- The normal create-project path should create `~/Ripple/<project-name>` and
  hide setup work behind app language.
- Shipped Ripple paths must remove `1Code`, `21st.dev`, upstream auth/update
  coupling, and primary-path developer terminology.

## Users And Product Reasoning

- Primary users are motion designers, editors, marketers, indie founders, and
  agency teams creating social promos, title cards, lower thirds, explainers,
  and short brand videos.
- Ripple exists to give those users an agentic motion-graphics workflow without
  asking them to learn GitHub, coding tools, dependency installs, project setup,
  or repo mechanics.
- A successful first session lets someone open or create a project, describe a
  title card or lower third, iterate through chat or frame-anchored comments,
  preview quickly, and export a usable 1080p video.
- Ripple sits between motion-design tools and AI coding-agent tools. Agents
  should generate structured HyperFrames HTML/CSS/GSAP motion work, not generic
  app code.
- The main UX addition over raw HyperFrames is a Frame.io-style review loop:
  frame/time/element comments become isolated, reviewable revisions with clear
  accept/reject decisions.

## Architecture Snapshot

Current code is still mostly 1Code-shaped:

- `src/main/`: Electron main process, auth, analytics, updater, database,
  tRPC routers, terminal, git/worktree helpers, Claude/Codex execution.
- `src/preload/`: context-isolated bridge exposing tRPC and `desktopApi`.
- `src/renderer/`: React 19 renderer with the current agents shell, onboarding,
  sidebar, chat, preview, diff, file viewer, terminal, settings, automations,
  and kanban.
- `src/main/lib/db/schema/index.ts`: current Drizzle schema. It still has
  `projects`, `chats`, `sub_chats`, and provider credential tables; Ripple
  domain tables still need to be added.
- `PLANS.md`: ExecPlan rules and template for complex work.
- `ROADMAP.md`: active roadmap/spec and durable product context.

Target Ripple additions:

- HyperFrames project service in the main process.
- tRPC APIs for project creation, environment checks, composition discovery,
  preview lifecycle, snapshots, render/export, comments, and revisions.
- Renderer shell with project rail, assets/compositions pane,
  chat/comment pane, and embedded HyperFrames Studio/player surface.
- SQLite tables for compositions, assets, comment threads, revisions, export
  jobs, and environment readiness.

## ExecPlans

- Use `PLANS.md` for complex features, significant refactors, multi-hour
  migrations, work with major unknowns, or any change that materially affects
  Ripple's architecture, roadmap, scope, or release criteria.
- Before starting that kind of work, read `PLANS.md` and `ROADMAP.md`, then
  create or update the relevant phase plan under `plans/`.
- Keep each ExecPlan self-contained enough that another agent can continue from
  the working tree and the plan alone.
- Keep active plans living: update progress, discoveries, decisions,
  retrospective notes, validation steps, and recovery guidance as work proceeds.
- Use prototyping milestones for uncertain libraries or integration risks,
  especially HyperFrames runtime behavior, Electron packaging, render/export
  validation, and agent revision isolation.
- For small edits, follow `AGENTS.md` directly and update `PLANS.md` only when
  the change alters the ExecPlan process. Update `ROADMAP.md` when the change
  alters durable product or engineering direction.

## Commands

Use Bun unless a task specifically requires another package manager.

```bash
bun run dev
bun test
bun run test:ripple
bun run build
bun run ts:check
bun run package
bun run package:mac
bun run package:win
bun run package:linux
bun run db:generate
bun run db:push
```

Notes:

- `bun run dev` starts the Electron app with hot reload.
- `bun run test:ripple` runs the focused Ripple regression suite:
  project paths/scaffold/metadata/environment/lifecycle, hidden `.ripple`
  setup config, project chat selection, chat ownership, New Project shortcut
  routing, and selected-project mapping.
- `bun run ts:check` is the current TypeScript check.
- Ripple should grow full unit, integration, renderer/component, Electron E2E,
  render/export, packaging, and manual QA gates; see `ROADMAP.md`.
- HyperFrames integration should eventually validate Node.js 22+, FFmpeg, and
  `npx hyperframes doctor` through app-managed flows.

## Implementation Rules

- Read `PLANS.md` and `ROADMAP.md` before large changes or architecture work.
  For complex or high-risk work, create or update the relevant ExecPlan under
  `plans/`, and keep progress, decisions, and validation current.
- Keep work scoped to the current request. Do not do broad rebrands, schema
  migrations, or dependency upgrades unless the task calls for them.
- Prefer existing Electron, tRPC, Drizzle, Jotai, Zustand, React Query, Radix,
  and Tailwind patterns over new abstractions.
- Put main-process filesystem, process, preview, render, and export orchestration
  behind typed tRPC procedures.
- Do not make renderer code launch privileged shell commands directly.
- Do not trust renderer-provided absolute paths for project, asset, revision, or
  export operations. Resolve and validate paths in the main process.
- Reuse `src/main/lib/git/security/*` style boundary checks when adapting file
  and revision access.
- Hidden git/worktree/snapshot mechanics are allowed internally, but primary UX
  must say revision, proposal, version, accept, reject, project, composition,
  timeline, preview, and export.
- Avoid introducing Remotion, React scene, or app-preview assumptions for motion
  graphics. HyperFrames is the source of truth.

## HyperFrames Rules

- Treat HyperFrames compositions as plain HTML project files, not React
  components.
- Typical project shape: `index.html`, `compositions/`, `assets/`,
  `hyperframes.json` or metadata, and exported renders.
- Composition roots need `data-composition-id`, `data-width`, and
  `data-height`.
- Timed visible clips need `class="clip"`, `data-start`, `data-duration`, and
  `data-track-index`.
- GSAP timelines must be paused and registered on `window.__timelines`.
- Do not use unseeded randomness, wall-clock animation logic, render-time
  network fetches, manual media playback, or custom script timing that bypasses
  HyperFrames clip semantics.
- Prefer official HyperFrames Studio/player/producer primitives over rebuilding
  parallel preview, timeline, render, or frame-snapshot systems.

## UI Rules

- Ripple should feel like a motion-design tool, not a developer tool.
- Primary shell target:
  - far-left project rail
  - assets/compositions/templates pane
  - chat/comment pane
  - right HyperFrames preview/editor/timeline/export surface
- Keep the UI dense, focused, and app-like. Avoid marketing-page patterns in
  the desktop shell.
- Use existing Radix/Tailwind/Ripple component wrappers where possible.
- Use motion-design language in primary UX. Avoid repo, branch, worktree, PR,
  clone, sandbox, dependency install, and dev server unless in advanced/debug
  surfaces.
- Export must be a first-class flow, not a hidden developer command.

## Data And Security

- Local project files live under `~/Ripple/<project-name>` by default.
- Agent execution must stay inside the active project boundary or a registered
  isolated revision context derived from that project.
- Comment revisions must be isolated. Do not silently fall back to editing the
  primary project when isolation fails.
- Accept/reject must be explicit product actions.
- Render destinations and imported assets must be validated before writing.
- Optional auth, analytics, sync, or account features must not block local use.

## File Naming

- Renderer components: `PascalCase.tsx`.
- Feature utilities, stores, services, and main-process modules:
  `kebab-case.ts`.
- HyperFrames compositions and templates: `kebab-case.html`.
- Tests: `*.test.ts` or `*.test.tsx` near the code they cover, unless a broader
  integration test folder is introduced.

## Done Means

- The requested behavior is implemented or the blocker is clearly documented.
- Relevant type checks, tests, or smoke checks were run, or the reason they were
  not run is reported.
- User-facing language follows Ripple terminology.
- No new primary-path `1Code`, `21st.dev`, repo-first, auth-gated, or
  Remotion-style assumptions were introduced.
- Risky filesystem, process, provider, preview, render, or export behavior is
  validated from the main process.
- `ROADMAP.md` is updated when the change materially affects roadmap, scope,
  architecture, or acceptance criteria.
