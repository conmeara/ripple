# Ripple V1 Release Checklist

This checklist is the concrete release artifact for `ROADMAP.md` Phase 19. It
maps the user request, roadmap phases, commands, gates, and deliverables to
evidence that must be inspected before calling v1 ready.

Last updated: 2026-05-05 / Codex.

Target release: `v0.19`.

Package metadata version: `0.19.0`.

## Objective Mapping

| Requirement | Evidence to inspect | Current status |
| --- | --- | --- |
| Review everything implemented in `ROADMAP.md` | `ROADMAP.md` phase list and every `plans/phase-*.md` ExecPlan | Local audit completed. Phase plans exist for Phases 1-18 plus 10B and v2 sequence research; Phase 19 plan added in this pass. |
| Review all phases | Phase 0-19 matrix below | Local phase matrix updated. Manual packaged-app QA remains the main v1 go/no-go input. |
| Improve and optimize for v1 release | Release-readiness findings, patched docs/UI, validation commands | Improved in this pass: root README, AGENTS snapshot, roadmap Phase 19 linkage, preview setup wiring/copy, shipped import wording, macOS permission copy, package-size optimization, quality/regression platform, and this checklist. |
| Do not accept proxy signals as completion | Command output, packaged app evidence, manual QA notes, artifact inspection | Substantially satisfied locally. Automated gates, package/resource smoke, local MP4/MOV/WebM export smoke, packaged UI MP4 export, packaged analytics opt-in/off smoke, and credentialed provider smoke passed. The first official `v0.19` CI release passed notarization but exposed a missing x64 export browser; multi-arch staging and a CI package-browser guard are now added, and the official rerun still gates stable. |
| Ship the release as `v0.19` | `package.json`, release workflow input, GitHub release tag/name | Package metadata and packaged `Info.plist` are `0.19.0`; a draft `v0.19.0` release exists, but final signed/notarized release evidence still needs the rerun after the multi-arch export-browser fix. |

## Phase Matrix

| Phase | Primary artifact | Release evidence required | Status |
| --- | --- | --- | --- |
| 0 Planning And Instruction Reset | `AGENTS.md`, `PLANS.md`, `ROADMAP.md` | Ripple-specific agent instructions and roadmap are current | Updated in Phase 19; final pre-release read still recommended. |
| 1 Local-First Boot | `plans/phase-1-local-first-boot.md` | Fresh app entry reaches project-first shell without sign-in | Packaged isolated-userData smoke passed; remaining human install QA still recommended. |
| 2 Ripple Project Creation | `plans/phase-2-ripple-project-creation.md` | Create/open under `~/Ripple`, scaffold is previewable, lifecycle actions work | Covered by `bun run test:ripple`; packaged blank/template project creation passed. |
| 3 HyperFrames Service Layer | `plans/phase-3-hyperframes-service-layer.md` | Main-process environment, discovery, preview, snapshot, render APIs work | Current HyperFrames tests and packaged UI export smoke pass. |
| 4 HyperFrames Preview Player | `plans/phase-4-hyperframes-preview-player.md` | Official player-backed preview loads, seeks, reloads, and errors clearly | Current focused tests and packaged preview play/seek smoke pass. |
| 5 HyperFrames Timeline | `plans/phase-5-hyperframes-timeline.md` | Timeline stays synced with player and selection state | Current focused tests and packaged mouse-seek smoke pass; remaining visual QA recommended. |
| 6 Assets And Compositions Pane | `plans/phase-6-assets-compositions-pane.md` | Composition/asset pane uses project-safe reads and drives preview/timeline | Current focused tests pass; visual QA still needed. |
| 7 Ripple Shell And Review Sidebar | `plans/phase-7-ripple-shell-and-review-sidebar.md` | Four-pane shell, right chat/comments pane, and utilities work together | Current shell tests pass; visual QA still needed. |
| 8 Comments And Revisions | `plans/phase-8-comments-and-revisions.md` | Frame/time comments, isolated revisions, accept/reject/delete/restore work | Current comments/revisions tests pass; manual revision smoke still needed. |
| 9 Codex And Claude Integrations | `plans/phase-9-codex-and-claude-integrations.md` | Provider setup is optional and agent runs stay in validated workspaces | Current agent-runtime tests pass; provider smoke still depends on configured credentials. |
| 10 Conversations And Proposals | `plans/phase-10-conversations-and-proposals.md` | Conversations/messages are canonical and comment chat handoff works | Current conversation tests pass. |
| 10B Active Conversations | `plans/phase-10b-active-conversation-tabs-and-activity-badges.md` | Active chips/history/activity badges remain reliable | Current shell/activity tests pass. |
| 11 Export | `plans/phase-11-renders-and-export.md` | MP4, MOV, WebM export through Producer with validated paths and recovery | Current export tests, local MP4/MOV/WebM render smoke, and packaged UI MP4 export pass after staging the export browser. |
| 12 Templates And Starters | `plans/phase-12-templates-and-starters.md` | Bundled templates preview/install offline and lint cleanly | Current template/HyperFrames tests pass and packaged template creation/comment smoke passed. |
| 13 Agent Prompting And Skills | `plans/phase-13-agent-prompting-and-skills.md` | App-managed HyperFrames skills/context reach Codex and Claude without mutating project roots | Current runtime/context tests pass; credentialed Codex and Claude account smokes passed. |
| 14 Visual Context CLI And Frame Sheets | `plans/phase-14-agent-visual-context.md` | `ripple frame-sheet` works in dev/packaged wrapper and comment visuals are bounded | Current CLI/runtime tests pass; packaged `ripple --help` smoke passed. |
| 15 Rebrand And Service Decoupling | `plans/phase-15-rebrand-and-service-decoupling.md` | Primary shipped paths remove 1Code/21st/repo-first identity | Built output audit now only finds legacy compatibility guards. |
| 16 Analytics Setup | `plans/phase-16-analytics-setup.md` | Opt-in main-process analytics sends only allowed sanitized events; analytics off sends nothing | Current analytics tests and packaged production analytics opt-in/off smoke pass. |
| 17 Onboarding Screen | `plans/phase-17-onboarding-screen.md` | First-run dialog is skippable, local-first, and separates profile/email/analytics/provider setup | Covered by settings/onboarding tests and packaged skippable first-run smoke. |
| 18 App Updates | `plans/phase-18-app-updates.md`, `.github/workflows/release.yml` | Signed/notarized beta N-to-N+1 update passes inside Ripple | Prior Phase 18 evidence records beta.1 to beta.2 success; recheck before stable. |
| 19 Hardening And Release Readiness | `plans/phase-19-hardening-and-release-readiness.md`, this file | Full automated, package, render, analytics, update, and manual QA gates pass | Automated local gates, local export smoke, packaged UI export, packaged analytics, package smoke, and credentialed provider smoke passed. First official CI release notarized but revealed the x64 export-browser packaging gap; fix and CI guard are in place, with official rerun/update/human QA gates still remaining. |

## Automated Gates

Run from `/Users/conmeara/code/ripple`.

| Gate | Command | Pass condition | Evidence location |
| --- | --- | --- | --- |
| Focused Ripple regressions | `bun run test:ripple` | All tests pass | Passed 2026-05-05: 363 tests / 1459 expectations. |
| Quality platform | `bun run test:quality` | Workflow matrix, fixtures, scripts, and closeout protocol verify | Passed 2026-05-05: 3 tests / 82 expectations; verifier found 36 workflow rows and 14 package scripts. |
| UX workflow sweep | `bun run test:ux` | User-facing renderer workflow slice passes | Passed 2026-05-05: 129 tests / 458 expectations. |
| Electron UX automation | `bun run test:e2e` | Playwright launches built Electron, clicks launch/onboarding/project/template/comments/renders workflows, and retains screenshots/traces/logs on failure | Passed 2026-05-05: 2 Electron tests. |
| Visual regression snapshot | `bun run test:visual` | Stable project-entry visual baseline matches, or intentional changes are reviewed with `bun run test:e2e:update` | Passed 2026-05-05: 1 Playwright visual test; baseline stored under `test/e2e/__screenshots__/`. |
| Agent/runtime sweep | `bun run test:agent` | Provider, revisions, conversations, and runtime slice passes | Passed 2026-05-05: 97 tests / 321 expectations. |
| Credentialed provider smoke | `RIPPLE_LIVE_PROVIDER_SMOKE=1 RIPPLE_LIVE_PROVIDER=codex|claude bun run test:live` | Configured provider reports a real authenticated account without running a project mutation | Passed 2026-05-05: Codex connected with an available ChatGPT account; Claude connected through `claude.ai` / `firstParty`. |
| Export workflow sweep | `bun run test:export` | HyperFrames/export workflow slice passes | Passed 2026-05-05: 152 tests / 748 expectations. |
| Export format smoke | `bun run test:export:smoke` | Fixture renders MP4, MOV, and WebM with expected FFprobe facts | Passed 2026-05-05: MP4, MOV, and WebM rendered successfully. |
| Full unit/integration sweep | `bun test` | All tests pass | Passed 2026-05-05 after E2E filename isolation: 411 tests / 1711 expectations. |
| HyperFrames/export focused sweep | `bun run test:hyperframes` | All tests pass | Passed 2026-05-05: 152 tests / 748 expectations. |
| TypeScript | `bun run ts:check` | No diagnostics | Passed 2026-05-05. |
| Production build | `bun run build` | Build exits 0 | Passed 2026-05-05 with existing Vite warnings. |
| Whitespace | `git diff --check` | No whitespace errors | Passed 2026-05-05. |
| Schema drift | `bun run db:generate` then inspect diff | No unintended migration diff, or generated migration is reviewed | Passed 2026-05-05: no schema changes. |
| Package build | `bun run package` or platform package command | Packaged app contains expected resources and identity | Passed 2026-05-05 for local `--dir`; export browsers staged for `darwin-arm64` and `darwin-x64`, and the local arm64 app includes `Resources/browser`; notarization skipped locally. |
| Package smoke | `bun run test:package:smoke` | Existing packaged app has Ripple identity, resources, CLI binaries, and export browser | Passed 2026-05-05 against `release/mac-arm64/Ripple.app` after export-browser verification was added. |
| Release script | `bun run test:release` | Closeout, schema drift, export smoke, package, and package smoke all pass | Passed 2026-05-05 after the `0.19.0` version bump and packaged export-browser fix. Notarization skipped locally because local notarize options were unavailable. |

## Artifact Audits

| Area | Check | Pass condition |
| --- | --- | --- |
| Primary-path identity | Search shipped source/resources for `1Code`, `21st.dev`, `.21st`, `twentyfirst`, `Set up repository` | Passed local built-output audit: only legacy compatibility guards remain in `out/main/index.js`. |
| Root docs | Read `README.md`, `AGENTS.md`, `ROADMAP.md`, `PLANS.md` | Updated in this pass to describe Ripple v1 state and Phase 19. |
| Package resources | Inspect package output | Passed local package smoke: `Ripple.app`, app id/protocol, CLI wrapper, migrations, templates, skills/plugins, and app-managed Claude/Codex binaries are present. |
| Release workflow | Inspect `.github/workflows/release.yml` and latest Actions run | Signed/notarized artifacts publish with GitHub update metadata and no app-embedded publishing secrets. The workflow now also verifies each packaged app contains an executable export browser with the expected macOS architecture. |
| Analytics privacy | Inspect docs/tests and packaged opt-in smoke | Passed packaged production smoke: unset/denied consent blocked capture; opt-in captured an allowlisted event. |
| Export outputs | Render fixture project to MP4, MOV, WebM | Passed local render/FFprobe smoke for MP4, MOV, and WebM; packaged UI MP4 export passed from the final app artifact. |
| Manual QA | Complete checklist below | Fresh packaged app, onboarding skip, blank project, template project, preview seek, comments, analytics, and MP4 export passed by automated packaged UI smoke; remaining human QA rows are listed below. |

## Manual QA

Complete these in a packaged app with isolated user data before stable v1.

| Flow | Pass condition | Notes |
| --- | --- | --- |
| Fresh install | App opens to Ripple project-first entry without sign-in | Passed packaged isolated-userData smoke. |
| First-run onboarding | User can skip optional profile/email/analytics/provider setup | Passed packaged isolated-userData smoke. |
| New project | Creates `~/Ripple/<project-name>` and opens previewable default composition | Passed packaged blank-project smoke. |
| Open project | Existing valid HyperFrames project opens without repo language |  |
| Preview/timeline | Play, pause, seek, reload, and composition switch stay synchronized | Packaged play/pause and mouse seek passed; reload/composition switch still needs human QA. |
| Templates | Blank and bundled template creation preview immediately offline | Packaged blank and bundled `app-showcase` creation passed. |
| Comments | Frame/time comment creates the expected card and conversation | Packaged blank/template comment cards passed. |
| Revision accept/reject | Generated-change preview can be accepted and rejected cleanly |  |
| Agent setup | Missing Codex/Claude connection prompts from the first agent action only |  |
| Visual context | Current-frame screenshot or frame sheet attaches to comments when enabled |  |
| Export | MP4, MOV, and WebM export complete in a validated environment | Packaged UI MP4 export passed; local Producer smoke passed MP4, MOV, and WebM. |
| App updates | Older packaged beta updates to newer packaged beta inside Ripple | Prior beta.1 to beta.2 success should be refreshed near stable. |
| Analytics | Off sends nothing; opt-in sends only allowed sanitized events | Passed packaged production opt-in/off smoke. |
| Offline local use | Project creation, preview, comments, and export do not require network |  |
| Failure recovery | Missing Node/FFmpeg, preview startup failure, export failure, and failed update check show recoverable errors |  |
| Resize/keyboard | Four-pane shell avoids overlap and keeps controls usable |  |

## Current Findings

- Phase 19 had no checked-in ExecPlan before this pass. Added
  `plans/phase-19-hardening-and-release-readiness.md`.
- The root `README.md` still described 1Code and 21st.dev. Replaced it with a
  Ripple-focused README.
- `AGENTS.md` still described target additions as future work. Updated the
  architecture snapshot for the current release-hardening state.
- `ROADMAP.md` only linked some phase ExecPlans. It now links every implemented
  non-Phase-0 phase plan from Phases 1-19.
- `PreviewSetupHoverCard` used repository language and local throwaway settings
  atoms. It now opens the real Projects settings tab and uses Ripple project
  language.
- Packaged builds duplicated the Claude Agent SDK optional platform binary even
  though Ripple uses its app-managed `Resources/bin/claude`. The package config
  now excludes `node_modules/@anthropic-ai/claude-agent-sdk-*/**/*`, reducing
  local `app.asar.unpacked` output from about 447 MB to about 242 MB.
- Shipped remote-import copy still said "Cloning repo" / "Cloning repository".
  It now uses project/import language in the built renderer output.
- The packaged macOS camera permission string used generic default copy. It now
  uses Ripple-branded wording alongside the existing microphone wording.
- The quality/regression platform is now complete enough to be a release gate:
  workflow matrix, future-agent closeout protocol, Electron E2E, visual
  snapshot, deterministic fixture, package/export smokes, provider smoke
  scaffolding, CI reporting, and `test:release` wiring are in place.
- `package.json` is set to `0.19.0` for the `v0.19` target and the final local
  packaged `Info.plist` reports `CFBundleShortVersionString` / `CFBundleVersion`
  as `0.19.0`.
- Packaged UI export initially failed because the app did not include a
  headless export browser. Packaging now stages Puppeteer's
  `chrome-headless-shell` into `Resources/browser`, and package smoke verifies
  the browser executable.
- The first official `v0.19.0` draft release workflow passed signing,
  notarization, stapling, update metadata, and artifact upload, but its x64
  packaging log showed `resources/browser/darwin-x64` was missing. Browser
  staging now prepares both `darwin-arm64` and `darwin-x64`, and the release
  workflow fails if either packaged app is missing the right export browser.
- `plans/v2/sequences-and-composition-structure.md` remains a v2 research plan
  outside the active v1 roadmap.

## Local Package Evidence

- `bun run test:release` rebuilt `release/mac-arm64/Ripple.app`, passed
  automated closeout, schema drift, export smoke, package, and package smoke,
  and exited 0 after the `0.19.0` version bump and packaged export-browser fix.
- `bun run browser:stage` now stages both
  `resources/browser/darwin-arm64/chrome-headless-shell` and
  `resources/browser/darwin-x64/chrome-headless-shell`; `file` reports arm64
  and x86_64 respectively.
- `bun run package` and `bun run test:package:smoke` passed again after the
  multi-arch browser-staging change.
- Local package size: about 1.7 GB total, with `Contents/Resources/browser`
  about 189 MB, `app.asar.unpacked` about 237 MB, and
  `Contents/Resources/bin` about 377 MB.
- `Info.plist` reports `CFBundleDisplayName`, `CFBundleName`, and
  `CFBundleExecutable` as `Ripple`, bundle id `app.ripple.desktop`, app category
  `public.app-category.video`, and Ripple-branded camera/microphone permission
  strings.
- Required resource folders are present: `migrations`, `bin`, `build`,
  `browser`, `hyperframes-templates`, `agent-skills`, and `claude-plugins`.
- Packaged CLI smokes passed:
  `Resources/bin/ripple --help`, `Resources/bin/hyperframes --version`
  (`0.4.40`), `Resources/bin/claude --version` (`2.1.123`), and
  `Resources/bin/codex --version` (`codex-cli 0.125.0`).
- Packaged export browser smoke passed:
  `Resources/browser/chrome-headless-shell --version` reports Chrome for Testing.
- Packaged UI smoke passed from the final artifact: production analytics
  off/on, blank project creation, preview play/pause/seek, frame comment, Renders
  pane MP4 export, bundled template creation, pane toggle, and template comment.
- Local signing verification passed with
  `codesign --verify --deep --strict --verbose=2 release/mac-arm64/Ripple.app`.
- The local package still skips notarization because local notarize options are
  unavailable; `spctl` rejects the local artifact as `Unnotarized Developer ID`
  and `xcrun stapler validate` reports no stapled ticket. Stable release
  requires the credentialed GitHub Actions path.

## Remaining V0.19 Release Blockers

- Rerun the official GitHub Actions release workflow for `v0.19` after the
  multi-arch export-browser fix, then verify signed, notarized, stapled
  artifacts with `codesign`, `spctl`, and `stapler`, and confirm no packaged
  export-browser warnings remain.
- Refresh packaged update N-to-N+1 evidence near stable.
- Complete remaining packaged app human QA rows in the checklist above, especially
  open-project, revision accept/reject, visual context, update flow, failure
  recovery, resize/keyboard, and MOV/WebM from the packaged UI if desired.
