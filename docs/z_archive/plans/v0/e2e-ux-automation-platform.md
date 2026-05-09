# Build Ripple Electron UX Automation

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

Ripple needs a regression platform that clicks through the real desktop app,
captures visual evidence, and leaves future agents with artifacts they can use
to prove whether launch, project creation, preview, review, and export flows
still work. After this change, `bun run test:e2e` launches the built Electron
app in an isolated temporary home, drives the v1 workflows with Playwright, and
keeps screenshots, traces, logs, and render/export evidence tied into the local
and CI quality gates.

## Progress

- [x] 2026-05-05 / Codex: Audited the current quality platform, Electron app
  entry, onboarding, Ripple shell, preview player, renders pane, comments pane,
  package scripts, and release workflow.
- [x] 2026-05-05 / Codex: Installed `@playwright/test` for Electron automation.
- [x] 2026-05-05 / Codex: Add stable UI selectors and the Playwright Electron
  harness.
- [x] 2026-05-05 / Codex: Add E2E workflow scenarios, visual snapshot coverage,
  live-provider smoke structure, docs, and CI wiring.
- [x] 2026-05-05 / Codex: Run validation commands and record evidence here.

## Surprises & Discoveries

- Observation: Existing `test:release` already performs real render-format
  smokes and packaged-app smoke checks, but it does not click the renderer.
  Evidence: `package.json` has `test:export:smoke`,
  `test:package:smoke`, and `test:release`.
- Observation: Built Electron can avoid the dev server because
  `src/main/windows/main.ts` loads `out/renderer/index.html` when
  `ELECTRON_RENDERER_URL` is unset.
  Evidence: `createWindow()` calls `window.loadFile(...)` in the no-dev-server
  branch.
- Observation: The first-run dialog is intentionally skippable, which gives E2E
  a clean way to prove local creation is not auth-gated.
  Evidence: `RippleFirstRunDialog` has a `Set up later` action that sets the
  onboarding atom to `seenSkipped`.
- Observation: `app-showcase` installs as the root `index.html` composition,
  not as `compositions/app-showcase.html`.
  Evidence: the E2E template workflow now asserts `templateId:
  "app-showcase"` in `hyperframes.json` and app-showcase text in `index.html`.
- Observation: Electron project creation still uses `app.getPath("home")`, so
  Playwright isolation must override Electron's home path in addition to the
  process `HOME` environment variable.
  Evidence: `src/main/index.ts` honors `RIPPLE_E2E_HOME_DIR` and
  `RIPPLE_E2E_USER_DATA_DIR` before app state is initialized.
- Observation: Bun's default test discovery will attempt to import
  `*.e2e.test.ts` files.
  Evidence: a full `bun test` run failed until the Playwright specs were
  renamed to `*.e2e.ts` and `test/e2e/playwright.config.ts` was updated to
  match that pattern.

## Decision Log

- Decision: Use Playwright's Electron launcher against the built app rather
  than the hot dev server.
  Rationale: The release risk is the packaged-style renderer/main wiring, not
  Vite HMR. The built path also avoids devtools windows and makes CI simpler.
  Date/Author: 2026-05-05 / Codex.
- Decision: Keep E2E isolated by overriding `HOME`, XDG folders, and artifact
  directories per test.
  Rationale: Project creation must write under a temp `~/Ripple`, not the
  user's real project library, and each run should be repeatable.
  Date/Author: 2026-05-05 / Codex.
- Decision: Combine broad deterministic unit/integration coverage with focused
  click-through E2E scenarios and release-gated live/provider smokes.
  Rationale: Some workflows require credentials, signed packages, or expensive
  renders, but the everyday regression gate should still prove the core UX loop
  with real mouse/keyboard actions.
  Date/Author: 2026-05-05 / Codex.

## Outcomes & Retrospective

Implemented the E2E platform and wired it into the v1 quality system:

- Playwright launches the built Electron app with isolated temp home/user-data
  directories.
- Real click-through scenarios cover skippable onboarding, blank project
  creation, preview/timeline visibility, preview play/pause, mouse-based
  timeline seeking, Renders pane exposure, bundled template creation, layout
  pane toggling, comment creation, and export controls.
- Visual regression uses a checked-in Playwright screenshot baseline for the
  project-entry surface.
- Failure artifacts include Playwright traces, final screenshots, Electron
  renderer/main logs, and retained temp homes.
- `test:live` provides opt-in Codex/Claude account smoke checks without mutating
  projects.
- CI/reporting exists in `.github/workflows/ripple-quality.yml` with E2E,
  export, package, and artifact-upload steps.

One local validation issue was environmental rather than source-level: the
installed esbuild binary in `node_modules` had to have local extended
attributes cleared before `bun run build` could execute it. After that, the
repeatable source commands below passed.

## Context and Orientation

Ripple is an Electron + React desktop app. `src/main/index.ts` initializes the
main process, database, runtime checks, and windows. `src/main/windows/main.ts`
creates the BrowserWindow and loads either the dev URL or built renderer file.
`src/renderer/App.tsx` shows `ProjectEntryPage` when no project is selected and
the Ripple shell after a project is selected.

The user-visible v1 workflow starts in
`src/renderer/features/onboarding/project-entry-page.tsx`, optionally shows
`RippleFirstRunDialog`, creates a HyperFrames project under `~/Ripple`, then
opens `src/renderer/features/ripple-shell/RippleShell.tsx`. The center pane is
`HyperFramesPreviewPlayer`, the right pane switches between chat/comments and
`RippleRendersPane`, and the comment review loop lives in
`RippleCommentsPane`.

The existing quality platform is documented in `docs/testing/README.md` and
`docs/testing/ux-workflow-coverage.md`. Unit and integration coverage is
already wired through `test:quality`, `test:ux`, `test:agent`,
`test:export`, `test:ripple`, `test:closeout`, and `test:release`. This plan
adds the missing real Electron click-through layer.

## Plan of Work

Add stable `data-testid` attributes to user-facing shell regions and controls
that Playwright needs: project entry, first-run dialog actions, template cards,
Ripple shell, preview player, comments pane, and renders pane. Then add
`test/e2e/playwright.config.ts`, a reusable Electron fixture in
`test/e2e/helpers/ripple-electron.ts`, and workflow tests under `test/e2e`.

The helper launches the built app through the installed Electron binary, points
`HOME` and XDG paths at a temp directory, records trace data, captures
screenshots/logs on failure, and exposes filesystem helpers for checking the
created `~/Ripple/<project>` artifacts. E2E tests should use real clicks,
fills, keyboard input, role locators, and screenshot comparisons where the UI
is deterministic.

Package scripts, docs, release checklist, and CI should treat E2E artifacts as
first-class evidence. Live/provider tests remain opt-in and credential-gated so
default local runs never require real Codex or Claude accounts.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Add stable selectors to the renderer surfaces used by the E2E scenarios.
2. Create the Playwright Electron config and helper fixture.
3. Add E2E tests for fresh launch/onboarding/project creation/preview, template
   creation/layout toggles/renders pane, and comments/review composer behavior.
4. Add live-provider smoke scaffolding and update `package.json` scripts.
5. Update testing docs, the workflow matrix, quality verifier, and CI workflow.
6. Run `bun run test:e2e:update`, `bun run test:e2e`, `bun run test:quality`,
   focused unit tests for touched files, `bun run ts:check`, and any feasible
   release smoke commands.
7. Record command outcomes and remaining risks in this plan.

## Validation and Acceptance

Acceptance criteria:

- `bun run test:e2e` builds Ripple and launches Electron with Playwright.
- E2E tests drive the app with mouse/keyboard actions, not only mocked units.
- The harness writes isolated temp projects under a temp `~/Ripple`.
- Failures retain screenshots, traces, and renderer logs under Playwright
  artifacts.
- At least one deterministic Playwright screenshot comparison guards a stable
  UI surface.
- Render-fidelity remains backed by `bun run test:export:smoke`, and package
  release evidence remains backed by `bun run test:release`.
- CI has an automated workflow that runs quality, E2E, export smoke, and
  package smoke/report upload where feasible.

Validation commands:

- `bun run test:e2e:update` passed 2026-05-05: 2 Electron tests.
- `bun run test:e2e` passed 2026-05-05 after the `.e2e.ts` rename: 2 Electron
  tests.
- `bunx playwright test --config test/e2e/playwright.config.ts` passed
  2026-05-05 after adding preview play/pause and mouse-seek coverage: 2
  Electron tests.
- `bun run test:visual` passed 2026-05-05 after the `.e2e.ts` rename: 1
  Playwright visual test.
- `bun run test:closeout` passed 2026-05-05 after the `.e2e.ts` rename.
- `bun run test:release` passed 2026-05-05 after the Electron E2E gate was
  added to closeout; local macOS notarization was skipped because local
  notarize options were unavailable.
- `bun run test:release` passed again 2026-05-05 after the preview interaction
  E2E strengthening: quality verifier found 36 workflow rows and 14 package
  scripts; the full Bun suite passed 411 tests / 1711 expectations; Playwright
  passed 2 Electron tests; `drizzle-kit generate` reported no schema changes;
  MP4/MOV/WebM export smoke passed; packaged app smoke found
  `release/mac-arm64/Ripple.app` OK at 1.5G. Local macOS notarization was
  skipped because local notarize options were unavailable.
- `bun run test:quality` passed 2026-05-05 after Phase 19 package-staging
  hardening: 3 tests / 88 expectations; verifier found 36 workflow rows and 16
  package scripts.
- `bun run test:ux` passed 2026-05-05: 129 tests / 458 expectations.
- `bun run test:agent` passed 2026-05-05: 97 tests / 321 expectations.
- `bun run test:export` passed 2026-05-05: 152 tests / 748 expectations.
- `bun run test:export:smoke` passed 2026-05-05: MP4, MOV, and WebM outputs.
- `bun run test:live` passed 2026-05-05 in default skip mode; credentialed
  smokes remain opt-in with `RIPPLE_LIVE_PROVIDER_SMOKE=1`.
- `bun run test:ripple` passed 2026-05-05: 363 tests / 1459 expectations.
- `bun test` passed 2026-05-05 after the `.e2e.ts` rename: 411 tests / 1711
  expectations.
- `bun run ts:check` passed 2026-05-05.
- `bun run test:release` when the machine has the required packaged-app and
  render dependencies.

## Idempotence and Recovery

The Playwright helper creates a fresh temp home per test and deletes it after
success unless `RIPPLE_E2E_KEEP_ARTIFACTS=1` is set. If Electron fails to
launch, inspect the retained trace/log artifacts under `test-results/` and run
`bun run build` manually before retrying. If a screenshot changes for an
intentional UI update, run `bun run test:e2e:update` and review the snapshot
diff before committing.

Live/provider smokes must stay opt-in through environment variables. If no
credentials are present, default local and CI quality commands should skip those
checks with a clear message instead of failing the whole suite.

## Interfaces and Dependencies

- `@playwright/test` provides the Electron launcher, locators, screenshot
  assertions, trace capture, and test runner.
- The installed `electron` package provides the executable used to load
  `out/main/index.js`.
- `bun run build` must produce `out/main/index.js` and
  `out/renderer/index.html`.
- `scripts/smoke-ripple-export-formats.ts` remains the real render-fidelity
  smoke for MP4, MOV, and WebM.
- `.github/workflows/ripple-quality.yml` will run the automated gate in CI.

## Artifacts and Notes

Artifact conventions:

- Playwright report: `playwright-report/ripple-e2e/`.
- Test output, traces, screenshots, and logs: `test-results/ripple-e2e/`.
- Export smoke videos: `test-results/ripple-export-smoke/`.
- Packaged app smoke evidence: `release/mac-arm64/Ripple.app` or
  `RIPPLE_PACKAGED_APP`.
