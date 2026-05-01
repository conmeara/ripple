# Ripple Roadmap

Active roadmap and migration specification for rebuilding this repository from
the 1Code desktop/chat/agent foundation into Ripple.

For the reusable ExecPlan standard, read `PLANS.md`. Phase-specific plans live
under `plans/` and should link back to the roadmap phase they implement. Update
this file when product direction, scope, acceptance criteria, or roadmap phases
change.

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
- Core local use must not require sign-in, provider selection, GitHub, repo
  setup, or manual dependency installation. Agent-backed creation and editing
  may require the user to configure a Codex or Claude connection, but that setup
  must happen from settings or the first agent action instead of blocking app
  launch, project creation/opening, preview, comments and review, asset import,
  or export.
- The primary path is Create project or Open project, not Connect repo,
  Clone repo, or Select repository.
- Default projects live at `~/Ripple/<project-name>`.
- Ripple hides Git, worktrees, dependency setup, Node/FFmpeg troubleshooting,
  and developer tooling unless something is broken or the user opens an
  advanced/debug surface.
- The shipped product must remove primary-path `1Code`, `21st.dev`, upstream
  auth/update/service assumptions, and Remotion/generic app-preview assumptions.
- Ripple does not need to migrate shipped 1Code users or their local databases.
  Prefer clean Ripple-native schema, migrations, and naming over compatibility
  with old local 1Code rows.
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
- forcing users through GitHub, hosted auth, repo setup, provider setup, or
  dependency setup before they can create, preview, review, or export locally

Operational constraints:

- Node.js 22+ and FFmpeg/FFprobe are required for the validated HyperFrames
  render path.
- Ripple should satisfy render/runtime prerequisites through app-managed bundled
  tools or guided app-level readiness, not per-project manual dependency setup.
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
- Legacy chat/sub-chat state, streaming messages, queued sends, tool rendering.
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
| Runtime checks | Node.js 22+, npm/bun availability, FFmpeg/FFprobe, HyperFrames doctor, optional Docker for deterministic renders |
| Agents | Codex App Server and Claude Agent SDK as primary providers, with explicit local provider connections |

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
- default 1080p 30fps scaffold/template copying, while preserving metadata hooks
  for later width, height, and FPS changes
- automatic local Git initialization at the Ripple project root, hidden from
  normal UX, so revisions, history, proposal review, and future project
  recovery features have a durable substrate
- background dependency setup
- HyperFrames validation
- initial composition discovery
- opening the project shell with a previewable default composition
- project lifecycle actions: archive/hide, remove from Ripple without deleting
  files, and move project files to Trash with explicit confirmation

The normal path must not require the user to pick a folder.

## Target Domain Model

### Project

Fields:
`id`, `name`, `slug`, `localPath`, `aspectRatioPreset`,
`activeCompositionId`, `templateId`, `setupStatus`, `archivedAt`, `createdAt`,
`updatedAt`.

Purpose:
Top-level Ripple workspace stored by default at `~/Ripple/<project-name>`.

### Composition

Fields:
`id`, `projectId`, `name`, `filePath`, `dataCompositionId`, `kind`, `width`,
`height`, `durationSeconds`, `templateId`, `createdAt`, `updatedAt`.

Purpose:
HyperFrames motion document. The default entry composition is usually backed by
`index.html`; additional reusable composition files can live under
`compositions/`. A lower third, title card, CTA, chart, caption layer, or
product-shot module is a composition. `Main` refers to the primary
project/worktree, not a composition name.

### Clip

Fields:
`id`, `compositionId`, `selector`, `type`, `trackIndex`,
`startFrame`, `durationFrames`, `assetId`, `styleSnapshot`, `timelineLabel`.

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
`id`, `projectId`, `compositionId`, `conversationId`,
`anchorType`, `startFrame`, `endFrame`, `elementSelector`, `screenshotPath`,
`status`, `createdBy`, `createdAt`.

Purpose:
Frame/time/element review feedback attached to motion context. A comment is the
compact review surface for a conversation: the card shows the user comment,
agent response/proposal status, reply, delete, accept, and open-in-chat actions.

### Conversation

Fields:
`id`, `projectId`, `compositionId`, `commentThreadId`,
`revisionId`, `kind`, `title`, `summary`, `status`, `createdAt`, `updatedAt`,
`archivedAt`, `deletedAt`.

Purpose:
One user-facing chat thread. Conversations replace the inherited 1Code
`chat`/`sub_chat` split in Ripple's target architecture. A conversation can be a
normal project chat, the expanded chat behind a frame comment, a revision/proposal
conversation, an export support conversation, or a support/debug conversation.
The UI may still say "Chat", but code should prefer `Conversation` for new
Ripple flows.

### ConversationMessage

Fields:
`id`, `conversationId`, `agentRunId`, `role`, `partsJson`, `body`, `metadataJson`,
`createdAt`.

Purpose:
Canonical transcript storage for project chat, comment replies, agent responses,
tool summaries, and generated-change messages. The old physical
`sub_chats.messages` storage is retired from the active Ripple schema; existing
renderer/provider compatibility identifiers such as `subChatId` should map to
conversation IDs until those names can be safely cleaned up without changing
the visible chat UX.

### Revision

Fields:
`id`, `commentThreadId`, `conversationId`, `projectId`, `isolatedContextPath`,
`prompt`, `provider`, `status`, `previewOutputPath`, `diffSummary`, `createdAt`,
`resolvedAt`.

Purpose:
One isolated proposal generated by an agent from a chat request or comment.
Worktrees/snapshots belong to revisions/proposals, not to conversations or
legacy sub-chats.

### ExportJob

Fields:
`id`, `projectId`, `compositionId`, `format`, `qualityPreset`, `outputPath`,
`status`, `errorMessage`, `createdAt`, `completedAt`.

Purpose:
HyperFrames render/export request for a composition as `MP4`, `MOV`, or `WebM`.

### AgentSession / AgentRun

Fields:
`id`, `projectId`, `conversationId`, `revisionId`, `mode`, `provider`,
`status`, `providerThreadId`, `providerSessionId`, `conversationSummary`,
`createdAt`, `updatedAt`.

Purpose:
Preserved chat/agent foundation adapted to Ripple conversation, comment, and
revision workflows. Agent execution is separate from transcript storage:
conversations own messages, revisions own proposal workspaces, and agent runs
own provider execution state.

## HyperFrames Integration Facts

Verified official docs as of April 26, 2026:

- HyperFrames requires Node.js 22+.
- Local rendering requires FFmpeg and FFprobe.
- `npx hyperframes doctor` checks environment readiness.
- `npx hyperframes preview` launches Studio with hot reload.
- `npx hyperframes compositions --json` can list compositions reachable from
  `index.html`.
- `npx hyperframes snapshot` can capture frames/stills.
- `npx hyperframes render` renders final output.
- Current CLI package docs use `npx hyperframes init <name> --example blank`
  for agent-friendly scaffolding and describe agent mode as non-interactive by
  default. The Quickstart still mentions `--non-interactive --example blank`, so
  installed CLI flags must be verified with `--help` before implementation.
- `npx skills add heygen-com/hyperframes` installs HyperFrames agent skills for
  composition authoring, CLI commands, and GSAP animation context.
- HyperFrames calls built-in scaffolds "examples" in current CLI docs. Ripple
  can still say templates/starters in user-facing UI.
- Documented render formats include `mp4`, `mov`, and `webm`.
- Documented render settings include format, fps, quality presets, CRF,
  bitrate, workers, max concurrent renders, GPU, HDR, and Docker mode.
- Local render mode uses the system FFmpeg and is best for iteration; Docker
  mode is optional and useful for deterministic CI or agent-driven rendering.
- `@hyperframes/studio` exposes React components and hooks for layout,
  preview, player controls, timeline, source editor, property panel, file tree,
  element picking, and iframe/player state.
- Studio preview uses the same runtime path as rendering and watches
  `index.html` plus referenced sub-compositions for hot reload.
- `@hyperframes/player` is a web component that runs a composition in a
  sandboxed iframe inside Shadow DOM; editor access should go through
  `iframeElement` or Studio's `resolveIframe`.
- `@hyperframes/core` provides parsing, HTML generation, composition metadata
  extraction, validation/linting, runtime helpers, and schemas that can support
  Ripple's assets/compositions pane and future timeline models.
- `@hyperframes/producer` can support programmatic render pipelines.
- Current npm registry/install checks on April 30, 2026 showed `hyperframes`,
  `@hyperframes/player`, `@hyperframes/studio`, `@hyperframes/core`, and
  `@hyperframes/producer` all available at `0.4.40`; Ripple pins the
  HyperFrames package family to one exact version when adopting the scoped
  packages.

Open verification items:

- Verify the installed lockfile package versions before each implementation
  pass; this checkout previously had `hyperframes@0.4.28` installed while npm
  had advanced to `0.4.30`.
- Verify current `hyperframes init` flags against installed `--help`.
- Decide how Ripple bundles or copies an offline GSAP/runtime source for
  generated scaffolds, because official examples commonly show CDN scripts but
  Ripple must not fetch scripts at preview or render time.
- Verify programmatic MOV export through `@hyperframes/producer`; CLI MOV is
  documented.
- Decide whether Ripple should bundle HyperFrames skills itself, call
  HyperFrames init, or manage an app-owned skill/context layer.

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
- [@hyperframes/core](https://hyperframes.heygen.com/packages/core)
- [@hyperframes/producer](https://hyperframes.heygen.com/packages/producer)
- [HyperFrames GitHub Repo](https://github.com/heygen-com/hyperframes)

## HyperFrames Authoring Rules

- Compositions are HTML files, not React components.
- Composition roots need `data-composition-id`, `data-width`, and
  `data-height`.
- Timed visible elements need `class="clip"`, `data-start`, `data-duration`,
  and `data-track-index`.
- Audio clips are invisible and should not use `class="clip"`.
- Nested/external compositions use `data-composition-src`.
- Reusable external compositions use `<template>` wrappers.
- Every composition should register a finite GSAP timeline on
  `window.__timelines` with the exact `data-composition-id` key.
- GSAP timelines must be paused.
- Use GSAP's timeline positioning argument for absolute timing.
- Do not manually control media playback.
- Do not manually nest sub-composition timelines.
- Avoid unseeded randomness, wall-clock timing, async timeline construction,
  render-time network fetches, and custom timing systems.

## Templates And Bundled Context

- Project creation should keep a blank/default option that is immediately
  previewable and demonstrates the HyperFrames composition model.
- Ripple should offer one user-facing template gallery from project creation and
  new composition creation. The gallery is filtered by context, but users should
  not need to understand "project template" versus "composition template".
  Choosing a template must be optional; blank remains a first-class starter.
- Ripple should support a template library built on HyperFrames conventions:
  lower thirds, title cards, transitions, social overlays, data visualizations,
  and product promos.
- Source candidates include official online HyperFrames templates plus
  templates/examples from the HyperFrames GitHub repo, curated into an
  app-owned local bundle rather than fetched at authoring or render time.
- Preserve the useful starter/example names from the old docs as candidate
  seed templates: `warm-grain`, `play-mode`, `swiss-grid`, `kinetic-type`,
  `decision-tree`, `product-promo`, `nyt-graph`, `vignelli`, and `blank`.
- Users should be able to preview, create, or scaffold templates inside Ripple
  without touching the CLI. The preview UI should make aspect ratio, duration,
  category, and basic motion feel visible before creation.
- Ripple should bundle HyperFrames-aware agent context, skills, and template
  assets so users are not blocked on manual setup before the agent can work.
- HyperFrames supplies behavior, editing model, timeline semantics, and panel
  structure. Ripple supplies product workflow, visual chrome, project language,
  comments, revisions, and export UX.

## Target Shell

Center-stage shell with toggleable context panels:

1. Far-left app sidebar
   - search
   - new project
   - project list
   - settings/help/profile/footer actions
   - Codex-inspired project/chat navigation density

2. Compositions/assets/templates panel
   - compositions
   - assets
   - templates
   - project files where useful
   - inspired by HyperFrames Studio `FileTree`, but styled as Ripple
   - visible or hidden through top-right panel toggles and keyboard shortcuts
   - when hidden, disappears and lets the center editor expand rather than
     becoming an overlay drawer

3. Center editor region
   - HyperFrames preview/player
   - timeline
   - composition switcher
   - source/properties where appropriate
   - export controls
   - "Open in HyperFrames Studio" escape hatch

4. Right review pane
   - Frame.io-style mode switcher for `Chat` and `Comments`
   - vertical three-dot utility control next to `Comments`
   - chat history selection
   - prompting and frame/time comments
   - review context for accept/reject
   - existing details, files, changes, plan, terminal, MCP, and other widgets
     retained as secondary utility modes inside the same right pane, not as
     equal permanent columns

## Comment And Revision Workflow

Target behavior:

- User comments on a frame, time range, scene, composition, or visible
  element.
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

Status: complete as of 2026-04-24.

Goals:

- Remove old OpenSpec/1Code agent guidance.
- Establish `AGENTS.md` as concise repository instructions.
- Establish root `PLANS.md` as the ExecPlan standard.
- Establish `ROADMAP.md` as active roadmap/spec.
- Fold useful docs content into `AGENTS.md` and `ROADMAP.md` so `docs/` can be
  removed without losing product context.

Done when:

- `AGENTS.md` is Ripple-specific and practical.
- `PLANS.md` defines the self-contained task-plan format for complex work.
- `ROADMAP.md` captures roadmap, constraints, and acceptance criteria.
- No active OpenSpec instruction block remains.

### Phase 1: Local-First Boot

ExecPlan: `plans/phase-1-local-first-boot.md`

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

- Fresh install opens Ripple for project creation/opening and preview without
  account/provider setup.
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
- Motion runtime setup is app-managed: normal users are not asked to install or
  understand Node, FFmpeg, FFprobe, HyperFrames, or GSAP.
- Import/open existing folder exists as secondary advanced path.
- User can archive projects, restore archived projects, remove a project from
  Ripple without deleting files, and move project files to Trash through a
  guarded destructive action.

### Phase 3: HyperFrames Service Layer

ExecPlan: `plans/phase-3-hyperframes-service-layer.md`

Goals:

- Add main-process HyperFrames orchestration.
- Add typed tRPC router for environment checks, composition discovery, preview,
  snapshot, render/export, and cancellation.
- Decide package/version pinning and app-managed bundled runtime strategy.

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

- Main process can validate Node 22+, FFmpeg/FFprobe, and HyperFrames readiness
  from app-managed/bundled tools before falling back to system tools.
- Main process can discover compositions with structured output.
- Main process can start/stop preview per project/revision.
- Main process can render at least MP4 from a test project.

### Phase 4: HyperFrames Preview Player

ExecPlan: `plans/phase-4-hyperframes-preview-player.md`

Goals:

- Build a HyperFrames-native preview player inside the existing preview-pane
  pattern, instead of replacing the whole shell at once.
- Adopt official HyperFrames packages as the target architecture through a
  Ripple-owned adapter: `@hyperframes/player` for preview,
  `@hyperframes/core` for metadata, selective `@hyperframes/studio` primitives
  for later timeline/editor behavior, and the CLI preview server as the local
  serving/hot-reload backbone until the direct player path is validated.
- Replace generic CodeSandbox-style `AgentPreview` assumptions for Ripple
  projects with `HyperFramesPreviewPlayer`.
- Show clear loading, ready, refresh, stopped, and error states using Ripple's
  current UI style.
- Keep assets/compositions pane, right chat/comment sidebar, and full shell
  migration out of this phase.

Key files:

- `src/renderer/features/agents/main/active-chat.tsx`
- `src/renderer/features/agents/ui/agent-preview.tsx`
- `src/renderer/features/agents/ui/preview-url-input.tsx`
- `src/renderer/features/agents/ui/viewport-toggle.tsx`
- `src/renderer/features/agents/atoms/index.ts`
- `src/main/lib/trpc/routers/hyperframes.ts`
- new `src/renderer/features/hyperframes/*`

Done when:

- The existing preview pane can open a Ripple/HyperFrames project preview.
- The player shows the active HyperFrames composition with the correct aspect
  ratio and app-native preview controls.
- The selected HyperFrames package family version is documented and not mixed
  across CLI/player/core/studio packages.
- Preview start, reload, stop, and error states use Phase 3 main-process
  HyperFrames routes rather than renderer shell commands.
- The UI follows Ripple's existing component/style language.
- The implementation does not introduce the assets/compositions pane or the
  full four-part shell yet.

### Phase 5: HyperFrames Timeline

Goals:

- Add a HyperFrames-native timeline under the Phase 4 preview player.
- Reuse official HyperFrames Studio timeline/player primitives where practical,
  while keeping Ripple-owned layout, controls, visual chrome, comments, chat,
  widgets, and project language.
- Show clips, sections/scenes, tracks, ruler ticks, playhead, duration, zoom,
  and selected range using HyperFrames composition semantics.
- Drive seek/playhead state from the same preview player source as Phase 4
  instead of parsing or timing the composition independently in the renderer.
- Start read-only if that is the safest first milestone, then add guarded
  move/trim/select affordances only after source patching and project-boundary
  validation are proven.

Key files:

- `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`
- new `src/renderer/features/hyperframes/HyperFramesTimeline.tsx`
- new `src/renderer/features/hyperframes/timeline-*`
- `src/main/lib/trpc/routers/hyperframes.ts`
- `src/main/lib/hyperframes/player-source.ts`
- `src/main/lib/hyperframes/player-source-protocol.ts`
- selected `@hyperframes/studio` exports such as `Timeline`,
  `useTimelinePlayer`, `resolveIframe`, `usePlayerStore`, `liveTime`, and
  timeline helper logic if those APIs stay stable enough to consume directly

Done when:

- The preview pane shows the active composition above a Ripple-styled timeline
  similar to HyperFrames Studio's timeline surface.
- The timeline renders clips/tracks/ruler/playhead from HyperFrames runtime or
  Studio-derived metadata and stays synchronized with Phase 4 play, pause,
  seek, duration, reload, speed, and selected composition state.
- Timeline zoom and fit controls work without shifting or overlapping the
  preview player controls.
- Project file, asset, and source-patching operations, if introduced, resolve
  through project ID in the main process and never through renderer-supplied
  absolute paths.
- The implementation does not embed the full HyperFrames Studio app as the
  normal product surface.

### Phase 6: Assets And Compositions Pane

Goals:

- Replace or supersede the current chat/sub-chat list pane with
  assets and compositions for the selected Ripple project.
- Treat `subChatId` names in the current renderer as compatibility identifiers
  that resolve to project conversations, not as a nested persistence model. New
  Ripple data model work should use project conversations for chat history and
  transcripts.
- Build from HyperFrames composition discovery and project-local asset data.
- Add active composition switching that drives the Phase 4 preview player and
  Phase 5 timeline.
- Keep the current chat and right details/widgets surfaces available while this
  pane is introduced.

Key files:

- `src/renderer/features/layout/agents-layout.tsx`
- `src/renderer/features/agents/ui/agents-content.tsx`
- `src/renderer/features/sidebar/*`
- `src/main/lib/trpc/routers/hyperframes.ts`
- `src/renderer/features/hyperframes/*`
- new project-ID-safe file/asset router if needed

Done when:

- The left/middle list area shows compositions and assets in Ripple language.
- Selecting a composition updates project state and refreshes the preview
  player and timeline.
- Project file and asset reads are resolved by project ID in the main process,
  not by renderer-supplied absolute paths.
- The UI still feels like the existing app, borrowing HyperFrames structure
  without copying HyperFrames Studio styling wholesale.

### Phase 7: Ripple Shell And Review Sidebar

ExecPlan: `plans/phase-7-ripple-shell-and-review-sidebar.md`

Goals:

- Rework the broader shell from workspace/chat/dev-preview to project/assets,
  center-stage HyperFrames preview/timeline, and right chat-comment review pane.
- Move chat/comment UX into the right sidebar while preserving chat history and
  existing details/files/widgets.
- Chat history in the right pane should list project conversations while
  preserving the mature chat renderer and its message behavior.
- Add the Frame.io-style top-right panel toggles for assets/compositions and
  the right review pane.
- Add the right-pane `Chat` / `Comments` switcher plus a vertical three-dot
  utility control for Details, Files, Changes, Plan, Terminal, MCP, and similar
  secondary surfaces.

Done when:

- The HyperFrames preview player and timeline are the center-stage default for
  selected local Ripple projects, not a right preview sidebar.
- The assets/compositions panel can disappear and be restored with top-right
  panel toggles and keyboard shortcuts; hiding it expands the center editor.
- Right pane can switch between chat, comments, and secondary utility modes
  while retaining existing widgets/details surfaces.
- The preview player, timeline, and assets/compositions pane from Phases 4, 5,
  and 6 work together in the shell.
- "Open in HyperFrames Studio" escape hatch exists.

### Phase 8: Comments And Revisions

ExecPlan: `plans/phase-8-comments-and-revisions.md`

Status as of 2026-04-30: feature-complete for the local review loop after the
Phase 9 provider-runtime migration. Users can create frame/time comments,
review generated changes in isolation, return to Main, accept/delete/restore,
and continue through Chat handoff. Automatic screenshot/frame-sheet attachment
is intentionally deferred to Phase 14, and final export UX remains Phase 11.

Goals:

- Add comment thread and revision persistence.
- Capture frame/range/element context and user-provided attachments.
- Create isolated revision context per comment.
- Route agent execution into registered revision contexts.
- Support preview, accept, reject, and cleanup.
- Support recoverable comment deletion through comment filters.

Key files:

- `src/main/lib/db/schema/index.ts`
- `src/main/lib/git/worktree.ts`
- `src/main/lib/git/security/*`
- `src/main/lib/revisions/*`
- `src/main/lib/agent-runtime/generated-change-scheduler.ts`
- `src/main/lib/trpc/routers/revisions.ts`
- `src/renderer/features/comments/*`
- `src/renderer/features/ripple-shell/*`

Done when:

- User can leave frame/time-based comments.
- Agent receives frame/range/composition context and any attached files.
- Revision runs in isolation.
- Multiple revisions can be reviewed independently.
- Accept applies changes; reject discards them.
- Deleted comments can be restored from a filter.
- Primary UX does not expose worktree/branch language.

### Phase 9: Codex And Claude Code Integrations

ExecPlan: `plans/phase-9-codex-and-claude-integrations.md`

Status as of 2026-04-30: implemented for the core local Chat and
comment-generated-change paths. Codex App Server and Claude Agent SDK runs are
main-process-owned, persisted, restart-aware, attachment-aware, and bounded to
validated project or isolated workspace contexts.

Goals:

- Make Codex App Server and Claude Agent SDK the supported provider paths.
- Move provider launch, streaming, cancellation, recovery, approvals, and
  transcript persistence into a main-process `AgentRuntimeService`.
- Keep provider setup optional until a Chat or generated-change action needs it.
- Run both normal Chat and comment-generated changes inside validated project,
  chat-draft, or generated-change workspaces.
- Project provider-native events back into Chat and Comments without exposing
  provider internals in the primary motion-design workflow.
- Preserve Phase 8 review semantics while replacing hidden renderer-owned
  provider execution.

Done when:

- Codex and Claude can both run against a default Ripple project.
- Chat and comment-generated changes use the same main-process runtime model.
- Opening, closing, filtering, or remounting panes cannot duplicate or orphan
  agent runs.
- Missing-provider setup, streaming, cancellation, errors, and recovery surface
  in Ripple language.
- Attachments and visual/file references are materialized only inside validated
  workspaces.
- Runtime events write to conversation transcripts instead of introducing new
  sub-chat JSON as the target model.

### Phase 10: Conversations And Proposals

ExecPlan: `plans/phase-10-conversations-and-proposals.md`

Status as of 2026-04-30: conversations and conversation messages are canonical
for Ripple chat/comment transcripts, the visible chat renderer stays on the
mature existing ChatView path, and the physical `sub_chats` table is retired
from the active schema.

Goals:

- Make `Conversation` and `ConversationMessage` the canonical Ripple transcript
  model for project chat, comment chat, generated proposals, and future export
  support.
- Treat remaining `subChatId` names as compatibility identifiers for the
  current renderer/provider contracts, not as a persisted nested chat model.
- Do not preserve old `sub_chats` rows as a product requirement. Ripple has no
  shipped-user local database migration obligation, so schema work should prefer
  the clean conversation model over legacy transcript compatibility.
- Keep comments as compact visual conversations that can open into Chat for
  deeper follow-up.
- Keep revisions/proposals responsible for isolated generated-change
  workspaces.
- Preserve visible chat rendering while the backing model remains
  conversation-backed; defer any naming/UI cleanup until tests cover markdown,
  attachments, tool calls, streaming, history, model controls, and comment
  `Open in Chat`.

Done when:

- Comment threads and generated changes have canonical conversation IDs.
- Agent runtime transcript projection appends to `conversation_messages`.
- Project chat history can use conversation records without regressing the
  current message renderer.
- Comment lifecycle actions update the attached conversation status.
- Physical `sub_chats` storage is removed from the active schema. Remaining
  cleanup is limited to compatibility names once it can be done without a UI
  regression.

### Phase 11: Export

ExecPlan: `plans/phase-11-renders-and-export.md`

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

### Phase 12: Templates And Starters

ExecPlan: `plans/phase-12-templates-and-starters.md`

Goals:

- Curate official HyperFrames templates from the online gallery and GitHub repo
  into a Ripple-owned local template library.
- Add template metadata for name, category, aspect ratio, duration, preview
  media, required assets, source files, and compatibility/version notes.
- Add a polished template chooser for new project and new composition flows,
  with blank/default as the first-class starter and user-facing categories such
  as Social, Product, Data, Title Cards, Lower Thirds, Brand, and Overlays.
- Show fast previews for all available templates before the user creates or
  scaffolds them.
- Copy template files, assets, metadata, and runtime dependencies into the
  active project through main-process validated project paths.

Done when:

- New project creation can start from blank/default or a selected template.
- New Composition opens the same template chooser and can create valid
  HyperFrames composition files into the active project.
- New Composition selects and previews the created composition without patching
  `index.html`.
- Template previews are visible in the dialog without requiring network access
  or CLI knowledge.
- Created templates appear in the project browser, update active composition
  state as appropriate, and preview immediately.
- Template source and asset copying is project-boundary safe and does not fetch
  scripts, fonts, or media at render time.

### Phase 13: Agent Prompting And Skills

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

### Phase 14: Agent Visual Context, Screenshots, And Frame Sheets

Goals:

- Build a main-process screenshot tool that captures the active composition or
  revision preview at a requested frame, time, or selected range.
- Automatically attach the current-frame still to new comments when a comment
  is submitted from the review pane.
- Generate frame sheets for a composition or revision by sampling frames at a
  selected interval, such as every second, every 10 seconds, or across a marked
  timeline range.
- Make screenshots and frame sheets available to the agent during chat and
  comment workflows through image attachments when the provider supports vision,
  with timecode/composition metadata and text fallbacks when it does not.
- Persist screenshot and frame-sheet artifacts project-locally with database
  references, cleanup rules, size limits, and project/revision boundary checks.

Done when:

- Agent chat and comment runs can receive current visual context for the
  composition they are editing.
- New comments automatically include a screenshot thumbnail and stable
  screenshot artifact reference when preview capture is available.
- Frame sheets can be generated for the default project and for an isolated
  revision, then included in agent context.
- Screenshot and frame-sheet capture use HyperFrames snapshot/player paths and
  main-process validation rather than renderer shell commands or arbitrary
  filesystem access.
- The UI keeps this visual context understandable without exposing implementation
  terms like worktree or snapshot plumbing in primary flows.

### Phase 15: Rebrand And Service Decoupling

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

### Phase 16: Hardening And Release Readiness

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
- compositions/assets pane behavior
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

- local-first app entry and non-agent project work without mandatory
  auth/provider setup
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
- When the user asks an agent to create or edit motion work, Ripple prompts for
  a configured Codex or Claude connection if one is missing, without blocking
  the rest of the local project workflow.
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
