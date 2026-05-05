# Ripple Testing Platform

Ripple's v1 quality system is organized around user workflows, not raw line
coverage. The source of truth is the workflow matrix in
`docs/testing/ux-workflow-coverage.md`; every row must have automated coverage
or an explicit release-gate smoke.

## Command Tiers

- Fast touched-area checks: run the narrow command from
  `docs/testing/agent-closeout.md`.
- Workflow coverage check: `bun run test:quality`.
- Product UX regression sweep: `bun run test:ux`.
- Agent/runtime sweep: `bun run test:agent`.
- Export/HyperFrames sweep: `bun run test:export`.
- Desktop UX automation: `bun run test:e2e`.
- Visual regression snapshot lane: `bun run test:visual`, or
  `bun run test:e2e:update` after an intentional UI change.
- Credentialed provider smoke: `bun run test:live` with
  `RIPPLE_LIVE_PROVIDER_SMOKE=1` and `RIPPLE_LIVE_PROVIDER=codex|claude`.
- Normal Ripple gate: `bun run test:ripple`.
- Full local closeout: `bun run test:closeout`.
- Release gate: `bun run test:release`, which runs closeout, schema drift,
  real export smoke, package, and package smoke; then complete the manual and
  credentialed gates in `docs/release/v1-release-checklist.md`.
- Packaged update gate: `bun run test:update:smoke -- --from-release <tag> --to-version <version>`
  when a signed/notarized published app must prove N-to-N+1 update install.

`test:package:smoke` expects an existing local package at
`release/mac-arm64/Ripple.app` on macOS unless `RIPPLE_PACKAGED_APP` points at a
different app bundle. `test:export:smoke` is the real render-format smoke and
should be run in a validated environment with browser/FFmpeg access.
`test:update:smoke` downloads a published macOS ZIP, launches it with isolated
home/userData, drives the packaged update APIs, and verifies the updated app
with macOS signing/notarization checks.

## Electron E2E Artifacts

`bun run test:e2e` builds the app and launches the built Electron main process
with Playwright. Each test gets an isolated temporary `HOME`, so project
creation writes to a disposable `~/Ripple` instead of the user's real library.
Failures retain:

- Playwright traces: `test-results/ripple-e2e/**/trace.zip`
- Screenshots: `test-results/ripple-e2e/**/final-screen.png`
- Renderer/main logs: `test-results/ripple-e2e/**/electron.log`
- HTML report: `playwright-report/ripple-e2e/`

Set `RIPPLE_E2E_KEEP_ARTIFACTS=1`, `RIPPLE_E2E_TRACE=always`, or
`RIPPLE_E2E_SCREENSHOT=always` when a future agent needs extra local evidence.
Visual baselines live under `test/e2e/__screenshots__/` and should only be
updated with `bun run test:e2e:update` after reviewing the UI change.

## Future-Agent Rule

Before claiming a Ripple change is done, identify the workflow IDs touched in
`docs/testing/ux-workflow-coverage.md`, run the matching command set from
`docs/testing/agent-closeout.md`, and record any manual/release-gated evidence
that still cannot be automated locally.
