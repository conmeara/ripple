# V2 Exploration: Sequences And Composition Structure

This future-facing plan is parked outside the active Ripple roadmap. If sequence
work returns, promote it back into the phase track and refresh it against the
current HyperFrames and Ripple implementation before building from it.

## Purpose / Big Picture

After this phase, Ripple speaks the language of motion graphics instead of
HTML entry files. Users see `Sequences`, `Compositions`, and `Assets` in the
project browser. `Main` is the default sequence backed by `index.html`, and a
project can have additional top-level renderable sequences such as
`Instagram Story`, `Product Demo`, or `Square Ad`, typically backed by files
under `sequences/`.

A sequence is a top-level timeline a user can preview, comment on, and export.
A composition is a reusable motion piece, such as a lower third, title card,
CTA, chart, or app-shot module, that can be placed inside one or more sequences.
Users should be able to choose which compositions go into which sequence through
app UI rather than by editing `data-composition-src` manually.

HyperFrames still treats both sequences and reusable compositions as HTML
compositions. Ripple adds the product model on top: sequence discovery,
active-sequence state, reusable-composition placement, sequence-scoped comments,
and sequence-targeted export.

## Progress

- [x] 2026-05-01 / User + Codex: User confirmed `Sequence` is the right
  user-facing name for top-level renderable timelines and asked to make this
  the new Phase 12 before Templates.
- [x] 2026-05-01 / Codex: Moved Templates and Starters to Phase 13 and updated
  `ROADMAP.md` to reserve Phase 12 for sequence structure.
- [x] 2026-05-01 / User + Codex: Deferred sequence structure out of the active
  roadmap, moved this plan under `plans/v2/`, and restored Templates and
  Starters as Phase 12.
- [x] 2026-05-01 / Codex + sub-agents: Researched installed HyperFrames
  `0.4.40` docs/code, local CLI behavior, producer/player affordances, and
  current Ripple implementation assumptions.
- [x] 2026-05-01 / Codex + sub-agent: Prototyped a temp project with
  `index.html`, `sequences/vertical.html`, and `compositions/card.html`.
  The CLI discovered `index.html` and the referenced child composition, but not
  the standalone `sequences/vertical.html`.
- [ ] Implement Milestone 0: sequence model spike and final technical contract.
- [ ] Implement Milestone 1: durable database/shared model for sequences,
  reusable compositions, and placements.
- [ ] Implement Milestone 2: main-process sequence discovery, validation, and
  active-sequence APIs.
- [ ] Implement Milestone 3: preview, timeline, comments, and export target
  active sequences.
- [ ] Implement Milestone 4: project browser UI separates Sequences,
  Compositions, and Assets.
- [ ] Implement Milestone 5: sequence composition placement UI and source
  patching.
- [ ] Implement Milestone 6: validation, QA, and Phase 13 handoff.

## Surprises & Discoveries

- Observation: HyperFrames' authoring model supports Ripple's conceptual split,
  but the installed CLI/Studio project model is `index.html`-first.
  Evidence: `node_modules/@hyperframes/core/docs/core.md` says `index.html` is
  the top-level composition, any composition can be imported into another
  composition, and there is no special "root" type at the framework level.
  The installed CLI commands still resolve a project around `<project>/index.html`.

- Observation: `hyperframes compositions --json` does not discover arbitrary
  `sequences/*.html` entries.
  Evidence: A temp project under
  `/private/tmp/ripple-hf-sequence-probe-kvFCJ1` returned only `main` and a
  referenced `card` composition. The standalone `sequences/vertical.html`
  was ignored by `compositions`, `lint`, `inspect`, and `render`.

- Observation: `hyperframes lint --json` scanned only `index.html` and the
  referenced child composition in the prototype.
  Evidence: The prototype lint result was ok with `filesScanned: 2`, excluding
  `sequences/vertical.html`.

- Observation: The CLI has no documented `--entry`, `--sequence`, or
  `--composition` flag for targeting alternate top-level files in
  `compositions`, `lint`, `snapshot`, or `render`.
  Evidence: The prototype checked the installed `hyperframes --help` surfaces
  and direct-file attempts failed as "Not a directory".

- Observation: Lower-level HyperFrames pieces are more flexible than the CLI.
  Evidence: Research found `@hyperframes/player` can load an arbitrary
  composition URL via `src`, Studio has an internal safe preview route for
  arbitrary composition paths, and `@hyperframes/producer` has a programmatic
  `entryFile` field defaulting to `index.html`.

- Observation: Ripple's current app model overloads `composition`.
  Evidence: The database has `projects.activeCompositionId` and
  `compositions.kind` with `root` / `external`; preview, export, comments, and
  the project pane all use a single active composition ID.

- Observation: Current generated projects store `entry: "index.html"` and
  `compositions: ["index.html"]` in `hyperframes.json`, but installed
  HyperFrames default config does not treat `hyperframes.json` as a
  multi-entry manifest.
  Evidence: Current Ripple scaffold writes those fields for its own metadata,
  while the installed HyperFrames config defaults are focused on registry and
  paths.

- Observation: A plain reusable composition file is not enough to define
  sequence membership. The parent sequence needs a host element with
  `data-composition-id`, `data-composition-src`, `data-start`,
  `data-duration`, and `data-track-index`.
  Evidence: The temp prototype only discovered `compositions/card.html` after
  it was referenced by a host in `index.html`.

## Decision Log

- Decision: Use `Sequence` as Ripple's user-facing name for top-level
  renderable timelines.
  Rationale: Motion designers understand sequences as timelines containing
  multiple compositions. `index`, `root`, and `entry` are implementation terms.
  Date/Author: 2026-05-01 / User + Codex

- Decision: Keep `Main` as the default sequence backed by `index.html`.
  Rationale: This preserves compatibility with HyperFrames CLI/Studio defaults
  while hiding the filename from primary UX.
  Date/Author: 2026-05-01 / Codex

- Decision: Add additional sequences as app-owned top-level entries, likely
  under `sequences/`, rather than multiple files named `index.html`.
  Rationale: A project folder cannot have multiple root `index.html` files, and
  distinct sequence files are easier to display, validate, preview, and export.
  Date/Author: 2026-05-01 / Codex

- Decision: Ripple must own sequence discovery and active-sequence state.
  Rationale: HyperFrames CLI `0.4.40` does not discover arbitrary
  `sequences/*.html`, so relying on the stock CLI composition list would hide
  user-created sequences.
  Date/Author: 2026-05-01 / Codex

- Decision: Model reusable composition placement explicitly in app data.
  Rationale: Users need to answer "which compositions are in this sequence?"
  without parsing HTML mentally. A placement record also gives Ripple stable UI
  handles for timing, track, comments, and future drag/drop editing.
  Date/Author: 2026-05-01 / Codex

- Decision: Do not rename all internal code in one sweep.
  Rationale: `compositionId` is woven through preview, timeline, comments,
  revisions, and export. Phase 12 should introduce sequence-safe aliases and
  migrations, keep compatibility where needed, and retire old names
  incrementally.
  Date/Author: 2026-05-01 / Codex

## Outcomes & Retrospective

Not started. This plan is the initial Phase 12 implementation plan.

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
multiple user-visible sequences.

`src/main/lib/hyperframes/player-source.ts` prepares preview documents. It
currently treats only `kind === "root"` and `filePath === "index.html"` as the
root document. Any Phase 12 implementation must let a sequence file such as
`sequences/product-demo.html` be prepared as the active top-level preview
document.

The renderer project browser lives in
`src/renderer/features/hyperframes/HyperFramesProjectPane.tsx`. It currently
has one `Compositions` tab and selecting a row mutates the active composition.
Phase 12 should split this into a product model with `Sequences`, reusable
`Compositions`, and `Assets`.

Preview, timeline, comments, revisions, and export currently follow
`activeCompositionId`. Important surfaces include
`HyperFramesPreviewPlayer.tsx`, `HyperFramesTimeline.tsx`,
`RippleCommentsPane.tsx`, `RippleShell.tsx`, and
`src/main/lib/exports/service.ts`. Phase 12 should rename the user-facing and
new shared model to active sequence while keeping compatibility with existing
IDs during the migration.

Terminology:

- Project: a Ripple folder under `~/Ripple/<project-name>`.
- Sequence: a top-level renderable HyperFrames HTML composition. `Main` is the
  default sequence backed by `index.html`; additional sequences can live under
  `sequences/`.
- Composition: a reusable HyperFrames HTML motion piece under `compositions/`.
- Placement: one use of a reusable composition inside a sequence, with start,
  duration, track, source file, and instance key.
- Clip: a timed visual/audio element inside a sequence or composition.

## Plan of Work

Milestone 0 is a short technical contract spike. Verify the programmatic
Producer `entryFile` path against a non-`index.html` standalone sequence, not
just CLI render. Verify Ripple's existing prepared player source can serve
`sequences/foo.html` as a top-level document after path validation. Verify how
timeline extraction behaves for a non-index sequence file and for a reusable
composition mounted through `data-composition-src`. Record the exact result in
this plan before implementing broad schema changes.

Milestone 1 adds the durable model. Add `activeSequenceId` to projects while
temporarily preserving `activeCompositionId`. Either migrate `compositions.kind`
to `sequence` / `component` or introduce separate `sequences` and
`compositions` tables. The lower-risk first implementation is likely a typed
kind migration plus a new `sequence_compositions` placement table, because many
existing joins already expect composition IDs. The placement table should
include `id`, `projectId`, `sequenceId`, `compositionId`, `sourceFile`,
`instanceKey`, `trackIndex`, `start`, `duration`, `createdAt`, and `updatedAt`.

Milestone 2 makes discovery app-owned. Extend `hyperframes.json` parsing so
Ripple can read explicit entries such as:

```json
{
  "entry": "index.html",
  "sequences": [
    { "id": "main", "name": "Main", "path": "index.html" },
    { "id": "instagram-story", "name": "Instagram Story", "path": "sequences/instagram-story.html" }
  ],
  "compositions": [
    { "id": "lower-third", "name": "Lower Third", "path": "compositions/lower-third.html" }
  ]
}
```

Keep accepting the current `compositions: ["index.html"]` shape for existing
projects. Discovery should validate that each path stays inside the project,
exists, has a valid HyperFrames composition root, and does not rely on
render-time network resources.

Milestone 3 retargets active preview/export/comment state from composition to
sequence. Add `projects.setActiveSequence`, teach player source preparation to
serve any valid sequence file as the top-level document, and update export to
accept `sequenceId`. The existing `compositionId` routes can remain as
compatibility aliases while renderer state moves to `activeSequenceId`.

Milestone 4 updates the project browser. Replace the single Compositions tab
with sections or tabs for Sequences, Compositions, and Assets. Selecting a
sequence updates preview/timeline/comments/export. Selecting a reusable
composition should inspect it or prepare it for insertion, not replace the
active sequence unless the user explicitly opens it as a component preview.

Milestone 5 adds placement. Users need a clear way to place a reusable
composition into the active sequence. First pass can be a simple "Add to
Sequence" action on a composition row that appends a host element at the current
playhead or end of the sequence. Later work can add drag/drop into the
timeline. The main process should patch the sequence HTML using structured DOM
parsing where practical, not brittle string concatenation. After patching,
Ripple updates `sequence_compositions`, refreshes the project browser model,
and reloads the preview.

Milestone 6 hardens validation and hands off to Phase 13. Phase 13 templates
should depend on Phase 12's sequence/component model: project templates create a
default Main sequence; sequence templates create new top-level sequence files;
composition templates create reusable components and can optionally place them
inside the active sequence.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Re-read `PLANS.md`, `ROADMAP.md`, this plan, and the relevant files:
   `src/main/lib/db/schema/index.ts`,
   `src/main/lib/ripple-projects/metadata.ts`,
   `src/main/lib/ripple-projects/scaffold.ts`,
   `src/main/lib/hyperframes/compositions.ts`,
   `src/main/lib/hyperframes/player-source.ts`,
   `src/main/lib/exports/service.ts`,
   `src/renderer/features/hyperframes/HyperFramesProjectPane.tsx`,
   `src/renderer/features/hyperframes/HyperFramesPreviewPlayer.tsx`,
   and `src/renderer/features/comments/RippleCommentsPane.tsx`.

2. Run the Milestone 0 spike in `/private/tmp`. Create a standalone sequence
   file under `sequences/`, a reusable composition under `compositions/`, and a
   Main `index.html` that mounts the reusable composition. Verify CLI behavior,
   programmatic Producer `entryFile`, player source behavior, linting,
   composition discovery, and render output. Update this plan with the exact
   command summaries.

3. Add schema and shared model changes. Generate a Drizzle migration after the
   current latest migration. Add or update shared types for
   `RippleProjectSequenceItem`, `RippleProjectReusableCompositionItem`,
   `SequenceCompositionPlacement`, and active sequence state.

4. Update scaffold/metadata. Write new projects with `Main` as a sequence,
   create an empty `sequences/` folder, keep `index.html` for compatibility,
   and write metadata that can represent multiple sequences and reusable
   compositions.

5. Update discovery. Add a Ripple-owned sequence/composition discovery function
   that reads metadata and validates project-local files. Keep
   `hyperframes compositions --json` as a helper for `index.html` and mounted
   children, not as the only source of truth.

6. Update active selection routes. Add `projects.setActiveSequence` or an
   equivalent product-level route. Keep `setActiveComposition` as a compatibility
   path until all callers move.

7. Update preview and timeline. Teach player-source and timeline model code to
   treat any valid sequence as a top-level preview target. Preserve the ability
   to inspect reusable compositions where useful, but make sequence selection
   the main path.

8. Update comments and revisions. Scope comments to the active sequence, with
   optional component/element metadata when a comment targets a reusable
   composition placed inside that sequence. Avoid losing existing
   `compositionId` rows; map them to sequence IDs when they represent old root
   compositions.

9. Update export. Accept `sequenceId`, label exports by sequence name, and pass
   the sequence file path to the Producer path validated in Milestone 0. Do not
   let reusable components export directly unless rendered through a sequence.

10. Update project browser UI. Split Sequences, Compositions, and Assets. Add
    empty states, active sequence highlighting, and composition usage indicators
    such as "Used in Main" or "Used in 2 sequences".

11. Add placement MVP. Implement Add to Sequence for reusable compositions with
    guarded source patching and placement row creation. Verify repeated
    placements of the same composition get unique instance keys.

12. Run validation and update this plan with results.

## Validation and Acceptance

Validation commands:

- `bun test src/main/lib/ripple-projects src/main/lib/hyperframes src/main/lib/exports src/shared`
- `bun run test:hyperframes`
- `bun run test:ripple`
- `bun run ts:check`
- `bun run build`
- `git diff --check`

Focused tests to add or extend:

- `src/main/lib/ripple-projects/metadata.test.ts`: multiple sequences plus
  reusable compositions.
- `src/main/lib/ripple-projects/scaffold.test.ts`: default `Main` sequence,
  `sequences/` folder, and compatibility metadata.
- `src/main/lib/hyperframes/compositions.test.ts`: app-owned discovery does not
  drop non-`index.html` sequences.
- `src/main/lib/hyperframes/player-source.test.ts`: non-index sequence previews
  as a top-level document.
- `src/main/lib/exports/service.test.ts`: export active sequence, reject stale
  sequence, and prevent direct component export where unsafe.
- `src/renderer/features/hyperframes/project-model.test.ts`: group/sort
  Sequences vs Compositions and mark active sequence.
- `src/renderer/features/hyperframes/preview-comment-markers.test.ts`: comments
  scope by sequence.
- Renderer tests for project browser grouping, active sequence selection, and
  Add to Sequence behavior.

User-visible acceptance criteria:

- The project browser shows Sequences, Compositions, and Assets separately.
- `Main` appears as the default sequence; users do not see `index.html` as the
  primary concept.
- Users can create or register more than one sequence in a project.
- Selecting a sequence updates the preview, timeline, comments, and export
  target.
- A reusable composition can be added to more than one sequence.
- A sequence shows which reusable compositions it contains, and a composition
  shows where it is used.
- Export works for `Main` and for at least one non-`index.html` sequence.
- Comments created on one sequence do not appear as active comments on another
  sequence unless explicitly filtered to all comments.

## Idempotence and Recovery

Discovery should be repeatable and non-destructive. If a sequence file exists
but metadata is stale, the refresh path should recover it when safe. If metadata
references a missing sequence file, the UI should show a recoverable warning
instead of deleting user work silently.

Migrations should preserve existing projects by mapping current `root` rows to
`sequence` and current `external` rows to reusable compositions. Existing
`projects.activeCompositionId` should populate `activeSequenceId` when it
points to a root/main row. Old comments and exports should remain readable.

Adding a placement should be transactional where possible. If source patching
succeeds but database insertion fails, report the patched file and avoid hiding
the change. If database insertion succeeds but preview validation fails, keep
the placement visible with an error state so the user can remove or repair it.

Never overwrite `index.html` as part of creating a new sequence. Additional
sequences should use collision-safe paths under `sequences/`, such as
`product-demo.html`, `product-demo-2.html`, and so on.

## Interfaces and Dependencies

Existing interfaces affected:

- `projects.activeCompositionId`
- `compositions.kind`
- `projects.setActiveComposition`
- `hyperframes.getProjectBrowserModel`
- `hyperframes.getPlayerSource`
- `exports.start`
- `RippleCommentsPane`
- `HyperFramesProjectPane`
- `HyperFramesPreviewPlayer`
- `HyperFramesTimeline`
- `RippleShell`

New or changed interfaces proposed:

- `projects.activeSequenceId`
- `CompositionKind = "sequence" | "component"` or
  `"sequence" | "reusable"`
- `sequence_compositions` placement table
- `RippleProjectSequenceItem`
- `RippleProjectReusableCompositionItem`
- `SequenceCompositionPlacement`
- `projects.setActiveSequence`
- `hyperframes.listSequencesAndCompositions`
- `hyperframes.addCompositionToSequence`
- `hyperframes.removeCompositionFromSequence`
- `exports.start({ sequenceId })`

External/library dependencies:

- HyperFrames CLI `0.4.40` remains `index.html`-first for stock commands.
- `@hyperframes/player` can load explicit composition URLs.
- `@hyperframes/producer` appears to expose a programmatic `entryFile` route
  that Phase 12 must validate before export depends on it.
- HyperFrames nested composition semantics rely on `data-composition-src` and
  host timing attributes.

## Artifacts and Notes

Sub-agent research summary:

- Framework research: HyperFrames can conceptually support multiple top-level
  HTML entries through lower-level player/producer paths, but the CLI/Studio
  project model does not expose multi-sequence discovery.
- Prototype research: `hyperframes compositions --json` found only `main` and a
  referenced `card`; it ignored `sequences/vertical.html`. `lint` scanned only
  two files. Main rendered successfully to MP4, while direct file targets failed
  as "Not a directory".
- Ripple mapping research: current app state uses `activeCompositionId` across
  preview/export/comments and `kind: root | external`; Phase 12 should split
  this into sequences, reusable compositions, and placement records.

Recommended first implementation stance:

- Keep `index.html` as the default Main sequence for compatibility.
- Add `sequences/` for additional top-level sequence HTML files.
- Do not rely on HyperFrames CLI composition discovery for sequences.
- Validate `@hyperframes/producer` `entryFile` and player-source serving before
  committing to export support for non-index sequences.
- Build the placement model before Phase 13 templates so template insertion can
  cleanly create either a new sequence or a reusable composition and optionally
  place it inside the active sequence.
