# Phase 15: Rebrand And Service Decoupling

This ExecPlan must be maintained according to `PLANS.md`. It implements
`ROADMAP.md` Phase 15, "Rebrand And Service Decoupling".

## Purpose / Big Picture

After this phase, Ripple launches, packages, links, updates, and introduces
itself as Ripple rather than as inherited 1Code or 21st.dev software. A local
motion designer can create, open, preview, comment on, revise, and export a
project without any mandatory hosted account, upstream update feed, upstream
analytics key, 1Code CLI command, 21st.dev protocol, or repo-first service path
being part of the normal experience.

This phase is about product identity and service boundaries. It is not a broad
copy rewrite of every internal agent concept, not a full analytics taxonomy or
consent build, not the first-run onboarding redesign, and not the complete app
update UX. Those follow in Roadmap Phases 16, 17, and 18. Phase 15 should leave
clean hooks for those phases by removing inherited identity, making analytics a
no-op until Phase 16 intentionally enables it, and making hosted auth, hosted
APIs, update feeds, and release channels explicitly Ripple-owned and optional.

## Progress

- [x] 2026-05-02 / Codex: Started Phase 15 planning at the user's request.
- [x] 2026-05-02 / Codex: Read `PLANS.md`, `ROADMAP.md` Phase 15 through
  Phase 19, Phase 11 export notes, Phase 12 template notes, and current
  package/main/renderer service surfaces before drafting this plan.
- [x] 2026-05-02 / Codex: Audited current residual identity and service
  coupling in `package.json`, `src/main/index.ts`, `src/main/auth-manager.ts`,
  `src/main/lib/config.ts`, `src/main/lib/auto-updater.ts`,
  `src/main/lib/analytics.ts`, platform CLI providers, `resources/cli/1code`,
  renderer logo/settings/update surfaces, project clone paths, and release
  scripts.
- [x] 2026-05-02 / User + Codex: Added app updates as a dedicated roadmap
  Phase 18 after onboarding and moved hardening/release readiness to Phase 19.
- [x] 2026-05-04 / User + Codex: Audited this plan with subagents against
  `PLANS.md`, Roadmap Phases 14 through 19, Phase 14 CLI work, Phase 16
  analytics planning, and the current package/main/renderer implementation
  surface.
- [x] 2026-05-04 / Codex: Refreshed this plan to harden the phase boundaries:
  Phase 15 hard-disables inherited analytics until Phase 16, preserves Phase
  14's `ripple frame-sheet` CLI while rebranding app-launch CLI plumbing, adds
  userData/protocol/update/release risks, and gives each milestone local exit
  checks.
- [x] 2026-05-04 / User + Codex: Added the logo production requirement and
  promoted the selected clean chevron/playhead design to
  `build/ripple-logo-source.svg`, with generated active package icons and a
  backgroundless tray/menu glyph.
- [x] 2026-05-04 / Codex: Implemented Milestone 0 with
  `src/shared/app-identity.ts`, Ripple service config helpers, and safe legacy
  userData migration tests.
- [x] 2026-05-04 / Codex: Implemented Milestone 1 by updating package/app
  metadata, macOS app identity, app protocol registration, menus, titles, About
  copy, and active package icon/tray assets to Ripple.
- [x] 2026-05-04 / Codex: Implemented Milestone 2 by switching new auth/debug
  deep links to `ripple` / `ripple-dev`, keeping legacy protocols inbound-only,
  preserving `ripple frame-sheet`, updating packaged CLI wrappers, and removing
  the packaged `1code` wrapper.
- [x] 2026-05-04 / Codex: Implemented Milestone 3 by replacing hosted-service
  env names with Ripple-owned names, rejecting legacy hosted URLs, making main
  and renderer analytics no-op for Phase 15, and reworking release manifest
  output around configured Ripple destinations.
- [x] 2026-05-04 / Codex: Implemented Milestone 4 by replacing renderer,
  splash, auth-callback, login, fallback icon, update, theme, and stored-theme
  migration surfaces with Ripple names and the selected clean logo system.
- [x] 2026-05-04 / Codex: Implemented Milestone 5 by moving advanced import
  defaults under `~/Ripple/Imported Projects`, preserving `.1code` as
  read-only legacy detection, and blocking new legacy config writes.
- [x] 2026-05-04 / Codex: Implemented Milestone 6 automated/package validation:
  type check, full tests, Ripple regression tests, build, package, manifest,
  string/logo audit, whitespace audit, packaged CLI smoke, Info.plist
  inspection, and icon hash checks.
- [x] 2026-05-04 / Codex: Re-ran Phase 15 QA after final logo cleanup using
  Computer Use plus automated gates; fixed the export-service Electron shell
  import exposed by the full test suite, confirmed packaged Ripple metadata,
  and verified the old logo export/concept folders are no longer active assets.

## Surprises & Discoveries

The implementation closed the inherited-identity findings below; they are kept
as historical audit context, with final status recorded in Outcomes and
Artifacts.

- Observation: The roadmap contains newly inserted Phase 16 analytics, Phase 17
  onboarding, Phase 18 app updates, and Phase 19 hardening sections after Phase
  15.
  Evidence: `ROADMAP.md` now has Phase 15 rebrand/service decoupling followed
  by Phase 16 analytics setup, Phase 17 onboarding screen, Phase 18 app
  updates, and Phase 19 hardening/release readiness in the current working tree.

- Observation: Some service decoupling has already started.
  Evidence: `src/main/lib/config.ts` disables legacy `21st.dev` API URLs;
  `src/main/lib/auto-updater.ts` disables updates unless a non-legacy update
  feed is configured; `src/main/windows/main.ts` blocks signed/stream fetches
  to legacy `21st.dev` URLs.

- Observation: Core shipped identity is still inherited.
  Evidence: `package.json` still has `name: "21st-desktop"`, description
  `1Code - UI for parallel work with AI agents`, app id `dev.21st.agents`,
  product name `1Code`, protocol `twentyfirst-agents`, and microphone copy that
  says `1Code`.

- Observation: Main-process launch, menu, About, protocol, dev userData, and
  Windows app identity still present as 1Code/21st.
  Evidence: `src/main/index.ts` declares `PROTOCOL` as `twentyfirst-agents`,
  uses dev userData `Agents Dev`, sets Windows app user model IDs under
  `dev.21st.1code`, logs `Starting 1Code`, and builds menu/About copy around
  `About 1Code` and the `1code` command.

- Observation: There are now two CLI surfaces, and Phase 15 must preserve the
  Phase 14 `ripple frame-sheet` CLI while rebranding the legacy app-open CLI.
  Evidence: `src/cli/ripple.ts`, `scripts/ripple-cli.ts`, `resources/cli/ripple`,
  and `resources/cli/ripple.cmd` already exist from Phase 14, but
  `resources/cli/ripple` still points at packaged executable `MacOS/1Code`,
  `resources/cli/ripple.cmd` still points at `1Code.exe`, `resources/cli/1code`
  still opens `1Code`, and platform providers still install
  `/usr/local/bin/1code` or `~/.local/bin/1code.cmd`.

- Observation: The app icon candidate exists but is not wired.
  Evidence: `build/ripple-logo-export-bw-clean/README.md` says those icon files
  mirror Electron's expected names and are not wired into the app yet; the
  package still points to `build/icon.icns`, `build/icon.ico`, and
  `build/icon.png`.

- Observation: The clean logo bundle already contains the needed package-level
  source assets, but the active app still uses older top-level assets and inline
  1Code SVGs.
  Evidence: `build/ripple-logo-export-bw-clean` contains `icon.icns`,
  `icon.ico`, `icon.png`, `icon.iconset/*`, `trayTemplate.svg`,
  `trayTemplate.png`, `trayTemplate@2x.png`, previews, and `source.svg`.
  `package.json` still uses top-level `build/icon.*`; notification fallback
  code reads top-level `build/icon.ico` / `build/icon.png`;
  `src/main/index.ts` embeds an old blue favicon/auth logo; and
  `src/renderer/components/ui/logo.tsx` still has aria label `21st logo`.

- Observation: Analytics is still inherited and enabled by default in packaged
  builds if no environment key is provided.
  Evidence: `src/main/lib/analytics.ts` hardcodes a PostHog key and describes
  itself as "PostHog analytics for 1Code Desktop"; renderer analytics still
  uses `VITE_POSTHOG_KEY`/`VITE_POSTHOG_HOST` naming and 1Code comments.

- Observation: Some 1Code names are compatibility paths, not primary UX, and
  should be handled deliberately rather than removed blindly.
  Evidence: `src/main/lib/git/worktree-config.ts` reads legacy
  `.1code/worktree.json` after `.ripple/worktree.json` and `.cursor`; tests
  cover that fallback. This can stay as legacy import support if no new primary
  path writes `.1code`.

- Observation: A productName/userData change can strand existing local data if
  it is not planned.
  Evidence: the database lives under `app.getPath("userData")/data/agents.db`,
  auth lives under `app.getPath("userData")/auth.dat`, and renderer
  localStorage lives in Electron's userData directory.

- Observation: UserData migration can accidentally skip itself if "empty
  destination" is tested after the singleton lock is requested.
  Evidence: `src/main/index.ts` calls `app.requestSingleInstanceLock()` before
  `app.whenReady()`, and lock/cache files can appear in the new destination
  before migration. `src/main/auth-store.ts` decrypts `auth.dat` through
  `safeStorage.decryptString(...)`, so copied encrypted auth must be validated
  before treating it as successfully migrated.

- Observation: Release/update scripts still contain inherited or missing
  release paths.
  Evidence: `package.json` references `scripts/upload-release.mjs` and
  `scripts/upload-release-wrangler.sh`, which are not present in the working
  tree, and `scripts/generate-update-manifest.mjs` still instructs uploading
  `Agents-*` artifacts to `cdn.21st.dev`.

- Observation: MCP OAuth and OAuth client identity are part of the rebrand
  surface.
  Evidence: `src/main/lib/mcp-auth.ts` constructs an MCP client named
  `21st-desktop`; `src/main/lib/oauth.ts` still uses client names and fallbacks
  such as `1code`, `Codex`, and default client id `1code`.

- Observation: Environment typings and sample env docs still carry inherited
  analytics/API names.
  Evidence: `src/env.d.ts` declares `MAIN_VITE_POSTHOG_*` and
  `VITE_POSTHOG_*`; `.env.example` documents those names and still says the API
  URL defaults to `https://21st.dev`.

## Decision Log

- Decision: Centralize app identity before replacing scattered strings.
  Rationale: Package identity, protocols, CLI names, update logs, auth callback
  pages, menus, and renderer links should come from one small contract so later
  phases do not inherit another set of magic strings.
  Date/Author: 2026-05-02 / Codex

- Decision: The planned primary names are `Ripple` for product name, `ripple`
  for the CLI command, `ripple` for production deep links, `ripple-dev` for dev
  deep links, `Ripple Dev` for development userData, and
  `app.ripple.desktop` / `app.ripple.desktop.dev` for packaged app IDs unless
  the user chooses a different signing identity before implementation.
  Rationale: These names are short, user-facing, and aligned with the local
  motion product. The app ID can be swapped early in implementation if a real
  reverse-DNS domain is chosen for signing.
  Date/Author: 2026-05-02 / Codex

- Decision: Phase 15 hard-disables inherited analytics by default rather than
  designing the full event taxonomy, PostHog project wiring, or consent system.
  Rationale: Roadmap Phase 16 owns the event map, consent copy, and analytics
  product-health design. Phase 15 should remove inherited keys and upstream
  identity now so there is no accidental tracking while Phase 16 is pending.
  New Ripple analytics env names can be reserved in the identity/config
  contract, but analytics capture should remain no-op until Phase 16 implements
  explicit consent and provider configuration.
  Date/Author: 2026-05-02 / Codex

- Decision: Keep optional hosted-service plumbing, but make it explicit,
  Ripple-named, and harmless when unset.
  Rationale: Ripple may later add hosted services, but local create/open,
  preview, comments, revisions, and export must work without a hosted backend.
  Date/Author: 2026-05-02 / Codex

- Decision: Preserve legacy `.1code/worktree.json` reads as advanced
  compatibility, but never write new 1Code config from primary Ripple paths.
  Rationale: Existing projects may have old configuration. Reading it is not
  the same as shipping a primary 1Code experience.
  Date/Author: 2026-05-02 / Codex

- Decision: Add userData migration before changing the productName-driven data
  path.
  Rationale: A rebrand should not make existing local projects, conversations,
  auth credentials, update preferences, project icons, or UI preferences appear
  lost on first launch.
  Date/Author: 2026-05-02 / Codex

- Decision: Preserve the Phase 14 `ripple frame-sheet` CLI and rebrand the
  app-launch CLI plumbing around it.
  Rationale: Phase 14 already introduced the `ripple` command for visual
  context. Phase 15 should not rebuild or regress that utility; it should fix
  packaged executable names, install locations, menu copy, source-path
  resolution, and legacy `1code` cleanup so the same `ripple` command supports
  both app-open and `frame-sheet` behavior.
  Date/Author: 2026-05-04 / Codex

- Decision: Protocol migration emits only Ripple-owned schemes in new flows.
  Rationale: New auth and MCP callback URLs should use `ripple://` or
  `ripple-dev://`. If a transition release accepts `twentyfirst-agents` URLs,
  that acceptance must be inbound-only, tested, and not listed as a packaged
  primary protocol.
  Date/Author: 2026-05-04 / Codex

- Decision: Phase 15 owns update identity and disabled legacy feeds, while Phase
  18 owns the full app-update experience.
  Rationale: Phase 18 depends on Ripple-owned app IDs, artifact names, feed
  names, signing identity, and release-channel boundaries. Phase 15 should make
  those inputs safe and Ripple-owned without implementing the complete
  check/download/restart/recovery UX.
  Date/Author: 2026-05-04 / Codex

- Decision: `build/ripple-logo-source.svg` is the source of truth for the Phase
  15 Ripple app-icon system.
  Rationale: The user selected the clean chevron/playhead design as the new
  mark. `scripts/generate-icon.mjs` now derives the active packaged `icon.*`
  assets from that source, while the renderer and tray/menu surfaces use
  documented monochrome derivatives. Older blue, export-bundle, and concept
  assets should not remain on shipped primary paths.
  Date/Author: 2026-05-04 / User + Codex

## Outcomes & Retrospective

Phase 15 is implemented in the current working tree.

- App identity now flows through `src/shared/app-identity.ts`, with Ripple
  product names, app IDs, protocols, CLI names, userData names, and explicit
  legacy compatibility names.
- Package and main-process identity now present the app as Ripple: package
  metadata, macOS `Info.plist`, app IDs, protocol schemes, About/menu/title
  strings, terminal env, OAuth/MCP client names, debug callback URLs, and auth
  callback pages are Ripple-owned.
- The selected `build/ripple-logo-source.svg` now backs active `build/icon.*`,
  packaged resource icons, renderer splash, auth callback favicon/logo, login
  surface, and fallback logo surfaces. The renderer sidebar/header `Logo` and
  tray/menu template use backgroundless monochrome derivatives of the same mark.
- Hosted services are optional and Ripple-named. Unset API/update env vars
  disable those services, legacy `21st.dev` URLs are rejected, analytics is
  intentionally no-op until Phase 16, and release manifest output points at a
  configured Ripple release destination.
- The Phase 14 `ripple frame-sheet` CLI still works from the packaged app, while
  the old packaged `1code` wrapper is gone and platform install providers now
  target `ripple`.
- Legacy `.1code/worktree.json` and old userData names are retained only for
  read/migration compatibility. New primary paths write Ripple-owned locations,
  and successful userData migration writes `ripple-migration.json` so the copy
  is not repeated.

Validation completed on 2026-05-04 and refreshed after final logo cleanup:

- `bun run ts:check` passed.
- `bun test` passed: 374 tests, 0 failures.
- `bun run test:ripple` passed: 352 tests, 0 failures.
- `bun run build` passed. Existing Vite warnings remain for `gray-matter` eval
  and dynamic/static import chunking.
- `bun run package` passed and generated `release/mac-arm64/Ripple.app`;
  notarization was skipped because notarize options were not configured.
- Fresh packaged `Info.plist` reports `CFBundleDisplayName`,
  `CFBundleExecutable`, and `CFBundleName` as `Ripple`,
  `CFBundleIdentifier` as `app.ripple.desktop`, and only the `ripple` URL
  scheme.
- Fresh packaged CLI smoke passed for
  `release/mac-arm64/Ripple.app/Contents/Resources/bin/ripple --help` and
  the same packaged `ripple frame-sheet --help` command. Both commands printed
  the expected help; Electron emitted a macOS code-sign validity warning but
  exited 0.
- Packaged `Resources/icon.icns`, `Resources/build/icon.png`, and
  `Resources/build/trayTemplate.*` are the active generated Ripple icon/tray
  assets. `release/mac-arm64/Ripple.app/Contents/Resources` contains
  `bin/ripple`, `bin/ripple.cmd`, `build/icon.*`, and `build/trayTemplate.*`,
  with no packaged `1code` wrapper.
- A packaged resource search for `1code*` returned no legacy CLI wrapper.
- `bun run dist:manifest` passed after regenerating
  `release/Ripple-0.0.72-arm64.zip`; it generated `latest-mac.yml` for Ripple
  artifacts and printed configured Ripple release-destination instructions.
- `git diff --check` passed.
- Computer Use QA of the live dev app verified the app menu/window as
  Ripple/Ripple Dev, the backgroundless smaller sidebar logo in light mode, the
  project/composition list, HyperFrames preview/timeline playback, Comments,
  and the Renders right-pane replacement. A UI export smoke completed from the
  `Hello` project to `exports/hello-main-moresihpjbzlroah.mp4`, reporting MP4,
  30 fps, 233 KB, 0:06, and 1920x1080 in the Renders pane.
- Primary-path string audit passed after review. Remaining hits are limited to
  legacy `.1code` read-only support/tests, userData migration fixtures, config
  rejection tests for old `21st.dev` URLs, one sandbox host parsing comment
  using `21st.sh`, and non-product `AGENTS` agent-instruction terminology.
- Renderer logo audit for the old 400x400 mark and `21st logo` labels passed
  with no remaining hits.

Residual notes from QA: the dev app logs a local MCP warning for a missing
Codex Computer Use app path inside Ripple's own plugin discovery, and packaged
CLI smoke emits a macOS code-sign validity warning while still exiting 0. Those
warnings did not block startup, playback, package generation, or CLI help.

## Context and Orientation

Ripple is currently a local-first motion-graphics app built on a 1Code desktop
foundation. The visible motion product is already well underway: projects live
under `~/Ripple`, HyperFrames preview/timeline/export is the center surface,
comments and revisions use Ripple language, and Phase 11/12 added exports and
templates.

The remaining Phase 15 problem is that the shell still carries inherited
identity and hosted-service assumptions:

- `package.json` controls Electron package metadata, app IDs, protocols,
  product name, release scripts, icons, and platform build settings.
- `src/main/index.ts` owns startup identity, protocol registration, the local
  auth callback server, About panel, application menu, update menu, dev
  userData path, Windows app user model ID, and Electron boot sequence.
- `src/main/lib/config.ts` is the current hosted API boundary.
- `src/main/auth-manager.ts` and `src/main/auth-store.ts` handle optional hosted
  desktop auth and local credential persistence.
- `src/main/lib/auto-updater.ts` handles optional electron-updater feed setup.
- `src/main/lib/analytics.ts` and `src/renderer/lib/analytics.ts` initialize
  PostHog analytics.
- `src/main/lib/cli.ts`, `src/main/lib/platform/*`, and `resources/cli/1code`
  implement the app CLI command.
- `src/renderer/components/ui/logo.tsx`, settings tabs, update banners, theme
  names, and leftover login/update surfaces contain user-facing strings.
- `src/main/lib/trpc/routers/projects.ts` still has inherited repository clone
  helpers that default to `~/.21st/repos`.

Terms used in this plan:

- "Primary path" means the flows a normal Ripple user sees while creating,
  opening, previewing, commenting, revising, and exporting motion projects.
- "Optional hosted service" means any network service configured by an env var
  or future settings step. It must never gate local project work.
- "Legacy compatibility" means code that can read or migrate old local state
  without presenting old branding in the normal UI or creating new old-branded
  files.
- "Inbound-only legacy protocol" means a temporary parser for old callback URLs.
  Ripple may accept such URLs for recovery if explicitly implemented, but new
  app URLs, auth URLs, package metadata, and docs must emit Ripple schemes.

## Plan of Work

Milestone 0 creates a small identity and service-boundary contract. Add a
shared module such as `src/shared/app-identity.ts` or a main/renderer pair that
exports product name, app IDs, protocol schemes, CLI command names, userData
directory names, update env names, analytics env names, and legacy names. Add
tests for the config helpers that reject legacy `21st.dev` values, accept
Ripple-owned env names, and leave hosted services disabled when unset.
Also add the userData migration policy here, before package metadata is
switched: migration must run before singleton lock creation or define
"destination empty" by absence of real local state, ignoring singleton locks and
caches. This milestone is complete when identity/config/userData helper tests
pass independently.

Milestone 1 updates packaged app identity. Change `package.json` metadata to
Ripple-owned values, update `build.productName`, `build.appId`, protocols,
`NSMicrophoneUsageDescription`, mac/linux categories where appropriate, and
release artifact names. Wire the clean Ripple icon candidate from
`build/ripple-logo-source.svg` as the app-icon source of truth. Generate or
place:

- `build/icon.icns` for macOS app/Dock/package identity.
- `build/icon.ico` for Windows app, installer, uninstaller, and notification
  fallback.
- `build/icon.png` for Linux app identity and notification fallback.
- `build/trayTemplate.svg`, `build/trayTemplate.png`, and
  `build/trayTemplate@2x.png` for template-style tray/menu glyphs.
- any iconset/sized PNG slices needed by packaging or icon regeneration.

Do not keep older blue/concept logos on any shipped primary path. Update
`scripts/patch-electron-dev.mjs` so the dev Electron bundle shows Ripple in the
Dock.
This milestone is complete when the package metadata and generated macOS
`Info.plist` identify the app as Ripple and no package metadata emits
`twentyfirst-agents`, `dev.21st.*`, or `1Code`, and when generated package
metadata/icons use the white-on-black clean Ripple assets.

Milestone 2 replaces deep links and app-launch CLI naming while preserving the
Phase 14 CLI. Update `src/main/index.ts`, `src/main/lib/trpc/routers/debug.ts`,
`src/main/auth-manager.ts`, `src/main/lib/mcp-auth.ts`, `src/main/lib/oauth.ts`,
and related preload/renderer code to use `ripple://` and `ripple-dev://` for
new auth and MCP callbacks. Keep any `twentyfirst-agents` support inbound-only
and explicitly tested if a transition path is retained. Update the existing
`resources/cli/ripple` and `resources/cli/ripple.cmd` wrappers so packaged
execution points at the rebranded app executable and still runs
`out/main/ripple-cli.js`; update `src/main/lib/cli.ts`, `src/main/lib/platform/*`,
and menu/dialog copy to install `ripple` / `ripple.cmd`. Keep an explicit legacy
cleanup path for an existing `1code` symlink or generated copy only when it
points to this app's old bundled resource. Do not silently delete unrelated user
commands. This milestone is complete when a packaged app exposes `ripple --help`
and `ripple frame-sheet --help`, and new callback/debug surfaces emit only
Ripple schemes.

Milestone 3 removes inherited hosted-service coupling. Rename hosted API env
usage to Ripple-owned names such as `MAIN_VITE_RIPPLE_API_URL` and
`MAIN_VITE_RIPPLE_UPDATE_URL`, with temporary compatibility only for non-legacy
old env names if needed. Remove hardcoded PostHog keys and make main/renderer
analytics capture no-op even if old env vars are present; Phase 16 will add the
Ripple PostHog project, explicit consent, event map, and main-process analytics
state. Keep Sentry and auto-update disabled unless configured through
Ripple-owned env names. Update `src/env.d.ts`, `.env.example`, release scripts,
and manifest generation to talk about Ripple artifacts and a configured
destination instead of `cdn.21st.dev` or `Agents-*` files. This milestone is
complete when no-env startup is harmless, old hosted URLs are rejected, analytics
cannot emit events accidentally, and `bun run dist:manifest` no longer prints
legacy upload instructions.

Milestone 4 cleans renderer-facing identity. Replace `Logo` with the Ripple
logo asset or a code-native version derived from `build/ripple-logo-source.svg`.
Update auth callback favicons and inline logo SVGs, renderer `Logo` aria labels,
title bars, update links,
settings tab copy, account/profile copy, theme names, "21st Dark"/"21st Light"
defaults, fallback app icons, and any visible 1Code/21st strings in primary UI.
Add a preference migration so users with stored `21st-dark` or `21st-light`
themes land on renamed Ripple theme IDs without losing their appearance.
This milestone may rebrand and ungate the existing project-entry path, but it
does not design the new Phase 17 onboarding experience or analytics consent
screen. It is complete when renderer string/theme tests and a primary-path
string audit pass, and when all primary UI logo renderers use the clean
white-on-black Ripple design or an intentional monochrome derivative.

Milestone 5 narrows old repo/service flows. Move default clone destinations
from `~/.21st/repos` to a Ripple-owned advanced import location such as
`~/Ripple/Imports`. Hide or relabel repo-first flows so they are not primary
project creation. Keep `.1code/worktree.json` as read-only legacy detection in
`src/main/lib/git/worktree-config.ts`, but ensure save targets and settings
default to `.ripple/worktree.json`.
This milestone is complete when clone/import defaults and worktree-config tests
prove no primary path writes `.21st` or `.1code`, while existing `.1code` reads
remain covered as legacy compatibility.

Milestone 6 validates the app as a Ripple package. Run automated checks, a
string audit, release-script/manifest checks, and a package smoke. Then launch
the Electron app and verify that a fresh local boot with no hosted
API/update/analytics env reaches the Ripple project entry flow, can create/open
a project, can preview/export, and shows Ripple in the app menu, About panel,
Dock/taskbar/title bar, settings, update state, and CLI install prompts.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Create the identity contract and config tests.
2. Add userData migration before switching productName/app userData and before
   `app.requestSingleInstanceLock()` can make the destination look non-empty:
   - source candidates: legacy packaged `1Code`, legacy dev `Agents Dev`, and
     any app-data directory used by current Electron builds on the target OS.
   - destination: `Ripple` or `Ripple Dev`.
   - copy only safe local state when the destination is empty: `data/agents.db`
     plus WAL/SHM files, `auth.dat`, `auth.dat.json`, `window-settings.json`,
     `update-channel.json`, `project-icons/`, and renderer `Local Storage/`.
   - define "empty" by absence of real app state such as database/auth/local
     storage, ignoring singleton locks and caches.
   - validate copied encrypted auth by loading it through the same
     `safeStorage.decryptString(...)` path before marking auth migrated.
   - never copy stale singleton lock files, GPU caches, crash dumps, or
     network caches.
3. Build/place the clean logo system from `build/ripple-logo-source.svg`:
   - copy or regenerate `icon.icns`, `icon.ico`, and `icon.png` into the active
     package paths or repoint package/runtime paths to the clean bundle,
   - copy or regenerate tray/menu template assets into the active runtime paths,
   - update `scripts/generate-icon.mjs` or replace it with a Ripple logo
     generation script if regeneration remains part of the workflow,
   - update `scripts/patch-electron-dev.mjs` to use the Ripple name and icon.
4. Update `package.json`, package build metadata, platform categories, release
   artifact names, and dev patch script.
5. Update main-process startup identity, protocols, callback pages, About panel,
   menus, Windows app user model ID, notification strings, update menu strings,
   inline auth/MCP callback favicons/logos, and logs.
6. Preserve the existing Phase 14 `ripple` CLI wrappers and update their
   packaged executable paths from `1Code`/`1Code.exe` to Ripple. Rename platform
   provider configs and app menus from `1code` to `ripple`, with a guarded
   legacy cleanup helper for old symlinks or generated copies that target this
   app.
7. Update hosted-service config and callers so unset services return harmless
   disabled states. Block legacy `21st.dev` values as today.
8. Update analytics initialization so inherited hardcoded keys and old env names
   cannot emit events. Keep analytics no-op until Phase 16 adds explicit Ripple
   consent/configuration. Add tests that no hardcoded inherited key is used.
9. Update renderer logo, visible labels, update/changelog links, theme names,
   account/settings copy, and optional service UI states.
10. Update repo clone/import defaults and any old `.21st` path writes to Ripple
   locations.
11. Update env typings/docs (`src/env.d.ts`, `.env.example`) and release
    manifest/upload scripts so they are Ripple-owned and do not reference
    missing old release scripts.
12. Run the validation commands below and record results in this plan.
13. If implementation changes durable product direction beyond this plan, update
   `ROADMAP.md`; otherwise keep roadmap text stable.

## Validation and Acceptance

Automated validation:

- `bun run ts:check`
- `bun run test:ripple`
- `bun test`
- `bun run build`
- `bun run package`
- `bun run dist:manifest`
- `git diff --check`

Focused validation to add or run:

- Milestone exit checks:
  - Milestone 0: identity/config/userData migration unit tests pass.
  - Milestone 1: package metadata and generated app metadata inspect as Ripple,
    and package icons derive from `build/ripple-logo-source.svg`.
  - Milestone 2: packaged `ripple --help` and `ripple frame-sheet --help` work;
    new auth/MCP/debug URLs emit Ripple schemes.
  - Milestone 3: no-env/no-network startup is harmless; legacy hosted URLs and
    inherited analytics keys cannot emit events.
  - Milestone 4: renderer string/theme migration tests pass.
  - Milestone 5: clone/import/worktree tests prove Ripple defaults and legacy
    read-only compatibility.
- Config tests proving:
  - no hosted API is configured when env vars are unset,
  - legacy `21st.dev` values are rejected,
  - Ripple-owned API/update env vars are accepted,
  - Ripple analytics env names are reserved but analytics stays no-op until Phase
    16 consent/configuration is implemented,
  - legacy non-21st env compatibility, if kept, is documented and tested.
- UserData migration tests proving:
  - an empty Ripple data dir receives safe legacy local state,
  - an existing Ripple data dir is not overwritten,
  - stale lock/cache files are not copied.
  - singleton locks do not cause migration to skip real missing local state.
  - copied encrypted `auth.dat` is readable through the auth-store decrypt/load
    path before migration records success.
- CLI/platform tests or smoke checks proving:
  - the installed command name is `ripple`,
  - the old `1code` command is not newly installed,
  - legacy cleanup only removes symlinks/copies created by this app.
  - the packaged `ripple` wrapper still runs the Phase 14 `frame-sheet` command.
- Logo/icon validation proving:
  - active `build/icon.icns`, `build/icon.ico`, `build/icon.png`, and
    `build/trayTemplate.*` derive from `build/ripple-logo-source.svg` or a
    documented monochrome derivative.
  - package metadata points at the active clean Ripple icon assets.
  - notification fallbacks on Windows/Linux resolve the clean `build/icon.*`
    assets.
  - auth callback favicon/inline logo and renderer `Logo` use the clean Ripple
    source or a documented monochrome derivative.
  - old blue/concept logos are not used in shipped primary paths.
- Theme migration tests proving stored `21st-dark` and `21st-light` values map
  to Ripple-owned theme IDs.

String audit:

Run a primary-path audit and review every remaining hit:

```bash
rg -n "1Code|21st\\.dev|twentyfirst|\\.21st|dev\\.21st|1code|21st logo|21st Dark|21st Light|Agents-" package.json electron-builder.yml electron.vite.config.ts src/env.d.ts .env.example src/main src/preload src/renderer resources scripts build --glob '!**/*.png' --glob '!**/*.ico' --glob '!**/*.icns' --glob '!**/*.tiff'
```

Expected result: no hits in shipped primary paths. Allowed hits must be
explicitly documented legacy compatibility, migration code, test fixtures, or
historical docs that are not packaged into the app.

Package smoke:

- Inspect generated app metadata after `bun run package`:
  - macOS `Info.plist` product name is Ripple,
  - protocol schemes are `ripple` and not `twentyfirst-agents`,
  - app ID is Ripple-owned,
  - icons are the clean white-on-black Ripple assets from
    `build/ripple-logo-source.svg`,
  - packaged resources still include migrations, bundled agent binaries, and
    `hyperframes-templates`.
- Run the packaged CLI wrappers from the built app resources:
  - `ripple --help` prints the Ripple CLI help,
  - `ripple frame-sheet --help` prints the Phase 14 frame-sheet help,
  - no installed/menu path creates a new `1code` command.
- Verify release manifest generation uses Ripple artifact names and does not
  instruct uploading to `cdn.21st.dev`.
- Verify release scripts referenced by `package.json` exist or are removed from
  the release path.

Manual Electron acceptance:

- Launch with no hosted API, update, PostHog, or Sentry env vars.
- Observe that the app reaches Ripple local project entry without sign-in.
- Create a project under `~/Ripple`, select a template, preview it, create a
  comment, and open the `Renders` pane.
- Confirm app menu, About panel, window title/taskbar/Dock identity, settings,
  update UI, auth callback pages, notifications, and CLI install dialogs say
  Ripple.
- Confirm Dock/taskbar/app icon, installer icon, notification icon, auth callback
  favicon/logo, renderer logo, and tray/menu template glyph use the clean
  white-on-black Ripple design.
- Confirm optional hosted account/profile/automation surfaces are hidden,
  disabled, or clearly optional when no hosted service is configured.
- Confirm old local data is visible after the userData migration when starting
  from a legacy data directory.

## Idempotence and Recovery

All string and metadata replacements should be safe to rerun because they flow
from the identity constants and package metadata.

UserData migration must be idempotent. It should create a marker file such as
`ripple-migration.json` in the destination userData folder with source path,
copied paths, timestamp, and app version. If the marker exists or the
destination contains a database, migration should not overwrite user data. If a
copy fails halfway through, leave a clear log message and retry only missing
safe files on the next launch.

CLI install changes must avoid destructive cleanup. Removing a legacy `1code`
command is safe only if it is a symlink to the old bundled resource or a file
with a matching generated marker/header. Otherwise leave it in place and only
install the new `ripple` command.

Protocol migration is additive only for inbound legacy parsing. Register
`ripple` and `ripple-dev` for new flows. If needed for one transition release,
accept `twentyfirst-agents` callbacks only as legacy inputs and never emit them
in new auth URLs, package metadata, docs, or debug helpers.

If package metadata changes break signing, updates, or app data paths, revert
only the metadata and identity constants involved. Do not revert unrelated
Ripple project, export, comment, or template work.

## Interfaces and Dependencies

Repository modules to create or change:

- `src/shared/app-identity.ts` or equivalent shared identity contract.
- `src/main/lib/config.ts`
- `src/main/lib/auto-updater.ts`
- `src/main/lib/analytics.ts`
- `src/renderer/lib/analytics.ts`
- `src/main/auth-manager.ts`
- `src/main/auth-store.ts`
- `src/main/index.ts`
- `src/main/windows/main.ts`
- `src/main/lib/cli.ts`
- `src/main/lib/platform/darwin.ts`
- `src/main/lib/platform/linux.ts`
- `src/main/lib/platform/windows.ts`
- `src/main/lib/mcp-auth.ts`
- `src/main/lib/oauth.ts`
- `resources/cli/ripple`
- `resources/cli/ripple.cmd`
- `resources/cli/1code` for guarded legacy cleanup/removal.
- `build/ripple-logo-source.svg` as the selected app-icon source.
- `build/icon.icns`
- `build/icon.ico`
- `build/icon.png`
- `build/trayTemplate.svg`
- `build/trayTemplate.png`
- `build/trayTemplate@2x.png`
- `package.json`
- `electron-builder.yml`
- `electron.vite.config.ts`
- `src/env.d.ts`
- `.env.example`
- `scripts/patch-electron-dev.mjs`
- `scripts/generate-icon.mjs` or its Ripple replacement if icon generation stays
  scripted.
- `scripts/generate-update-manifest.mjs`
- release upload scripts referenced by `package.json`, if they remain in the
  release path.
- `src/renderer/components/ui/logo.tsx`
- `src/renderer/login.html` if the legacy login surface remains packaged.
- `src/renderer/icons/framework-icons.tsx` for any remaining 21st fallback logo.
- `src/renderer/components/update-banner.tsx`
- `src/renderer/lib/hooks/use-just-updated.ts`
- `src/renderer/lib/themes/builtin-themes.ts`
- `src/renderer/lib/themes/diff-view-highlighter.ts`
- `src/renderer/lib/themes/shiki-theme-loader.ts`
- `src/renderer/lib/atoms/index.ts`
- `src/main/lib/trpc/routers/projects.ts`
- `src/main/lib/git/worktree-config.ts` and tests, if save/read behavior changes.

External dependencies and services:

- Electron and electron-builder package metadata.
- electron-updater generic feed, disabled unless configured.
- PostHog/Sentry SDKs, disabled unless configured and allowed by their owning
  phase. For Phase 15, inherited analytics must be no-op by default; Phase 16
  owns explicit analytics consent/configuration.
- OS protocol handlers for `ripple://` and `ripple-dev://`.
- OS CLI install locations: `/usr/local/bin/ripple` on macOS/Linux and
  `~/.local/bin/ripple.cmd` on Windows.
- Existing HyperFrames, Producer, FFprobe, template bundle, project, comment,
  revision, and export systems should continue to work unchanged.

## Artifacts and Notes

Initial audit commands:

- `rg -n "1Code|21st|twentyfirst|\\.21st|21st\\.dev|1code|dev\\.21st|twentyfirst-agents|Agents Dev|@1code|1code\\.dev|21st logo" src/main src/preload src/renderer resources scripts build package.json electron-builder.yml electron.vite.config.ts src/env.d.ts .env.example README-ripple.md docs --glob '!**/*.png' --glob '!**/*.ico' --glob '!**/*.icns' --glob '!**/*.tiff'`
- `sed -n '930,1125p' ROADMAP.md`
- `sed -n '1,220p' package.json`
- `sed -n '1,1040p' src/main/index.ts`
- `sed -n '1,320p' src/main/lib/analytics.ts`
- `sed -n '1,280p' src/main/auth-manager.ts`
- `sed -n '1,240p' src/main/lib/platform/darwin.ts`
- `sed -n '1,160p' resources/cli/1code`
- `sed -n '1,80p' resources/cli/ripple`
- `sed -n '1,80p' src/main/lib/mcp-auth.ts`
- `sed -n '1,120p' src/main/lib/oauth.ts`
- `sed -n '1,80p' src/env.d.ts`
- `sed -n '1,80p' .env.example`

Completion audit notes:

- The initial inherited identity hits listed above were resolved or moved behind
  explicit legacy compatibility.
- Active package metadata is Ripple-owned, and fresh macOS generated metadata
  confirms `Ripple`, `app.ripple.desktop`, and the `ripple` protocol.
- Active top-level package icons and packaged resource icons are generated from
  `build/ripple-logo-source.svg`; tray/menu resources use the backgroundless
  monochrome derivative.
- `resources/cli/ripple` and `resources/cli/ripple.cmd` now point at packaged
  `Ripple` executables, and the packaged `1code` wrapper has been removed.
- `src/main/lib/cli.ts` now resolves packaged CLI resources under
  `process.resourcesPath/bin/<scriptName>`, matching the package resources.
- `.env.example`, `src/env.d.ts`, hosted API/update config, analytics modules,
  and manifest generation now use Ripple-owned names. Analytics remains no-op
  until Phase 16.
- Remaining string-audit hits are intentionally allowed legacy compatibility,
  rejection tests, or non-primary comments:
  - `.1code/worktree.json` read-only detection and tests,
  - `1Code` userData migration fixture names,
  - `21st.dev` config rejection helpers/tests,
  - `21st.sh` sandbox-host parser examples,
  - `AGENTS` project note and agent-runtime terminology.
