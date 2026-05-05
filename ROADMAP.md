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
- optional Ripple account/provider setup that never blocks local app entry

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

The original foundation is still visible in advanced/internal surfaces, but the
active v1 path is now Ripple-shaped and in release-hardening mode.

Implemented foundations:

- Electron + React 19 + TypeScript + Vite desktop app.
- Tailwind, Radix UI, Motion, Sonner, Lucide, Jotai, Zustand, TanStack Query.
- tRPC IPC between renderer and main process.
- SQLite + Drizzle with migrations.
- Claude Agent SDK and Codex App Server provider paths.
- Git/worktree, diff, file viewer, terminal, settings, MCP/plugins,
  automations, kanban, and voice-related systems retained as secondary or
  internal foundations where they still serve Ripple.

Implemented Ripple v1 surfaces:

- Local-first app entry and project-first onboarding without mandatory sign-in,
  provider setup, GitHub, repo setup, or billing gates.
- `~/Ripple/<project-name>` project creation, scaffold, metadata, lifecycle,
  hidden setup config, and app-managed HyperFrames context.
- Main-process HyperFrames project, preview, composition discovery, timeline,
  snapshot, template, frame-sheet, and render/export services.
- Center-stage Ripple shell with project rail, assets/compositions/templates
  pane, HyperFrames preview/timeline/export surface, and right chat/comment
  pane.
- Frame/time comments, isolated revisions/proposals, accept/reject/delete/
  restore flows, active conversation tabs, and activity badges.
- Canonical Ripple conversations/messages with remaining `subChatId` names
  treated as renderer/provider compatibility identifiers.
- DB-backed export jobs and `Renders` pane for MP4, MOV, and WebM.
- Bundled HyperFrames templates, previews, app-managed agent skills/context,
  and `ripple frame-sheet` visual-context tooling.
- Ripple app identity, CLI wrappers, app icons, update config, optional
  analytics consent, first-run onboarding, and GitHub Releases app update flow.

Remaining v1 release risks:

- Phase 19 must refresh broad automated gates, packaged-resource audits,
  render/export smokes, analytics opt-in/off packaged smoke, manual QA, and
  stable-release update evidence before v1 is called ready.
- Some inherited developer-tool components remain for advanced/debug or
  compatibility paths. Primary shipped paths must continue to be audited for
  `1Code`, `21st.dev`, repo/worktree/branch/clone language, mandatory auth,
  and generic dev-preview assumptions.
- Multi-sequence/video-variant structure is parked in
  `plans/v2/sequences-and-composition-structure.md` and is not active v1 scope
  unless a validation spike explicitly promotes it.

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
- Preserve `blank` as the default starter. The older seeded example labels
  such as `warm-grain`, `play-mode`, `swiss-grid`, `kinetic-type`,
  `decision-tree`, `product-promo`, `nyt-graph`, and `vignelli` should not ship
  as generic lookalike starters unless real source templates are bundled.
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

ExecPlan: `plans/phase-2-ripple-project-creation.md`

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

ExecPlan: `plans/phase-5-hyperframes-timeline.md`

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

ExecPlan: `plans/phase-6-assets-compositions-pane.md`

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

Follow-up ExecPlan:
`plans/phase-10b-active-conversation-tabs-and-activity-badges.md`

Follow-up goals:

- Add active conversation tabs/chips inside the Ripple Chat pane so users can
  keep multiple conversations visible without digging through history.
- Treat active conversation chips as an attention set, not as permanent
  `Main`, composition, or future sequence ownership.
- Closing a chip removes it from active chats but keeps the conversation in
  history.
- Add dismissible activity badges to composition rows, and future sequence
  rows, for unacknowledged comment/revision activity such as working, changes
  ready, and needs attention.

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

ExecPlan: `plans/phase-13-agent-prompting-and-skills.md`

Goals:

- Replace generic app/coding-scene prompts with HyperFrames-aware motion editor
  instructions.
- Ship app-managed HyperFrames skills/context once with Ripple and expose them
  to every project and revision run through provider-native skill loading.
- Keep `AGENTS.md` and `CLAUDE.md` as short user-editable project notes rather
  than Ripple's primary app system prompt.
- Teach agents Ripple workflow: project, composition, clip, timeline, asset,
  comment, revision, preview, export.
- Remove Remotion/React scene guidance from motion paths.

Done when:

- Agent prompts target HTML compositions, data attributes, assets, timing, GSAP,
  and HyperFrames rules.
- Provider setup is optional until the first agent action that needs it.
- Agent filesystem access is bounded to project or revision context.
- Existing projects are checked, not mutated, on open; project-note setup and
  project skill installation are explicit actions.

### Phase 14: Visual Context CLI And Frame Sheets

ExecPlan: `plans/phase-14-agent-visual-context.md`

Goals:

- Lean on the broader HyperFrames CLI and skills for native motion-project
  tooling, including preview, inspect, validation, rendering, and screenshots.
- Add a small Ripple CLI command for frame sheets so agents and humans can
  sample a composition across time with one command.
- Let agents choose from both tool families directly: HyperFrames for native
  project tooling and Ripple for frame sheets.
- Expose both CLI tool families to normal chat agents and comment-generated
  change agents in their active project or generated-change workspace.
- Automatically attach a current-frame still to new comments by calling the
  same HyperFrames snapshot path.
- Support time-range comments by calling the Ripple frame-sheet utility with a
  small default sample count.
- Bundle the screenshot/frame-sheet workflow as agent skill/context so Codex,
  Claude Code, Codespaces, and in-app agents know when and how to use it.

Done when:

- `ripple frame-sheet` can generate a contact sheet from a HyperFrames project
  using explicit timestamps, a time range plus sample count, a time interval, or
  a frame interval.
- The command writes a sheet image and manifest under project-local `.ripple`
  output and can print machine-readable JSON for agents.
- The Ripple CLI has a stable dev/test entrypoint and packaged wrapper, and
  app-run agents get a shared tool environment that exposes both HyperFrames
  and Ripple commands.
- `ripple frame-sheet` is workspace-bounded when launched from Ripple agent
  runs, so `--dir` and generated outputs stay inside the validated active
  project or revision workspace.
- Active-composition screenshot behavior is verified before automatic comment
  visuals ship; Ripple does not silently capture the wrong composition.
- New comments can automatically include a current-frame screenshot captured
  through HyperFrames snapshot.
- Comment visuals captured from generated-change workspaces are copied to the
  canonical project root and sent to providers through runtime-only attachment
  loading, not base64 transcript history.
- Range comments can generate a compact default frame sheet after the
  current-frame path is stable.
- Agent-facing docs or skills explain the broader HyperFrames CLI surface and
  `ripple frame-sheet`, allowing agents to choose the tool that fits the task.
- Chat and comment-generated-change agents can resolve and run the app-managed
  HyperFrames CLI and Ripple CLI from validated project/revision contexts.
- Generated frame sheets, comment visuals, and transient snapshot intermediates
  are ignored or excluded from generated-change proposal diffs.
- Primary UI keeps this understandable as screenshots, current frames, and frame
  sheets without exposing worktree, branch, or artifact-system terminology.

### Phase 15: Rebrand And Service Decoupling

ExecPlan: `plans/phase-15-rebrand-and-service-decoupling.md`

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

### Phase 16: Analytics Setup

ExecPlan: `plans/phase-16-analytics-setup.md`

Goals:

- Define Ripple-owned analytics events for product health, onboarding completion,
  project creation/opening, preview readiness, comment/revision actions, export
  attempts, export success/failure, and first-run setup failures.
- Keep analytics optional, privacy-conscious, and non-blocking for local use.
- Remove or replace inherited analytics endpoints, event names, product IDs, and
  identity assumptions with Ripple-owned configuration.
- Add explicit consent, disablement, and local-development behavior so analytics
  never gates project creation, preview, comments, review, or export.
- Publish a plain-language analytics transparency artifact, preferably in the
  GitHub repo and optionally mirrored to a Gist, that the onboarding screen can
  open from a "Let me show you" link.
- Keep PostHog official-build wiring disabled until the event map, transparency
  docs, main-owned consent store, sanitizer, forbidden-payload tests, and legacy
  helper quarantine are in place.

Key files:

- `src/main/lib/analytics.ts`
- `src/main/lib/config.ts`
- `src/main/index.ts`
- `src/renderer/features/settings/*`
- `src/renderer/features/onboarding/*`

Done when:

- Ripple has a documented analytics event map and no primary-path event still
  reports as `1Code`, `21st.dev`, or upstream product identity.
- Analytics initializes only when configured and permitted, and failures are
  logged without interrupting local workflows.
- First-launch analytics is not marked as remotely captured while analytics is
  disabled or unconfigured; the first permitted capture remains measurable or
  local first-run state is tracked separately.
- Users can understand and change analytics consent from settings or onboarding.
- Renderer code does not initialize its own analytics provider; analytics
  capture goes through the main-process consent, allowlist, and sanitizer path.
- Analytics is off by default, profile/email/update preferences are separate
  from analytics consent, and analytics payloads never include project files,
  prompts, agent conversations, comments, media, exports, local file paths, or
  user email.
- For v1, opted-in weekly update emails can be captured in PostHog through a
  dedicated contact path, separate from anonymous analytics and without adding a
  full account backend.
- Anonymous analytics and email contact capture use separate identities
  (`anon:<installId>` and `contact:<id>` or equivalent) and are never identified,
  aliased, or merged.
- Remote crash/error reporting is off by default. Official builds do not set a
  Sentry DSN unless a separate explicit crash-reporting opt-in and sanitized
  exception extras exist.
- Development, test, and packaged-app builds have predictable analytics behavior.

### Phase 17: Onboarding Screen

ExecPlan: `plans/phase-17-onboarding-screen.md`

Goals:

- Replace inherited repo/provider-first onboarding with a compact Ripple
  first-run dialog over project entry that first offers optional Ripple
  profile/email/update preferences and analytics consent, then leads into
  creating or opening a motion project.
- Let users create their first project under `~/Ripple/<project-name>` without
  mandatory account creation, GitHub, provider setup, dependency knowledge, or
  repo terms.
- Offer optional setup paths for Codex/Claude connections, analytics consent,
  and advanced project import without blocking local preview and export basics.
- Let users optionally save a local Ripple profile/email preference, optionally
  request weekly app update emails, optionally allow automatic in-app update
  checks, and skip all of them without losing local app access. Do not describe
  v1 email capture as account creation unless a real Ripple account endpoint is
  implemented.
- Capture opted-in weekly update emails for v1 through the Phase 16 PostHog
  contact path, while leaving full hosted accounts for a later backend phase.
- Use motion-design language and visual affordances that lead into templates,
  compositions, preview, comments, revisions, and export.

Key files:

- `src/renderer/features/onboarding/*`
- `src/renderer/App.tsx`
- `src/renderer/features/projects/*`
- `src/main/lib/trpc/routers/projects.ts`
- `src/main/lib/ripple-projects/*`

Done when:

- Fresh install shows a compact first-run dialog over `ProjectEntryPage`, with
  clear Create Project and Open Existing Project actions visible as the
  destination once the dialog is continued or skipped.
- Completing onboarding creates or opens a project and reaches the primary Ripple
  shell without mandatory account/provider setup.
- Optional Ripple profile/email, weekly update emails, automatic in-app update
  checks, provider setup, and analytics steps can be skipped, revisited from
  settings, and do not strand returning users.
- Weekly update email capture works when explicitly enabled and is visibly
  separate from anonymous product analytics.
- The analytics toggle is off by default and links to the Phase 16 public
  transparency artifact.
- Claude/Codex readiness cards are optional, fail open, and do not auto-start
  provider setup until the user explicitly chooses to connect.
- Provider card language is motion-user-friendly; Terminal, OAuth, API-key, and
  command-copy setup details appear only after the user chooses to connect.
- Onboarding copy avoids repo, branch, clone, worktree, dependency install, and
  developer-tool language in the primary path.

### Phase 18: App Updates

ExecPlan: `plans/phase-18-app-updates.md`

Goals:

- Turn Ripple's Electron update plumbing into a complete user-facing app update
  flow for packaged builds.
- Let users check for updates, see release context, download an update, choose
  when to restart/install, and recover from failed or interrupted updates
  without learning release artifacts or update feeds.
- Validate stable and beta update channels against electron-builder GitHub
  Releases metadata, product IDs, protocols, signing identity, and artifact names
  established in Phase 15.
- Use public GitHub Releases on `conmeara/ripple` as the default Phase 18
  release/update source, electron-builder's GitHub provider for generated update
  metadata, and GitHub Actions as the official build and publish path.
- Start with a manually triggered GitHub Actions release workflow that produces
  signed/notarized draft artifacts for inspection, then publish a
  beta/prerelease update candidate for real in-app N-to-N+1 validation before
  stable publication; tag-push automation can be added after the release gate is
  proven.
- Keep update checks optional and non-blocking. Update failures must not block
  local project creation/opening, preview, comments, revisions, or export.
- Add clear packaged-build QA for macOS first, then Windows and Linux as their
  release targets are prepared.

Key files:

- `src/main/lib/auto-updater.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/components/update-banner.tsx`
- `src/renderer/lib/hooks/use-update-checker.ts`
- `src/renderer/lib/hooks/use-just-updated.ts`
- `src/renderer/components/dialogs/settings-tabs/agents-beta-tab.tsx`
- `scripts/generate-update-manifest.mjs` as legacy/fallback only if the
  electron-builder GitHub provider cannot cover the release path
- `electron-builder.yml`
- `package.json`

Done when:

- A packaged Ripple build can discover a newer packaged Ripple build from a
  Ripple-owned GitHub Releases update feed or documented equivalent.
- Users can manually check, download, and restart to install an update from the
  app UI.
- Downloaded updates show a ready-to-restart state and require an explicit
  `Restart to update` action; the renderer does not auto-install or restart
  from a ready-state effect.
- The update UI shows useful release/version state and handles unavailable,
  failed, cancelled, already-downloaded, and restart-required states.
- App update controls live in a first-class App Updates settings surface or
  equivalent Ripple-labeled section with manual checks, automatic checks, Early
  Access, version state, release notes/date, and recoverable errors.
- Stable is the default channel. Beta is an opt-in Early Access channel in
  settings, persists safely, and never enables legacy upstream feeds.
- Automatic update checks are a separate persisted preference from weekly email
  updates and default off for the first release unless the user opts in; manual
  checks remain available.
- GitHub Actions can build, sign/notarize, and attach stable/beta release
  artifacts plus electron-builder update metadata to GitHub Releases.
- The official release path uses electron-builder GitHub publishing metadata;
  the generic manifest script is explicitly fallback-only and is not required
  by normal packaged update checks.
- GitHub release publishing uses the built-in Actions `GITHUB_TOKEN` with
  explicit release permissions where possible. Any maintainer tokens and Apple
  signing/notarization credentials live only in ignored local env files or
  GitHub Actions secrets, never in app runtime code or packaged resources.
- Update installation is validated from an older signed/notarized macOS build to
  a newer reachable published beta/prerelease build entirely inside Ripple, with
  Windows and Linux expectations documented if those platforms are not yet
  release-ready.
- Failed update checks or downloads are logged and recoverable without blocking
  local Ripple workflows.

### Phase 19: Hardening And Release Readiness

ExecPlan: `plans/phase-19-hardening-and-release-readiness.md`

Release checklist: `docs/release/v1-release-checklist.md`

Current release target: `v0.19` (`package.json` version `0.19.0`).

Goals:

- Build full automated test suites and QA coverage for Ripple.
- Harden path validation.
- Validate first-run setup.
- Validate package resources.
- Finish analytics release validation with a packaged-app smoke against the
  Ripple PostHog project.
- Ship packaged exports with an app-managed headless browser, not a dependency
  on the user's Puppeteer cache or repo checkout.
- Produce release checklist for Ripple.

Done when:

- Fresh install reaches project-first shell.
- New project creates and previews.
- Comment revision can be accepted/rejected.
- MP4, MOV, and WebM exports succeed in validated environments.
- Packaged UI export can produce an MP4 from the Renders pane using packaged
  resources.
- Official GitHub Actions release workflow verifies signed/notarized macOS
  artifacts, packaged export-browser resources for arm64 and x64, and update
  metadata before uploading draft release assets.
- Unit, integration, E2E, render/export, migration, packaging, and manual QA
  gates pass.
- Packaged app update install flow passes the Phase 18 release gate.
- Packaged official-build analytics smoke passes with explicit opt-in: PostHog
  receives only documented, sanitized Ripple events; analytics-off captures
  nothing; weekly update email capture stays on the dedicated contact identity;
  no files, paths, prompts, messages, comments, media, export paths, or raw IDs
  appear in captured payloads.
- Packaging no longer references missing old release scripts or 1Code assets.
- `docs/release/v1-release-checklist.md` is current and maps every release
  requirement, command, artifact audit, and manual QA item to inspected
  evidence.

## Testing Strategy

Current baseline after Phase 19 local audit:

- `bun run ts:check`
- `bun run test:quality`
- `bun run test:ux`
- `bun run test:agent`
- `bun run test:export`
- `bun run test:e2e`
- `bun run test:visual`
- `bun run test:live` as an opt-in credentialed provider smoke
- `bun run test:ripple`
- `bun run test:hyperframes`
- `bun test`
- `bun run db:generate`
- `bun run build`
- `bun run package` for local packaged-resource smoke
- `bun run test:release`
- `bun run test:package:smoke` verifies Ripple identity, app-managed CLIs, and
  the packaged export browser
- Official GitHub Actions release run `25388403839` passed for draft
  `v0.19.0`: staging, build, signing/notarization, packaged export-browser
  architecture verification, `codesign` / `spctl` / `stapler`, update metadata,
  GitHub Release upload, and workflow artifact upload
- Playwright Electron artifacts for launch, onboarding, project creation,
  template creation, existing-project open, comments, stored visual context,
  preview shell, resize/keyboard controls, and Renders pane workflows
- Comment visual capture now has focused regression coverage for
  symlink-resolved macOS project paths so app-generated frames are validated
  against real project/source roots without rejecting `/var` to `/private/var`
  resolutions.
- Packaged app smoke evidence now covers production analytics off/on, blank
  project preview/comment/MP4 export, and bundled-template comment flow
- remaining release evidence still needed for update N-to-N+1, revisions,
  failure recovery, provider setup prompts, offline local use, reload /
  composition-switch preview checks, and optional packaged MOV/WebM UI export

Ripple should graduate from the 1Code baseline to full test suites plus a
repeatable QA protocol. Testing is a release gate, not a best-effort cleanup
task.

Quality platform artifacts:

- `plans/quality-regression-platform.md`
- `docs/testing/ux-workflow-coverage.md`
- `docs/testing/agent-closeout.md`
- `docs/testing/README.md`
- `test/quality/`
- `test/fixtures/hyperframes/basic-title-card/`
- `test/e2e/`
- `scripts/verify-ripple-quality-platform.mjs`
- `scripts/smoke-packaged-ripple.mjs`
- `scripts/smoke-ripple-export-formats.ts`
- `scripts/smoke-live-provider.mjs`
- `scripts/stage-export-browser.mjs`
- `.github/workflows/ripple-quality.yml`

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
- Electron E2E: Playwright with Electron support, launched against the built
  Electron app with isolated temporary homes and retained screenshots/traces on
  failure.
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
- quality platform verification passes
- UX workflow sweep passes
- agent/runtime workflow sweep passes
- HyperFrames/export workflow sweep passes
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
