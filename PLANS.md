# PLANS.md

Active roadmap, migration specification, and execution-plan guidance for
rebuilding this repository from the 1Code desktop/chat/agent foundation into
Ripple.

This file is intentionally more detailed than `AGENTS.md`. Keep `AGENTS.md`
concise and durable; update this file when project direction, scope, acceptance
criteria, or long-running execution plans change.

## How To Use PLANS.md

Use this file for complex features, significant refactors, multi-hour
migrations, and work with major unknowns. Simple edits can follow `AGENTS.md`
alone, but any change that affects Ripple's architecture, roadmap, scope, or
release criteria should update this file.

When authoring or implementing an execution plan:

- make it self-contained enough for a fresh agent to continue from the current
  working tree and the plan text alone
- start with purpose and user-visible behavior before implementation details
- define project-specific terms in plain language
- keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and
  `Outcomes & Retrospective` current as work proceeds
- include concrete files, commands, expected observations, validation steps, and
  acceptance criteria
- include idempotence and recovery notes for risky or repeatable steps
- add prototyping milestones for uncertain libraries, runtime behavior, or
  architectural choices before committing to a broad migration

The standing Ripple roadmap below serves as the current repository-level
ExecPlan. For a narrower feature, add or link a focused plan section that follows
the same rules instead of scattering decisions across chat history.

If a focused plan becomes too large for this file, place it under `plans/` and
link to it from the relevant roadmap phase. Otherwise, keep the plan inline here.

## Focused ExecPlan Template

Use these headings for task-specific plans:

- Purpose / Big Picture
- Progress
- Surprises & Discoveries
- Decision Log
- Outcomes & Retrospective
- Context and Orientation
- Plan of Work
- Concrete Steps
- Validation and Acceptance
- Idempotence and Recovery
- Interfaces and Dependencies
- Artifacts and Notes

`Progress` should use checkboxes and should be updated at every stopping point.
`Decision Log` should capture the decision, rationale, date, and author.
`Validation and Acceptance` should name the commands to run and the observable
behavior that proves the work is complete.

## Product North Star

Ripple is a local-first desktop app for creating short motion graphics through
plain-English prompts and frame-anchored comments instead of manual After
Effects workflows or developer tooling.

Ripple should combine:

- the strongest parts of the existing 1Code desktop/chat/agent/revision
  foundation
- a Ripple-specific motion-graphics shell
- native HyperFrames project creation, editing, preview, comments, revisions,
  and export
- optional provider/account setup that never blocks local app entry

Ripple is not "1Code with a custom preview tab."

## Users And Jobs

Primary users:

- motion designers who want faster iteration without building everything by hand
- video editors and marketers making short social or brand motion pieces
- indie founders who need polished product videos without hiring a full motion
  team for every change
- agency teams producing title cards, lower thirds, explainers, promos, and
  presentation motion graphics

User jobs:

- describe a title card, lower third, promo, intro, transition, or explainer
  scene in plain English
- ask for text, timing, layout, color, asset, and animation changes
- leave frame/time/element-specific comments the way they would in a review tool
- preview quickly enough to keep creative flow
- export a usable video without hand-coding or learning a developer workflow

## Success Definition

A successful first session lets a user create or open a Ripple project, describe
a short motion graphic, iterate through chat or frame-anchored comments, and
export a usable 1080p MP4. The output should look professional enough for a real
draft, and the user should not need to understand Git, worktrees, repos,
dependency installs, Node, FFmpeg, or HyperFrames internals.

Ripple succeeds when it feels like motion-design assistance, not a wrapped code
editor. The agent should handle structured video markup, timing, assets, and
rendering details while the user stays in creative language.

## Non-Negotiables

- HyperFrames is the video framework and source of truth.
- Local use must not require sign-in, provider selection, GitHub, repo setup, or
  manual dependency installation.
- The primary path is Create project or Open project, not Connect repo,
  Clone repo, or Select repository.
- Default projects live at `~/Ripple/<project-name>`.
- Ripple hides Git, worktrees, dependency setup, Node/FFmpeg troubleshooting,
  and developer tooling unless something is broken or the user opens an
  advanced/debug surface.
- The shipped product must remove primary-path `1Code`, `21st.dev`, upstream
  auth/update/service assumptions, and Remotion/generic app-preview assumptions.
- Agents must operate on HyperFrames HTML compositions, assets, timing data, and
  GSAP timelines, not React/Remotion scene abstractions.

## MVP Scope

In scope:

- HyperFrames project creation, preview, composition discovery, and rendering
- HTML/CSS/GSAP animation authoring through agents
- plain-English chat for motion changes
- frame/time/element comments that create isolated revisions
- asset import into project-local `assets/`
- MP4 export as the default sharing path
- MOV and WebM export where HyperFrames/runtime support is validated
- preserving useful 1Code chat, provider, revision, file, and execution
  foundations while hiding developer mechanics from the primary UX

Out of scope for MVP:

- cloud sync
- multi-user realtime collaboration
- mobile apps
- full After Effects project export
- forcing users through GitHub, hosted auth, repo setup, or dependency setup
  before they can create locally

Operational constraints:

- Node.js 22+ and FFmpeg/FFprobe are required for the validated HyperFrames
  render path.
- Agent work must stay inside the active project or registered isolated
  revision context.
- HyperFrames remains the source of truth for composition structure, timeline
  semantics, preview, and render behavior.

## Current Codebase Reality

The codebase currently provides useful foundations:

- Electron + React 19 + TypeScript + Vite desktop app.
- Tailwind, Radix UI, Motion, Sonner, Lucide, Jotai, Zustand, TanStack Query.
- tRPC IPC between renderer and main process.
- SQLite + Drizzle with migrations.
- Claude Code and Codex provider paths.
- Chat/sub-chat state, streaming messages, queued sends, tool rendering.
- Git/worktree, diff, file viewer, terminal, settings, MCP/plugins,
  automations, kanban, and voice-related systems.

The codebase still conflicts with Ripple in major ways:

- Main window loading is auth-gated.
- Renderer app entry is billing/provider-gated, then repo-gated.
- Project APIs are folder/repo/GitHub oriented.
- Default clone paths still use `.21st`.
- The DB lacks Ripple domain entities.
- Preview is a sandbox/dev-server iframe, not HyperFrames Studio/player.
- Review is branch/commit/PR/diff oriented, not frame/comment/revision oriented.
- Branding and service URLs still reference 1Code and 21st.
- HyperFrames packages and runtime orchestration are not integrated yet.

## Target Tech Stack

| Layer | Target |
| --- | --- |
| Frontend | Electron + React 19 + TypeScript + Vite |
| Styling | Tailwind CSS + Radix UI + Motion + Ripple wrappers |
| State | Jotai + Zustand + TanStack React Query |
| IPC | tRPC over Electron preload bridge |
| Backend | Electron main process orchestration |
| Video | HyperFrames CLI, Studio, Player, Producer/Core where useful |
| Database | SQLite + Drizzle ORM + better-sqlite3 |
| Runtime checks | Node.js 22+, npm/bun availability, FFmpeg/FFprobe, HyperFrames doctor |
| Agents | Preserved Claude Code, Codex, API-key/custom-model flows |

## Target Project Model

A Ripple project is a HyperFrames project stored on disk and tracked in SQLite.

Default project folder:

```text
~/Ripple/<project-name>/
├── index.html
├── compositions/
├── assets/
├── hyperframes.json
├── meta.json
└── exports/
```

Project creation should automatically handle:

- top-level `~/Ripple` folder creation
- project name sanitization
- collision handling
- default scaffold/template copying
- background dependency setup
- HyperFrames validation
- optional hidden local git/snapshot initialization for revisions
- initial composition discovery
- opening the project shell with a previewable default composition

The normal path must not require the user to pick a folder.

## Target Domain Model

### Project

Fields:
`id`, `name`, `slug`, `localPath`, `aspectRatioPreset`,
`activeCompositionId`, `templateId`, `setupStatus`, `createdAt`, `updatedAt`.

Purpose:
Top-level Ripple workspace stored by default at `~/Ripple/<project-name>`.

### Composition

Fields:
`id`, `projectId`, `name`, `filePath`, `dataCompositionId`, `width`,
`height`, `parentCompositionId`, `kind`, `createdAt`, `updatedAt`.

Purpose:
HyperFrames HTML composition. `index.html` is usually the entry composition;
child compositions live under `compositions/`.

### Clip

Fields:
`id`, `compositionId`, `selector`, `type`, `trackIndex`, `startFrame`,
`durationFrames`, `assetId`, `styleSnapshot`, `timelineLabel`.

Purpose:
Timed visual or media element in a composition.

### Asset

Fields:
`id`, `projectId`, `name`, `kind`, `relativePath`, `mimeType`, `width`,
`height`, `durationMs`, `importedAt`.

Purpose:
Imported media stored under `assets/`.

### CommentThread

Fields:
`id`, `projectId`, `compositionId`, `anchorType`, `startFrame`, `endFrame`,
`elementSelector`, `screenshotPath`, `status`, `createdBy`, `createdAt`.

Purpose:
Frame/time/element review feedback attached to motion context.

### Revision

Fields:
`id`, `commentThreadId`, `projectId`, `isolatedContextPath`, `prompt`,
`provider`, `status`, `previewOutputPath`, `diffSummary`, `createdAt`,
`resolvedAt`.

Purpose:
One isolated proposal generated by an agent from a chat request or comment.

### ExportJob

Fields:
`id`, `projectId`, `compositionId`, `format`, `qualityPreset`, `outputPath`,
`status`, `errorMessage`, `createdAt`, `completedAt`.

Purpose:
HyperFrames render/export request for `MP4`, `MOV`, or `WebM`.

### AgentSession

Fields:
`id`, `projectId`, `revisionId`, `mode`, `provider`,
`conversationSummary`, `createdAt`, `updatedAt`.

Purpose:
Preserved chat/agent foundation adapted to Ripple Chat and Comment workflows.

## HyperFrames Integration Facts

Verified official docs as of April 24, 2026:

- HyperFrames requires Node.js 22+.
- Local rendering requires FFmpeg and FFprobe.
- `npx hyperframes doctor` checks environment readiness.
- `npx hyperframes preview` launches Studio with hot reload.
- `npx hyperframes compositions --json` can list compositions.
- `npx hyperframes snapshot` can capture frames/stills.
- `npx hyperframes render` renders final output.
- Documented render formats include `mp4`, `mov`, and `webm`.
- `@hyperframes/studio` exposes React components and hooks for layout,
  preview, player controls, timeline, source editor, property panel, file tree,
  element picking, and iframe/player state.
- `@hyperframes/player` is a web component that runs a composition in a
  sandboxed iframe inside Shadow DOM; editor access should go through
  `iframeElement` or Studio's `resolveIframe`.
- `@hyperframes/producer` can support programmatic render pipelines.

Open verification items:

- Pin the exact HyperFrames package versions; docs and repo release labels may
  differ.
- Verify current `hyperframes init` flags against installed `--help`.
- Verify programmatic MOV export through `@hyperframes/producer`; CLI MOV is
  documented.

Reference links to preserve from the old docs:

- [HyperFrames Introduction](https://hyperframes.heygen.com/introduction)
- [HyperFrames Quickstart](https://hyperframes.heygen.com/quickstart)
- [HyperFrames Rendering Guide](https://hyperframes.heygen.com/guides/rendering)
- [HyperFrames Prompt Guide](https://hyperframes.heygen.com/guides/prompting)
- [HyperFrames Compositions](https://hyperframes.heygen.com/concepts/compositions)
- [HyperFrames Data Attributes](https://hyperframes.heygen.com/concepts/data-attributes)
- [HyperFrames Frame Adapters](https://hyperframes.heygen.com/concepts/frame-adapters)
- [HyperFrames Templates](https://hyperframes.heygen.com/templates)
- [HyperFrames Examples](https://hyperframes.heygen.com/examples)
- [@hyperframes/studio](https://hyperframes.heygen.com/packages/studio)
- [@hyperframes/player](https://hyperframes.heygen.com/packages/player)
- [@hyperframes/producer](https://hyperframes.heygen.com/packages/producer)
- [HyperFrames GitHub Repo](https://github.com/heygen-com/hyperframes)

## HyperFrames Authoring Rules

- Compositions are HTML files, not React components.
- Root composition needs `data-composition-id`, `data-width`, and
  `data-height`.
- Timed visible elements need `class="clip"`, `data-start`, `data-duration`,
  and `data-track-index`.
- Audio clips are invisible and should not use `class="clip"`.
- Nested/external compositions use `data-composition-src`.
- Reusable external compositions use `<template>` wrappers.
- GSAP timelines must be paused and registered on `window.__timelines`.
- Use GSAP's timeline positioning argument for absolute timing.
- Do not manually control media playback.
- Do not manually nest sub-composition timelines.
- Avoid unseeded randomness, wall-clock timing, async timeline construction,
  render-time network fetches, and custom timing systems.

## Target Shell

Four primary regions:

1. Far-left project rail
   - search
   - new project
   - project list
   - settings/help/profile/footer actions

2. Assets/compositions/templates pane
   - assets
   - composition structure
   - templates
   - project files where useful
   - inspired by HyperFrames Studio `FileTree`, but styled as Ripple

3. Chat/comment pane
   - modes: `Chat` and `Comment`
   - prompting
   - frame/time revision requests
   - review context for accept/reject

4. Right editor region
   - HyperFrames preview/player
   - timeline
   - composition switcher
   - source/properties where appropriate
   - export controls
   - "Open in HyperFrames Studio" escape hatch

## Comment And Revision Workflow

Target behavior:

- User comments on a frame, time range, scene, composition, or visible element.
- Ripple captures screenshot/still, frame/range, active composition/project, and
  prompt/conversation context.
- A revision is created in an isolated context derived from the project.
- Agent runs in that isolated context.
- Multiple comment revisions can run independently.
- User previews the result and explicitly accepts or rejects it.
- Accepted revision applies cleanly to the primary project.
- Rejected revision is discarded cleanly.

Implementation constraints:

- One comment/revision request maps to one isolated context.
- Hidden backend may be worktree, snapshot, sandbox, or another reliable
  isolation mechanism.
- Do not silently fall back to editing the primary project if isolation fails.
- UI language should say comment, revision, proposal, version, accept, reject.
- Avoid branch, worktree, cherry-pick, rebase, stash, PR in primary UX.

## Export Workflow

Export is primary product functionality.

Supported formats:

- `MP4` as default for common sharing.
- `MOV` for transparent overlays/editor workflows.
- `WebM` for browser transparency/playback workflows.

Export UX must include:

- visible export entry point
- composition selection
- format selection
- quality/settings mapped to HyperFrames where possible
- output destination
- progress
- cancellation where practical
- clear errors
- success state with output path

## Roadmap

### Phase 0: Planning And Instruction Reset

Status: in progress.

Goals:

- Remove old OpenSpec/1Code agent guidance.
- Establish `AGENTS.md` as concise repository instructions.
- Establish `PLANS.md` as active roadmap/spec and execution-plan standard.
- Fold useful docs content into `AGENTS.md` and `PLANS.md` so `docs/` can be
  removed without losing product context.

Done when:

- `AGENTS.md` is Ripple-specific and practical.
- `PLANS.md` captures roadmap, constraints, acceptance criteria, and the
  self-contained task-plan format for complex work.
- No active OpenSpec instruction block remains.

### Phase 1: Local-First Boot

Goals:

- Remove mandatory auth gate from Electron window loading.
- Remove billing/provider gating from renderer app entry.
- Keep auth/provider setup optional in settings or first-agent-run flows.
- Reach a Ripple project-first shell without signing in.

Key files:

- `src/main/windows/main.ts`
- `src/main/index.ts`
- `src/main/auth-manager.ts`
- `src/renderer/App.tsx`
- `src/renderer/features/onboarding/*`
- `src/renderer/components/dialogs/*login*`

Done when:

- Fresh install opens Ripple without account/provider setup.
- Optional sign-in still works from settings or explicit user action.
- Existing provider setup state does not strand users in old gates.

### Phase 2: Ripple Project Creation

Goals:

- Replace repo-first onboarding with project-first create/open flows.
- Add `createRippleProject` service and tRPC route.
- Default to `~/Ripple/<project-name>`.
- Scaffold a previewable default HyperFrames project.
- Run background setup and environment checks.

Key files:

- `src/main/lib/trpc/routers/projects.ts`
- `src/main/lib/db/schema/index.ts`
- `src/renderer/features/onboarding/*`
- new `src/main/lib/hyperframes/*`
- new `src/main/lib/ripple-projects/*` if useful

Done when:

- User can create a project without picking a folder.
- Project is stored under `~/Ripple`.
- Scaffold contains `index.html`, `compositions/`, `assets/`, config/metadata,
  and at least one immediately previewable composition.
- Import/open existing folder exists as secondary advanced path.

### Phase 3: HyperFrames Service Layer

Goals:

- Add main-process HyperFrames orchestration.
- Add typed tRPC router for environment checks, composition discovery, preview,
  snapshot, render/export, and cancellation.
- Decide package/version pinning and project-local dependency strategy.

Candidate API:

- `hyperframes.doctor`
- `hyperframes.createProject`
- `hyperframes.listCompositions`
- `hyperframes.startPreview`
- `hyperframes.stopPreview`
- `hyperframes.getPreviewStatus`
- `hyperframes.snapshot`
- `hyperframes.render`
- `hyperframes.cancelRender`

Done when:

- Main process can validate Node 22+, FFmpeg/FFprobe, and HyperFrames readiness.
- Main process can discover compositions with structured output.
- Main process can start/stop preview per project/revision.
- Main process can render at least MP4 from a test project.

### Phase 4: Ripple Shell

Goals:

- Rework shell from workspace/chat/dev-preview to project/assets/chat-comment/
  HyperFrames editor.
- Replace or supersede sub-chat sidebar with assets/compositions/templates pane.
- Replace generic `AgentPreview` with `HyperFramesStudioPane`.
- Add active composition switching and preview refresh states.

Key files:

- `src/renderer/features/layout/agents-layout.tsx`
- `src/renderer/features/agents/ui/agents-content.tsx`
- `src/renderer/features/agents/main/active-chat.tsx`
- `src/renderer/features/sidebar/*`
- `src/renderer/features/details-sidebar/sections/files-tab.tsx`
- new `src/renderer/features/hyperframes/*`
- new `src/renderer/features/ripple-shell/*` if useful

Done when:

- Four-part layout is visible and usable.
- Preview/editor region is HyperFrames-native.
- Composition switching works.
- Preview refresh/error/sync states are clear.
- "Open in HyperFrames Studio" escape hatch exists.

### Phase 5: Comments And Revisions

Goals:

- Add comment thread and revision persistence.
- Capture frame/range/element/screenshot context.
- Create isolated revision context per comment.
- Route agent execution into registered revision contexts.
- Support preview, accept, reject, and cleanup.

Key files:

- `src/main/lib/db/schema/index.ts`
- `src/main/lib/trpc/routers/chats.ts`
- `src/main/lib/trpc/routers/claude.ts`
- `src/main/lib/trpc/routers/codex.ts`
- `src/main/lib/git/worktree.ts`
- `src/main/lib/git/security/*`
- `src/renderer/features/agents/main/active-chat.tsx`
- `src/renderer/features/agents/context/text-selection-context.tsx`
- new `src/main/lib/revisions/*`
- new `src/main/lib/trpc/routers/revisions.ts`
- new `src/renderer/features/comments/*`

Done when:

- User can leave frame/time-based comments.
- Agent receives screenshot plus frame/range/composition context.
- Revision runs in isolation.
- Multiple revisions can be reviewed independently.
- Accept applies changes; reject discards them.
- Primary UX does not expose worktree/branch language.

### Phase 6: Export

Goals:

- Add export job model and renderer UI.
- Use HyperFrames render paths.
- Support MP4, MOV, WebM.
- Validate output paths and environment readiness.

Done when:

- Export succeeds for a default project.
- Progress and errors are visible.
- Output path is recorded.
- Export can be cancelled or safely recovered from failure.

### Phase 7: Agent Prompting And Skills

Goals:

- Replace generic app/coding-scene prompts with HyperFrames-aware motion editor
  instructions.
- Bundle or install HyperFrames skills/context.
- Teach agents Ripple workflow: project, composition, clip, timeline, asset,
  comment, revision, preview, export.
- Remove Remotion/React scene guidance from motion paths.

Done when:

- Agent prompts target HTML compositions, data attributes, assets, timing, GSAP,
  and HyperFrames rules.
- Provider setup is optional until the first agent action that needs it.
- Agent filesystem access is bounded to project or revision context.

### Phase 8: Rebrand And Service Decoupling

Goals:

- Remove shipped primary-path `1Code`, `21st.dev`, `twentyfirst-agents`,
  `.21st`, upstream update URLs, upstream auth server assumptions, and upstream
  analytics product identity.
- Replace app IDs, protocols, menus, About labels, CLI names, update config, and
  user-facing strings with Ripple equivalents.
- Keep local abstractions only where useful for optional future Ripple services.

Key files:

- `package.json`
- `electron-builder.yml`
- `src/main/index.ts`
- `src/main/auth-manager.ts`
- `src/main/lib/auto-updater.ts`
- `src/main/lib/analytics.ts`
- `src/main/lib/config.ts`
- `src/main/lib/cli.ts`
- `resources/cli/*`
- `scripts/*`
- renderer icons/logo labels and settings strings

Done when:

- No shipped primary path depends on upstream branding or mandatory hosted auth.
- Optional services are clearly optional.
- Product name, app id, protocol, update channel, menus, and packaging identity
  are Ripple-owned.

### Phase 9: Hardening And Release Readiness

Goals:

- Build full automated test suites and QA coverage for Ripple.
- Harden path validation.
- Validate first-run setup.
- Validate package resources.
- Produce release checklist for Ripple.

Done when:

- Fresh install reaches project-first shell.
- New project creates and previews.
- Comment revision can be accepted/rejected.
- MP4, MOV, and WebM exports succeed in validated environments.
- Unit, integration, E2E, render/export, migration, packaging, and manual QA
  gates pass.
- Packaging no longer references missing old release scripts or 1Code assets.

## Testing Strategy

Current baseline:

- `bun run ts:check`
- manual Electron smoke tests
- existing Drizzle migration flow

Ripple should graduate from the 1Code baseline to full test suites plus a
repeatable QA protocol. Testing is a release gate, not a best-effort cleanup
task.

### Automated Test Suites

Unit tests:

- project name sanitization, slugging, and collision handling
- `~/Ripple` path resolution and filesystem boundary helpers
- HyperFrames CLI output parsing and typed error normalization
- composition discovery parsing
- export job state transitions
- revision/comment state transitions
- renderer utility logic and stores

Main-process integration tests:

- database migrations and schema defaults
- Ripple project creation and setup status updates
- HyperFrames environment checks with mocked command results
- preview lifecycle start/stop/restart
- snapshot capture orchestration
- render/export orchestration and cancellation
- path validation for imports, exports, project files, and revisions
- provider cwd resolution into registered project/revision contexts

Renderer/component tests:

- project-first onboarding
- project rail and create/open flows
- assets/compositions pane behavior
- composition switcher states
- chat/comment mode switching
- comment creation surfaces
- revision review controls
- export dialog states
- error and readiness messaging

End-to-end Electron tests:

- fresh install opens without sign-in
- create project without manually choosing a folder
- default project previews successfully
- switch active composition
- create frame/time-based comment
- run a mocked or fixture-backed revision
- preview, accept, and reject revisions
- import assets into a project
- export MP4, MOV, and WebM from a fixture project
- optional provider setup from settings or first-agent-run flow
- re-open app and restore last project state

Render/export validation:

- verify output file exists, has nonzero size, and has expected format metadata
- verify representative frame snapshots are nonblank
- verify transparent-output expectations for MOV/WebM where possible
- verify export errors are clear when Node.js 22+ or FFmpeg is missing

Packaging and release QA:

- build packaged app for supported platforms where possible
- verify migrations are included
- verify required bundled resources are included
- verify app id, product name, protocol, update URL, menu labels, and About text
  use Ripple identity
- verify no primary shipped path references `1Code`, `21st.dev`, `.21st`, or
  old release scripts

Manual QA checklist:

- fresh install
- upgrade from an older local database
- offline local use without account
- missing Node.js 22+
- missing FFmpeg/FFprobe
- failed project setup recovery
- failed preview startup recovery
- failed export recovery
- multiple simultaneous comment revisions
- reject revision cleanup
- accept revision conflict handling
- keyboard and resize behavior across the four-pane shell
- visual review of empty/loading/error states

### Suggested Tooling

Initial recommendation:

- TypeScript: keep `bun run ts:check`.
- Unit/integration: Vitest, because the app is already Vite/React/Electron and
  Vitest gives better mocking, watch mode, and DOM integration than ad hoc Bun
  tests for this stack.
- Renderer components: React Testing Library on Vitest.
- Electron E2E: Playwright with Electron support, or an equivalent Electron test
  harness.
- Render validation: FFprobe plus frame snapshot checks.
- Manual/visual QA: Codex Computer Use for packaged-app and desktop interaction
  checks, especially first-run flows, resizing, menus, dialogs, export
  progress, and failure recovery.

Bun test can still be considered later for isolated pure TypeScript utilities,
but Vitest should be the default automated test runner unless implementation
experience proves otherwise.

### Minimum Release Gate

Before a Ripple release:

- type check passes
- unit suite passes
- main-process integration suite passes
- renderer/component suite passes
- Electron E2E happy path passes
- export validation passes for MP4, MOV, and WebM on at least one validated
  local environment
- manual QA checklist is completed for fresh install and upgrade paths
- release build/package smoke passes

## Review Standards

When reviewing Ripple work, prioritize:

- local-first access without mandatory auth/provider setup
- project-first onboarding
- HyperFrames-native composition and timeline rules
- frame/time comment context capture
- isolated revision safety
- accept/reject clarity
- export reliability
- no primary-path 1Code/21st/repo/worktree leakage
- secure main-process path and process orchestration

Severity:

- High: data loss, security issue, mandatory auth regression, isolation failure,
  non-HyperFrames motion architecture, export corruption.
- Medium: broken flow, missing edge case, confusing UX language, incomplete
  environment handling.
- Low: cosmetic inconsistency, minor naming issue, missing polish.

## MVP Release Criteria

Keep this section as the project-level acceptance checklist. Work should be
driven by the roadmap phases above, not by a separate immediate-next-steps list.

Required:

- App boots to a Ripple project-first shell without sign-in.
- New project creates `~/Ripple/<project-name>` automatically.
- Default project opens with a previewable HyperFrames composition.
- Embedded editor supports composition discovery, switching, live refresh,
  player/timeline controls, and a full Studio escape hatch.
- User can create frame/time-based comments.
- Comment revisions run in isolated contexts.
- User can preview, accept, and reject revisions.
- Export succeeds for MP4, MOV, and WebM on validated environments.
- Shipped UI and packaging remove primary-path `1Code`, `21st.dev`, mandatory
  upstream auth, upstream update URLs, and generic repo-first assumptions.

Informational metrics:

- time to first preview after project creation
- preview refresh latency after agent edits
- export duration for a representative 1080p project
- failure modes from missing Node 22+ or FFmpeg
