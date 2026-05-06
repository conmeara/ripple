# V2 Exploration: Sequences And Composition Structure

This future-facing plan is parked outside the active Ripple v1 roadmap. If
sequence work returns to the phase track, promote this plan back into `plans/`,
refresh it against the current HyperFrames and Ripple implementation, and update
`ROADMAP.md` at the same time.

## Purpose / Big Picture

This plan records the best-known direction for making Ripple sequence-native
without forcing the v1 release to become a half-built nonlinear editor.

The core product model remains important:

- A sequence is a renderable video/timeline users can preview, comment on,
  revise, and export.
- A reusable composition is a motion block such as a lower third, title card,
  CTA, chart, caption block, or app-shot module.
- A placement is one instance/reference of a reusable composition inside a
  sequence with its own start time, track, stable placement ID, and optional
  per-instance variables.

The current recommendation is a hybrid: sequence-native architecture is the
right long-term model, but visible multi-sequence UX should be gated by a
HyperFrames validation spike. For v1, the safer product posture is a
single-sequence-first surface with reusable composition placement. Additional
visible sequences, video variants, and sequence switching should ship only when
preview, timeline extraction, path resolution, export, and repeated placements
are proven boringly reliable.

HyperFrames still treats both renderable sequences and reusable compositions as
HTML compositions. Ripple owns `Sequence` as a product role for a renderable
HyperFrames entry; HyperFrames itself does not need to expose a separate
sequence primitive.

## Progress

- [x] 2026-05-01 / User + Codex: User confirmed `Sequence` is the right
  user-facing name for top-level renderable timelines and asked to make this a
  roadmap phase before Templates.
- [x] 2026-05-01 / Codex: Researched installed HyperFrames `0.4.40` docs/code,
  local CLI behavior, producer/player affordances, and current Ripple
  implementation assumptions.
- [x] 2026-05-01 / Codex: Prototyped a temp project with `index.html`,
  `sequences/vertical.html`, and `compositions/card.html`. The CLI discovered
  `index.html` and the referenced child composition, but not the standalone
  `sequences/vertical.html`.
- [x] 2026-05-01 / User + Codex: Deferred sequence structure out of the active
  roadmap, moved the plan under `plans/v2/`, and restored Templates and
  Starters as Phase 12.
- [x] 2026-05-05 / User + Codex: Briefly promoted sequence structure into the
  active v1 roadmap as Phase 6B, then reviewed an Oracle product/architecture
  critique recommending a hybrid path.
- [x] 2026-05-05 / User + Codex: Moved this plan back to `plans/v2/` and updated
  it with the hybrid recommendation: sequence-native core, single-sequence-first
  product surface, reusable composition placements, stable source paths, and
  feature-gated multi-sequence UX.
- [ ] Run the validation spike before any visible multi-sequence UX returns to
  the active roadmap.
- [ ] Decide whether v1 should adopt any internal sequence seam, or keep v1
  scoped to the current composition-first roadmap.

## Surprises & Discoveries

- Observation: HyperFrames' authoring model supports Ripple's conceptual split,
  but the installed CLI/Studio project model is `index.html`-first.
  Evidence: Prior research found HyperFrames documentation/source describing
  `index.html` as the top-level composition, external compositions imported
  through `data-composition-src`, and no special framework-level "root" type
  beyond the default entry workflow.

- Observation: `hyperframes compositions --json` did not discover arbitrary
  `sequences/*.html` entries in the prototype.
  Evidence: A temp project under
  `/private/tmp/ripple-hf-sequence-probe-kvFCJ1` returned only `main` and a
  referenced `card` composition. The standalone `sequences/vertical.html` was
  ignored by `compositions`, `lint`, `inspect`, and `render`.

- Observation: The CLI had no documented `--entry`, `--sequence`, or
  `--composition` flag for targeting alternate top-level files in the tested
  `compositions`, `lint`, `snapshot`, or `render` help surfaces.
  Evidence: Direct-file attempts failed as "Not a directory".

- Observation: Lower-level HyperFrames pieces appear more flexible than the CLI.
  Evidence: Prior research found `@hyperframes/player` can load an arbitrary
  composition URL via `src`, Studio has internal safe preview behavior for
  arbitrary composition paths, and `@hyperframes/producer` exposes an
  `entryFile` field in current Ripple export code.

- Observation: Ripple's current app model overloads `composition`.
  Evidence: `src/main/lib/db/schema/index.ts` has
  `projects.activeCompositionId` and `compositions.kind` of `root` / `external`;
  preview, export, comments, agent runtime, and the project pane still use the
  active composition as the render target.

- Observation: A plain reusable composition file is not enough to define
  sequence membership.
  Evidence: The parent sequence needs a host element with `data-composition-id`,
  `data-composition-src`, `data-start`, and `data-track-index`. The temp
  prototype only discovered `compositions/card.html` after it was referenced by
  a host in `index.html`.

- Observation: The strongest Oracle critique was not against the model; it was
  against shipping the full visible multi-sequence surface before v1.
  Evidence: The recommendation was "Sequence-native core, single-sequence-first
  product surface, reusable composition placements, stable source paths, and
  feature-gated multi-sequence UX."

## Decision Log

- Decision: Keep this plan in `plans/v2/`, not in the active v1 phase track.
  Rationale: The sequence/composition/placement model is directionally right,
  but the visible multi-sequence workflow touches preview, timeline, comments,
  revisions, export, agent targeting, and path handling. That breadth is too
  risky for the current v1 finish unless the spike proves every critical path.
  Date/Author: 2026-05-05 / User + Codex.

- Decision: Use `Sequence` as the long-term product name for renderable
  timelines, but consider `Videos` or `Video Variants` as the user-facing label
  when this reaches the UI.
  Rationale: Motion designers understand sequences, editors understand videos
  and cuts, and marketers may understand "Video" or "Variant" faster than
  "Sequence." Code can keep precise domain names while the UI chooses friendlier
  copy.
  Date/Author: 2026-05-05 / Codex.

- Decision: Keep root `index.html` as the default primary render entry for
  compatibility, but never teach users that `index.html` is the product concept.
  Rationale: HyperFrames CLI and default project behavior are `index.html`-first.
  Ripple can hide that implementation detail.
  Date/Author: 2026-05-01 / Codex.

- Decision: If/when additional sequences ship, prefer
  `sequences/<readable-slug>_s_<stable-id>/index.html` over flat
  `sequences/<name>.html`.
  Rationale: Per-sequence folders align with the index-file mental model and
  leave room for future thumbnails, notes, analysis artifacts, and local preview
  cache. The stable suffix prevents collisions and keeps paths durable.
  Date/Author: 2026-05-05 / Codex.

- Decision: Source paths should be stable after creation; ordinary display
  rename should update DB and `meta.json`, not move files or folders.
  Rationale: Readable creation-time slugs make the local project understandable.
  Later path churn can break comments, revisions, exports, agent references, and
  `data-composition-src` references. A later explicit advanced "Rename source
  file/folder" operation can handle source reorganization transactionally.
  Date/Author: 2026-05-05 / Codex.

- Decision: Use project-root-relative source paths in Ripple-authored sequence
  files.
  Rationale: Prior Oracle review called out path resolution risk for
  sequence-folder-relative paths. Authored placement and asset references should
  look like `compositions/lower-third_c_a41d.html` and `assets/logo_a2c1.png`,
  not `../` or `../../` references.
  Date/Author: 2026-05-05 / Codex.

- Decision: Model reusable composition placement explicitly when this work is
  implemented.
  Rationale: Users and agents need stable handles for "this instance of this
  reusable motion block at this time on this timeline." Placement records also
  support comments, variables, affected-sequence warnings, and future drag/drop
  editing.
  Date/Author: 2026-05-01 / Codex.

- Decision: Do not support nested sequences in this plan's first implementation.
  Rationale: Nested sequences add cycle prevention, trimming/duration ambiguity,
  inherited comments, export dependency validation, and revision impact
  analysis. Multiple top-level renderable entries plus reusable composition
  placements must be proven first.
  Date/Author: 2026-05-05 / Codex.

## Outcomes & Retrospective

Not implemented. This plan is a v2 research and architecture record. The active
v1 roadmap remains in `ROADMAP.md`.

## Context and Orientation

Current Ripple has one overloaded composition model. `src/main/lib/db/schema/index.ts`
stores `projects.activeCompositionId` and a `compositions` table whose `kind`
currently behaves like `root` or `external`. The default scaffold in
`src/main/lib/ripple-projects/scaffold.ts` writes `index.html` with
`data-composition-id="main"` and records one composition row named `Main`.

`src/main/lib/ripple-projects/metadata.ts` injects a default `Main` composition
from `hyperframes.json.entry`, and non-entry declarations become external
children of `main`. `src/main/lib/hyperframes/compositions.ts` merges CLI and
declared composition facts, inferring `root` only when a file path equals the
entry. This works for the current single-entry world but is not enough for
future multiple user-visible render entries.

`src/main/lib/hyperframes/player-source.ts` prepares preview documents. It
currently treats only `kind === "root"` and `filePath === "index.html"` as the
root document, then prepares other composition files through Studio helper or
standalone document fallback. Any future sequence implementation must let a
sequence file such as `sequences/instagram-story_s_7f3a/index.html` be prepared
as a top-level preview document, not as a reusable component inspection.

`src/main/lib/exports/service.ts` resolves an export composition from
`input.compositionId` or `project.activeCompositionId`, validates that file as
the `entryFile`, and passes it to the producer executor. This is the promising
export seam: a future sequence implementation can pass the sequence entry path
to the producer, but it must first verify non-root `entryFile` behavior against
the exact installed HyperFrames version.

The renderer project browser lives in
`src/renderer/features/hyperframes/HyperFramesProjectPane.tsx`. It currently has
one `Compositions` tab and selecting a row mutates the active composition. A
future implementation could shift visible language toward `Videos`, `Motion
Blocks`, `Assets`, and `Exports`, while keeping `Sequence` and `Composition` as
code/domain terms.

Terminology:

- Project: a Ripple folder under `~/Ripple/<project-name>`.
- Sequence: long-term domain term for a top-level renderable HyperFrames HTML
  entry. The primary sequence is backed by root `index.html`; additional
  entries would live under `sequences/<readable-slug>_s_<stable-id>/index.html`.
- Video / Video Variant: possible user-facing label for a sequence.
- Composition: reusable HyperFrames HTML motion module under `compositions/`.
- Motion Block: possible user-facing label for a reusable composition.
- Placement: one use of a reusable composition inside a sequence, with stable
  placement ID, source composition ID/path, instance composition ID, start,
  track, resolved duration cache, and optional variable overrides.
- Clip: a timed visual/audio element inside a sequence or composition.

Possible v2 project shape:

```text
~/Ripple/<project-name>/
├── index.html
├── sequences/
│   ├── instagram-story_s_7f3a/
│   │   └── index.html
│   └── square-ad_s_b912/
│       └── index.html
├── compositions/
│   ├── lower-third_c_a41d.html
│   └── product-card_c_9fd2.html
├── assets/
├── hyperframes.json
├── meta.json
└── exports/
```

Recommended placement source shape:

```html
<section
  id="plc_lower_third_9q2d"
  class="clip ripple-placement"
  data-type="composition"
  data-composition-id="lower-third__plc_lower_third_9q2d"
  data-composition-src="compositions/lower-third_c_a41d.html"
  data-start="3.200"
  data-track-index="2"
  data-variable-values='{"headline":"Ada Lovelace","subhead":"Founder"}'
  data-ripple-placement-id="plc_lower_third_9q2d"
  data-ripple-source-composition-id="cmp_a41d"
  data-ripple-role="placement"
></section>
```

HyperFrames-owned attributes are `data-composition-id`,
`data-composition-src`, `data-start`, `data-track-index`, and
`data-variable-values`. Ripple-owned attributes are
`data-ripple-placement-id`, `data-ripple-source-composition-id`, and
`data-ripple-role`.

Do not author `data-duration` on external composition placement hosts as the
normal duration source unless the spike proves a specific HyperFrames behavior
that should become product contract. Placement duration should initially be
runtime/parse-derived and cached in DB.

## Plan of Work

Milestone 0 is a technical validation spike. Build a fixture project in
`/private/tmp` with root `index.html`, two non-root sequence entries under
`sequences/<slug>_s_<id>/index.html`, two reusable compositions under
`compositions/`, an asset under `assets/`, two placements of the same reusable
composition in one sequence, and distinct `data-variable-values` per placement.

The spike must prove:

- Programmatic producer export can render root and non-root `entryFile` values.
- Player preview can load root and non-root sequence entries with correct
  duration and frame seeking.
- Project-root-relative `data-composition-src` and asset paths work in preview
  and export.
- Repeated placements of the same reusable composition do not collide in DOM
  IDs, GSAP selectors, runtime timelines, variables, or rendered output.
- `data-variable-values` overrides differ per placement.
- CLI discovery/lint/render limitations are documented and do not block the
  app-managed path.

Milestone 1, only after a clean spike, is a sequence-native core. Add sequence
and placement models, either as new tables or as a carefully staged domain layer,
while keeping v1-visible UI single-sequence-first unless product scope changes.
Make active render target explicit without forcing users to manage multiple
timelines.

Milestone 2 is reusable composition placement in the primary render target.
Add a Motion Block creation/placement path, typed source patching, placement
IDs, variable overrides, usage count, and affected-sequence warnings for shared
source edits. This may be valuable before full multi-sequence UX, but it still
needs the same source/DB reconciliation guardrails.

Milestone 3 is visible multi-sequence / video variants. Only ship this if
Milestone 0 passes and the UI can stay small. Prefer `Videos` or `Video
Variants` over exposing a full NLE-style "Sequences" manager. Start with
duplicate-as-variant, active video switcher, and export active video. Defer
nested sequences, batch export, deep bins, in/out trimming, precompose from
selection, and sequence-as-source placement.

Milestone 4 is agent topology operations. Agents should use typed operations
for project topology and placements, such as `createSequence`,
`createComposition`, `addCompositionPlacement`, `updatePlacementTiming`,
`updatePlacementVariables`, `editSequenceSource`, and
`editReusableComposition`. Raw file edits should be target-locked to explicit
allowed files and followed by source validation.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Re-read `PLANS.md`, `ROADMAP.md`, this plan, and the relevant files:
   `src/main/lib/db/schema/index.ts`,
   `src/main/lib/ripple-projects/types.ts`,
   `src/main/lib/ripple-projects/metadata.ts`,
   `src/main/lib/ripple-projects/scaffold.ts`,
   `src/main/lib/hyperframes/compositions.ts`,
   `src/main/lib/hyperframes/player-source.ts`,
   `src/main/lib/hyperframes/timeline-model.ts`,
   `src/main/lib/exports/service.ts`,
   `src/main/lib/exports/producer-executor.ts`,
   `src/main/lib/agent-runtime/runtime-context.ts`,
   `src/renderer/features/hyperframes/HyperFramesProjectPane.tsx`,
   `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`,
   `src/renderer/features/hyperframes/HyperFramesTimeline.tsx`,
   and `src/renderer/features/comments/RippleCommentsPane.tsx`.

2. Create the spike fixture under `/private/tmp/ripple-sequence-spike`:

   ```text
   ripple-sequence-spike/
   ├── index.html
   ├── sequences/
   │   ├── instagram-story_s_a1b2/
   │   │   └── index.html
   │   └── square-ad_s_c3d4/
   │       └── index.html
   ├── compositions/
   │   ├── lower-third_c_l3rd.html
   │   └── product-card_c_prod.html
   ├── assets/
   │   └── logo_a_logo.svg
   ├── hyperframes.json
   ├── meta.json
   └── scripts/
       └── render-entry.mjs
   ```

3. Run CLI commands from the fixture:

   ```bash
   npx hyperframes --version
   npx hyperframes compositions --json
   npx hyperframes lint . --json
   npx hyperframes inspect . --json --at 0.5,2.5,4.5
   npx hyperframes snapshot . --at 0.5,2.5,4.5
   npx hyperframes render --output exports/root.mp4 --fps 30 --quality draft
   ```

   Expected likely result: root `index.html` works, while standalone non-root
   sequences are not discovered by stock CLI commands unless HyperFrames has
   changed since the prior spike.

4. Run a programmatic producer render script that calls `createRenderJob` with
   `entryFile` set to `index.html`,
   `sequences/instagram-story_s_a1b2/index.html`, and
   `sequences/square-ad_s_c3d4/index.html`. Confirm output, nonblank frames,
   asset resolution, nested composition resolution, and repeated placement
   variable overrides.

5. Run a player preview spike through a minimal local harness or Ripple preview
   route that loads each entry file through `@hyperframes/player`. Confirm
   readiness, duration, seeking, frame snapshots, asset paths, and repeated
   placement behavior.

6. If the spike passes, update this plan and then decide whether to promote a
   scoped sequence-native core back into active v1 or keep all work as v2.

## Validation and Acceptance

Validation commands for a future implementation:

- `bun test src/main/lib/ripple-projects src/main/lib/hyperframes src/main/lib/exports src/main/lib/agent-runtime src/shared`
- `bun run test:hyperframes`
- `bun run test:ripple`
- `bun run ts:check`
- `bun run build`
- `git diff --check`

Spike go criteria:

- Producer renders root and non-root entries through `entryFile`.
- Player previews root and non-root entries through app-managed source URLs.
- Project-root-relative composition and asset paths work in both preview and
  export.
- Repeated reusable composition placements render correctly and independently.
- Variable overrides differ per placement.
- Comments can anchor to sequence/time/placement IDs in the proposed model.

Spike no-go criteria for visible multi-sequence v1:

- Non-root preview requires persistent source rewriting.
- Producer `entryFile` works inconsistently or only accidentally.
- Repeated external composition instances collide.
- CLI/root-only validation leaves no safe automated path for agents.
- The visible UI needs more than one new mental model to explain basic creation
  and export.

User-visible acceptance criteria for a future v2 promotion:

- The project pane can show Videos, Motion Blocks, Assets, and Exports without
  teaching users source path mechanics.
- Users can place a reusable Motion Block into the active Video without moving
  source files.
- A reusable Motion Block can be placed more than once without ID or runtime
  collisions.
- Users can see when a Motion Block is used in multiple Videos.
- Additional Videos or Video Variants can be created, switched, previewed, and
  exported if the validation spike proves the non-root entry path.

## Idempotence and Recovery

Discovery should be repeatable and non-destructive. If sequence metadata exists
but a file is missing, Ripple should warn instead of deleting references. If a
sequence file exists but metadata is stale, Ripple can offer recovery when safe.

DB should be workflow/index/cache truth. Source HTML/CSS/GSAP/assets remain
render truth. `meta.json` should be a portable mirror that can help rebuild DB
identity and display state, not a second active database. `hyperframes.json`
should stay HyperFrames-facing and should not be overloaded with comments,
revisions, or review workflow state.

Source paths should be stable after creation. Display rename should update DB
and `meta.json` only. A future explicit source-reorganize action must be
transactional, preserve stable IDs, update source references, and recover cleanly
from collisions or filesystem errors.

Adding a placement should be transactional where possible. If source patching
succeeds but database insertion fails, report the patched file and avoid hiding
the change. If database insertion succeeds but preview validation fails, keep
the placement visible with an error state so the user can remove or repair it.

## Interfaces and Dependencies

Existing interfaces likely affected by a future implementation:

- `projects.activeCompositionId`
- `compositions.kind`
- `projects.setActiveComposition`
- `hyperframes.getProjectBrowserModel`
- `hyperframes.getPlayerSource`
- `hyperframes.getTimelineModel`
- `exports.start`
- `agent-runtime/runtime-context`
- `RippleCommentsPane`
- `HyperFramesProjectPane`
- `HyperFramesPreviewPlayer`
- `HyperFramesTimeline`
- `RippleRendersPane`
- `RippleShell`

Possible future interfaces:

- `projects.activeSequenceId`
- `sequences` table
- `sequence_composition_placements` table
- `RippleProjectSequenceItem`
- `RippleProjectReusableCompositionItem`
- `SequenceCompositionPlacement`
- `RippleActiveSequenceState`
- `projects.setActiveSequence`
- `hyperframes.listSequencesAndCompositions`
- `hyperframes.createSequence`
- `hyperframes.renameSequence`
- `hyperframes.addCompositionToSequence`
- `hyperframes.removeCompositionFromSequence`
- `hyperframes.updateCompositionPlacement`
- `exports.start({ sequenceId })`

External/library dependencies:

- HyperFrames CLI `0.4.40` previously behaved as `index.html`-first for stock
  commands; verify current installed behavior before implementation.
- `@hyperframes/player` appears able to load explicit composition URLs.
- `@hyperframes/producer` exposes a programmatic `entryFile` route in current
  Ripple export code, but future work must validate it against the exact
  installed package and non-root entries.
- HyperFrames nested composition semantics rely on `data-composition-src` and
  host timing attributes.
- Do not assume raw HyperFrames CLI discovery is a multi-sequence manifest.

## Artifacts and Notes

Research summary:

- HyperFrames can conceptually support multiple renderable HTML entries through
  lower-level player/producer paths, but stock CLI/Studio workflow has been
  observed as `index.html`-first.
- The sequence/composition/placement model is the right long-term product
  model, especially if Ripple wants to feel like a motion tool rather than a
  generic file editor.
- The full visible multi-sequence workflow is too broad for v1 unless the spike
  is clean and the UI remains simple.
- The best near-term user-facing language may be `Videos`, `Motion Blocks`,
  `Assets`, and `Exports`, with `Sequence`, `Composition`, and `Placement`
  retained in code and data model.
- Use readable stable paths at creation time, then display-only renames by
  default.
- Use project-root-relative paths in authored placement and asset references.
- Agents should use typed topology operations for sequence/composition/placement
  changes rather than broad file-edit instructions.

Recommended stance:

- Keep the active v1 roadmap focused unless/until this plan is explicitly
  promoted again.
- Do the spike before any visible multi-sequence UX.
- If promoted, start with a sequence-native core and reusable placement model,
  then gate multi-sequence UI behind proven preview/export/path behavior.
