# Agent Closeout

Use this closeout guide when a feature, refactor, or release-prep thread changes Ripple product behavior. Start with focused tests near the change, then expand to the appropriate product and package gates.

## Core Gates

- `bin:stage` stages app-managed provider binaries.
- `package:stage` runs binary and browser staging before packaging.
- `test:quality` checks workflow coverage and quality platform evidence.
- `test:ux` covers renderer and shared UX workflows.
- `test:agent` covers agent runtime, provider, conversation, and attachment behavior.
- `test:export` covers HyperFrames preview/export behavior.
- `test:export:smoke` renders the supported export formats.
- `test:e2e` builds the app and runs Playwright Electron workflows.
- `test:e2e:packaged` runs packaged release QA against an app bundle.
- `test:e2e:update` updates Playwright snapshots for intentional UI changes.
- `test:visual` runs visual-tagged Playwright workflows.
- `test:live` checks live provider connectivity when `RIPPLE_LIVE_PROVIDER_SMOKE=1` is set.
- `test:package:smoke` verifies packaged runtime assets and app-managed CLIs.
- `test:update:smoke` verifies packaged update behavior.
- `test:closeout` runs quality, Ripple, HyperFrames, Bun, TypeScript, E2E, and whitespace gates.
- `test:release` adds database generation, export smoke, package build, and package smoke.

## Suggested Order

1. Run focused tests for the files changed.
2. Run `bun run test:ripple` for product workflow changes.
3. Run `bun run test:hyperframes` for preview, render, export, or visual-context changes.
4. Run `bun test` before claiming repo-wide Bun coverage.
5. Run `bun run ts:check` and `git diff --check`.
6. Run `bun run build`.
7. Run package or release gates when packaging, update, app-managed binary, browser, or Electron runtime behavior changed.

## Product Areas

- Project creation: verify blank projects, templates, project reopening, and managed baselines.
- Templates: verify catalog metadata, template installers, previews, and offline assets.
- Preview: verify center-stage playback, reloads, composition switching, and timeline controls.
- Comments: verify frame comments, range comments, replies, and automatic visual context.
- Revisions: verify proposal creation, refresh, acceptance, and generated-change summaries.
- Provider runtime: verify Codex, Claude, runtime context, approvals, attachments, and app-managed commands.
- Exports: verify Producer render jobs, active preview export routing, and export smoke.
- Analytics: verify event sanitization, consent, contact preferences, and privacy docs.
- App updates: verify updater source, update banner behavior, package metadata, and update smoke.
- Packaging: verify staged binaries, staged browser, packaged runtime assets, signing, and packaged smoke.

For release preparation, follow `docs/release/v1-release-checklist.md` and preserve the exact command output in the release notes or handoff.
