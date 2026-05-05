# Phase 19: Hardening And Release Readiness

This ExecPlan must be maintained according to `PLANS.md`. It implements
`ROADMAP.md` Phase 19, "Hardening And Release Readiness".

## Purpose / Big Picture

After this phase, Ripple can be called v1-ready from evidence rather than hope.
The user can install a packaged Ripple build, create or open a local motion
project, preview and revise HyperFrames work, export usable video, opt into or
out of analytics, update the app from Ripple, and recover from common failures
without learning GitHub, repo setup, dependency setup, or release artifact
mechanics.

This phase is a release gate. It does not introduce new product scope unless a
blocker requires a narrowly targeted fix. It audits Phases 0-18 against the
actual implementation, closes primary-path polish and safety gaps, runs current
validation, records manual QA evidence, and produces the final v1 release
checklist.

## Progress

- [x] 2026-05-05 / Codex: Started Phase 19 from the active goal to review
  `ROADMAP.md` and all phases, improve/optimize, and prepare for v1 release.
- [x] 2026-05-05 / Codex: Read `PLANS.md`, `ROADMAP.md`, the phase-plan index,
  current git status, package scripts, release workflow, Phase 15 rebrand notes,
  Phase 16 analytics notes, and Phase 18 app-update notes.
- [x] 2026-05-05 / Codex: Found release-readiness drift: no Phase 19 ExecPlan,
  root `README.md` still described 1Code/21st.dev, `AGENTS.md` architecture
  snapshot still framed implemented Ripple services as future additions, and
  `PreviewSetupHoverCard` used repository language plus local throwaway
  settings atoms.
- [x] 2026-05-05 / Codex: Added `docs/release/v1-release-checklist.md` as the
  prompt-to-artifact release checklist mapping the active objective, phases,
  commands, artifact audits, manual QA, and current findings to evidence.
- [x] 2026-05-05 / Codex: Replaced the root README with a Ripple-focused
  project/development/release guide.
- [x] 2026-05-05 / Codex: Updated `AGENTS.md` architecture snapshot to describe
  the current v1 release-hardening state.
- [x] 2026-05-05 / Codex: Fixed `PreviewSetupHoverCard` to use the shared
  settings atoms, open the Projects settings tab, and avoid repo/GitHub setup
  language in the preview primary path.
- [x] 2026-05-05 / Codex: Excluded duplicated
  `@anthropic-ai/claude-agent-sdk-*` platform packages from packaged builds
  while preserving Ripple's app-managed `Resources/bin/claude`; added package
  configuration coverage for this.
- [x] 2026-05-05 / Codex: Replaced remaining shipped remote-import copy such as
  "Cloning repo" / "Cloning repository" with project/import language, and added
  Ripple-branded macOS camera/microphone permission strings.
- [x] 2026-05-05 / Codex: Ran current automated release gates:
  `bun run ts:check`, `bun run test:ripple`, `bun run test:hyperframes`,
  `bun test`, `bun run build`, `git diff --check`, and `bun run db:generate`.
- [x] 2026-05-05 / Codex: Ran local `electron-builder --dir` package smoke;
  inspected bundle identity, resources, CLI versions, duplicate SDK package
  absence, and package size.
- [x] 2026-05-05 / Codex: Audited roadmap phase navigability and added missing
  `ExecPlan:` links for every implemented non-Phase-0 roadmap phase.
- [x] 2026-05-05 / Codex: Started the companion quality/regression platform
  plan at `plans/quality-regression-platform.md` and linked the testing
  workflow matrix / future-agent closeout artifacts into the roadmap.
- [x] Complete Milestone 0: release-baseline audit and primary-path language
  cleanup.
- [x] Complete Milestone 1: automated gate run and failures fixed or recorded.
- [x] Complete Milestone 2: packaged-resource evidence refresh for local
  package output.
- [ ] Complete Milestone 3: manual QA checklist and final v1 go/no-go.

## Surprises & Discoveries

- Observation: Phase 18 has stronger release evidence than the top-level
  roadmap summary implied.
  Evidence: `plans/phase-18-app-updates.md` records successful GitHub Actions
  beta releases for `0.0.73-beta.1` and `0.0.73-beta.2`, signed/notarized
  artifacts, downloaded `beta-mac.yml` checks, and an in-app packaged
  beta.1-to-beta.2 update validation.

- Observation: The active code has moved beyond the old `ROADMAP.md` "Current
  Codebase Reality" section.
  Evidence: `src/main/lib/ripple-projects/`, `src/main/lib/hyperframes/`,
  `src/main/lib/exports/`, `src/main/lib/revisions/`,
  `src/main/lib/conversations/`, `src/main/lib/agent-runtime/`,
  `src/renderer/features/ripple-shell/`, `src/renderer/features/hyperframes/`,
  `src/renderer/features/comments/`, and `src/renderer/features/renders/`
  exist, while the roadmap section still described HyperFrames integration and
  Ripple domain entities as absent.

- Observation: `PreviewSetupHoverCard` was not only stale copy; its settings
  button did not open the real app settings state.
  Evidence: It declared local `atom(false)` / `atom<string | null>(null)`
  values instead of importing `agentsSettingsDialogOpenAtom` and
  `agentsSettingsDialogActiveTabAtom` from `src/renderer/lib/atoms`.

- Observation: Sequence/composition structure remains v2, not v1 release
  scope.
  Evidence: `plans/v2/sequences-and-composition-structure.md` is modified in
  the working tree and states that visible multi-sequence UX should stay gated
  by a validation spike before returning to the active roadmap.

- Observation: Local package output was carrying a duplicated 205 MB Claude
  binary through the SDK optional platform package.
  Evidence: Before the package optimization, `app.asar.unpacked` was about
  447 MB and contained
  `node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`. After
  excluding `node_modules/@anthropic-ai/claude-agent-sdk-*/**/*`, local package
  output is about 1.5 GB total, `app.asar.unpacked` is about 242 MB, and
  `find release/mac-arm64/Ripple.app/Contents/Resources -path '*claude-agent-sdk-darwin-arm64*'`
  returns no paths.

- Observation: The built output string audit no longer finds the earlier
  shipped "Cloning repo" / "Cloning repository" copy.
  Evidence: After `bun run build`, `rg` over `out`, `resources`, `build`, and
  `package.json` only finds legacy identity strings inside compatibility guards:
  `src/shared/app-identity.ts` output and `src/main/lib/config.ts` output.

- Observation: Local `electron-builder --dir` can package and sign on this
  machine, but notarization remains a CI/credentialed-release gate.
  Evidence: `bun run package` exited 0 and produced
  `release/mac-arm64/Ripple.app`; electron-builder reported
  `skipped macOS notarization` because local notarize options were unavailable.

- Observation: `ROADMAP.md` linked only some phase ExecPlans even though plans
  exist for Phases 1-19 plus 10B.
  Evidence: A roadmap section scan showed missing `ExecPlan:` lines for
  Phases 2, 5, 6, 13, 15, 16, 17, and 18. The roadmap now links every
  implemented non-Phase-0 plan.

## Decision Log

- Decision: Treat Phase 19 as an evidence gate, not a feature catch-all.
  Rationale: Phases 1-18 already cover major product work. New scope this late
  increases release risk unless it fixes a verified blocker.
  Date/Author: 2026-05-05 / Codex.

- Decision: Keep v2 sequence-native work outside the v1 release unless the user
  explicitly promotes it and the validation spike passes.
  Rationale: The sequence plan touches preview, timeline, comments, revisions,
  exports, agent targeting, and source paths. That breadth conflicts with a
  focused v1 hardening gate.
  Date/Author: 2026-05-05 / Codex.

- Decision: Root docs are release artifacts.
  Rationale: A public v1 release cannot ship a README that describes the old
  1Code/21st.dev product, even if app code has been rebranded.
  Date/Author: 2026-05-05 / Codex.

- Decision: Primary-path language fixes should be coupled to code wiring when
  the stale copy points at a broken or misleading action.
  Rationale: The preview setup card had repo language and opened local dummy
  atoms, so copy-only cleanup would leave the user action broken.
  Date/Author: 2026-05-05 / Codex.

- Decision: Remove duplicate packaged provider binaries only when Ripple passes
  an explicit executable path into the provider SDK.
  Rationale: The Claude Agent SDK falls back to optional platform packages only
  when no `pathToClaudeCodeExecutable` is provided. Ripple already passes the
  app-managed `Resources/bin/claude`, so excluding SDK platform packages cuts
  package size without changing the runtime binary source.
  Date/Author: 2026-05-05 / Codex.

## Outcomes & Retrospective

Current outcome: local automated validation and local package/resource smoke are
green after the Phase 19 hardening patches.

Passed local gates on 2026-05-05:

- `bun run ts:check`: passed.
- `bun run test:ripple`: passed, 356 tests / 1424 expectations.
- `bun run test:hyperframes`: passed, 152 tests / 748 expectations.
- `bun test`: passed, 408 tests / 1629 expectations.
- `bun run build`: passed. Vite still reports existing warnings for
  `gray-matter` eval and mixed dynamic/static imports, but exits 0.
- `git diff --check`: passed.
- `bun run db:generate`: passed with "No schema changes, nothing to migrate".
- `bun run package`: passed for local `--dir` output; signing ran locally and
  notarization was skipped because local notarize options are unavailable.

This phase is not complete until manual packaged-app QA, credentialed release
workflow verification, notarized artifact checks, packaged analytics opt-in/off
smoke, packaged update smoke near stable, and real MP4/MOV/WebM export smoke are
all either passed or documented with explicit release blockers.

## Context and Orientation

Ripple is an Electron + React 19 + TypeScript + Vite desktop app using Bun,
tRPC IPC, Drizzle/SQLite, Jotai/Zustand/React Query, Radix/Tailwind, and
HyperFrames `0.4.40`. The current v1 path is a local-first motion project under
`~/Ripple/<project-name>` with `index.html`, `compositions/`, `assets/`,
`hyperframes.json`, `meta.json`, and `exports/`.

Important release surfaces:

- `ROADMAP.md`: durable product roadmap, testing strategy, and MVP release
  criteria.
- `AGENTS.md`: instructions future agents will follow in this repo.
- `README.md`: public repository entry point.
- `docs/release/v1-release-checklist.md`: concrete Phase 19 checklist.
- `docs/testing/ux-workflow-coverage.md`: workflow-to-test coverage matrix.
- `docs/testing/agent-closeout.md`: future-agent closeout protocol.
- `plans/quality-regression-platform.md`: companion quality platform plan.
- `package.json`: scripts, dependencies, electron-builder configuration,
  update publishing metadata, and app identity.
- `.github/workflows/release.yml`: official macOS signed/notarized release
  build and publish workflow.
- `src/main/lib/ripple-projects/`: project creation, paths, metadata,
  lifecycle, scaffold, and app-managed HyperFrames context.
- `src/main/lib/hyperframes/`: preview, player source, composition discovery,
  timeline, snapshot, templates, and runtime wrappers.
- `src/main/lib/exports/`: render/export service and Producer executor.
- `src/main/lib/revisions/`, `src/main/lib/conversations/`, and
  `src/main/lib/agent-runtime/`: review loop and provider execution.
- `src/renderer/features/ripple-shell/`, `src/renderer/features/hyperframes/`,
  `src/renderer/features/comments/`, and `src/renderer/features/renders/`:
  primary Ripple UI.

The current working tree began this pass with an existing modification to
`plans/v2/sequences-and-composition-structure.md`. Treat that v2 plan as
pre-existing work; do not revert it.

## Plan of Work

Milestone 0 establishes the release baseline. Read the roadmap and phase plans,
run primary-path identity/language audits, compare the roadmap's "current
reality" against actual code, update stale release docs, and fix narrow primary
UX issues found by the audit. The output is a current Phase 19 plan and a
release checklist.

Milestone 1 runs automated validation. Start with touched/focused tests, then
run `bun run test:ripple`, `bun test`, `bun run test:hyperframes`,
`bun run ts:check`, `bun run build`, and `git diff --check`. Fix failures that
are caused by Phase 19 changes. If a broader failure is pre-existing, record the
exact command, error summary, and release risk.

Milestone 2 refreshes artifact evidence. Inspect packaged resources and
electron-builder config, verify the GitHub Actions release workflow is still
aligned with Phase 18, refresh package identity/string audits, perform at least
one package smoke when the local machine can do it, and record any CI-only gate
that must be rerun before stable.

Milestone 3 refreshes product smoke evidence. Validate project creation,
preview/timeline, comments/revisions, exports, analytics opt-in/off behavior,
and app update behavior from packaged or fixture-backed paths where possible.
Use manual QA for desktop visual flows that the current automated suite does not
cover.

Milestone 4 closes the final v1 go/no-go. Update this ExecPlan, the release
checklist, and `ROADMAP.md` with final evidence. A go decision requires every
release blocker to be fixed or explicitly accepted by the user.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Inspect current state:
   `git status --short`,
   `rg -n "^### Phase|^Status:" ROADMAP.md`,
   `rg -n "^- \\[ \\]" plans ROADMAP.md`,
   `rg -n "1Code|21st\\.dev|\\.21st|twentyfirst|Set up repository" src README.md AGENTS.md ROADMAP.md package.json resources scripts`.

2. Keep release docs current:
   update `README.md`, `AGENTS.md`, `ROADMAP.md`,
   `plans/phase-19-hardening-and-release-readiness.md`, and
   `docs/release/v1-release-checklist.md` when evidence changes.

3. Run focused validation for touched code:
   `bun test src/renderer/features/agents/components/preview-setup-hover-card.tsx`
   if a colocated test is added, otherwise run the nearest existing renderer
   suites that exercise the header/preview settings behavior.

4. Run broad automated gates:
   `bun run test:ripple`,
   `bun test`,
   `bun run test:hyperframes`,
   `bun run ts:check`,
   `bun run build`,
   and `git diff --check`.

5. Check package/resource identity:
   run a package smoke if possible, inspect the generated app bundle/resource
   list, and rerun the string audit against shipped paths.

6. Refresh release-update evidence:
   inspect `.github/workflows/release.yml`, latest GitHub Actions release runs,
   beta/stable release metadata, and packaged in-app update smoke notes.

7. Refresh analytics/export evidence:
   run analytics sanitizer/config tests, perform packaged PostHog opt-in/off
   smoke when official-build config is available, and validate MP4/MOV/WebM
   output with FFprobe/frame checks in a validated environment.

8. Complete manual QA checklist in `docs/release/v1-release-checklist.md`.

## Validation and Acceptance

Automated acceptance:

- `bun run test:ripple` passes.
- `bun test` passes.
- `bun run test:hyperframes` passes.
- `bun run ts:check` passes.
- `bun run build` passes.
- `git diff --check` passes.
- Primary-path string audit has no unreviewed 1Code/21st/repo-first hits.

Release acceptance:

- `docs/release/v1-release-checklist.md` has current evidence for every phase,
  command, artifact audit, and manual QA item.
- `README.md`, `AGENTS.md`, and `ROADMAP.md` describe Ripple v1 state.
- Packaged app creates/opens local projects without sign-in.
- Preview/timeline, comments/revisions, template creation, agent setup prompts,
  visual context, and export flows pass manual or automated evidence checks.
- MP4, MOV, and WebM export outputs are real and valid in a validated
  environment.
- Packaged official-build analytics smoke proves opt-in/off behavior and
  forbidden payload exclusion.
- App update N-to-N+1 packaged install is refreshed near stable release.
- No release-blocking primary-path `1Code`, `21st.dev`, repo-first,
  app-entry-auth-gated, or Remotion/generic-app-preview assumption remains.

## Idempotence and Recovery

Documentation updates are repeatable. Re-run audits after every code or doc
change and update only the evidence that changed.

Validation commands are repeatable. If a command fails, record the exact command
and failure summary before patching. If a command modifies generated files, use
`git diff` to inspect whether the change is intended before keeping it.

Package and release checks may require local signing credentials, GitHub
Actions secrets, or a clean CI runner. If local packaging is blocked by this
machine, use CI evidence and record the local blocker rather than weakening the
release gate.

Do not revert pre-existing user changes, including the current v2 sequence plan
modification. If a pre-existing change conflicts with v1 release scope, document
the conflict and ask the user before moving or discarding it.

## Interfaces and Dependencies

Primary dependencies:

- Bun scripts in `package.json`.
- Electron/electron-builder package configuration in `package.json` and
  `electron-builder.yml`.
- GitHub Actions release workflow `.github/workflows/release.yml`.
- HyperFrames package family pinned at `0.4.40`.
- FFmpeg/FFprobe via bundled or system resolution for render validation.
- PostHog official-build env for analytics smoke.
- Apple signing/notarization secrets for macOS release workflow.

Interfaces under release review:

- `desktopApi` update, analytics, project, preview, and export methods.
- tRPC routers for `projects`, `hyperframes`, `exports`, `revisions`,
  `conversations`, and `agent-runtime`.
- Packaged CLI wrappers under `resources/cli/`.
- App-managed agent skills under `resources/agent-skills/` and
  `resources/claude-plugins/`.

## Artifacts and Notes

Current Phase 19 artifacts:

- `plans/phase-19-hardening-and-release-readiness.md`
- `docs/release/v1-release-checklist.md`
- `README.md`
- `AGENTS.md`
- `ROADMAP.md`

Current known pre-existing worktree change:

- `plans/v2/sequences-and-composition-structure.md`

Initial release-readiness findings from this pass:

- Root `README.md` was still the old 1Code README.
- `AGENTS.md` still described key Ripple services as future additions.
- `ROADMAP.md` current-state language still needs release-state refresh.
- `PreviewSetupHoverCard` had stale repository copy and disconnected settings
  atoms.
