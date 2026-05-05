# Ripple Quality And Regression Platform

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

After this work, Ripple has a professional quality system that future agents can
use to close the loop before claiming changes are done. The system maps each
core v1 user workflow to automated tests or explicit release-gate evidence,
adds deterministic fixtures and smoke scripts for package/export risks, and
documents which commands to run when a particular product surface changes.

This is not a raw coverage-percentage project. It is a workflow confidence
project: project creation, preview/timeline, comments, revisions, agents,
exports, onboarding, analytics, updates, packaging, failure recovery, and layout
all have named coverage rows and closeout commands.

## Progress

- [x] 2026-05-05 / Codex: Started from the assigned goal to build Ripple's v1
  quality and regression platform.
- [x] 2026-05-05 / Codex: Audited the current suite, including `package.json`,
  `ROADMAP.md`, `docs/release/v1-release-checklist.md`, Phase 19 notes, and the
  existing `*.test.ts` / `*.test.tsx` inventory.
- [x] 2026-05-05 / Codex: Added `docs/testing/ux-workflow-coverage.md` with 36
  workflow rows mapped to automated evidence or release gates.
- [x] 2026-05-05 / Codex: Added `docs/testing/agent-closeout.md` and
  `docs/testing/README.md` so future agents can choose the right commands.
- [x] 2026-05-05 / Codex: Added deterministic HyperFrames fixture
  `test/fixtures/hyperframes/basic-title-card`.
- [x] 2026-05-05 / Codex: Added package/export smoke scripts:
  `scripts/smoke-packaged-ripple.mjs` and
  `scripts/smoke-ripple-export-formats.ts`.
- [x] 2026-05-05 / Codex: Added quality tests under `test/quality` and
  `scripts/verify-ripple-quality-platform.mjs`.
- [x] 2026-05-05 / Codex: Added package scripts for `test:quality`, `test:ux`,
  `test:agent`, `test:export`, `test:export:smoke`,
  `test:package:smoke`, `test:closeout`, and `test:release`; expanded
  `test:ripple` to include onboarding and template tests.
- [x] 2026-05-05 / Codex: Ran `bun run test:quality`; it passed with 3 tests
  and verified 36 workflow rows plus 10 package scripts.
- [x] 2026-05-05 / Codex: Ran the new workflow tiers:
  `bun run test:ux`, `bun run test:agent`, and `bun run test:export`.
- [x] 2026-05-05 / Codex: Ran `bun run test:export:smoke`; the first attempt
  caught an invalid fake timeline fixture, then the fixture was upgraded to use
  a real paused GSAP timeline and MP4/MOV/WebM smoke renders passed.
- [x] 2026-05-05 / Codex: Ran `bun run test:closeout`; it passed the quality
  verifier, focused Ripple and HyperFrames suites, full Bun suite,
  TypeScript, production build, and whitespace check.
- [x] 2026-05-05 / Codex: Ran `bun run test:package:smoke` and
  `bun run db:generate`; the packaged app smoke passed and no schema changes
  were generated.
- [x] 2026-05-05 / Codex: Ran `bun run test:release`; it passed closeout,
  schema drift, export smoke, package, and package smoke. Local macOS
  notarization was skipped because notarize options are not configured locally.

## Surprises & Discoveries

- Observation: `test:ripple` did not include the onboarding or template hover
  tests even though both are v1 user-facing surfaces.
  Evidence: The pre-change `package.json` `test:ripple` script omitted
  `src/renderer/features/onboarding` and `src/renderer/features/templates`.

- Observation: The release checklist already named many manual gates, but it
  was not enough for future-agent closeout because it did not map changed
  surfaces to commands.
  Evidence: `docs/release/v1-release-checklist.md` has release gates, while the
  new `docs/testing/agent-closeout.md` adds the surface-to-command map.

- Observation: A static HTML fixture with a hand-written `window.__timelines`
  object is not enough to prove export correctness.
  Evidence: The first `bun run test:export:smoke` failed with
  `duration is not a function`; switching the fixture to a real paused GSAP
  timeline made MP4, MOV, and WebM render/probe successfully.

## Decision Log

- Decision: Treat quality as a workflow platform, not a coverage percentage.
  Rationale: Ripple is a desktop motion tool. A high coverage number would not
  prove packaged resources, exports, provider boundaries, or review workflows.
  Date/Author: 2026-05-05 / Codex.

- Decision: Keep release-only evidence explicit instead of pretending it can all
  run locally on every commit.
  Rationale: Official PostHog smoke, signed/notarized updates, and real export
  format validation need credentials, packaged builds, browsers, or FFmpeg.
  Date/Author: 2026-05-05 / Codex.

- Decision: Make the workflow matrix executable with `test:quality`.
  Rationale: A static matrix decays quickly unless CI or local tests assert that
  required workflow IDs, scripts, evidence paths, and release-gate references
  still exist.
  Date/Author: 2026-05-05 / Codex.

## Outcomes & Retrospective

The v1 quality platform is implemented and locally validated. The workflow
matrix covers 36 named user journeys and the verifier keeps the matrix, package
scripts, fixtures, evidence paths, and closeout docs from drifting. The new
command tiers let future agents choose targeted UX, agent/runtime, export,
package, or full closeout sweeps instead of guessing from the entire suite.

The export smoke was worth adding immediately: it caught a non-renderable test
fixture that normal file-presence checks would have missed. That failure is now
covered by a real paused GSAP timeline fixture and FFprobe validation for MP4,
MOV, and WebM outputs.

## Context and Orientation

Ripple's existing test suite is mostly Bun tests in `src/**`. The broad
regression commands before this work were `bun test`, `bun run test:ripple`,
`bun run test:hyperframes`, `bun run ts:check`, `bun run build`, and release
checks documented in Phase 19.

Important artifacts:

- `docs/testing/ux-workflow-coverage.md`: user workflow coverage matrix.
- `docs/testing/agent-closeout.md`: future-agent surface-to-command protocol.
- `docs/testing/README.md`: command tier overview.
- `test/quality/*.test.ts`: tests for quality-platform integrity.
- `test/fixtures/hyperframes/basic-title-card`: deterministic smoke fixture.
- `scripts/verify-ripple-quality-platform.mjs`: matrix/script verifier.
- `scripts/smoke-packaged-ripple.mjs`: packaged app contract smoke.
- `scripts/smoke-ripple-export-formats.ts`: real MP4/MOV/WebM render smoke.
- `package.json`: command entry points.

## Plan of Work

Milestone 0 audits the current test suite and creates the living workflow
matrix. Each row identifies a user journey, acceptance condition, automated
evidence, command, release gate, and status.

Milestone 1 adds future-agent closeout commands and scripts. The package scripts
must separate fast workflow sweeps, agent/runtime checks, HyperFrames/export
checks, package smokes, and full release candidate gates.

Milestone 2 adds deterministic fixture assets and smoke scripts for risks that
normal unit tests do not catch: packaged app resources and real export formats.

Milestone 3 makes the platform self-checking with `test:quality`. The verifier
must fail if workflow IDs, package scripts, evidence paths, closeout docs, or
release-gate references drift.

Milestone 4 validates the new command tiers, updates roadmap/agent instructions,
and records remaining release-only evidence in the release checklist.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple`.

1. Inspect `package.json`, `ROADMAP.md`, `docs/release/v1-release-checklist.md`,
   `plans/phase-19-hardening-and-release-readiness.md`, and the `*.test.ts`
   inventory.
2. Update or create the testing docs under `docs/testing/`.
3. Add deterministic fixtures under `test/fixtures/`.
4. Add quality tests under `test/quality/`.
5. Add smoke/verifier scripts under `scripts/`.
6. Add package scripts for workflow, quality, agent, export, package, closeout,
   and release gates.
7. Update `ROADMAP.md`, `AGENTS.md`, and Phase 19 docs to point at the quality
   platform.
8. Run validation commands and update this plan with results.

## Validation and Acceptance

Required local validation for this platform:

- `bun run test:quality` passes.
- `bun run test:ux` passes.
- `bun run test:agent` passes.
- `bun run test:export` passes.
- `bun run test:ripple` passes with onboarding and templates included.
- `bun run ts:check` passes.
- `bun run build` passes.
- `git diff --check` passes.

Release-candidate validation:

- `bun run test:package:smoke` passes after `bun run package`.
- `bun run test:export:smoke` passes in a validated render environment.
- `bun run test:release` passes when local packaging/notarization prerequisites
  are available, or the release checklist records any CI-only gate explicitly.

Acceptance criteria:

- Every core Ripple v1 UX journey has a row in
  `docs/testing/ux-workflow-coverage.md`.
- Every automated row references concrete test files and commands.
- Every release-gated row references `docs/release/v1-release-checklist.md`.
- Future agents have an obvious closeout protocol.
- The quality platform itself has tests that fail on drift.

## Idempotence and Recovery

Docs and verifier tests are safe to rerun. If a workflow row changes, run
`bun run test:quality` immediately so missing scripts or stale evidence paths
are caught near the edit.

`test:package:smoke` expects a package to exist; run `bun run package` first or
set `RIPPLE_PACKAGED_APP`. `test:export:smoke` creates a temporary project and
deletes it unless `RIPPLE_KEEP_EXPORT_SMOKE=1` is set.

If export smoke fails because a browser, FFmpeg, or FFprobe is missing, record
that in `docs/release/v1-release-checklist.md` and do not weaken the workflow
matrix.

## Interfaces and Dependencies

Created interfaces:

- package scripts: `test:quality`, `test:ux`, `test:agent`, `test:export`,
  `test:export:smoke`, `test:package:smoke`, `test:closeout`, `test:release`
- verifier: `scripts/verify-ripple-quality-platform.mjs`
- package smoke: `scripts/smoke-packaged-ripple.mjs`
- export smoke: `scripts/smoke-ripple-export-formats.ts`

Dependencies:

- Bun test runner
- Electron builder output for package smoke
- HyperFrames CLI and Producer runtime for export smoke
- FFprobe for export metadata validation
- Phase 19 release checklist for manual/credentialed gates

## Artifacts and Notes

Current command evidence:

- `bun run test:quality`: passed, 3 tests / 82 expectations; verifier reported
  36 workflow rows and 14 package scripts.
- `bun run test:ux`: passed, 129 tests / 458 expectations.
- `bun run test:agent`: passed, 97 tests / 321 expectations.
- `bun run test:export`: passed, 152 tests / 748 expectations.
- `bun run test:ripple`: passed, 363 tests / 1459 expectations with onboarding
  and templates included.
- `bun run test:export:smoke`: passed for MP4, MOV, and WebM; FFprobe confirmed
  640x360 video streams.
- `bun run test:closeout`: passed after the Electron E2E layer was added and
  Playwright specs were isolated from Bun discovery; the full-suite segment
  reported 411 tests / 1711 expectations.
- `bun run test:package:smoke`: passed against `release/mac-arm64/Ripple.app`.
- `bun run db:generate`: passed with no schema changes.
- `bun run test:release`: passed after the Electron E2E gate was added to
  closeout; it reran the closeout gate, confirmed no schema changes, rendered
  MP4/MOV/WebM, rebuilt `release/mac-arm64/Ripple.app`, skipped local
  notarization for missing local notarize options, and passed package smoke
  against the rebuilt app.
