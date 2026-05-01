# Phase 12: Templates And Starters

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this phase, Ripple users can start with a useful motion design template
instead of always starting from the current single hardcoded starter. The New
Project entry surface keeps the existing project name field and Open Existing
Project action, then adds a template gallery below them. The first tile is
Blank, a black/minimal HyperFrames project with correct structure and a paused
GSAP timeline. Other tiles are curated starters such as social video, title
card, lower third, brand promo, explainer, data story, and product showcase.

The same template gallery model is also available inside an existing project
from the Compositions pane. A user can create a new composition from a template
without leaving the motion-design surface. Users should not need to understand
"project template" versus "composition template"; Ripple presents one template
catalog of motion starting points, filtered by where the user opens it. Created
templates are copied through main-process path validation, appear in the project
browser, become active when requested, and preview immediately without asking the
user to know the HyperFrames CLI, registry, Git, filesystems, or dependency
setup.

Phase 12 does not insert the new composition into `index.html`. It only creates,
registers, selects, and previews the reusable composition. Placement into the
entry composition is a later editing workflow.

## Progress

- [x] 2026-05-01 / User + Codex: Started Phase 12 planning. User direction:
  add template previews to New Project, keep Blank first, research official
  HyperFrames templates and open-source options, and add a New Composition
  action in the project browser.
- [x] 2026-05-01 / Codex: Read `PLANS.md`, `ROADMAP.md`, Phase 2 project
  creation notes, Phase 6 assets/compositions pane notes, and Phase 11 export
  notes before drafting this plan.
- [x] 2026-05-01 / Codex: Researched current HyperFrames docs, registry, and
  installed `hyperframes@0.4.40` package behavior.
- [x] 2026-05-01 / Codex: Mapped current Ripple implementation surfaces for New
  Project, scaffold writing, project/composition tRPC routes, composition
  browser model, preview thumbnails, and active-composition selection.
- [x] 2026-05-01 / User + Codex: Deferred the multi-timeline structure
  exploration to `plans/v2/` and restored Templates and Starters as the active
  Phase 12 scope.
- [x] 2026-05-01 / User + Codex: Clarified that `Main` refers to the primary
  project/worktree, not `index.html` or a composition. Phase 12 should create
  compositions only, with no "Add to Main" or automatic `index.html` placement.
- [x] 2026-05-01 / Codex + sub-agents: Researched official HyperFrames examples,
  registry blocks/components, local installed package contents, and community
  reference repos for the Phase 12 template catalog.
- [x] 2026-05-01 / User + Codex: Agreed that users should see one template
  gallery of starting points, context-filtered for New Project or New
  Composition, while project/composition compatibility stays internal.
- [ ] Implement Milestone 0: template source audit, bundle policy, and curated
  first gallery.
- [ ] Implement Milestone 1: typed template library and offline bundle.
- [ ] Implement Milestone 2: New Project template chooser.
- [ ] Implement Milestone 3: New Composition action.
- [ ] Implement Milestone 4: offline template preview media and thumbnail QA.
- [ ] Implement Milestone 5: validation, packaging, and recovery hardening.

## Surprises & Discoveries

- Observation: The roadmap has a Phase 12 template scope that matches the user
  request closely.
  Evidence: `ROADMAP.md` says Phase 12 should curate official HyperFrames
  templates into a local library, add metadata and previews, and expose the
  chooser for new project and new composition flows.

- Observation: Current HyperFrames public docs use both "templates" and
  "examples". The installed CLI and newer docs use `--example`, while the
  older Templates page still shows `--template`.
  Evidence: `https://hyperframes.heygen.com/examples` and
  `https://hyperframes.heygen.com/packages/cli` show `npx hyperframes init
  my-video --example ...`; `https://hyperframes.heygen.com/templates` still
  shows `--template`.

- Observation: The installed `hyperframes@0.4.40` package bundles only the
  `blank` static template locally. Other official examples are resolved from
  the public HyperFrames registry if the CLI is allowed to fetch them.
  Evidence: `node_modules/hyperframes/dist/templates/blank/index.html` exists,
  and `node_modules/hyperframes/dist/cli.js` copies static templates when
  present, otherwise calls the remote registry.

- Observation: The local checkout pins and installs the HyperFrames package
  family at `0.4.40`, but the installed package is not enough for an offline
  Ripple template gallery beyond Blank.
  Evidence: `package.json`, `node_modules/.bin/hyperframes --version`, and
  `bun pm ls` report `0.4.40`; `~/.hyperframes/cache` has no cached registry
  items; `hyperframes catalog --json` returned an empty list in the restricted
  environment.

- Observation: Official HyperFrames examples are the best candidates for
  templates that can create new projects; registry blocks are the best
  candidates for templates that can create new compositions; registry components
  are smaller effects/snippets and should not be first-class starters in the
  first pass.
  Evidence: The docs list examples such as `warm-grain`, `play-mode`,
  `swiss-grid`, `kinetic-type`, `decision-tree`, `product-promo`, `nyt-graph`,
  `vignelli`, and `blank`. The registry also contains blocks such as
  `yt-lower-third`, `instagram-follow`, `tiktok-follow`, `app-showcase`,
  `data-chart`, `spotify-card`, and transition showcases.

- Observation: The current New Project UI is a full-screen entry page rather
  than a reusable modal.
  Evidence: `ProjectEntryPage` renders the creation/open form, and `AppContent`
  shows it when there is no selected project or when the user invokes the New
  Project flow.

- Observation: The current starter intentionally avoids a nested default
  composition after prior preview instability around nested starter content.
  Evidence: `src/main/lib/ripple-projects/scaffold.ts` now writes only
  `index.html` and returns only the entry composition row. New template work
  must validate nested examples rather than restoring nested starter complexity
  blindly.

- Observation: A third-party `hyperframes-student-kit` repo exists and has
  useful inspiration, but it should not be bundled in the first pass without
  legal/content cleanup.
  Evidence: The repo advertises MIT-licensed code/compositions, but its README
  excludes AIS brand assets from reuse and includes at least one React-via-Babel
  project that does not match Ripple's plain-HTML default.

- Observation: Other community/demo repos are useful moodboards, not safe
  bundled templates.
  Evidence: `hyperframes-launch-video` is a complex reference production rather
  than a permissively reusable template pack; `website-to-hyperframes-demo`
  includes logos, fonts, audio, and captured site clips; `vibe-video` is an
  agent/render pipeline rather than a template library.

## Decision Log

- Decision: Ripple's user-facing word is "Template"; the UI should present one
  gallery of starting points with category filters, while internally the library
  tracks source kind and supported targets.
  Rationale: Users should not need to understand the difference between project
  templates and composition templates. The source-kind and target split is only
  needed so Ripple can install each template safely in the current context.
  Date/Author: 2026-05-01 / Codex

- Decision: The first tile in every chooser is Blank.
  Rationale: Blank is the escape hatch for agent-generated work and should be
  visually obvious as a black/minimal HyperFrames project or composition with
  correct structure, dimensions, and a registered paused timeline.
  Date/Author: 2026-05-01 / User + Codex

- Decision: Templates available from New Project should use full official
  examples first:
  `blank`, `warm-grain`, `play-mode`, `swiss-grid`, `kinetic-type`,
  `decision-tree`, `product-promo`, `nyt-graph`, and `vignelli`.
  Rationale: These are complete HyperFrames project starters documented by the
  official project and fit Ripple's target use cases.
  Date/Author: 2026-05-01 / Codex

- Decision: Templates available from New Composition should start from official
  blocks such as
  `yt-lower-third`, `instagram-follow`, `tiktok-follow`, `app-showcase`,
  `data-chart`, `flowchart`, `spotify-card`, `macos-notification`, `x-post`,
  `reddit-post`, and `logo-outro`.
  Rationale: Blocks install as standalone composition files and include host
  snippets, dimensions, duration, and assets. They match the user's request for
  reusable composition starts better than full examples do.
  Date/Author: 2026-05-01 / Codex

- Decision: Runtime project creation and composition creation must use an
  app-owned local template bundle, not a network fetch.
  Rationale: Ripple is local-first. The user should be able to preview and use
  templates offline, and render-time network fetches are disallowed by the
  HyperFrames rules in `AGENTS.md` and `ROADMAP.md`.
  Date/Author: 2026-05-01 / Codex

- Decision: Treat third-party/community template intake as a later curated
  policy, not part of the first bundled template set.
  Rationale: Community examples are useful for inspiration, but Phase 12 should
  ship license-clean, HyperFrames-native, offline-safe templates before adding
  a broader intake surface.
  Date/Author: 2026-05-01 / Codex

## Outcomes & Retrospective

Not started. This plan is the initial Phase 12 implementation plan.

## Context and Orientation

Phase 12 does not introduce a separate multi-timeline model. In user-facing
Ripple language, `Main` is reserved for the primary project/worktree. The
default top-level HyperFrames composition is the entry composition backed by
`index.html`. Template work should improve project creation and composition
creation without adding multiple top-level renderable timelines to the active
roadmap.

`src/renderer/features/onboarding/project-entry-page.tsx` owns the current
New Project entry surface. It stores `projectName`, calls
`trpc.projects.createRippleProject`, and renders the project name input,
Create Project button, Open Existing Project button, and archived-project
restore list. `src/renderer/App.tsx` shows this page when there is no selected
project or when New Project is invoked from the app shell.

`src/main/lib/trpc/routers/projects.ts` exposes `projects.createRippleProject`,
which already accepts an optional `templateId`, though the current visible UI
does not choose one. The route delegates to
`src/main/lib/ripple-projects/service.ts`. `createRippleProject` normalizes the
name, creates a unique folder under `~/Ripple`, builds scaffold metadata, calls
`writeRippleProjectScaffold`, initializes the hidden local Git repository, runs
setup checks, inserts the project row, inserts initial composition rows, and
sets the active composition.

`src/main/lib/ripple-projects/scaffold.ts` currently hardcodes the generated
starter. It writes `.gitignore`, `index.html`, `hyperframes.json`, `meta.json`,
and `assets/vendor/gsap.min.js`, then returns one composition metadata record
for the entry composition at `index.html`. It has useful safety behavior: it rejects project
folders with unrelated top-level files and refuses to overwrite changed
generated files.

`src/renderer/features/hyperframes/HyperFramesProjectPane.tsx` is the current
project-browser surface and is the natural surface for a New Composition
template action. It fetches
`hyperframes.getProjectBrowserModel`, renders Composition and Assets tabs, shows
composition thumbnail iframes from the prepared preview source, lets users
select a composition, and imports assets through main-process tRPC. A compact
template button belongs near the Compositions tab header and composition rows.

`src/main/lib/trpc/routers/hyperframes.ts` and `src/main/lib/hyperframes/*`
own the safe main-process HyperFrames project boundary. Template creation
operations should live behind typed tRPC procedures in this boundary or a new
`templates` router, not as renderer filesystem writes. Relevant helper families
include project context/path validation, composition discovery, project browser
model creation, prepared player sources, snapshots, and export.

Terms used in this plan:

- Template: Ripple user-facing gallery item.
- Supported target: internal compatibility flag for where a template can be
  used, such as New Project and/or New Composition.
- Example: HyperFrames term for a full project starter scaffolded by
  `hyperframes init --example`.
- Block: HyperFrames registry item that installs a standalone composition file
  and a host snippet into an existing project.
- Component: HyperFrames registry item that installs a smaller effect/snippet,
  usually not a standalone composition.
- Composition: a HyperFrames motion document. The default entry composition is
  backed by `index.html`; additional reusable compositions usually live under
  `compositions/`.

## Plan of Work

Start by turning the research into a curated, app-owned template bundle. The
bundle should live in a packaging-friendly location such as
`resources/hyperframes-templates/` and contain a machine-readable manifest,
template files, assets, and preview media. In development, the main process can
read the bundle from the repository. In packaged builds, Electron should include
the bundle through `electron-builder.yml` or the `build.extraResources`
configuration in `package.json`, and the main process should resolve it through
`process.resourcesPath`.

Create a typed template catalog shared between the main process and renderer.
The catalog should describe each item with `id`, `name`, `description`,
`category`, `sourceKind`, `supportedTargets`, `width`, `height`, `fps`,
`durationSeconds`, `assetPaths`, `previewPosterPath`, `previewVideoPath`,
`sourceUrl`, `license`, `compatibility`, and `version`. The shared type can
live in `src/shared/hyperframes-templates.ts`; main-process file and install
logic can live under `src/main/lib/hyperframes/templates/`.

Use the official examples as the first templates available from New Project:

- Blank: Ripple-owned minimal black starter with correct `index.html`,
  `hyperframes.json`, `meta.json`, `assets/vendor/gsap.min.js`, and one paused
  timeline.
- Warm Grain: branding/lifestyle.
- Play Mode: high-energy social/product launch.
- Swiss Grid: corporate/technical.
- Kinetic Type: promos/title cards.
- Decision Tree: explainers/tutorials.
- Product Promo: multi-scene product showcase.
- NYT Graph: editorial data story.
- Vignelli: portrait headlines/announcements.

Use registry blocks as the first templates available from New Composition:

- Blank composition: a minimal standalone child composition.
- YouTube Lower Third: `yt-lower-third`, landscape overlay.
- Instagram Follow: `instagram-follow`, portrait social overlay.
- TikTok Follow: `tiktok-follow`, portrait social overlay.
- App Showcase: `app-showcase`, landscape product/app demo.
- Data Chart: `data-chart`, landscape chart/story block.
- Flowchart: `flowchart`, explainer block.
- Spotify Now Playing: `spotify-card`, portrait social/music card.
- macOS Notification: `macos-notification`, product/demo overlay.
- X Post Card: `x-post`, landscape social card.
- Reddit Post Card: `reddit-post`, landscape social card.
- Logo Outro: `logo-outro`, landscape brand ending.

Keep transition showcases and components out of the first visible template grid
unless the user explicitly wants them. They are useful later as an Effects or
Blocks library, but the first Phase 12 experience should prioritize starts that
create useful motion graphics, not a gallery of transition samples.

Add template-aware project creation by replacing `writeRippleProjectScaffold`
with a template installer that can either write the existing blank starter or
copy a selected bundled project template. It must preserve the current safe
destination checks, write app-managed GSAP/runtime files locally, rewrite or
reject external scripts/fonts/media, write `meta.json.templateId`, write a
valid `hyperframes.json`, run composition discovery, and return composition
metadata for database insertion.

Add composition creation APIs. A new composition operation should generate a
safe file name under `compositions/`, copy the selected block or blank child
composition plus required assets, avoid collisions, update `hyperframes.json`,
refresh composition rows, and optionally set the new composition as active. It
must not patch `index.html` or offer an "Add to Main" action in Phase 12.

Build a reusable `TemplateChooserDialog` renderer component. In New Project it
appears below the name/open controls and selects a compatible template before
submission. In the project browser, it opens from icon+tooltip controls:
New Composition. The chooser should have a compact grid with poster/hover
preview, user-facing category filters such as Blank, Social, Product, Data,
Title Cards, Lower Thirds, Brand, and Overlays, plus aspect ratio/duration
chips and clear states for unavailable or incompatible templates. Blank remains
first and keyboard-selectable. Technical labels such as example, block,
component, project template, and composition template should not be primary UI
copy.

Template previews should be offline. The first implementation should bundle
static poster PNGs and short muted WebM/MP4 previews generated during
development from the same local template files. If size becomes a concern, use
posters first and add hover video previews only for selected/high-value
templates. Runtime generation can be a fallback for development, but normal app
use should not fetch remote media or call a network registry.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Re-audit current HyperFrames behavior and template sources.
   Read `ROADMAP.md`, `PLANS.md`, this ExecPlan, the installed
   `node_modules/hyperframes/dist/cli.js` init path, and the official
   HyperFrames Examples, Templates, CLI, and Registry docs. Confirm the
   installed package version with `bun pm ls hyperframes @hyperframes/core
   @hyperframes/player @hyperframes/studio @hyperframes/producer`.

2. Build the template bundle skeleton.
   Add `resources/hyperframes-templates/manifest.json`, `project/`, `block/`,
   and `previews/` folders. Add the curated Blank project and Blank composition
   first. Copy official templates only after checking license/source and
   rewriting remote runtime references to local assets. Add packaging
   configuration so the bundle exists in packaged Electron builds.

3. Add shared types and a main-process template catalog.
   Create `src/shared/hyperframes-templates.ts` and
   `src/main/lib/hyperframes/templates/catalog.ts`. Add tests that validate the
   manifest shape, unique IDs, supported target values, file existence, preview
   file existence, and dimensions/durations.

4. Add the template install service.
   Create `src/main/lib/hyperframes/templates/installer.ts` or a similarly
   named module. Implement safe copy helpers that resolve project IDs to local
   paths in the main process, reject writes outside the project, reject or
   rewrite external network dependencies, handle file collisions, update
   `hyperframes.json`, and call `refreshHyperframesCompositions` before
   returning.

5. Refactor project scaffolding to use the installer.
   Update `writeRippleProjectScaffold` or wrap it so
   `projects.createRippleProject({ templateId })` writes a selected project
   template. Keep the existing blank behavior as the first passing path. Extend
   `src/main/lib/ripple-projects/scaffold.test.ts`,
   `src/main/lib/ripple-projects/metadata.test.ts`, and
   `src/main/lib/ripple-projects/lifecycle.test.ts`.

6. Add tRPC routes.
   Add `templates.list`, `templates.getPreview`, and
   `templates.createComposition` or equivalent `hyperframes.*` procedures. Keep
   `projects.createRippleProject` as the project creation endpoint. Validate all
   input with zod and return product-level view models, not absolute filesystem
   paths.

7. Build the shared chooser UI.
   Add `src/renderer/features/templates/TemplateChooserDialog.tsx` or a
   similarly scoped component. Reuse Radix/Tailwind/Ripple UI components and
   lucide icons. The grid must be compact and app-like, not a marketing page.
   Show template poster, optional hover video preview, name, category, aspect
   ratio, and duration. Keep text inside cards/buttons bounded at mobile and
   desktop sizes.

8. Wire New Project.
   Update `ProjectEntryPage` so the existing name/open flow remains, but a
   template gallery appears below it. Submit the selected template ID through
   `projects.createRippleProject`. Widen the entry surface if needed, keep
   Blank first, and preserve archived project recovery.

9. Wire New Composition.
   Update the project browser to show a compact icon button near the
   Compositions section. New Composition opens the chooser filtered to templates
   that can create reusable compositions.
   After success, invalidate `hyperframes.getProjectBrowserModel`, update
   `selectedProjectAtom` with refreshed active-composition state, and show a
   concise success toast. Do not insert the new composition into `index.html`;
   direct placement belongs to a later editor workflow.

10. Add preview generation and QA.
    Generate poster images and optional hover clips for the initial templates.
    Validate that the chooser previews load offline in dev and packaged paths.
    For templates with black first frames, sample a representative frame as
    Phase 6 thumbnails already do.

11. Validate.
    Run focused tests as they are added, then run `bun run test:ripple`,
    `bun run test:hyperframes`, `bun run ts:check`, `bun run build`, and
    `git diff --check`. If template previews or Electron resource paths change,
    run `bun run package:mac` or at least `bun run package` and smoke the
    packaged resource lookup.

12. Live QA.
    Start the app with `bun run dev`. Verify New Project from Blank and at least
    two nonblank compatible templates. Verify New Composition from Blank, YouTube
    Lower Third, Instagram Follow, and App Showcase. Verify created
    templates preview immediately, appear in the pane, use local assets, and do
    not modify `index.html`.

## Validation and Acceptance

Validation commands:

- `bun test src/main/lib/ripple-projects src/main/lib/hyperframes src/shared`
- `bun run test:hyperframes`
- `bun run test:ripple`
- `bun run ts:check`
- `bun run build`
- `git diff --check`
- Packaging/resource smoke when bundle paths change: `bun run package` or
  `bun run package:mac`

HyperFrames checks for curated templates:

- Each New Project-compatible template has `index.html`, `hyperframes.json`,
  `meta.json`, and any required local assets.
- Each New Composition-compatible template has a composition root with
  `data-composition-id`, `data-width`, and `data-height`.
- Timed visible clips have `class="clip"`, `data-start`, `data-duration`, and
  `data-track-index`.
- Timelines are paused and registered on `window.__timelines`.
- `hyperframes lint --json` reports no errors for every bundled template.
- Ripple composition discovery and metadata refresh discover created templates,
  including reusable compositions that are not yet referenced by `index.html`.
- Preview and export do not require network access at render time.

User-visible acceptance criteria:

- New Project shows Blank first and a curated grid of template previews below
  the existing project name/open controls.
- Creating a project with Blank produces a previewable black/minimal
  HyperFrames project.
- Creating a project with a nonblank template copies all local files/assets,
  records `templateId`, selects the entry composition, and previews immediately.
- The project browser has a clear New Composition control.
- New Composition opens the template chooser and creates a valid composition
  under `compositions/` without exposing paths or CLI commands.
- New Composition selects and previews the created composition, but does not
  patch `index.html` or add it to the entry composition.
- Template previews are visible offline.
- Created template assets stay inside the project boundary.

## Idempotence and Recovery

The template catalog should be read-only at runtime. Listing templates and
loading preview media can be repeated safely.

Project creation remains idempotent through the existing unique folder and safe
destination behavior. If a database insert fails after files are written, the
existing error path should report the generated path and preserve the files for
manual recovery, as Phase 2 already does.

Composition creation must be collision-safe. If `compositions/lower-third.html`
exists, the installer should choose a stable suffix such as
`lower-third-2.html` or present an explicit replace flow. Partial failures
should leave existing project files unchanged where practical. If files are
copied before a later validation failure, the service should either clean up
the newly copied files it owns or record the exact files in the error for
manual recovery.

The default entry composition remains backed by `index.html`; Phase 12 template
creation should not create additional top-level timeline files or treat `Main`
as a composition name. Replacing the entry composition is a separate explicit
action and must preserve the previous file. Always keep `hyperframes.json.entry`
valid, and validate any composition before setting it active.

Preview media generation can be rerun from the template bundle. Generated
posters/videos should be deterministic enough that diffs are expected and
reviewable. If preview generation fails for a template, the chooser should show
the poster or a neutral placeholder and the plan should record the template ID
and failure.

## Interfaces and Dependencies

Existing interfaces to use:

- `projects.createRippleProject` in `src/main/lib/trpc/routers/projects.ts`
- `createRippleProject` in `src/main/lib/ripple-projects/service.ts`
- `writeRippleProjectScaffold` in `src/main/lib/ripple-projects/scaffold.ts`
- `refreshHyperframesCompositions` in
  `src/main/lib/hyperframes/compositions.ts`
- `resolveHyperframesProjectContext` and path helpers in
  `src/main/lib/hyperframes/project-context.ts`
- `hyperframes.getProjectBrowserModel` and `hyperframes.getPlayerSource`
- `HyperFramesProjectPane` and existing composition thumbnail logic
- `ProjectEntryPage`
- `selectedProjectAtom` and `toSelectedProject`

New or changed interfaces proposed by this plan:

- `src/shared/hyperframes-templates.ts`
- `src/main/lib/hyperframes/templates/catalog.ts`
- `src/main/lib/hyperframes/templates/installer.ts`
- `resources/hyperframes-templates/manifest.json`
- `templates.list` tRPC query
- `templates.createComposition` tRPC mutation
- `TemplateChooserDialog` renderer component

External dependencies and sources:

- Official HyperFrames Examples:
  `https://hyperframes.heygen.com/examples`
- Official HyperFrames Catalog:
  `https://hyperframes.heygen.com/catalog`
- Official HyperFrames Templates:
  `https://hyperframes.heygen.com/templates`
- HyperFrames CLI docs:
  `https://hyperframes.heygen.com/packages/cli`
- Public registry:
  `https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry/registry.json`
- HyperFrames repo:
  `https://github.com/heygen-com/hyperframes`
- Optional reference only, not direct bundled source:
  `https://github.com/nateherkai/hyperframes-student-kit`
- Optional reference only, not direct bundled source:
  `https://github.com/heygen-com/hyperframes-launch-video`
- Optional reference only, not direct bundled source:
  `https://github.com/heygen-com/website-to-hyperframes-demo`
- Optional architecture reference only:
  `https://github.com/agno-agi/vibe-video`

## Artifacts and Notes

Open product questions for the user:

1. For the Blank tile, should it be a pure black empty stage, or a very minimal
   black stage with faint "Untitled" text so users can see something in the
   preview? Recommendation: pure black for the poster plus a tiny label outside
   the preview card; the generated composition can be empty but valid.
2. Should Phase 12 show only full starts and blocks, or also expose effects
   like Grain Overlay and Shimmer Sweep? Recommendation: keep effects out of
   the first chooser and add an Effects/Components gallery later.
3. How many templates should ship in the first pass? Recommendation: ship the
   9 project starters and a tight 8-11 composition starters listed above, then expand
   once the copy/preview/validation pipeline is solid.

Research summary:

- Official examples are full project starts and are appropriate for New
  Project.
- Official blocks are reusable composition starts and are appropriate for New
  Composition.
- Official components are snippets/effects and should be deferred from the
  first New Project/New Composition chooser.
- The installed package bundles only `blank`, so Ripple must vendor curated
  snapshots if it wants offline template selection for nonblank templates.
- Official Apache-2.0 HyperFrames examples/registry items are the safest
  bundling source after Ripple vendors, rewrites CDN runtime references, records
  license/source metadata, and lints each template.
- Community repos are moodboards unless sanitized into original Ripple-authored
  templates with clean assets and no brand/logo/media carryover.
- Use source links and license notes in the manifest so each bundled template
  is auditable.
