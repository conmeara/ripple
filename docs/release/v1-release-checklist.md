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
| Do not accept proxy signals as completion | Command output, packaged app evidence, manual QA notes, artifact inspection | Substantially satisfied. Automated gates, package/resource smoke, local MP4/MOV/WebM export smoke, packaged UI MP4 export, packaged offline-local smoke, packaged analytics opt-in/off smoke, credentialed provider smoke, and official signed/notarized CI release passed. Release evidence exposed and fixed two packaging gaps: the first official `v0.19` CI release missed the x64 export browser, and quality CI package smoke later exposed that fresh checkouts needed tracked HyperFrames CLI staging plus current-platform Claude/Codex binary staging before `bun run package`. |
| Ship the release as `v0.19` | `package.json`, release workflow input, GitHub release tag/name | Package metadata and packaged `Info.plist` are `0.19.0`; a draft `v0.19.0` release exists with refreshed signed/notarized arm64 and x64 macOS assets from GitHub Actions run `25393310437`, targeting commit `8dd8a71d2c2cb2e599fd246d7d54222bdb3ec64b`. |

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
| 9 Codex And Claude Integrations | `plans/phase-9-codex-and-claude-integrations.md` | Provider setup is optional and agent runs stay in validated workspaces | Current agent-runtime tests pass, including deterministic Claude/Codex auth-error prompt coverage; provider smoke still depends on configured credentials. |
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
| 19 Hardening And Release Readiness | `plans/phase-19-hardening-and-release-readiness.md`, this file | Full automated, package, render, analytics, update, and manual QA gates pass | Automated local gates, local export smoke, packaged UI export, packaged analytics, package smoke, credentialed provider smoke, and official signed/notarized CI release passed. Package staging now prepares current-platform app-managed CLIs and export browsers from a fresh checkout. Update refresh and remaining human QA gates still remain. |

## Automated Gates

Run from `/Users/conmeara/code/ripple`.

| Gate | Command | Pass condition | Evidence location |
| --- | --- | --- | --- |
| Focused Ripple regressions | `bun run test:ripple` | All tests pass | Passed 2026-05-05 after provider prompt coverage: 370 tests / 1507 expectations. |
| Quality platform | `bun run test:quality` | Workflow matrix, fixtures, scripts, and closeout protocol verify | Passed 2026-05-05 after offline workflow mapping: 3 tests / 91 expectations; verifier found 37 workflow rows and 16 package scripts. |
| UX workflow sweep | `bun run test:ux` | User-facing renderer workflow slice passes | Passed 2026-05-05: 130 tests / 464 expectations. |
| Electron UX automation | `bun run test:e2e` | Playwright launches built Electron, clicks launch/onboarding/project/template/comments/renders/open-project/visual-context/resize/preview reload/composition-switch/generated-change review workflows, and retains screenshots/traces/logs on failure | Passed 2026-05-05: 6 passed, 1 packaged-only offline export workflow skipped. |
| Packaged Electron UX automation | `bun run test:e2e:packaged` | Playwright launches the packaged `Ripple.app` artifact and replays trusted open-project, visual context, preview reload/composition-switch, generated-change review, and offline local-use workflows | Passed 2026-05-05 against `release/mac-arm64/Ripple.app`: 5 release QA workflows. |
| Visual regression snapshot | `bun run test:visual` | Stable project-entry visual baseline matches, or intentional changes are reviewed with `bun run test:e2e:update` | Passed 2026-05-05: 1 Playwright visual test; baseline stored under `test/e2e/__screenshots__/`. |
| Agent/runtime sweep | `bun run test:agent` | Provider, revisions, conversations, and runtime slice passes | Passed 2026-05-05 after provider auth-prompt extraction: 102 tests / 334 expectations. |
| Credentialed provider smoke | `RIPPLE_LIVE_PROVIDER_SMOKE=1 RIPPLE_LIVE_PROVIDER=codex|claude bun run test:live` | Configured provider reports a real authenticated account without running a project mutation | Passed 2026-05-05: Codex connected with an available ChatGPT account; Claude connected through `claude.ai` / `firstParty`. |
| Export workflow sweep | `bun run test:export` | HyperFrames/export workflow slice passes | Passed 2026-05-05: 152 tests / 748 expectations. |
| Export format smoke | `bun run test:export:smoke` | Fixture renders MP4, MOV, and WebM with expected FFprobe facts | Passed 2026-05-05: MP4, MOV, and WebM rendered successfully. |
| Full unit/integration sweep | `bun test` | All tests pass | Passed 2026-05-05 after provider prompt coverage: 418 tests / 1767 expectations. |
| HyperFrames/export focused sweep | `bun run test:hyperframes` | All tests pass | Passed 2026-05-05: 152 tests / 748 expectations. |
| TypeScript | `bun run ts:check` | No diagnostics | Passed 2026-05-05. |
| Production build | `bun run build` | Build exits 0 | Passed 2026-05-05 with existing Vite warnings. |
| Whitespace | `git diff --check` | No whitespace errors | Passed 2026-05-05. |
| Schema drift | `bun run db:generate` then inspect diff | No unintended migration diff, or generated migration is reviewed | Passed 2026-05-05: no schema changes. |
| Package build | `bun run package` or platform package command | Packaged app contains expected resources and identity | Passed 2026-05-05 for local `--dir`; `package:stage` now runs `bin:stage` and `browser:stage`, so a fresh checkout stages current-platform Claude/Codex binaries plus arm64/x64 export browsers before packaging. Notarization skipped locally. |
| Package smoke | `bun run test:package:smoke` | Existing packaged app has Ripple identity, resources, CLI binaries, and export browser | Passed 2026-05-05 against a freshly rebuilt `release/mac-arm64/Ripple.app`; smoke verified `Resources/bin/ripple`, tracked `Resources/bin/hyperframes`, downloaded `Resources/bin/claude`, downloaded `Resources/bin/codex`, and `Resources/browser`. |
| Release script | `bun run test:release` | Closeout, schema drift, export smoke, package, and package smoke all pass | Passed 2026-05-05 after the `0.19.0` version bump and packaged export-browser fix. Notarization skipped locally because local notarize options were unavailable. |

## Artifact Audits

| Area | Check | Pass condition |
| --- | --- | --- |
| Primary-path identity | Search shipped source/resources for `1Code`, `21st.dev`, `.21st`, `twentyfirst`, `Set up repository` | Passed local built-output audit: only legacy compatibility guards remain in `out/main/index.js`. |
| Root docs | Read `README.md`, `AGENTS.md`, `ROADMAP.md`, `PLANS.md` | Updated in this pass to describe Ripple v1 state and Phase 19. |
| Package resources | Inspect package output | Passed local package smoke: `Ripple.app`, app id/protocol, CLI wrapper, migrations, templates, skills/plugins, and app-managed Claude/Codex binaries are present. |
| Release workflow | Inspect `.github/workflows/release.yml` and latest Actions run | Passed GitHub Actions run `25393310437`: signed/notarized artifacts published with GitHub update metadata and no app-embedded publishing secrets. The workflow verifies each packaged app contains an executable export browser with the expected macOS architecture, and existing draft refreshes now retarget the release to the run SHA. |
| Analytics privacy | Inspect docs/tests and packaged opt-in smoke | Passed packaged production smoke: unset/denied consent blocked capture; opt-in captured an allowlisted event. |
| Export outputs | Render fixture project to MP4, MOV, WebM | Passed local render/FFprobe smoke for MP4, MOV, and WebM; packaged UI MP4 export passed from the final app artifact. |
| Manual QA | Complete checklist below | Fresh packaged app, onboarding skip, blank project, template project, preview seek, comments, analytics, MP4 export, open project, visual context, preview reload/composition switching, generated-change accept/reject, and offline local use passed against packaged or built Electron artifacts. Remaining human QA rows are listed below. |

## Manual QA

Complete these in a packaged app with isolated user data before stable v1.

| Flow | Pass condition | Notes |
| --- | --- | --- |
| Fresh install | App opens to Ripple project-first entry without sign-in | Passed packaged isolated-userData smoke. |
| First-run onboarding | User can skip optional profile/email/analytics/provider setup | Passed packaged isolated-userData smoke. |
| New project | Creates `~/Ripple/<project-name>` and opens previewable default composition | Passed packaged blank-project smoke. |
| Open project | Existing valid HyperFrames project opens without repo language | Passed packaged release QA with a trusted native-dialog mock and the basic HyperFrames fixture. |
| Preview/timeline | Play, pause, seek, reload, and composition switch stay synchronized | Packaged play/pause and mouse seek passed; packaged release QA verifies reload preserves the current frame and composition switching preserves current time while updating timeline duration. |
| Templates | Blank and bundled template creation preview immediately offline | Packaged blank and bundled `app-showcase` creation passed. |
| Comments | Frame/time comment creates the expected card and conversation | Packaged blank/template comment cards passed. |
| Revision accept/reject | Generated-change preview can be accepted and rejected cleanly | Passed packaged release QA: the test seeds isolated generated-change proposals, clicks `Reject changes` and `Accept changes`, verifies persisted `rejected` / `accepted` statuses, confirms rejected worktree cleanup, and confirms Main receives the accepted title change. |
| Agent setup | Missing Codex/Claude connection prompts from the first agent action only | Automated coverage now verifies Claude auth errors open the Claude setup prompt, Codex missing credentials open the Codex setup prompt, saved Codex credentials queue one retry without a modal, and repeated saved-credential failures show a recoverable error. App launch / project entry E2E continues to verify no provider setup gate appears before local work. |
| Visual context | Current-frame screenshot or frame sheet attaches to comments when enabled | Passed built-Electron release QA for current-frame capture; also found and fixed a macOS `/var` to `/private/var` realpath boundary bug. |
| Export | MP4, MOV, and WebM export complete in a validated environment | Packaged UI MP4 export passed; local Producer smoke passed MP4, MOV, and WebM. |
| App updates | Older packaged beta updates to newer packaged beta inside Ripple | Prior beta.1 to beta.2 success should be refreshed near stable. |
| Analytics | Off sends nothing; opt-in sends only allowed sanitized events | Passed packaged production opt-in/off smoke. |
| Offline local use | Project creation, preview, comments, and export do not require network | Passed packaged release QA with external renderer HTTP/S requests blocked: created a local project, reached preview readiness, recorded a frame comment, completed a packaged MP4 export, and asserted no external requests were attempted. |
| Failure recovery | Missing Node/FFmpeg, preview startup failure, export failure, and failed update check show recoverable errors |  |
| Resize/keyboard | Four-pane shell avoids overlap and keeps controls usable | Passed built-Electron release QA at 980x720 with keyboard panel toggles and visible preview/comments controls. |

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
- The official rerun after the multi-arch browser fix passed end to end as
  GitHub Actions run `25388403839`. It staged both browser architectures,
  verified `release/mac/.../chrome-headless-shell` as x86_64 and
  `release/mac-arm64/.../chrome-headless-shell` as arm64, verified notarized
  apps with `codesign`, `spctl`, and `stapler`, verified `latest-mac.yml`
  contains `version: 0.19.0`, and replaced the draft release assets.
- A later release-refresh audit found that editing an existing draft release
  replaced assets but left the draft release target commit on the original run.
  `.github/workflows/release.yml` now passes `--target "$GITHUB_SHA"` when
  editing an existing release. The final draft release refresh passed as
  GitHub Actions run `25393310437` and `gh release view v0.19.0` reports target
  commit `8dd8a71d2c2cb2e599fd246d7d54222bdb3ec64b`.
- Built-Electron release QA now covers opening an existing HyperFrames project,
  creating a frame comment with stored current-frame visual context, and using
  resize/keyboard controls. That test found a real macOS symlink-resolution
  bug in comment visual boundary checks; the fix compares real project roots to
  real generated outputs and has focused unit coverage.
- Comment review cards now expose an explicit `Reject changes` action for
  proposed generated changes. Previously the only visible rejection-like action
  was deleting the entire comment; the renderer now calls the existing
  `revisions.reject` mutation and resets preview state back to Main after
  rejection.
- Built-Electron release QA now exercises generated-change review controls end
  to end. It seeds proposed generated changes in isolated worktrees, clicks the
  visible `Reject changes` and `Accept changes` actions, verifies persisted
  status changes, checks rejected worktree cleanup, and checks Main is updated
  after acceptance.
- Built-Electron release QA now covers preview reload and composition switching
  with a two-composition HyperFrames fixture. The test advances one frame,
  reloads preview, verifies the frame is preserved, switches to a two-second
  composition, verifies the timeline duration updates to 2 seconds while the
  current frame is retained, and switches back to Main.
- Packaged release QA now reuses the release workflow test file against
  `release/mac-arm64/Ripple.app` via `bun run test:e2e:packaged`. It passed the
  trusted open-project, visual-context comment, preview reload/composition
  switch, and generated-change accept/reject workflows against the local
  packaged artifact.
- Release QA exposed two automation edges: GitHub's macOS runner captures the
  project-entry form one pixel wider than local macOS, so the visual baseline now
  has a CI-specific snapshot, and current-frame snapshot capture could take
  close to the old 10s process budget under full Electron load. The app now
  gives HyperFrames visual capture a 15s snapshot budget and a 30s process
  budget, so frame-attached comments have less timing fragility.
- Quality CI then exposed a fresh-checkout packaging gap: `bun run package`
  previously staged the export browser but relied on ignored local
  `resources/bin/<platform>-<arch>` contents for app-managed CLIs. Packaging now
  runs `package:stage`, which stages current-platform Claude/Codex binaries and
  export browsers, and the tracked `resources/cli/hyperframes` wrapper is copied
  into packaged `Resources/bin/hyperframes`.
- The first quality CI run after package-staging hardening reached `Package app`
  but failed on `codex:download` with GitHub API `HTTP 403`; the quality
  workflow now exposes `GH_TOKEN` and `GITHUB_TOKEN` like the release workflow so
  Codex binary downloads use the Actions token instead of unauthenticated API
  quota.
- The successful release workflow emitted a GitHub Actions annotation that
  Node.js 20 actions are deprecated and will move to Node.js 24 defaults in
  2026. This is not a v0.19 release blocker, but the release workflow should be
  refreshed before that runner migration becomes mandatory.
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
  package-staging change; the package log showed `bin:stage` and `browser:stage`
  ran before Electron Builder.
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
- The packaged `Resources/bin/hyperframes` file contains the tracked
  `resources/cli/hyperframes` wrapper, proving package smoke no longer depends
  on ignored local platform-bin state.
- Packaged export browser smoke passed:
  `Resources/browser/chrome-headless-shell --version` reports Chrome for Testing.
- Packaged UI smoke passed from the final artifact: production analytics
  off/on, blank project creation, preview play/pause/seek, frame comment, Renders
  pane MP4 export, bundled template creation, pane toggle, and template comment.
- Local signing verification passed with
  `codesign --verify --deep --strict --verbose=2 release/mac-arm64/Ripple.app`.
- The local package still skips notarization because local notarize options are
  unavailable; `spctl` rejects the local artifact as `Unnotarized Developer ID`
  and `xcrun stapler validate` reports no stapled ticket. The credentialed
  GitHub Actions release path now supplies the notarized artifact evidence.

## Official Release Evidence

- GitHub Actions release run `25393310437` passed in 27m10s from commit
  `8dd8a71d2c2cb2e599fd246d7d54222bdb3ec64b`.
- Draft release: `v0.19.0` / `Ripple 0.19.0`, draft true, prerelease false.
- Draft release target commit:
  `8dd8a71d2c2cb2e599fd246d7d54222bdb3ec64b`.
- Uploaded assets: `latest-mac.yml`, arm64/x64 DMG, arm64/x64 ZIP, and matching
  blockmaps.
- Export browsers verified in CI:
  `release/mac/Ripple.app/Contents/Resources/browser/chrome-headless-shell`
  is x86_64, and
  `release/mac-arm64/Ripple.app/Contents/Resources/browser/chrome-headless-shell`
  is arm64.
- Notarization verification passed in CI:
  both app bundles passed `codesign`; `spctl` accepted them; `stapler validate`
  reported success.
- Update metadata verification passed in CI:
  `release/latest-mac.yml` contains `version: 0.19.0`, and packaged
  `app-update.yml` points to GitHub owner `conmeara` / repo `ripple`.

## Remaining V0.19 Release Blockers

- Refresh packaged update N-to-N+1 evidence near stable.
- Complete remaining packaged app human QA rows in the checklist above, especially
  update flow, failure recovery, and MOV/WebM from the packaged UI if desired.
