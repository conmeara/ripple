# Ripple V1 Release Checklist

This checklist is the concrete release artifact for `ROADMAP.md` Phase 19. It
maps the user request, roadmap phases, commands, gates, and deliverables to
evidence that must be inspected before calling v1 ready.

Last updated: 2026-05-05 / Codex.

## Objective Mapping

| Requirement | Evidence to inspect | Current status |
| --- | --- | --- |
| Review everything implemented in `ROADMAP.md` | `ROADMAP.md` phase list and every `plans/phase-*.md` ExecPlan | Local audit completed. Phase plans exist for Phases 1-18 plus 10B and v2 sequence research; Phase 19 plan added in this pass. |
| Review all phases | Phase 0-19 matrix below | Local phase matrix updated. Manual packaged-app QA remains the main v1 go/no-go input. |
| Improve and optimize for v1 release | Release-readiness findings, patched docs/UI, validation commands | Improved in this pass: root README, AGENTS snapshot, roadmap Phase 19 linkage, preview setup wiring/copy, shipped import wording, macOS permission copy, package-size optimization, and this checklist. |
| Do not accept proxy signals as completion | Command output, packaged app evidence, manual QA notes, artifact inspection | Partially satisfied locally. Automated gates, package/resource smoke, and local MP4/MOV/WebM export smoke passed; manual QA, notarized CI release, and analytics/update packaged smokes remain required before stable. |

## Phase Matrix

| Phase | Primary artifact | Release evidence required | Status |
| --- | --- | --- | --- |
| 0 Planning And Instruction Reset | `AGENTS.md`, `PLANS.md`, `ROADMAP.md` | Ripple-specific agent instructions and roadmap are current | Updated in Phase 19; final pre-release read still recommended. |
| 1 Local-First Boot | `plans/phase-1-local-first-boot.md` | Fresh app entry reaches project-first shell without sign-in | Needs packaged/manual confirmation. |
| 2 Ripple Project Creation | `plans/phase-2-ripple-project-creation.md` | Create/open under `~/Ripple`, scaffold is previewable, lifecycle actions work | Covered by `bun run test:ripple`; needs packaged/manual confirmation. |
| 3 HyperFrames Service Layer | `plans/phase-3-hyperframes-service-layer.md` | Main-process environment, discovery, preview, snapshot, render APIs work | Current HyperFrames tests pass; desktop smoke still needed. |
| 4 HyperFrames Preview Player | `plans/phase-4-hyperframes-preview-player.md` | Official player-backed preview loads, seeks, reloads, and errors clearly | Current focused tests pass; desktop smoke still needed. |
| 5 HyperFrames Timeline | `plans/phase-5-hyperframes-timeline.md` | Timeline stays synced with player and selection state | Current focused tests pass; visual QA still needed. |
| 6 Assets And Compositions Pane | `plans/phase-6-assets-compositions-pane.md` | Composition/asset pane uses project-safe reads and drives preview/timeline | Current focused tests pass; visual QA still needed. |
| 7 Ripple Shell And Review Sidebar | `plans/phase-7-ripple-shell-and-review-sidebar.md` | Four-pane shell, right chat/comments pane, and utilities work together | Current shell tests pass; visual QA still needed. |
| 8 Comments And Revisions | `plans/phase-8-comments-and-revisions.md` | Frame/time comments, isolated revisions, accept/reject/delete/restore work | Current comments/revisions tests pass; manual revision smoke still needed. |
| 9 Codex And Claude Integrations | `plans/phase-9-codex-and-claude-integrations.md` | Provider setup is optional and agent runs stay in validated workspaces | Current agent-runtime tests pass; provider smoke still depends on configured credentials. |
| 10 Conversations And Proposals | `plans/phase-10-conversations-and-proposals.md` | Conversations/messages are canonical and comment chat handoff works | Current conversation tests pass. |
| 10B Active Conversations | `plans/phase-10b-active-conversation-tabs-and-activity-badges.md` | Active chips/history/activity badges remain reliable | Current shell/activity tests pass. |
| 11 Export | `plans/phase-11-renders-and-export.md` | MP4, MOV, WebM export through Producer with validated paths and recovery | Current export tests and local MP4/MOV/WebM render smoke pass; packaged/manual export QA still needed. |
| 12 Templates And Starters | `plans/phase-12-templates-and-starters.md` | Bundled templates preview/install offline and lint cleanly | Current template/HyperFrames tests pass and packaged resources are present. |
| 13 Agent Prompting And Skills | `plans/phase-13-agent-prompting-and-skills.md` | App-managed HyperFrames skills/context reach Codex and Claude without mutating project roots | Current runtime/context tests pass; provider smoke still needed. |
| 14 Visual Context CLI And Frame Sheets | `plans/phase-14-agent-visual-context.md` | `ripple frame-sheet` works in dev/packaged wrapper and comment visuals are bounded | Current CLI/runtime tests pass; packaged `ripple --help` smoke passed. |
| 15 Rebrand And Service Decoupling | `plans/phase-15-rebrand-and-service-decoupling.md` | Primary shipped paths remove 1Code/21st/repo-first identity | Built output audit now only finds legacy compatibility guards. |
| 16 Analytics Setup | `plans/phase-16-analytics-setup.md` | Opt-in main-process analytics sends only allowed sanitized events; analytics off sends nothing | Current analytics tests pass; packaged PostHog smoke remains Phase 19 gate. |
| 17 Onboarding Screen | `plans/phase-17-onboarding-screen.md` | First-run dialog is skippable, local-first, and separates profile/email/analytics/provider setup | Covered by settings/onboarding tests where present; needs packaged/manual confirmation. |
| 18 App Updates | `plans/phase-18-app-updates.md`, `.github/workflows/release.yml` | Signed/notarized beta N-to-N+1 update passes inside Ripple | Prior Phase 18 evidence records beta.1 to beta.2 success; recheck before stable. |
| 19 Hardening And Release Readiness | `plans/phase-19-hardening-and-release-readiness.md`, this file | Full automated, package, render, analytics, update, and manual QA gates pass | Automated local gates, local export smoke, and local package smoke passed; manual/CI gates remain. |

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
| Credentialed provider smoke | `RIPPLE_LIVE_PROVIDER_SMOKE=1 RIPPLE_LIVE_PROVIDER=codex|claude bun run test:live` | Configured provider reports a real authenticated account without running a project mutation | Release-gated; skipped by default without credentials. |
| Export workflow sweep | `bun run test:export` | HyperFrames/export workflow slice passes | Passed 2026-05-05: 152 tests / 748 expectations. |
| Export format smoke | `bun run test:export:smoke` | Fixture renders MP4, MOV, and WebM with expected FFprobe facts | Passed 2026-05-05: MP4, MOV, and WebM rendered successfully. |
| Full unit/integration sweep | `bun test` | All tests pass | Passed 2026-05-05 after E2E filename isolation: 411 tests / 1711 expectations. |
| HyperFrames/export focused sweep | `bun run test:hyperframes` | All tests pass | Passed 2026-05-05: 152 tests / 748 expectations. |
| TypeScript | `bun run ts:check` | No diagnostics | Passed 2026-05-05. |
| Production build | `bun run build` | Build exits 0 | Passed 2026-05-05 with existing Vite warnings. |
| Whitespace | `git diff --check` | No whitespace errors | Passed 2026-05-05. |
| Schema drift | `bun run db:generate` then inspect diff | No unintended migration diff, or generated migration is reviewed | Passed 2026-05-05: no schema changes. |
| Package build | `bun run package` or platform package command | Packaged app contains expected resources and identity | Passed 2026-05-05 for local `--dir`; notarization skipped locally. |
| Package smoke | `bun run test:package:smoke` | Existing packaged app has Ripple identity, resources, and CLI binaries | Passed 2026-05-05 against `release/mac-arm64/Ripple.app`. |
| Release script | `bun run test:release` | Closeout, schema drift, export smoke, package, and package smoke all pass | Passed 2026-05-05 locally with Electron E2E in closeout; notarization skipped because local notarize options were unavailable. |

## Artifact Audits

| Area | Check | Pass condition |
| --- | --- | --- |
| Primary-path identity | Search shipped source/resources for `1Code`, `21st.dev`, `.21st`, `twentyfirst`, `Set up repository` | Passed local built-output audit: only legacy compatibility guards remain in `out/main/index.js`. |
| Root docs | Read `README.md`, `AGENTS.md`, `ROADMAP.md`, `PLANS.md` | Updated in this pass to describe Ripple v1 state and Phase 19. |
| Package resources | Inspect package output | Passed local package smoke: `Ripple.app`, app id/protocol, CLI wrapper, migrations, templates, skills/plugins, and app-managed Claude/Codex binaries are present. |
| Release workflow | Inspect `.github/workflows/release.yml` and latest Actions run | Signed/notarized artifacts publish with GitHub update metadata and no app-embedded publishing secrets. |
| Analytics privacy | Inspect docs/tests and packaged opt-in smoke | Analytics off captures nothing; analytics on sends only documented sanitized events; email contact stays separate. |
| Export outputs | Render fixture project to MP4, MOV, WebM | Passed local render/FFprobe smoke for MP4, MOV, and WebM; packaged/manual export QA remains required before stable. |
| Manual QA | Complete checklist below | Fresh install and upgrade paths work without blocking local workflows. |

## Manual QA

Complete these in a packaged app with isolated user data before stable v1.

| Flow | Pass condition | Notes |
| --- | --- | --- |
| Fresh install | App opens to Ripple project-first entry without sign-in |  |
| First-run onboarding | User can skip optional profile/email/analytics/provider setup |  |
| New project | Creates `~/Ripple/<project-name>` and opens previewable default composition |  |
| Open project | Existing valid HyperFrames project opens without repo language |  |
| Preview/timeline | Play, pause, seek, reload, and composition switch stay synchronized |  |
| Templates | Blank and bundled template creation preview immediately offline |  |
| Comments | Frame/time comment creates the expected card and conversation |  |
| Revision accept/reject | Generated-change preview can be accepted and rejected cleanly |  |
| Agent setup | Missing Codex/Claude connection prompts from the first agent action only |  |
| Visual context | Current-frame screenshot or frame sheet attaches to comments when enabled |  |
| Export | MP4, MOV, and WebM export complete in a validated environment |  |
| App updates | Older packaged beta updates to newer packaged beta inside Ripple | Prior beta.1 to beta.2 success should be refreshed near stable. |
| Analytics | Off sends nothing; opt-in sends only allowed sanitized events |  |
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
- `plans/v2/sequences-and-composition-structure.md` was already modified before
  this pass. It remains a v2 research plan outside the active v1 roadmap.

## Local Package Evidence

- `bun run test:release` rebuilt `release/mac-arm64/Ripple.app`, passed
  automated closeout, schema drift, export smoke, package, and package smoke,
  and exited 0.
- Local package size: about 1.5 GB total, with `app.asar` about 630 MB,
  `app.asar.unpacked` about 242 MB, and `Contents/Resources/bin` about 377 MB.
- `Info.plist` reports `CFBundleDisplayName`, `CFBundleName`, and
  `CFBundleExecutable` as `Ripple`, bundle id `app.ripple.desktop`, app category
  `public.app-category.video`, and Ripple-branded camera/microphone permission
  strings.
- Required resource folders are present: `migrations`, `bin`, `build`,
  `hyperframes-templates`, `agent-skills`, and `claude-plugins`.
- Packaged CLI smokes passed:
  `Resources/bin/ripple --help`, `Resources/bin/hyperframes --version`
  (`0.4.40`), `Resources/bin/claude --version` (`2.1.123`), and
  `Resources/bin/codex --version` (`codex-cli 0.125.0`).
- The local package still skips notarization because local notarize options are
  unavailable; stable release requires the credentialed GitHub Actions path.
