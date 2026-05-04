# Phase 18 GitHub Releases App Updates

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

Ripple needs a packaged-app update flow that users can trust. After this phase,
official packaged builds can check GitHub Releases for a newer Ripple build,
show update availability in app language, download on user request, restart to
install, and recover cleanly from missing feeds, network failures, cancelled
downloads, and signing/notarization problems. The normal user path must happen
inside Ripple: users should not need to visit GitHub, choose an asset manually,
or understand release metadata to update the app.

The visible behavior is stable-by-default updates with an optional beta channel
in Settings. Stable users receive only normal releases. Users who opt into beta
can receive beta releases as early access, then still receive later stable
releases. Manual update checks are always user-initiated from the app.
Automatic update checks are a separate persisted preference, default off for the
first release unless the user enables them from onboarding or Settings. Update
checks are non-blocking and never prevent local project creation/opening,
preview, comments, revisions, or export.

## Progress

- [x] 2026-05-04 / Codex: Audited the inherited updater code and confirmed it
  already supports `latest` and `beta` channels, defaults to `latest`, persists
  channel choice, and leaves downloads user-initiated.
- [x] 2026-05-04 / Codex: Added local ignored `.env` placeholders for GitHub
  release publishing and Apple signing/notarization credentials.
- [x] 2026-05-04 / Codex: Inspected GitHub in Safari. `conmeara/ripple` exists
  as the release repo candidate, was initially private, has no published
  releases, and has no repository Actions secrets yet.
- [x] 2026-05-04 / Codex: Verified in Safari that the user changed
  `conmeara/ripple` to public. Treat this public repository as the Phase 18
  GitHub Releases source unless the user later chooses a different release repo.
- [x] 2026-05-04 / Codex: User chose GitHub Actions as the official release
  build/publish path for Phase 18.
- [x] 2026-05-04 / Codex: User generated a new App Store Connect Team API key
  for Ripple notarization. Recorded the non-secret key ID and issuer ID in the
  ignored local `.env`, and confirmed the downloaded `.p8` file exists locally.
- [x] 2026-05-04 / Codex: Stored the App Store Connect notarization key values
  in GitHub Actions secrets for `conmeara/ripple`: `APPLE_API_KEY_P8`,
  `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`.
- [x] 2026-05-04 / Codex: Checked local macOS signing identities with
  `security find-identity -v -p codesigning`; no valid signing identities are
  currently installed, so Phase 18 still needs a new `Developer ID Application`
  certificate and `.p12` export.
- [x] 2026-05-04 / User: Accepted the latest Apple Developer Program License
  Agreement; certificate management is available again.
- [x] 2026-05-04 / Codex: Recorded `APPLE_TEAM_ID=6TNDG45H72` in the ignored
  local `.env` and stored `APPLE_TEAM_ID` in GitHub Actions secrets.
- [x] 2026-05-04 / Codex: Checked common local locations for existing exported
  signing materials. No `.p12`, `.cer`, CSR, or local signing identity was
  found, so a new Developer ID Application CSR/certificate is needed unless the
  user supplies an existing `.p12`.
- [x] 2026-05-04 / Codex: Generated a new local private key and CSR under
  ignored `.secrets/signing/`, uploaded the CSR to Apple, issued a G2
  `Developer ID Application` certificate, downloaded it, verified it matches the
  private key, and exported a password-protected `.p12` for CI signing.
- [x] 2026-05-04 / Codex: Stored `CSC_LINK` and `APPLE_IDENTITY` in GitHub
  Actions secrets after explicit user confirmation.
- [x] 2026-05-04 / User: Added `CSC_KEY_PASSWORD` to GitHub Actions secrets.
  Automatic transmission was blocked by safety review because this password
  unlocks the Developer ID signing bundle, so the user entered it manually.
- [x] 2026-05-04 / Codex: Clarified that Phase 18 must validate the seamless
  in-app update path, not merely create downloadable GitHub Release artifacts.
- [x] 2026-05-04 / Codex: Ran an Oracle manual-paste audit of Phases 16-18 and
  chose the electron-builder GitHub provider path, two-stage release gating, and
  optional automatic update checks.
- [x] Implement Milestone 4: wire publishing secrets in local `.env` and
  GitHub Actions secrets without embedding tokens in the app.
- [ ] Implement Milestone 1: finalize release channel
  naming, tag naming, and workflow trigger details.
- [ ] Implement Milestone 2: replace generic CDN/R2 release assumptions with
  electron-builder GitHub Releases publishing and generated update metadata.
- [ ] Implement Milestone 3: harden update state, settings copy, and release
  notes UI for Ripple.
- [ ] Implement Milestone 4: prototype release channel metadata with two
  prerelease versions before stable publication.
- [ ] Implement Milestone 5: validate signed/notarized macOS update install,
  then document Windows/Linux gates.

## Surprises & Discoveries

- Observation: The inherited updater already has stable plus beta support.
  Evidence: `src/main/lib/auto-updater.ts` defines
  `type UpdateChannel = "latest" | "beta"`, defaults `getSavedChannel()` to
  `latest`, persists `update-channel.json`, and documents `latest = stable
  only, beta = stable + beta`.
- Observation: The inherited update UX is user-initiated for downloads.
  Evidence: `initAutoUpdaterConfig()` sets `autoUpdater.autoDownload = false`,
  `autoInstallOnAppQuit = true`, and `autoRunAppAfterInstall = true`.
- Observation: The current renderer can auto-install/restart shortly after an
  update reaches the ready state.
  Evidence: `src/renderer/components/update-banner.tsx` watches
  `realState.status === "ready"` and calls `installUpdate()` in a timeout. Phase
  18 must remove that effect and require an explicit `Restart to update` action,
  while keeping `autoInstallOnAppQuit` as the quiet fallback if the user quits
  later.
- Observation: Packaged builds check for updates on startup and window focus.
  Evidence: `src/main/index.ts` calls `initAutoUpdater`, `setupFocusUpdateCheck`,
  and a forced `checkForUpdates(true)` five seconds after startup when
  `app.isPackaged`.
- Observation: The current startup/focus behavior is network-active before a
  user-level update-check preference exists.
  Evidence: Phase 18 must gate `checkForUpdates(true)`,
  `setupFocusUpdateCheck(...)`, channel-change checks, and scheduled/focus
  checks behind a persisted `updates.autoCheckEnabled` preference while keeping
  manual `Check Now` available.
- Observation: Update feed configuration is currently an explicit environment
  URL, not a hardcoded upstream feed.
  Evidence: `src/main/lib/auto-updater.ts` reads `getConfiguredUpdateFeedUrl()`,
  and `src/main/lib/config.ts` accepts `MAIN_VITE_RIPPLE_UPDATE_URL` while
  rejecting legacy `21st.dev` URLs.
- Observation: The manifest script still assumes generic hosted update metadata
  files and a configured upload destination.
  Evidence: `scripts/generate-update-manifest.mjs` generates `latest-mac.yml`,
  `latest-mac-x64.yml`, `beta-mac.yml`, `beta-mac-x64.yml`, and
  `latest-linux.yml`/`beta-linux.yml` for files in `release/`.
- Observation: Phase 18 should not keep generic metadata and GitHub provider
  paths half-wired.
  Evidence: The chosen implementation path is electron-builder's GitHub
  publish provider with generated update metadata uploaded to GitHub Releases;
  `scripts/generate-update-manifest.mjs` becomes legacy/fallback unless the
  GitHub provider proves unusable.
- Observation: The current renderer settings already exposes Early Access.
  Evidence:
  `src/renderer/components/dialogs/settings-tabs/agents-beta-tab.tsx` shows an
  `Early Access` switch that calls `desktopApi.setUpdateChannel("beta" |
  "latest")`.
- Observation: Current update settings are mixed into an inherited Beta
  settings surface.
  Evidence: `src/renderer/components/dialogs/settings-tabs/agents-beta-tab.tsx`
  should become or feed a first-class `App Updates` settings section with
  manual check, automatic check, channel, and Early Access controls.
- Observation: macOS signing identity is env-driven but notarization is not yet
  fully represented in this repository.
  Evidence: `electron-builder.yml` reads `APPLE_IDENTITY` and sets
  `notarize: false` with a comment saying notarization is handled in CI.
- Observation: The packaged macOS app already requests hardened runtime signing
  and Electron entitlements.
  Evidence: `package.json` sets `mac.hardenedRuntime = true` and points
  `entitlements`/`entitlementsInherit` to `build/entitlements.mac.plist`.
- Observation: There is no GitHub Actions workflow in the checkout yet.
  Evidence: `.github/` does not exist.
- Observation: The current GitHub release repo candidate is now public and
  empty from a releases/secrets perspective.
  Evidence: Safari initially showed a `Private` badge on
  `github.com/conmeara/ripple`; after the user changed visibility, the General
  settings page reported "This repository is currently public." The repo still
  showed `No releases published`, and the Actions secrets page showed "This
  repository has no secrets."
- Observation: App Store Connect Team API key access is confirmed for
  notarization.
  Evidence: App Store Connect showed issuer ID
  `14719761-6ccb-42dc-aeab-9586320f9bc2`, and the user provided key ID
  `WRSCQ49MY6`. The private key contents and local download path are not copied
  into the plan.
- Observation: GitHub Actions now has the notarization API key secrets.
  Evidence: `gh secret list --app actions -R conmeara/ripple` shows
  `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`.
- Observation: The local machine does not currently have a valid Apple code
  signing identity installed.
  Evidence: `security find-identity -v -p codesigning` reported
  `0 valid identities found`.
- Observation: Apple Developer certificate creation is currently blocked by an
  account-level agreement prompt.
  Evidence: Safari on
  `developer.apple.com/account/resources/certificates/add` showed "Access
  Unavailable" and said to agree to the latest Program License Agreement in the
  developer account.
- Observation: Apple Developer certificate management is available after the
  agreement was accepted.
  Evidence: Safari on
  `developer.apple.com/account/resources/certificates/list` shows the
  Certificates list and Team ID `6TNDG45H72`.
- Observation: There are existing Developer ID Application certificates in the
  Apple Developer portal, including one expiring `2030/02/26`, but this Mac does
  not have the matching private key installed.
  Evidence: Safari certificate list shows existing `Developer ID Application`
  rows. `security find-identity -v -p codesigning` still reports
  `0 valid identities found`, and local searches did not find a `.p12`.
- Observation: The newly issued signing certificate is ready for CI packaging.
  Evidence: Apple issued certificate ID `4YFMH98JQ4` with subject
  `Developer ID Application: Conor Callahan Omeara (6TNDG45H72)`, G2 issuer,
  serial `4932469EED7539DA69C6B2290F7C2348`, and expiration
  `2031/05/05`. The local certificate and private key modulus hashes match, and
  the `.p12` exported successfully.

## Decision Log

- Decision: Ripple should ship stable-by-default updates with an optional beta
  channel in Settings.
  Rationale: This matches the inherited behavior, supports early testers, and
  avoids exposing beta instability to ordinary users.
  Date/Author: 2026-05-04 / Codex.
- Decision: Use electron-builder's GitHub publish/update provider for Phase 18,
  with GitHub Releases as the source of truth. Do not keep the generic feed
  manifest path half-wired unless the GitHub provider proves unusable during
  implementation.
  Rationale: The user prefers GitHub Releases, electron-builder supports GitHub
  release publishing and generated update metadata, and choosing one provider
  strategy reduces release/update ambiguity for autonomous implementation.
  Date/Author: 2026-05-04 / Codex.
- Decision: Use public GitHub Releases on `conmeara/ripple` as the default
  Phase 18 release/update source.
  Rationale: The repository is public now, so packaged apps can check public
  release metadata without a runtime GitHub token. Publishing and signing
  credentials remain maintainer-only secrets.
  Date/Author: 2026-05-04 / Codex.
- Decision: Build and publish official Phase 18 releases from GitHub Actions.
  Start with a manual `workflow_dispatch` release workflow that creates draft
  releases, signs/notarizes artifacts, and attaches update metadata. Tag-push
  automation can be added after the signed macOS update path is validated.
  Rationale: Actions makes release builds reproducible, keeps maintainer
  credentials out of app runtime and local scripts, and allows the built-in
  `GITHUB_TOKEN` to create release artifacts with `contents: write` permission
  when possible.
  Date/Author: 2026-05-04 / Codex.
- Decision: Release publishing tokens are build/publish secrets only. They must
  not be embedded in the packaged app or required for public update checks.
  Rationale: Runtime update checks should work for users without exposing a
  GitHub token. Private-release update checks would require special handling and
  are not the preferred public distribution path.
  Date/Author: 2026-05-04 / Codex.
- Decision: Keep update download user-initiated for Phase 18.
  Rationale: The inherited app already asks before download, and that gives a
  local-first desktop user a clear choice before network/download activity.
  Date/Author: 2026-05-04 / Codex.
- Decision: Keep update installation/restart explicit after download. The
  downloaded/ready state should show `Ready to restart` with `Restart to update`
  and `Later` actions; the renderer must not call `installUpdate()` automatically
  from a ready-state effect.
  Rationale: A motion app should not restart while the user is previewing,
  exporting, reviewing, or presenting a draft.
  Date/Author: 2026-05-04 / Codex.
- Decision: Keep automatic update checks optional and separate from weekly
  email updates. For the first release, default automatic checks off until the
  user enables them from onboarding or Settings; manual checks remain available.
  Rationale: A non-blocking network call is still a network call, and Ripple's
  local-first invariant is strongest when app entry and local work do not depend
  on update checks.
  Date/Author: 2026-05-04 / Codex.
- Decision: The normal update path must be app-native. GitHub Releases are the
  distribution backend, but the user-facing flow is Ripple checking, showing
  release state, downloading, and restarting/installing from inside the app.
  Rationale: The user wants seamless app updates, not a release page where users
  manually choose downloads.
  Date/Author: 2026-05-04 / Codex.
- Decision: macOS is the first full update gate; Windows and Linux expectations
  are documented unless signing/build infrastructure is ready.
  Rationale: The roadmap calls for macOS first, and macOS auto-update requires
  signing/notarization to be credible.
  Date/Author: 2026-05-04 / Codex.
- Decision: Use a two-stage release gate. CI first creates signed/notarized
  draft artifacts for maintainer inspection, then a published beta/prerelease
  update candidate is used to validate a real N-to-N+1 in-app update, and only
  then is stable published/promoted.
  Rationale: Draft releases are good for artifact inspection, but public in-app
  updater validation needs a reachable release feed.
  Date/Author: 2026-05-04 / Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

`src/main/lib/auto-updater.ts` owns update setup, channel persistence, event
bridging, and IPC handlers. It imports `electron-updater` synchronously, sets
`autoDownload = false`, currently configures a generic feed URL from
`getConfiguredUpdateFeedUrl()`, forwards update events to every renderer window,
and exposes IPC handlers for check, download, install, get state, set channel,
and get channel. Phase 18 should move official builds to electron-builder's
GitHub provider and generated metadata rather than relying on a bespoke generic
feed URL.

`src/preload/index.ts` exposes update APIs to the renderer:
`checkForUpdates`, `downloadUpdate`, `installUpdate`, `setUpdateChannel`,
`getUpdateChannel`, and event listeners for checking, available, not available,
progress, downloaded, error, and manual-check.

`src/renderer/lib/hooks/use-update-checker.ts` listens for update events and
tracks banner state. `src/renderer/components/update-banner.tsx` shows the
bottom-left update banner, handles "Update" and "Later", and opens
`https://github.com/conmeara/ripple/releases` for "See what's new".

`src/renderer/components/dialogs/settings-tabs/agents-beta-tab.tsx` currently
contains the inherited Beta settings page. It exposes Early Access updates and
manual update check controls, but its surrounding tab and copy still need a
Ripple product pass.

`scripts/generate-update-manifest.mjs`, `package.json` release scripts, and
`electron-builder.yml` define the current release build path. `package.json`
has `release`, `dist`, `dist:manifest`, and platform packaging scripts. The
manifest script expects artifacts in `release/` and writes channel metadata.
`electron-builder.yml` reads `APPLE_IDENTITY` and disables built-in
notarization because CI is expected to handle it.

The current source also triggers automatic checks in packaged builds on startup
and window focus. Phase 18 must add a persisted update-check preference and
guard startup/focus/channel-change checks behind it. Manual checks from the menu
or Settings should continue to work even when automatic checks are off.

## Plan of Work

First, use `conmeara/ripple` public GitHub Releases as the release source of
truth unless the user chooses a different public release repo. Treat public
GitHub Releases as the normal update source. Private GitHub release feeds
should not be used for the normal app because they imply a runtime token on
user machines.

Second, define channel and tag conventions. Stable releases use normal semver
tags such as `v0.1.0` and update channel `latest`. Beta releases use prerelease
tags such as `v0.1.0-beta.1` and update channel `beta`. The app defaults to
`latest`; the Settings Early Access switch opts into `beta`.

Third, implement GitHub Actions as the official publishing strategy. The first
workflow should be manually triggered with `workflow_dispatch`, build Ripple
with `bun install --frozen-lockfile`, sign/notarize macOS artifacts, create or
update a draft GitHub Release, and attach artifacts plus generated update
metadata. Use the built-in `GITHUB_TOKEN` with explicit
`permissions: contents: write` for release writes unless implementation
discovery proves a maintainer PAT is required. Do not expose release secrets to
untrusted PR workflows. Use a protected GitHub Environment for release jobs if
available. Local publishing can exist only as a maintainer fallback using
ignored `.env` values. Do not read a GitHub token from app runtime code.
The workflow must include a top-level or job-level minimum permission block,
at least `contents: write` for release creation/upload, and no release secrets
on `pull_request` workflows.

Fourth, switch official update metadata to electron-builder's GitHub provider.
Add explicit `publish` configuration for `owner: conmeara`, `repo: ripple`,
`provider: github`, and stable/beta channel handling. Use explicit
`--publish always` in the release workflow so release publishing is intentional.
Treat `scripts/generate-update-manifest.mjs` as legacy/fallback and remove it
from the normal release path unless the GitHub provider fails during
implementation. Validate generated `app-update.yml` and release metadata assets
instead of only custom `latest-mac*.yml` files.

Fifth, wire signing and notarization. For macOS, use
`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_IDENTITY`, `APPLE_TEAM_ID`, and
App Store Connect Team API key credentials from GitHub Actions secrets. CI must
import the certificate, build, sign, notarize, staple, verify with `spctl` (and
signature checks), attach artifacts, and only publish update metadata if
signing/notarization/stapling verification succeeds. Use Apple ID/app-specific
password only as a fallback if API-key notarization is blocked. Validate that an
installed signed/notarized build at version N updates from inside Ripple to a
newer signed/notarized build N+1.

Sixth, refine user-facing update UX. Keep downloads user-initiated, keep beta
optional, add a separate automatic-update-check preference, show meaningful
release/version state, and ensure unavailable, failed, cancelled, already
downloaded, restart-required, and recovery states are visible. Rename inherited
"Agents"/"Beta" wording where needed so the settings read as Ripple app updates
rather than developer-tool beta features. "Downloaded" should mean "ready to
restart" unless the user explicitly chooses `Restart to update`. Remove the
current renderer ready-state auto-install effect; keep `autoInstallOnAppQuit`
only as a fallback if the user quits after download.

Seventh, split update controls into a first-class App Updates settings section
or an equivalent Ripple-labeled settings surface. It should expose manual
`Check Now`, automatic check preference, stable/beta channel, Early Access copy,
current version, release version/date/notes when available, and recoverable
error state. If automatic checks are off, manual checks still work.

Finally, add tests and manual QA gates for channel persistence, missing feed
configuration, check/download/install events, update banner behavior, release
notes link, and packaged macOS update install.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Use `conmeara/ripple` public GitHub Releases as the release/update source.
2. Confirm channels: `latest` stable by default, optional `beta` early access.
3. Add a GitHub Actions release workflow with manual `workflow_dispatch`,
   explicit `permissions: contents: write`, stable/beta inputs, protected
   release environment if available, and no secret exposure on untrusted PR
   workflows.
   Required minimum workflow shape:
   `permissions: contents: write`; no `pull_request` release publishing; and
   secrets only in the manual release job.
4. Fill local ignored `.env` secrets when ready for maintainer fallback builds:
   `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_IDENTITY`, `APPLE_TEAM_ID`, chosen
   Apple notarization credential variables, and
   optional `GITHUB_RELEASE_TOKEN`/`GH_TOKEN` only if local release publishing
   remains supported.
5. Add required Apple signing/notarization and official build environment values
   to GitHub Actions repository secrets before CI release publishing is enabled.
   Do not add a personal GitHub PAT unless the built-in `GITHUB_TOKEN` cannot
   support the selected release workflow.
6. Audit `package.json`, `electron-builder.yml`,
   `scripts/generate-update-manifest.mjs`, `scripts/sync-to-public.sh`,
   `src/main/lib/auto-updater.ts`, `src/main/lib/config.ts`,
   `src/preload/index.ts`, `src/renderer/lib/hooks/use-update-checker.ts`,
   `src/renderer/components/update-banner.tsx`, and
   `src/renderer/components/dialogs/settings-tabs/agents-beta-tab.tsx`.
7. Configure electron-builder's GitHub publish provider in `package.json`
   `build.publish` or `electron-builder.yml`: `provider: github`,
   `owner: conmeara`, `repo: ripple`, explicit channel behavior, and generated
   metadata suitable for electron-updater.
8. Update release scripts and the CI workflow to use
   `bun install --frozen-lockfile`, build, sign, notarize, staple, verify, and
   publish with explicit `--publish always` only after the release job is in the
   intended publish stage.
9. Remove `scripts/generate-update-manifest.mjs` and
   `MAIN_VITE_RIPPLE_UPDATE_URL` from the normal GitHub release path, or mark
   them as maintainer fallback only under an explicitly named fallback command.
   Do not keep generic and GitHub-provider metadata half-wired. Official
   acceptance requires `build.publish` configured for GitHub, release scripts no
   longer calling `dist:manifest`, and runtime update checks not depending on
   `MAIN_VITE_RIPPLE_UPDATE_URL`.
10. Add a two-stage release gate:
   draft artifacts for maintainer inspection, then a published beta/prerelease
   update candidate for real in-app N-to-N+1 validation, then stable
   publication/promotion.
11. Add a persisted `updates.autoCheckEnabled` preference. Gate packaged
   startup, focus, scheduled, and channel-change update checks behind it while
   preserving manual `Check Now`. Exact source acceptance: no startup
   `setTimeout(() => checkForUpdates(true), 5000)`, no
   `setupFocusUpdateCheck(...)`, and no post-channel-switch check may run unless
   `updates.autoCheckEnabled === true`.
12. Remove the renderer ready-state auto-install effect in
   `src/renderer/components/update-banner.tsx`. After download, show
   `Ready to restart`, `Restart to update`, and `Later`. Keep
   `autoInstallOnAppQuit` as a fallback if the user quits later.
13. Update settings copy and release notes links to Ripple/GitHub Releases, and
   rename the inherited beta tab/surface into a first-class `App Updates` /
   `Early Access` settings section.
14. Add release-notes behavior for unavailable and downloaded states. Store or
   surface `releaseNotes` and `releaseDate` from update events when available;
   `See what's new` should open the release page for the relevant installed or
   available version when possible.
15. Add a release-channel prototype milestone before stable publication: build
   two prerelease versions, inspect generated `app-update.yml` and channel
   metadata, and verify stable users do not see beta while beta users see beta
   and later stable.
16. Add or update tests for update channel preference, automatic-check
   preference, generated/provider config, and renderer update state.
17. Run a primary UI string audit for update surfaces: `Agents`, `workspace`,
   `PR`, `commit`, `branch`, `worktree`, `repo`, `clone`, `sub-chat`,
   `account email`, `dev mode?`, and `bypasses CDN cache` must not appear in
   primary update UI.
18. Build two macOS versions in GitHub Actions, install the older one, and verify
   it updates to the newer signed/notarized one entirely inside Ripple.
19. Update this ExecPlan with exact artifacts, tags, workflow runs, and
   validation evidence.

## Validation and Acceptance

Validation commands:

- `bun run ts:check`
- `bun test src/main/lib/config.test.ts`
- `bun test src/renderer/lib/hooks/use-update-checker`
- `bun run build`
- `bun run package:mac`
- Inspect generated `app-update.yml` and GitHub release update metadata from the
  electron-builder GitHub provider
- Prototype channel metadata with two prerelease versions before stable
  publication. Expected: stable users do not see beta; beta users see beta and
  later stable.
- `spctl --assess --type execute --verbose <Ripple.app>` against CI artifacts
  after signing/notarization/stapling
- `codesign --verify --deep --strict --verbose=2 <Ripple.app>` against CI
  artifacts

Manual packaged QA:

- Install a signed/notarized macOS build at version N with stable channel.
  Expected: with automatic checks off, it does not check the network on startup
  or focus; manual Check Now checks GitHub Releases and either reports no update
  or offers version N+1 if published.
- Enable automatic update checks. Expected: startup/focus checks run
  non-blockingly, can be disabled again, and never affect project workflows.
- Opt into Early Access in Settings. Expected: the app persists `beta`, checks
  the beta channel, and does not downgrade from a newer stable build to an older
  beta.
- Click Update when an update is available. Expected: download starts only after
  the click, progress is shown inside Ripple, download completion shows
  `Ready to restart`, and no browser/GitHub/manual asset selection is required.
- After download completes, wait without clicking restart. Expected: Ripple does
  not auto-call `installUpdate()` and does not restart while the user continues
  work; `Restart to update` and `Later` remain explicit choices.
- Publish a beta/prerelease update candidate, install an older signed build, and
  update from N to N+1 entirely inside Ripple. Expected: the app discovers the
  reachable GitHub Release feed, downloads from Ripple, shows ready-to-restart,
  restarts/installs, and launches as N+1.
- Simulate missing feed configuration. Expected: menu/settings checks are
  harmless no-ops and local Ripple workflows are unaffected.
- Simulate network failure. Expected: a recoverable error is logged/shown, and
  the app remains usable.
- With account/profile disabled, provider disabled, GitHub unavailable,
  analytics unconfigured, update checks disabled, and email blank, run app
  entry, create project, open project, preview, comment, accept/reject an
  existing mocked or fixture-generated revision, export, and manual update
  check smoke paths. Expected: all local-first workflows continue to work.
  Creating a new agent-backed revision may still prompt for optional provider
  setup.
- Run a primary UI string audit for update surfaces. Expected: legacy/developer
  strings such as `Agents`, `workspace`, `PR`, `commit`, `branch`, `worktree`,
  `repo`, `clone`, `sub-chat`, `account email`, `dev mode?`, and
  `bypasses CDN cache` are absent from the primary update UI.

Acceptance criteria:

- Stable updates are the default.
- Beta updates are opt-in from Settings and clearly described as early access.
- Automatic update checks are a separate persisted preference from weekly email
  updates; they default off for the first release unless the user opts in.
- GitHub release publishing secrets are stored only in ignored `.env` or GitHub
  Actions secrets, not source code or packaged app resources.
- The app does not require a GitHub token for public update checks.
- The normal user update flow works fully inside Ripple: check, availability
  state, download, progress, restart/install, and recovery.
- Downloaded update state requires an explicit `Restart to update` action. The
  renderer does not auto-install from a ready-state effect; install-on-quit is
  only a quiet fallback after a downloaded update.
- macOS update install is validated with reachable published beta/prerelease
  metadata and signed/notarized artifacts before stable is published.
- Update metadata is not published when signing, notarization, stapling, or
  verification fails.
- Update failures never block local project creation/opening, preview,
  comments, revisions, or export.

## Idempotence and Recovery

Release scripts must be safe to rerun for the same draft release. If upload
fails halfway, rerunning should replace or reattach the expected artifacts
without creating mismatched channel metadata.

Do not republish a bad version as a fixed artifact. If a release candidate is
bad, create a higher version or prerelease version and point update metadata at
that newer build. Draft artifact inspection can be repeated, but public update
validation must use a reachable prerelease or release.

If a beta release is bad, ship a newer version rather than trying to republish a
lower or same version. Keep `autoUpdater.allowDowngrade = false` so users are
not offered an older beta after receiving a newer stable.

If signing or notarization fails, do not publish the release as an update. Keep
artifacts in draft/private CI output until install/update validation passes.

If local `.env` secrets are missing, release commands should fail with clear
messages before building or uploading, and app runtime should continue treating
updates as unconfigured.

## Interfaces and Dependencies

Updater runtime:

- `src/main/lib/auto-updater.ts`
- `src/main/lib/config.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/lib/hooks/use-update-checker.ts`
- `src/renderer/lib/hooks/use-just-updated.ts`
- `src/renderer/components/update-banner.tsx`
- `src/renderer/components/dialogs/settings-tabs/agents-beta-tab.tsx`

Packaging and release:

- `package.json`
- `electron-builder.yml`
- `scripts/generate-update-manifest.mjs` as legacy/fallback only if the
  electron-builder GitHub provider cannot cover the release path
- `scripts/sync-to-public.sh`
- GitHub Actions release workflow
- Public GitHub Releases for `conmeara/ripple` or a later chosen release repo
- electron-builder GitHub publish provider with explicit `--publish always`
- GitHub Actions `GITHUB_TOKEN` with `permissions: contents: write`

New or updated preferences/APIs:

- `updates:get-auto-check-enabled`
- `updates:set-auto-check-enabled`
- persisted `updates.autoCheckEnabled`
- first-class App Updates settings section or equivalent Ripple-labeled
  settings surface with manual check, automatic checks, Early Access channel,
  current version, release notes/date, and recoverable errors

Local ignored `.env` placeholders:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `GITHUB_RELEASE_TOKEN`
- `GH_TOKEN`
- `GITHUB_TOKEN`
- `APPLE_IDENTITY`
- `APPLE_TEAM_ID`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `APPLE_API_KEY`
- `APPLE_API_KEY_P8`

## Artifacts and Notes

Recommended policy:

- Default channel: `latest`
- Optional channel: `beta`
- Stable tags: `v0.1.0`, `v0.1.1`, etc.
- Beta tags: `v0.1.0-beta.1`, `v0.1.0-beta.2`, etc.
- Stable versions: `0.1.0`, `0.1.1`, etc.
- Beta versions: `0.1.0-beta.1`, `0.1.0-beta.2`, etc.
- Never republish a bad version; publish a higher version.
- Never downgrade from a newer stable build to an older beta build.
- Download behavior: ask before download, install on restart after download.
- Ready behavior: downloaded updates show `Ready to restart` and require an
  explicit `Restart to update`; no automatic renderer-triggered restart.
- Automatic checks: default off until user opts in; manual checks remain
  available.
- Release notes: show release version/date/notes in-app when available; open
  the relevant GitHub Release page for `See what's new` unless the release repo
  changes.
- Release dry-run checklist: expected macOS arm64/x64 ZIP/DMG artifacts,
  generated update metadata, signed/notarized/stapled verification evidence,
  and observed update event sequence from N to N+1.

Recommended macOS notarization credentials:

- Signing certificate: `Developer ID Application` certificate exported from
  Keychain as a password-protected `.p12`.
- CI signing secrets: `CSC_LINK` as the base64 `.p12` contents and
  `CSC_KEY_PASSWORD` as the export password.
- Identity metadata: `APPLE_IDENTITY` in the form
  `Developer ID Application: <name> (<TEAM_ID>)`, plus `APPLE_TEAM_ID`.
- Preferred notarization credentials: App Store Connect Team API key, stored as
  `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, and `APPLE_API_KEY_P8`. CI writes the
  key contents to `AuthKey_<id>.p8` and sets `APPLE_API_KEY` to that file path.
- Fallback notarization credentials: `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.

Known signing/notarization values and secret status:

- `CSC_LINK` is present locally only in ignored signing materials and in GitHub
  Actions secrets.
- `CSC_KEY_PASSWORD` is set in ignored local secret storage and in GitHub
  Actions secrets.
- `APPLE_IDENTITY=Developer ID Application: Conor Callahan Omeara (6TNDG45H72)`
- `APPLE_TEAM_ID=6TNDG45H72`
- `APPLE_API_KEY_ID=WRSCQ49MY6`
- `APPLE_API_ISSUER=14719761-6ccb-42dc-aeab-9586320f9bc2`
- `APPLE_API_KEY_P8` is stored as secret contents in GitHub Actions and should
  be written to an ephemeral file during CI.
- `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` are now present
  in `conmeara/ripple` GitHub Actions secrets.
- `APPLE_TEAM_ID` is now present in `conmeara/ripple` GitHub Actions secrets.
- `CSC_LINK` and `APPLE_IDENTITY` are now present in `conmeara/ripple` GitHub
  Actions secrets.
- `CSC_KEY_PASSWORD` is now present in `conmeara/ripple` GitHub Actions secrets.

Open questions before implementation:

- Decide whether to create the initial release workflow as macOS-only first or
  include Windows/Linux artifact placeholders immediately.
- Decide exact post-gate automation, if any: add tag-push release triggers
  after validation, or keep `workflow_dispatch` for all public releases.
