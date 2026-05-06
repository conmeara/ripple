# Phase 2: Ripple Project Creation

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, a user can start Ripple by creating a motion project, not by
selecting a repository. The first-run path asks for a project name, creates a
folder under `~/Ripple/<project-name>`, writes a previewable HyperFrames project
scaffold, records the project in the local database, selects it in the app, and
shows local setup readiness without requiring sign-in, GitHub, provider setup,
manual dependency installation, or folder picking.

The visible behavior is a project-first entry screen with a primary Create
Project action and a secondary Open Existing Project action. The primary path
uses Ripple language: project, composition, preview, setup, and local files.
Developer-first terms such as repository, clone, branch, worktree, and GitHub
remain out of the normal creation flow.

This phase establishes enough Ripple project structure for later phases to add
HyperFrames preview, Studio integration, comments, revisions, and export. It
does not need to implement the full HyperFrames service layer from Phase 3, the
four-pane shell from Phase 4, comment revisions from Phase 5, or export from
Phase 6.

## Progress

- [x] 2026-04-24 / Codex: Created this ExecPlan from `ROADMAP.md`, the Phase 1
  handoff plan, and current code inspection.
- [x] 2026-04-24 / Codex: Re-checked official HyperFrames docs for CLI
  scaffolding, composition structure, Studio preview, GSAP timelines, and
  linting requirements; updated this plan with the findings.
- [x] 2026-04-24 / Codex: Implemented database schema additions for Ripple
  project metadata and composition records; generated
  `drizzle/0008_small_vertigo.sql`.
- [x] 2026-04-24 / Codex: Added main-process Ripple project utilities,
  scaffold writer, environment checks, and create/open/setup/composition
  service orchestration under `src/main/lib/ripple-projects/`.
- [x] 2026-04-24 / Codex: Added typed tRPC routes for
  `projects.createRippleProject`, `projects.openRippleProjectFolder`,
  setup-status refresh, composition listing, and active-composition updates.
- [x] 2026-04-24 / Codex: Replaced the no-project app entry with
  `ProjectEntryPage`, a Ripple project-first create/open surface.
- [x] 2026-04-24 / Codex: Updated the normal project selector to use
  project language and create/open project actions instead of repository/GitHub
  primary actions.
- [x] 2026-04-24 / Codex: Added focused Bun tests for Ripple project path
  handling, scaffold generation, environment readiness probing, and aspect
  ratio presets; added `test` and `test:ripple` scripts.
- [x] 2026-04-24 / Codex: Validated project creation through a live Electron
  smoke run with Computer Use by creating
  `/Users/comeara/Ripple/codex-qa-motion-20260424`.
- [x] 2026-04-25 / Codex: Kept width, height, FPS, and template metadata
  configurable in the project service while making the visible create flow use
  the default 1080p 30fps starter for now.
- [x] 2026-04-25 / Codex: Moved hidden revision setup config and worktree
  storage to `.ripple`, hid normal-path setup command controls, and removed the
  bottom-right setup-script banner.
- [x] 2026-04-25 / Codex: Reworked the normal sidebar/composer/settings
  language from workspaces/worktrees to projects/revisions and made local chat
  creation reuse the existing project thread instead of creating duplicate
  project entries.
- [x] 2026-04-25 / Codex: Added tests for `.ripple` hidden setup config
  detection/priority, reran the full Bun test suite, reran the production
  build, reran `ts:check`, and completed a Computer Use QA pass on the live app.
- [x] 2026-04-25 / Codex: Added the three project lifecycle actions:
  archive/restore, remove from Ripple without deleting files, and move project
  files to Trash behind path validation plus typed-name confirmation.
- [x] 2026-04-25 / Codex: Polished the project rail to show compact text-only
  project rows without local paths or folder icons, then completed Computer Use
  QA for the rail plus archive/restore/remove/delete-files dialogs.
- [x] 2026-04-25 / Codex: Added left-rail hover archive buttons, increased
  project row spacing, fixed remove/delete dialog spacing, and re-ran Computer
  Use QA for the hover archive flow plus both dialogs.
- [x] 2026-04-25 / Codex: Fixed Phase 2 review findings for project-thread
  reuse, local-mode chat safety, reopening archived projects, and Node.js
  readiness probes; added focused tests for local chat reuse and failed Node
  probes.
- [x] 2026-04-25 / Codex: Kept archived-only recovery available from the
  project entry screen and fixed Settings > Projects cache updates after
  opening an existing project.
- [x] 2026-04-25 / Codex: Fixed another Phase 2 review pass: project rail
  selection now reopens the existing local project thread, malformed
  `hyperframes.json` files are rejected, all declared composition files are
  registered on open, and missing setup prerequisites surface as a warning
  after create/open.
- [x] 2026-04-25 / Codex: Fixed Settings > Projects lifecycle actions so
  archiving, removing, or deleting the currently selected project also clears
  the selected thread, draft, and sub-chat state before falling back.
- [x] 2026-04-25 / Codex: Added app-managed HyperFrames, GSAP, FFmpeg, and
  FFprobe dependencies; setup checks now prefer bundled/app-managed tools,
  fall back to Electron's built-in Node runtime, and refresh in the background
  on app launch without exposing install work to motion designers.
- [x] 2026-04-25 / Codex: Fixed the generated starter scaffold against the
  installed HyperFrames CLI, then validated `hyperframes lint --json` and
  `hyperframes compositions --json` against a fresh generated project.
- [x] 2026-04-25 / Codex: Fixed final project-rail QA findings so switching
  projects reopens an existing local conversation through the same
  multi-window ownership guard as normal chat selection, and reopening a
  HyperFrames project prunes composition rows that are no longer declared.
- [x] 2026-04-25 / Codex: Fixed final Phase 2 QA findings for real seekable
  GSAP starter timelines, Cmd+N/menu New Project routing, selected-chat
  ownership release when leaving a conversation, and hiding chats for archived
  projects from normal chat lists.
- [x] 2026-04-25 / Codex: Fixed the last reused-project-chat ownership gap:
  local project chat reuse in `chats.create` now claims the conversation before
  appending a new sub-chat and focuses the existing owner window if another
  window already owns it.
- [x] 2026-04-25 / Codex: Expanded the durable Ripple regression suite and made
  `bun run test:ripple` the future-agent entry point. Coverage now includes pure
  project helpers, HyperFrames scaffold/metadata/runtime checks, `.ripple` setup
  config priority, project chat selection/reuse, chat ownership, New Project
  shortcut routing, and selected-project mapping.
- [x] Implement database schema additions for Ripple project metadata and
  composition records.
- [x] Add main-process Ripple project creation, scaffold, import, and readiness
  services.
- [x] Add typed tRPC routes for create/open project flows.
- [x] Replace the primary repo-first onboarding surface with Ripple project
  creation.
- [x] Update primary project selector language from repo/repository to project
  where it is reached by normal Ripple users.
- [x] Validate project creation, generated files, database records, and
  first-run UX.
- [x] Replace the most visible inherited post-selection workspace/worktree
  language in the project rail, composer, settings, hotkeys, archive/restore
  copy, and setup warnings.
- [x] Defer the deeper renderer-shell migration to Phase 4 for remaining
  internal workspace/worktree identifiers and advanced revision surfaces.

## Surprises & Discoveries

- Observation: Phase 1 deliberately left the no-project screen as the old
  repository picker.
  Evidence: `plans/phase-1-local-first-boot.md` says the visible first screen is
  still the temporary "Select a repository" page, and that replacement belongs
  to Phase 2.
- Observation: The current project router is repository-oriented and includes
  GitHub clone paths that write under `~/.21st/repos`.
  Evidence: `src/main/lib/trpc/routers/projects.ts` exposes `openFolder`,
  `cloneFromGitHub`, `locateAndAddProject`, and `pickCloneDestination`; clone
  destination logic still uses `.21st`.
- Observation: The database currently has only the legacy `projects`, `chats`,
  `sub_chats`, provider credential, and Anthropic account tables.
  Evidence: `src/main/lib/db/schema/index.ts` defines `projects.path`,
  git-remote fields, chat worktree fields, and no Ripple composition, asset,
  setup, comment, revision, or export tables.
- Observation: Ripple does not need to migrate shipped 1Code users or preserve
  their local databases.
  Evidence: Product direction from 2026-04-24: 1Code users will not be
  migrating to this app, and there are no existing Ripple users.
- Observation: The selected-project renderer atom assumes the legacy project
  shape.
  Evidence: `src/renderer/features/agents/atoms/index.ts` defines
  `SelectedProject` with `id`, `name`, `path`, and optional git metadata.
- Observation: There is no dedicated test script yet; the current validation
  baseline is typechecking plus Electron smoke checks.
  Evidence: `package.json` has `bun run ts:check`, package/build scripts, and no
  `test` script.
- Observation: Current HyperFrames CLI package docs say `init` scaffolds from
  examples, uses `--example`, and is non-interactive by default for agents; the
  Quickstart still shows `--non-interactive --example blank`.
  Evidence: `https://hyperframes.heygen.com/packages/cli` documents
  `npx hyperframes init my-video --example blank`, while
  `https://hyperframes.heygen.com/quickstart` still mentions
  `--non-interactive --example blank`.
- Observation: HyperFrames project structure is intentionally plain files:
  `index.html` as the root composition, `compositions/` for sub-compositions
  loaded via `data-composition-src`, and `assets/` for media.
  Evidence: `https://hyperframes.heygen.com/quickstart` and
  `https://hyperframes.heygen.com/concepts/compositions`.
- Observation: HyperFrames Studio preview is file-backed and should fit
  Ripple's later automatic preview goal. The CLI preview command launches
  Studio with live reload, and Studio renders the composition in an iframe with
  the same runtime path used for rendering.
  Evidence: `https://hyperframes.heygen.com/packages/cli` and
  `https://hyperframes.heygen.com/packages/studio`.
- Observation: HyperFrames expects every composition to register a paused GSAP
  timeline on `window.__timelines` with a key matching `data-composition-id`.
  Examples often load GSAP from a CDN, but Ripple's local-first render path
  must not rely on render-time network fetches.
  Evidence: `https://hyperframes.heygen.com/reference/html-schema` and
  `https://hyperframes.heygen.com/guides/gsap-animation`; Phase 2 now installs
  HyperFrames and GSAP locally while the starter still ships a tiny offline
  helper so created projects do not fetch scripts from the network.
- Observation: The Phase 2 implementation keeps legacy `projects.path` as a
  compatibility alias while adding Ripple-native `projects.localPath`.
  Evidence: Existing chat, Claude, Codex, file, worktree, MCP, and settings
  surfaces still read `project.path`; `src/main/lib/db/schema/index.ts` now has
  both `path` and `localPath`, and new Ripple creation writes both to the same
  project root.
- Observation: HyperFrames CLI validation was initially blocked by the missing
  local package, then unblocked once the app-managed runtime dependencies were
  installed.
  Evidence: `npx --no-install hyperframes --version` attempted a request to
  `https://registry.npmjs.org/hyperframes` and failed with `ENOTFOUND`;
  after `bun add hyperframes @ffmpeg-installer/ffmpeg
  @ffprobe-installer/ffprobe gsap`, `node_modules/.bin/hyperframes --version`
  returned `0.4.28` and local HyperFrames lint/composition discovery passed.
- Observation: The host shell still lacks global FFmpeg and FFprobe, but Ripple
  can now resolve app-managed package binaries for both.
  Evidence: `ffmpeg -version` and `ffprobe -version` returned `command not
  found` before the package install; `@ffmpeg-installer/ffmpeg` and
  `@ffprobe-installer/ffprobe` now expose local binary paths under
  `node_modules`.
- Observation: The repository-wide TypeScript baseline is still failing outside
  the Phase 2 files.
  Evidence: `bun run ts:check` fails in preexisting files including
  `src/main/index.ts`, `src/main/lib/credential-manager.ts`,
  `src/main/lib/trpc/routers/claude.ts`, and multiple renderer agent files; no
  reported error references `src/main/lib/ripple-projects/`,
  `src/renderer/features/onboarding/project-entry-page.tsx`, or the updated
  project selector after adding `src/types/bun-test.d.ts`.
- Observation: The live create-project flow succeeds, selects the project, and
  keeps runtime setup non-blocking.
  Evidence: Computer Use smoke QA created
  `/Users/comeara/Ripple/codex-qa-motion-20260424`; the UI transitioned from
  "Create a motion project" to the selected project shell. Setup copy has since
  been changed to avoid naming developer dependencies in the normal path.
- Observation: A first Computer Use QA pass found inherited selected-shell
  workspace/worktree/branch language after project creation; the follow-up pass
  now shows the normal rail as "Search projects...", "New Project", and
  "Projects", without the bottom-right setup-script banner.
  Evidence: The 2026-04-24 QA showed "New Workspace", "Worktree", and "main";
  after the 2026-04-25 cleanup, Computer Use showed the project rail and
  composer without the setup banner or visible worktree/branch selectors.
- Observation: The code now looks for app-managed HyperFrames/FFmpeg resources
  through both packaged resources and installed runtime packages.
  Evidence: `src/main/lib/ripple-projects/environment.ts` checks packaged
  binaries, app-managed npm package binaries, Electron's built-in Node runtime,
  and then global commands only as a fallback.

## Decision Log

- Decision: Use a Ripple-native schema for project creation rather than
  preserving the old 1Code project row shape.
  Rationale: There are no shipped Ripple users and 1Code users will not migrate
  into this app, so preserving legacy local rows is not a product requirement.
  Phase 2 should prefer `localPath`, `slug`, `activeCompositionId`,
  `setupStatus`, and Ripple domain tables over compatibility with
  `projects.path`, git remote columns, or repo-oriented defaults.
  Date/Author: 2026-04-25 / Codex.
- Decision: Development database resets or destructive migrations are allowed
  when they produce a cleaner Ripple foundation.
  Rationale: Local development databases may contain old 1Code-shaped data, but
  they are not customer data. If a clean initial Ripple migration or table
  rewrite is simpler and safer than additive compatibility, use it and document
  the recovery/reset command for contributors.
  Date/Author: 2026-04-24 / Codex.
- Decision: Phase 2 seeds composition records for created/imported projects, but
  leaves full HyperFrames CLI composition discovery to Phase 3.
  Rationale: Project creation should work without network access or
  HyperFrames package installation. The known scaffold can be registered
  deterministically now; CLI-backed discovery, preview, snapshot, render, and
  cancellation belong in the service layer phase.
  Date/Author: 2026-04-24 / Codex.
- Decision: Environment readiness checks are non-blocking in this phase.
  Rationale: A user should still be able to create and inspect local project
  files if Node.js 22+, FFmpeg, FFprobe, or HyperFrames are missing. Missing
  readiness should be surfaced as setup state, not a creation blocker.
  Date/Author: 2026-04-24 / Codex.
- Decision: Do not initialize hidden git/worktree revision machinery during
  Phase 2 project creation.
  Rationale: Comment revision isolation is a Phase 5 concern. Adding hidden git
  setup here risks pulling repository language and failure modes back into the
  first-run path.
  Date/Author: 2026-04-24 / Codex.
- Decision: Use HyperFrames' current "example" terminology internally when
  talking to the CLI, while keeping Ripple's user-facing language as templates
  or starters.
  Rationale: Motion designers should not see CLI flags or registry terms, but
  the implementation needs to match current HyperFrames commands. If Phase 2 or
  later invokes `hyperframes init`, verify the installed CLI help and prefer
  `--example blank`; do not rely on stale `--template` naming.
  Date/Author: 2026-04-24 / Codex.
- Decision: Treat offline GSAP/runtime sourcing as part of scaffold correctness.
  Rationale: HyperFrames compositions need paused registered timelines for
  Studio seeking and deterministic rendering. A scaffold that references a CDN
  may work in docs examples, but it violates Ripple's local-first and
  no-render-time-network rules. Phase 2 should either bundle/copy a local GSAP
  asset into the project scaffold or prove that the generated blank scaffold can
  lint and preview without a custom GSAP dependency.
  Date/Author: 2026-04-24 / Codex.
- Decision: Keep `projects.path` during Phase 2 and add `projects.localPath`
  instead of doing a repo-wide rename now.
  Rationale: The existing 1Code foundation still uses `project.path` deeply for
  chat worktrees, file access, provider cwd resolution, MCP context, and
  settings surfaces. New Ripple services write `localPath` and `path` together,
  and the security boundary checks `localPath` first. This keeps the project
  creation path Ripple-native without dragging a large unrelated compatibility
  refactor into this phase.
  Date/Author: 2026-04-24 / Codex.
- Decision: Copy the app-managed GSAP runtime into generated starter projects.
  Rationale: Created project folders should be self-contained and should not
  fetch CDN scripts or depend on users understanding package installs. Since
  HyperFrames seeks registered timelines during preview and export, the
  generated starter writes `assets/vendor/gsap.min.js` from the bundled `gsap`
  package and registers real paused GSAP timelines on `window.__timelines`.
  Date/Author: 2026-04-24 / Codex.
- Decision: Use an additive migration for Phase 2 rather than resetting the
  existing development migration chain.
  Rationale: Keeping `projects.path` as a compatibility alias made an additive
  migration straightforward and avoided forcing contributors to reset their
  development databases during this slice.
  Date/Author: 2026-04-24 / Codex.
- Decision: Keep video dimensions and FPS configurable at the service/scaffold
  boundary, but hide those choices in the current create-project UI.
  Rationale: HyperFrames needs to support later size/FPS changes, while the
  current product path should start from a simple default template. Phase 2
  therefore uses a 1920x1080 30fps starter and stores width, height, and FPS
  metadata without asking users to choose them up front.
  Date/Author: 2026-04-25 / Codex.
- Decision: Store hidden revision setup config under `.ripple/worktree.json`
  and keep setup commands out of the normal project UI.
  Rationale: Worktree/setup-script language is developer terminology. Hidden
  revision mechanics may keep compatibility with old helper names internally,
  but users should see app-managed project setup and only need advanced/debug
  surfaces when something breaks.
  Date/Author: 2026-04-25 / Codex.
- Decision: A local Ripple project should appear once in the left rail.
  Rationale: The rail represents projects, not multiple workspaces for one
  project. Creating a new local chat for an existing project now reuses the
  existing project chat and adds sub-chat/thread state underneath it.
  Date/Author: 2026-04-25 / Codex.
- Decision: Opening an existing HyperFrames project should trust declared
  metadata enough to either register it or reject it.
  Rationale: Silently falling back to `index.html` hides broken metadata and
  loses external compositions that the user intentionally opened. Phase 2 now
  accepts string and object composition declarations from `hyperframes.json`,
  registers each declared file, and rejects malformed metadata immediately.
  Date/Author: 2026-04-25 / Codex.
- Decision: Runtime setup must be app-managed and backgrounded.
  Rationale: Ripple is for motion designers, editors, marketers, founders, and
  agency teams, not people who want to install Node, FFmpeg, FFprobe,
  HyperFrames, or GSAP by hand. Phase 2 now treats those as packaged/app-owned
  motion runtime pieces, refreshes readiness on app launch, and keeps normal UI
  copy focused on preview/export availability rather than dependency names.
  Date/Author: 2026-04-25 / Codex.

## Outcomes & Retrospective

Initial Phase 2 implementation is in place. The app now has a project-first
entry surface, main-process project creation under `~/Ripple`, deterministic
starter file generation, app-managed setup checks, composition persistence,
and project-language selector actions. The current starter defaults to a
1920x1080, 30fps HyperFrames project while service metadata still preserves
future width, height, FPS, and template configurability.

The visible post-selection path is also cleaner: the normal rail says projects,
shows compact text-only project rows with hover archive actions, the create/chat
composer no longer exposes worktree or branch controls, the setup-script banner
is gone, and hidden setup config now defaults to `.ripple`. Local project chat
creation reuses the existing project thread so the rail does not accumulate
multiple workspace-like entries for the same project. Selecting a project in
the rail now reopens that existing local project thread instead of leaving the
prior conversation unreachable.

The open-existing path now validates HyperFrames metadata instead of silently
falling back to defaults. A malformed `hyperframes.json` blocks the open action
with an actionable error, and valid metadata registers the entry composition
plus declared external composition files such as lower thirds.

Runtime setup is now a background app responsibility. The package includes
HyperFrames, GSAP, FFmpeg, and FFprobe dependencies, the main process checks
those app-managed tools on launch, and HyperFrames can run through Electron's
built-in Node runtime so normal users do not need to install or understand
developer tooling. Missing-runtime copy is intentionally generic: preview and
export tools may still be preparing, but project creation remains available.

Live Electron QA with Computer Use successfully created
`/Users/comeara/Ripple/codex-qa-motion-20260424` and verified the expected
starter files on disk. Follow-up Computer Use passes verified the project rail,
composer, settings accessibility tree, and project lifecycle dialogs use project
language, do not show local paths or folder icons in the rail, provide a hover
archive action, and do not show the previous setup-script banner. After adding
the app-managed runtime dependencies, HyperFrames CLI lint and composition
discovery both passed against a freshly generated starter project.

## Context and Orientation

This repository is still mostly the 1Code desktop app. Phase 1 made the app
open without mandatory auth or provider setup, but the first local screen is
still `SelectRepoPage`, a repository picker. The renderer entry point in
`src/renderer/App.tsx` checks `selectedProjectAtom`, validates it against
`trpc.projects.list`, and shows `SelectRepoPage` when no local project is
selected.

The current project system lives primarily in
`src/main/lib/trpc/routers/projects.ts`. It can list database projects, open a
folder selected through an Electron dialog, create a project from an explicit
path, clone from GitHub, locate an existing clone, and manage custom project
icons. This router is a useful tRPC boundary, but its primary workflow is
repo-shaped.

The database schema lives in `src/main/lib/db/schema/index.ts`. The existing
`projects` table has `id`, `name`, `path`, timestamps, git remote metadata, and
an optional `iconPath`. The `chats` table references `projects.id` and stores
worktree/branch fields. Existing path validation in
`src/main/lib/git/security/path-validation.ts` treats `projects.path` as a
registered workspace boundary. This is current-state orientation, not a
compatibility requirement. Phase 2 may replace `path` with `localPath` and
update call sites if that is the cleaner Ripple model.

For this phase:

- A Ripple project means a local HyperFrames project folder managed by Ripple.
- A HyperFrames project is a plain HTML motion project with `index.html`,
  `compositions/`, `assets/`, metadata/config, and export output folders.
- A composition is an HTML document or fragment that has a root element with
  `data-composition-id`, `data-width`, and `data-height`.
- A clip is a timed visible element with `class="clip"`, `data-start`,
  `data-duration`, and `data-track-index`.
- A reusable external composition is an HTML file under `compositions/` that
  wraps its content in a `<template>` and is referenced from another composition
  with `data-composition-src`.
- A HyperFrames timeline is a paused GSAP timeline registered on
  `window.__timelines` under the exact `data-composition-id`. Studio and render
  seeking depend on that registry.
- `setupStatus` is Ripple's local readiness state for project setup and
  environment checks. It must be user-facing enough to explain missing tools,
  but it must not block project creation.

## Plan of Work

Start by adding a small Ripple project domain layer in the main process instead
of growing more logic directly inside the tRPC router. Create
`src/main/lib/ripple-projects/` with focused modules:

- `paths.ts` for project-name sanitization, slug creation, `~/Ripple`
  resolution, collision handling, and path-boundary helpers.
- `scaffold.ts` for writing the default HyperFrames files and folders.
- `environment.ts` for non-blocking readiness checks for Node.js 22+, FFmpeg,
  FFprobe, and HyperFrames availability where it can be checked without
  downloading packages.
- `service.ts` for `createRippleProject` and `openExistingRippleProject`
  orchestration.
- `types.ts` for service inputs, outputs, setup-status values, and composition
  metadata.

The service layer must be the only code that chooses or validates filesystem
destinations for primary project creation. The renderer may submit a project
name, aspect ratio preset, and optional template ID, but it must not send an
absolute destination path for the primary create flow. The main process resolves
the destination under `app.getPath("home") + "/Ripple"`, sanitizes names, and
handles collisions by appending a stable suffix such as `my-project-2`.

Next, reshape `src/main/lib/db/schema/index.ts` around the Ripple domain model.
Prefer a clean `projects.localPath` column over the legacy `projects.path`
name, and keep git remote fields only if they remain useful in advanced/debug
surfaces rather than primary project creation. Add project fields such as
`slug`, `aspectRatioPreset`, `activeCompositionId`, `templateId`,
`setupStatus`, `setupError`, and `lastSetupCheckAt`. Add a `compositions` table
with `projectId`, `name`, relative `filePath`, `dataCompositionId`, `width`,
`height`, optional `parentCompositionId`, `kind`, and timestamps. Because there
are no existing Ripple users and no 1Code migration requirement, it is
acceptable to reset or rewrite development migrations if that creates a cleaner
fresh-install schema. Document any dev database reset needed for contributors.

Then implement the default scaffold. The default project should be useful and
boring in the best way: deterministic, offline, and immediately recognizable as
a motion composition. It should preview as a simple title card rather than a
blank video: black background, centered white title text, and a short entrance
animation such as a fade or subtle upward slide. It should create:

- `index.html`
- `compositions/`
- `compositions/lower-third.html`
- `compositions/captions.html` if caption placeholders are included in the
  starter
- `assets/`
- `assets/vendor/` if Ripple needs to copy a local GSAP/runtime asset
- `exports/`
- `hyperframes.json`
- `meta.json`

The scaffold must not reference CDN scripts, remote fonts, random data,
wall-clock animation logic, or network media. The HTML should contain valid
HyperFrames data attributes. The top-level composition should have
`data-composition-id`, `data-width`, and `data-height`. Visible timed elements
should have `class="clip"`, `data-start`, `data-duration`, and
`data-track-index`. `index.html` should demonstrate at least one external
sub-composition via `data-composition-src`, and that external file should use a
`<template>` wrapper. Each composition should register a finite paused GSAP
timeline keyed by its `data-composition-id`; if the implementation chooses not
to ship GSAP in Phase 2, it must validate with `npx hyperframes lint` that the
scaffold remains acceptable to the installed HyperFrames runtime.

Add tRPC routes in `src/main/lib/trpc/routers/projects.ts` or a nested router
module imported by it:

- `projects.createRippleProject`
- `projects.openRippleProjectFolder`
- `projects.getSetupStatus`
- `projects.refreshSetupStatus`
- `projects.listCompositions`
- optionally `projects.setActiveComposition`

`createRippleProject` accepts only safe product inputs: project name,
aspect-ratio preset, and template ID if needed. It returns the created project,
the registered active composition, generated path, and setup status. It should
insert or update local database records atomically enough that a partial failure
does not leave an unselectable project without recovery notes. If filesystem
creation succeeds but database insertion fails, the error should name the
created folder so recovery is obvious.

`openRippleProjectFolder` is the secondary advanced path. It opens an Electron
folder dialog in the main process, validates that the folder looks like a
Ripple/HyperFrames project by checking for expected files such as `index.html`
and `hyperframes.json`, records it in the database, and registers at least the
entry composition if possible. It should not ask the renderer to provide an
absolute path. Existing legacy `openFolder` and GitHub clone routes may remain
for now if other debug/settings surfaces still call them, but the primary entry
screen must stop using them.

Replace `src/renderer/features/onboarding/select-repo-page.tsx` as the primary
entry experience. Either rename it to
`src/renderer/features/onboarding/project-entry-page.tsx` or add the new file
and update `src/renderer/features/onboarding/index.ts` plus
`src/renderer/App.tsx`. The normal first screen should show a compact desktop
app creation flow: project name input, aspect ratio preset if useful, Create
Project button, and a secondary Open Existing Project action. Do not show GitHub
clone as a primary action. Use existing Radix/Tailwind component patterns and
keep the screen app-like, not marketing-like.

Update `src/renderer/features/agents/atoms/index.ts` so `SelectedProject` can
carry new Ripple fields without breaking existing consumers. Add a small helper
if it prevents repeated mapping from tRPC project rows to selected-project atom
values. Update `src/renderer/features/agents/components/project-selector.tsx`
to say project instead of repo in the normal UI and to offer Create/Open Project
actions. Avoid broad shell redesign here; Phase 4 owns the full Ripple shell.

Finally, validate with unit tests for pure project utilities where practical,
typecheck, and an Electron smoke run. Because the repository currently has no
test script, use Bun's test runner directly for any new `*.test.ts` files, for
example `bun test src/main/lib/ripple-projects`. If `bun run ts:check` still
fails because of known unrelated baseline issues from Phase 1, record the exact
failure summary and confirm no errors reference the new Phase 2 files.

## Concrete Steps

Run commands from `/Users/comeara/Projects/ripple` unless noted otherwise.

1. Inspect current state.

       git status --short
       sed -n '1,260p' plans/phase-1-local-first-boot.md
       sed -n '1,760p' ROADMAP.md
       sed -n '1,700p' src/main/lib/trpc/routers/projects.ts
       sed -n '1,360p' src/main/lib/db/schema/index.ts
       sed -n '1,260p' src/renderer/App.tsx
       sed -n '1,260p' src/renderer/features/onboarding/select-repo-page.tsx

2. Add pure project utility code under
   `src/main/lib/ripple-projects/paths.ts`.

   Implement name trimming, slugging, filesystem-safe path segment generation,
   `getDefaultRippleRoot()`, `getUniqueProjectPath()`, and an
   `isPathInsideRippleRoot()` helper. Use `app.getPath("home")` in the service
   boundary, not in pure helpers that should be unit-testable.

   Expected behavior:

   - `"Launch Video"` becomes a readable slug such as `launch-video`.
   - Empty or punctuation-only names are rejected with a typed error.
   - Existing project folders produce deterministic collision suffixes.
   - Returned primary project paths are inside `~/Ripple`.

3. Add the scaffold writer under
   `src/main/lib/ripple-projects/scaffold.ts`.

   The function should accept a destination path and scaffold metadata, create
   directories with `{ recursive: true }`, write deterministic files, and fail
   if it would overwrite an unrelated non-empty folder. The scaffold should be
   safe to retry when the same generated files already exist and match the
   expected shape. It should be lint-clean under HyperFrames once the local CLI
   is available.

   Expected generated tree:

       ~/Ripple/<slug>/
       ├── index.html
       ├── compositions/
       │   └── lower-third.html
       ├── assets/
       │   └── vendor/
       ├── exports/
       ├── hyperframes.json
       └── meta.json

   If `lower-third.html` is reusable, it must wrap its composition in a
   `<template>` and `index.html` must reference it with `data-composition-src`.
   Both the root composition and the external composition must register paused
   GSAP timelines with matching IDs. The root timeline should include a
   zero-duration set at the intended duration if needed so the composition has a
   finite, predictable length. The first rendered frame sequence should be an
   intentional title card, not an empty black frame: use a black stage, centered
   white "Hello, Ripple" or project-name title, and simple deterministic motion.

4. Add readiness checks under
   `src/main/lib/ripple-projects/environment.ts`.

   Use `child_process.execFile` or `spawn`, not shell-string execution, for
   checks that call external commands. Check Node.js, FFmpeg, and FFprobe. If a
   HyperFrames command is checked in Phase 2, avoid commands that download
   packages as a side effect. Return structured statuses and friendly error
   messages rather than throwing for missing tools.

   Also report whether Ripple has an offline GSAP/runtime source available for
   its starter scaffold. The local repository currently has no `gsap` package
   installed, so implementation must not quietly fall back to a CDN.

5. Extend the schema in `src/main/lib/db/schema/index.ts`.

   Replace or reshape legacy project metadata as needed for the clean Ripple
   model. Prefer `localPath` for the on-disk project root. Add `compositions`
   and `compositionsRelations`. Export `Composition` and `NewComposition`
   types. Update call sites that currently read `project.path` so the app has a
   single typed meaning for the local project root.

   Candidate project fields:

       id: string
       name: string
       slug: string | null
       localPath: string
       aspectRatioPreset: string | null
       activeCompositionId: string | null
       templateId: string | null
       setupStatus: "unknown" | "checking" | "ready" | "needs_environment" | "error"
       setupError: string | null
       lastSetupCheckAt: Date | null
       iconPath: string | null
       createdAt: Date
       updatedAt: Date

   The concrete implementation can use `text(...)` enum-like values because the
   existing schema uses plain SQLite text fields.

6. Generate or reset and inspect the migration.

       bun run db:generate

   Expected result: either a new migration is generated or the migration set is
   intentionally reset to a clean Ripple baseline. Drops/renames are allowed
   because there is no customer migration requirement, but they must be
   intentional and documented in this ExecPlan. If development databases need to
   be reset, record the exact recovery command and expected data loss.

7. Implement `src/main/lib/ripple-projects/service.ts`.

   `createRippleProject` should:

   - validate input
   - resolve `~/Ripple`
   - choose a unique slug/path
   - write the scaffold
   - run non-blocking readiness checks
   - insert a `projects` row with `localPath`
   - insert default composition rows
   - set `activeCompositionId`
   - return a typed result for the renderer

   `openExistingRippleProject` should:

   - show an Electron folder picker from the tRPC route or accept a path only
     from trusted main-process code
   - validate expected project files
   - insert or update a project row
   - register entry composition metadata where possible
   - return a typed result compatible with `createRippleProject`

8. Add tRPC procedures.

   Update `src/main/lib/trpc/routers/projects.ts` to expose the new Ripple
   procedures. Keep legacy procedures only where existing secondary surfaces
   still depend on them. The primary renderer onboarding must call
   `projects.createRippleProject` and `projects.openRippleProjectFolder`, not
   `openFolder` or `cloneFromGitHub`.

9. Replace the onboarding entry UI.

   Create or rename to
   `src/renderer/features/onboarding/project-entry-page.tsx`. Update exports and
   `src/renderer/App.tsx` so the no-project state renders the Ripple project
   entry. The UI should:

   - provide a focused project-name input
   - create on Enter
   - show pending, success, and error states
   - select the returned project in `selectedProjectAtom`
   - update `trpc.projects.list` cache
   - provide secondary Open Existing Project
   - avoid GitHub/repository language in the primary path

10. Update selected-project and project selector surfaces.

    Add new optional fields to `SelectedProject` and update mapping code in the
    onboarding page and `ProjectSelector`. Change normal labels such as "Select
    repo", "Search repos", and "Add repository" to project language. Leave
    advanced/debug GitHub clone routes alone unless the UI exposes them in the
    primary path.

11. Add focused tests where practical.

    Suggested tests:

        bun test src/main/lib/ripple-projects

    Cover slug generation, collision naming, invalid names, scaffold file
    detection, and environment-status normalization. Keep Electron `app`
    dependencies out of pure test modules.

12. Run validation.

        npx hyperframes lint "$HOME/Ripple/launch-video"
        npx hyperframes compositions "$HOME/Ripple/launch-video" --json
        bun run ts:check
        bun run dev

    Run the HyperFrames commands only when the CLI is already available or can
    be invoked without an unexpected download. If unavailable, record that
    readiness as `needs_environment` and validate the written HTML structure
    directly.

    Smoke the app manually or with Computer Use:

    - launch without sign-in
    - observe Ripple project creation as the first screen
    - create a project named `Launch Video`
    - verify files under `~/Ripple/launch-video` or collision-suffixed variant
    - verify the project is selected and the old repository picker is not the
      first-run primary path
    - quit cleanly

13. Update this ExecPlan.

    Record progress, surprises, decisions, validation output, and any remaining
    risks in this file before stopping.

## Validation and Acceptance

Validation commands:

       bun test src/main/lib/ripple-projects
       npx hyperframes lint "$HOME/Ripple/launch-video"
       npx hyperframes compositions "$HOME/Ripple/launch-video" --json
       bun run db:generate
       bun run ts:check
       bun run dev

If `bun run db:generate` was already run after the schema change, do not
generate duplicate migrations; inspect the existing generated migration instead.
If HyperFrames is not installed and `npx` would download it unexpectedly,
record that as environment readiness instead of blocking project creation.
If Phase 2 resets old development migrations or requires clearing the local
Electron development database, record the exact reset step in this plan and make
sure the fresh-install migration path is clean.

Acceptance criteria:

- Fresh unauthenticated app launch reaches a Ripple project-first entry screen.
- The primary action creates a project from a name without asking the user to
  pick a folder.
- Created projects live under `~/Ripple/<project-name>` with deterministic
  collision handling.
- Generated project files include `index.html`, `compositions/`, `assets/`,
  `exports/`, `hyperframes.json`, and `meta.json`.
- The generated project previews as a simple title card with a black background
  and centered white title text, using the project name or "Hello, Ripple".
- The default composition contains valid HyperFrames composition and clip data
  attributes.
- Reusable external compositions use `<template>` wrappers and are loaded from
  `index.html` through `data-composition-src`.
- Every composition that the scaffold creates registers a finite paused GSAP
  timeline on `window.__timelines` using the exact `data-composition-id`, or the
  plan records proof that the installed HyperFrames linter accepts the scaffold
  without a custom GSAP timeline.
- The scaffold does not fetch GSAP, fonts, media, or scripts from the network at
  preview or render time.
- The new project is stored in SQLite, appears in `projects.list`, and is
  selected in the renderer.
- Archived projects are hidden from normal project lists, visible in Settings
  > Projects > Archived, and restorable without touching local files.
- Removing a project from Ripple unregisters the local database row without
  deleting files.
- Deleting project files moves the on-disk project folder to Trash only after
  main-process path validation and typed-name confirmation.
- The project schema uses Ripple-native names, especially `localPath` for the
  on-disk project root, unless implementation records a stronger reason to keep
  a compatibility alias.
- At least one composition record is stored and tied to the project.
- Environment readiness is recorded and visible enough to explain preview/export
  availability without asking users to know or install Node.js, FFmpeg, FFprobe,
  HyperFrames, or GSAP.
- A secondary Open Existing Project path exists and is not the normal first-run
  call to action.
- Normal onboarding and project selector language says project/composition, not
  repository/repo/GitHub/clone.
- No new renderer code launches privileged shell commands directly.
- New main-process filesystem writes resolve and validate their own paths.
- `bun run ts:check` passes, or remaining failures are documented as preexisting
  and not from Phase 2 files.

Manual file checks after creating `Launch Video`:

       ls "$HOME/Ripple/launch-video"
       find "$HOME/Ripple/launch-video" -maxdepth 2 -type f | sort

Expected observations:

- The folder contains only the scaffolded Ripple project files and folders.
- Re-running project creation with the same name creates a separate
  collision-suffixed project instead of overwriting the existing folder.
- Opening an existing folder validates project shape and selects it, or shows a
  clear non-destructive error.

## Idempotence and Recovery

Pure utility tests, typechecks, and smoke runs are safe to repeat.

Project creation must be safe to retry. If `~/Ripple/<slug>` already exists and
is a complete project created by Ripple, the service may either reuse it when
the database row is missing or create a collision-suffixed folder for a new
project. If the folder exists and contains unrelated files, the service must not
overwrite it.

Scaffold writes should be deterministic. If a retry sees expected files already
present, validate shape before continuing. If a retry sees a partial scaffold,
either complete missing generated files or fail with a recovery message that
names the folder. Do not delete user files automatically.

Database migration does not need to preserve old 1Code-shaped rows. If migration
generation produces drops, renames, or destructive changes, verify they are
intentional, document the developer reset path, and keep the fresh Ripple
install path clean.

If filesystem creation succeeds but database insertion fails, leave the folder
intact and report the path. A later retry or Open Existing Project action should
be able to register it.

If environment checks fail or time out, store
`setupStatus: "needs_environment"` or `setupStatus: "error"` with a readable
message and still return the created project.

If `bun run dev` opens a blank shell after project creation, validate the
selected project shape in `selectedProjectAtom` first. The most likely recovery
is to add backward-compatible optional fields rather than requiring every
existing consumer to understand the new Ripple fields immediately.

## Interfaces and Dependencies

Existing interfaces this phase depends on:

- `src/renderer/App.tsx` no-project routing.
- `selectedProjectAtom` and `SelectedProject` in
  `src/renderer/features/agents/atoms/index.ts`.
- `trpc.projects.list.useQuery()` and tRPC cache utilities in renderer code.
- `projectsRouter` in `src/main/lib/trpc/routers/projects.ts`.
- `createAppRouter` in `src/main/lib/trpc/routers/index.ts`.
- Drizzle schema and migrations in `src/main/lib/db/schema/index.ts` and
  `drizzle/`. These may be reset or rewritten for a clean Ripple baseline
  because no shipped 1Code data migrates into Ripple.
- Existing path boundary model in
  `src/main/lib/git/security/path-validation.ts`, which recognizes
  `projects.path` as a registered workspace root today and should be adapted to
  `projects.localPath` if the schema is renamed.
- Electron `app.getPath("home")` and `dialog.showOpenDialog` in main-process
  code only.

New interfaces to create:

- `src/main/lib/ripple-projects/paths.ts`
- `src/main/lib/ripple-projects/scaffold.ts`
- `src/main/lib/ripple-projects/environment.ts`
- `src/main/lib/ripple-projects/service.ts`
- `src/main/lib/ripple-projects/types.ts`
- `projects.createRippleProject`
- `projects.openRippleProjectFolder`
- `projects.getSetupStatus`
- `projects.refreshSetupStatus`
- `projects.listCompositions`
- optional `projects.setActiveComposition`
- `src/renderer/features/onboarding/project-entry-page.tsx`

External command dependencies checked non-blockingly:

- `node --version` or an equivalent system Node check for Node.js 22+.
- `ffmpeg -version`.
- `ffprobe -version`.
- HyperFrames availability only if it can be checked without downloading or
  mutating global state during Phase 2.
- Offline GSAP/runtime availability for generated compositions. The scaffold
  must not rely on CDN scripts.

Phase 2 must not require:

- GitHub authentication.
- Hosted auth.
- Provider setup.
- Manual package installation.
- Running a dev server.
- HyperFrames preview/render processes.
- Git branches, worktrees, or PRs in the primary UX.

## Artifacts and Notes

Roadmap anchor:

- `ROADMAP.md` Phase 2 is "Ripple Project Creation".
- Phase 2 done means the user can create a project without picking a folder,
  the project is under `~/Ripple`, the scaffold includes the HyperFrames project
  files and at least one previewable composition, and opening an existing folder
  exists as a secondary advanced path.
- Official HyperFrames docs reviewed on 2026-04-24:
  `https://hyperframes.heygen.com/packages/cli`,
  `https://hyperframes.heygen.com/quickstart`,
  `https://hyperframes.heygen.com/concepts/compositions`,
  `https://hyperframes.heygen.com/concepts/data-attributes`,
  `https://hyperframes.heygen.com/reference/html-schema`,
  `https://hyperframes.heygen.com/guides/gsap-animation`, and
  `https://hyperframes.heygen.com/packages/studio`.

Current implementation anchor:

- `src/main/lib/trpc/routers/projects.ts` currently handles repository-shaped
  open/clone flows.
- `src/renderer/features/onboarding/select-repo-page.tsx` currently shows
  "Select a repository", "Select folder", and "Clone from GitHub".
- `src/renderer/features/agents/components/project-selector.tsx` currently
  shows "Select repo", "Search repos", "Add repository", and "Add from GitHub".
- `src/main/lib/db/schema/index.ts` currently lacks Ripple composition tables
  and setup-status fields.

Known baseline risk:

- Phase 1 recorded that `bun run ts:check` was blocked by existing repo-wide
  errors unrelated to local-first boot. Re-verify during Phase 2 rather than
  assuming the baseline is unchanged.

Implementation evidence from 2026-04-24:

- Added `src/main/lib/ripple-projects/paths.ts`,
  `scaffold.ts`, `environment.ts`, `service.ts`, and `types.ts`.
- Added focused tests in `src/main/lib/ripple-projects/paths.test.ts`,
  `scaffold.test.ts`, `environment.test.ts`, `types.test.ts`, and
  `src/main/lib/git/worktree-config.test.ts`.
- Added `src/renderer/features/onboarding/project-entry-page.tsx`.
- Updated `src/renderer/App.tsx` to render `ProjectEntryPage` when no selected
  project is valid.
- Updated `src/renderer/features/agents/components/project-selector.tsx` to
  use project language plus New Project and Open Existing Project actions.
- Updated `selectedProjectAtom` mapping helpers so new `localPath` metadata can
  coexist with legacy `path` consumers.
- Generated `drizzle/0008_small_vertigo.sql`, which creates `compositions`,
  adds Ripple project metadata fields, and creates
  `projects_local_path_unique`.
- Validation run: `bun test src/main/lib/ripple-projects` passed 24 tests after
  adding app-managed runtime discovery and HyperFrames-valid scaffold fixes.
- Validation run: `bun test` passed 29 tests across 9 files.
- Validation run: `bun run db:generate` generated
  `drizzle/0008_small_vertigo.sql`.
- Validation run: `bun run ts:check` still fails on preexisting repo-wide
  TypeScript errors; no remaining reported errors are in the new Ripple
  runtime/project service/scaffold files.
- Validation run: `bun run build` completed successfully, covering the
  Electron/Vite main, preload, and renderer bundles.
- Validation run: `bun test src/renderer/features/sidebar/project-chat-selection.test.ts src/main/lib/ripple-projects`
  passed 26 tests across 8 files after the final project rail and composition
  sync fixes.
- Validation run: `bun test` passed 29 tests across 9 files after the final
  project rail and composition sync fixes.
- Validation run: `bun run build` completed successfully after the final
  project rail and composition sync fixes.
- Validation run: `git diff --check` passed after the final project rail and
  composition sync fixes.
- Validation run: `bun test src/main/lib/ripple-projects src/renderer/features/sidebar/project-chat-selection.test.ts src/main/lib/git/worktree-config.test.ts`
  passed 29 tests across 9 files after the final GSAP, shortcut, chat release,
  and archived-project chat filtering fixes.
- Validation run: `bun run build` completed successfully after the final GSAP,
  shortcut, chat release, and archived-project chat filtering fixes.
- Validation run: `bun run ts:check` still fails on the known repo-wide
  baseline issues; no new errors were reported in the Phase 2 files touched by
  the final QA fixes.
- Validation run: `bun test` passed 29 tests across 9 files after the reused
  project-chat ownership fix.
- Validation run: `bun run build` completed successfully after the reused
  project-chat ownership fix.
- Validation run: `git diff --check` passed after the reused project-chat
  ownership fix.
- Validation run: `bun run ts:check` still fails on the known repo-wide
  baseline issues; no new errors were reported in `src/main/lib/trpc/routers/chats.ts`
  or `src/renderer/features/agents/main/new-chat-form.tsx` after the reused
  project-chat ownership fix.
- Validation run: `bun run test:ripple` passed 38 tests across 12 files after
  expanding the Ripple regression suite.
- Validation run: `bun test` passed 38 tests across 12 files after expanding
  the Ripple regression suite.
- Validation run: `bun run build` completed successfully after expanding the
  Ripple regression suite.
- Validation run: `git diff --check` passed after expanding the Ripple
  regression suite.
- Validation run: `bun run ts:check` still fails on the known repo-wide
  baseline issues; no new errors were reported in the new Phase 2 test files,
  `src/main/windows/chat-ownership.ts`, or
  `src/renderer/features/agents/utils/selected-project.ts`.
- Validation run: `node_modules/.bin/hyperframes snapshot <fresh generated project> --at 0,1,2 --timeout 10000`
  passed with escalated local-server permission and saved three PNG frames,
  confirming the generated starter can be seeked with the bundled GSAP runtime.
- Computer Use QA run: live dev app showed "Search projects...", "New Project",
  and "Projects" in the left rail; the composer no longer showed worktree or
  branch controls; the old setup-script banner was absent; settings navigation
  used "Projects" and project-thread language.
- Computer Use QA run: app launch logged `[Ripple] Motion runtime check: ready`
  and the normal UI did not show dependency/setup warnings or ask the user to
  install anything.
- HyperFrames validation: `node_modules/.bin/hyperframes lint <fresh generated
  project> --json` returned `ok: true`, `0` errors, and `0` warnings.
- HyperFrames validation: `node_modules/.bin/hyperframes compositions <fresh
  generated project> --json` returned `main` plus the external `lower-third`
  composition.
- Runtime dependency check: `hyperframes@0.4.28`,
  `@ffmpeg-installer/ffmpeg@1.1.0`,
  `@ffprobe-installer/ffprobe@2.1.2`, and `gsap@3.15.0` are now installed in
  the app dependency graph and are checked by the main process before global
  command fallbacks.
