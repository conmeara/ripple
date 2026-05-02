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
- [x] 2026-05-01 / Codex: Implemented Milestone 0. The first catalog uses
  Ripple-authored, offline-safe template sources keyed to official
  HyperFrames example/block IDs and records source URL, license, compatibility,
  version, category, dimensions, duration, and supported targets in the bundle
  manifest.
- [x] 2026-05-01 / Codex: Implemented Milestone 1. Added
  `resources/hyperframes-templates/`, shared template types, the main-process
  catalog loader, validation tests, and Electron package resources.
- [x] 2026-05-01 / Codex: Implemented Milestone 2. New Project now shows the
  reusable template gallery below the name/open controls and passes the
  selected template ID through project creation.
- [x] 2026-05-01 / Codex: Implemented Milestone 3. The project browser
  Compositions pane now has a New Composition action that opens the filtered
  template chooser, creates the composition through main-process tRPC, selects
  it, refreshes project browser state, and does not patch `index.html`.
- [x] 2026-05-01 / Codex: Implemented Milestone 4. Template previews are
  bundled offline as poster media loaded from the app-owned resource bundle.
  Hover video previews remain a future enhancement rather than a runtime
  network dependency.
- [x] 2026-05-01 / Codex: Implemented Milestone 5. Added focused catalog,
  scaffold, and installer regression tests; ran HyperFrames lint against every
  generated project template and a host project containing every composition
  template; ran Ripple/HyperFrames suites, type check, build, diff hygiene, and
  packaging/resource smoke.
- [x] 2026-05-01 / User + Codex: Added the full public HyperFrames catalog to
  Phase 12 scope. User direction: include the full catalog of templates,
  blocks, components, and other items from
  `https://hyperframes.heygen.com/catalog/`, make them selectable as project or
  composition starts where appropriate, and replace the generic thumbnail with
  a real preview for every selectable tile.
- [x] 2026-05-01 / Codex: Added a bundle refresh script that reads the official
  docs catalog index, downloads registry item manifests/sources/assets, and
  vendors official catalog preview PNGs into
  `resources/hyperframes-templates/`.
- [x] 2026-05-01 / Codex: Expanded the bundle to 55 selectable items: 9 New
  Project starters and 47 New Composition starters. Composition starters now
  include every official catalog block plus every official catalog component as
  a previewable composition with its snippet copied alongside it.
- [x] 2026-05-01 / Codex: Replaced the shared generic preview poster with 55
  distinct preview poster files: official catalog PNGs for catalog items and
  generated local SVG posters for project starters.
- [x] 2026-05-01 / Codex: Updated the installer so official catalog HTML is
  copied through main-process path validation, uses Ripple's local GSAP runtime,
  rewrites bundled asset references into template-specific asset folders, and
  removes render-time font/CDN fetches.
- [x] 2026-05-01 / Codex: Added regression coverage for the full catalog counts,
  unique preview paths, official components, copied snippets, copied assets, and
  local runtime sanitization. A generated temp-project audit installed every
  project template and every catalog composition template; `hyperframes lint
  --json` reported zero errors.
- [x] 2026-05-01 / Codex: Added hover previews to every Phase 12 template tile.
  Cards now crossfade from the static poster into an animated hover/focus
  preview using the real poster image, a play affordance, a shine pass, and a
  scrub-style progress sweep. This covers all 55 selectable templates without
  adding heavy video payloads to the catalog response.
- [x] 2026-05-01 / User + Codex: Upgraded the hover previews from poster-motion
  treatments to actual rendered motion previews for the whole catalog. Added a
  local render script, generated 55 MP4 clips from the bundled HyperFrames
  template sources, linked them from the manifest, and changed the chooser to
  play the local MP4 on hover/focus with the poster treatment as fallback.

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

- Observation: The first shipped template bundle was intentionally
  Ripple-authored rather than a verbatim registry snapshot.
  Evidence: `resources/hyperframes-templates/manifest.json` preserves official
  source IDs/URLs/license metadata, while `project/starter.html` and
  `block/starter.html` render local, parameterized HyperFrames documents with
  no network URLs.

- Observation: The public docs expose a machine-readable catalog index with
  official preview PNG URLs for every catalog item.
  Evidence: `docs/public/catalog-index.json` in the HyperFrames repository lists
  item name, type, title, description, tags, docs href, and
  `https://static.heygen.ai/hyperframes-oss/docs/images/catalog/...` preview
  image URLs for all public catalog blocks and components.

- Observation: Official catalog source files commonly reference CDN GSAP and
  Google Fonts, and some blocks use project-root asset paths that collide across
  items.
  Evidence: Vendored files such as
  `resources/hyperframes-templates/catalog/instagram-follow/instagram-follow.html`
  and `resources/hyperframes-templates/catalog/app-showcase/app-showcase.html`
  include remote runtime/font references in the upstream source. Ripple rewrites
  those at install time and stores assets under
  `assets/hyperframes-catalog/<template-id>/...`.

- Observation: Packaged resource lookup works through Electron's resources
  directory.
  Evidence: `bun run package` produced
  `release/mac-arm64/1Code.app/Contents/Resources/hyperframes-templates/`
  with `manifest.json`, project/block template sources, and preview poster
  media. The packaged bundle was 44K.

- Observation: The local package smoke required one approved network-capable
  package run because Electron packaging fetched cached/build dependencies
  outside the restricted sandbox.
  Evidence: The first sandboxed `bun run package` failed on DNS during the
  Electron download path; the approved rerun completed and skipped only macOS
  notarization because local notarization options are not configured.

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

- Decision: `templates.list` returns poster data URLs directly; there is no
  separate `templates.getPreview` endpoint in the first pass.
  Rationale: The preview media is small, local, and static. Returning it with
  the catalog simplifies offline chooser rendering while keeping absolute
  bundle paths out of the renderer.
  Date/Author: 2026-05-01 / Codex

- Decision: Full public catalog items are installed from vendored official
  registry sources, while project examples continue to use Ripple-normalized
  project starters.
  Rationale: Blocks and components can be added as reusable compositions with
  their own assets/snippets. Full official examples remain project starters in
  the New Project flow, but Ripple keeps the project starter implementation
  normalized for local-first project creation and current scaffold stability.
  Date/Author: 2026-05-01 / Codex

- Decision: Official components are selectable in New Composition as
  previewable composition demos, with their original component snippets copied
  into `compositions/components/`.
  Rationale: Users asked for the full catalog to be addable from the chooser.
  Components are not full compositions upstream, so Ripple makes them useful in
  this UX by installing a previewable composition and preserving the snippet for
  later editing workflows.
  Date/Author: 2026-05-01 / Codex

- Decision: Hover previews should prefer rendered local MP4 clips, with the
  poster-motion treatment kept only as a fallback.
  Rationale: The official catalog currently exposes poster previews but not
  motion preview URLs. Rendering clips from the same bundled HyperFrames sources
  gives the chooser real motion previews while preserving Ripple's local-first
  behavior and avoiding runtime network fetches.
  Date/Author: 2026-05-01 / User + Codex

- Decision: Catalog motion preview clips are generated at a maximum dimension
  of 960 pixels, 24fps, draft quality, and stored as MP4 under
  `resources/hyperframes-templates/previews/videos/`.
  Rationale: This preserves real motion and aspect ratio for every template
  while keeping the complete preview video set around 13M.
  Date/Author: 2026-05-01 / Codex

## Outcomes & Retrospective

Phase 12 full-catalog pass is implemented.

What shipped:

- A packaged, app-owned HyperFrames template bundle with 55 selectable items:
  9 New Project-compatible starts and 47 New Composition-compatible starts,
  including Blank first in both contexts.
- The full public HyperFrames catalog from `https://hyperframes.heygen.com/catalog/`:
  official blocks, transitions, showcases, social overlays, data blocks, and
  components.
- A durable catalog refresh script at
  `scripts/update-hyperframes-template-bundle.ts` that vendors the official
  catalog index, registry item manifests/sources/assets, and preview PNGs.
- Shared template catalog types, main-process manifest validation, and
  renderer-safe template view models with offline poster previews.
- A distinct preview poster and a rendered MP4 motion preview for every
  selectable template. Catalog items use official preview PNGs from the
  HyperFrames docs site; project starters use generated local SVG posters; all
  motion previews are generated locally from the vendored HyperFrames sources.
- Hover previews for every selectable template tile, using the rendered local
  MP4 on hover and keyboard focus, with the poster animation retained as a
  fallback.
- A durable motion-preview render script at
  `scripts/render-hyperframes-template-motion-previews.ts`, exposed through
  `bun run templates:motion-previews`.
- Template-aware project creation that preserves existing safe destination
  checks, writes local runtime assets, records `templateId`, and derives
  initial project dimensions from the selected template unless callers
  explicitly override them.
- A New Project template gallery that keeps the existing name and Open Existing
  Project flow intact.
- A New Composition flow in the project browser that creates reusable
  composition files under `compositions/`, updates `hyperframes.json`, refreshes
  composition rows, selects the created composition, and leaves `index.html`
  unchanged.
- Official catalog assets are copied into template-specific project folders and
  official catalog components are copied as both previewable compositions and
  preserved snippets.
- Electron packaging configuration that includes the offline template bundle,
  poster previews, and motion-preview MP4s in packaged app resources.

Validation completed:

- `bun test src/main/lib/hyperframes/templates src/main/lib/ripple-projects/scaffold.test.ts`
  passed.
- `bun test src/renderer/features/templates src/main/lib/hyperframes/templates
  src/main/lib/ripple-projects/scaffold.test.ts` passed.
- `bun run templates:motion-previews` rendered 55 MP4 clips and updated all 55
  `previewVideoPath` manifest entries.
- A manifest/file audit confirmed 55 MP4 files, zero missing video paths, a 13M
  `previews/videos/` directory, and a 27M total template bundle.
- An `ffprobe` audit confirmed every MP4 has valid width, height, duration, and
  frame count.
- `bun run test:ripple` passed.
- `bun run test:hyperframes` passed.
- `bun run ts:check` passed.
- `bun run build` passed.
- `git diff --check` passed.
- `bun run package` passed, and the packaged app bundle contained a 33M
  `hyperframes-templates/` resource bundle with 55 manifest entries, 55
  preview poster files, and 55 preview MP4 files.
- `hyperframes lint --json` reported zero errors for every generated New
  Project template and for a host project containing every New Composition
  template from the full catalog.

Remaining follow-up candidates:

- Add live Electron QA for the full click path from New Project and New
  Composition once a dev app session is requested.
- Add cleanup-or-error-manifest behavior for rare partial composition install
  failures after file copy but before metadata write.

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

Template previews should be offline. The implementation bundles static poster
media plus short muted MP4 previews generated during development from the same
local template files. Runtime app use should not fetch remote media or call a
network registry.

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
