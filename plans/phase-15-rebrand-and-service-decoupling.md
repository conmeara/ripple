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
copy rewrite of every internal agent concept, not a full analytics taxonomy
build, and not the first-run onboarding redesign. Those follow in Roadmap
Phases 16 and 17. Phase 15 should leave clean hooks for those phases by making
analytics, hosted auth, hosted APIs, update feeds, and release channels
explicitly Ripple-owned and optional.

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
- [ ] Implement Milestone 0: central Ripple identity constants and legacy
  migration policy.
- [ ] Implement Milestone 1: package, app, protocol, icon, menu, title, and
  About panel rebrand.
- [ ] Implement Milestone 2: CLI command and deep-link migration from `1code`
  and `twentyfirst-agents` to Ripple-owned names.
- [ ] Implement Milestone 3: hosted auth, hosted API, update feed, analytics,
  crash reporting, and release-script decoupling.
- [ ] Implement Milestone 4: renderer user-facing string, logo, theme, update,
  settings, and optional-service cleanup.
- [ ] Implement Milestone 5: legacy repo/import defaults and `.1code`
  compatibility boundaries.
- [ ] Implement Milestone 6: validation, packaging smoke, and Electron QA.

## Surprises & Discoveries

- Observation: The roadmap already contains newly inserted Phase 16 analytics
  and Phase 17 onboarding sections after Phase 15.
  Evidence: `ROADMAP.md` now has Phase 15 rebrand/service decoupling followed
  by Phase 16 analytics setup and Phase 17 onboarding screen in the current
  working tree.

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

- Observation: The bundled CLI is still named and scripted as 1Code.
  Evidence: `resources/cli/1code` opens `1Code`, and platform providers install
  `/usr/local/bin/1code` or `~/.local/bin/1code.cmd`.

- Observation: The app icon candidate exists but is not wired.
  Evidence: `build/ripple-logo-export-bw-clean/README.md` says those icon files
  mirror Electron's expected names and are not wired into the app yet; the
  package still points to `build/icon.icns`, `build/icon.ico`, and
  `build/icon.png`.

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

## Decision Log

- Decision: Centralize app identity before replacing scattered strings.
  Rationale: Package identity, protocols, CLI names, update logs, auth callback
  pages, menus, and renderer links should come from one small contract so Phase
  16 and Phase 17 do not inherit another set of magic strings.
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

- Decision: Phase 15 disables hosted analytics by default rather than designing
  the full event taxonomy.
  Rationale: Roadmap Phase 16 owns the event map, consent copy, and analytics
  product-health design. Phase 15 should remove inherited keys and upstream
  identity now so there is no accidental tracking while Phase 16 is pending.
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

## Outcomes & Retrospective

Not started.

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

## Plan of Work

Milestone 0 creates a small identity and service-boundary contract. Add a
shared module such as `src/shared/app-identity.ts` or a main/renderer pair that
exports product name, app IDs, protocol schemes, CLI command names, userData
directory names, update env names, analytics env names, and legacy names. Add
tests for the config helpers that reject legacy `21st.dev` values, accept
Ripple-owned env names, and leave hosted services disabled when unset.

Milestone 1 updates packaged app identity. Change `package.json` metadata to
Ripple-owned values, update `build.productName`, `build.appId`, protocols,
`NSMicrophoneUsageDescription`, mac/linux categories where appropriate, and
release artifact names. Wire the clean Ripple icon candidate from
`build/ripple-logo-export-bw-clean/` either by copying those files over
`build/icon.*` and tray assets or by pointing Electron builder directly at the
candidate paths. Update `scripts/patch-electron-dev.mjs` so the dev Electron
bundle shows Ripple in the Dock.

Milestone 2 replaces deep links and CLI naming. Update `src/main/index.ts`,
`src/main/lib/trpc/routers/debug.ts`, `src/main/auth-manager.ts`, and related
preload/renderer code to use `ripple://` and `ripple-dev://` for auth and MCP
callbacks. Create `resources/cli/ripple`, update platform CLI providers to
install `ripple` / `ripple.cmd`, update menus and dialogs, and keep an explicit
legacy cleanup path for an existing `1code` symlink only when it points to this
app's old bundled resource. Do not silently delete unrelated user commands.

Milestone 3 removes inherited hosted-service coupling. Rename hosted API env
usage to Ripple-owned names such as `MAIN_VITE_RIPPLE_API_URL` and
`MAIN_VITE_RIPPLE_UPDATE_URL`, with temporary compatibility only for non-legacy
old env names if needed. Remove hardcoded PostHog keys; only initialize main or
renderer analytics when Ripple analytics env vars are present and the user has
not opted out. Keep Sentry and auto-update disabled unless configured. Update
release scripts and manifest generation to talk about Ripple artifacts and a
configured destination instead of `cdn.21st.dev` or `Agents-*` files.

Milestone 4 cleans renderer-facing identity. Replace `Logo` with the Ripple
logo asset or a code-native version derived from the chosen source. Update
aria labels, title bars, update links, settings tab copy, account/profile copy,
theme names, "21st Dark"/"21st Light" defaults, fallback app icons, and any
visible 1Code/21st strings in primary UI. Add a preference migration so users
with stored `21st-dark` or `21st-light` themes land on renamed Ripple theme IDs
without losing their appearance.

Milestone 5 narrows old repo/service flows. Move default clone destinations
from `~/.21st/repos` to a Ripple-owned advanced import location such as
`~/Ripple/Imports`. Hide or relabel repo-first flows so they are not primary
project creation. Keep `.1code/worktree.json` as read-only legacy detection in
`src/main/lib/git/worktree-config.ts`, but ensure save targets and settings
default to `.ripple/worktree.json`.

Milestone 6 validates the app as a Ripple package. Run automated checks, a
string audit, and a package smoke. Then launch the Electron app and verify that
a fresh local boot with no hosted API/update/analytics env reaches the Ripple
project entry flow, can create/open a project, can preview/export, and shows
Ripple in the app menu, About panel, Dock/taskbar/title bar, settings, update
state, and CLI install prompts.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Create the identity contract and config tests.
2. Add userData migration before switching productName/app userData:
   - source candidates: legacy packaged `1Code`, legacy dev `Agents Dev`, and
     any app-data directory used by current Electron builds on the target OS.
   - destination: `Ripple` or `Ripple Dev`.
   - copy only safe local state when the destination is empty: `data/agents.db`
     plus WAL/SHM files, `auth.dat`, `auth.dat.json`, `window-settings.json`,
     `update-channel.json`, `project-icons/`, and renderer `Local Storage/`.
   - never copy stale singleton lock files, GPU caches, crash dumps, or
     network caches.
3. Update `package.json`, package build metadata, icons, platform categories,
   release artifact names, and dev patch script.
4. Update main-process startup identity, protocols, callback pages, About panel,
   menus, Windows app user model ID, notification strings, update menu strings,
   and logs.
5. Rename CLI resources and platform provider configs from `1code` to `ripple`,
   with a guarded legacy cleanup helper for old symlinks that target this app.
6. Update hosted-service config and callers so unset services return harmless
   disabled states. Block legacy `21st.dev` values as today.
7. Update analytics initialization to require Ripple env keys and add tests that
   no hardcoded inherited key is used.
8. Update renderer logo, visible labels, update/changelog links, theme names,
   account/settings copy, and optional service UI states.
9. Update repo clone/import defaults and any old `.21st` path writes to Ripple
   locations.
10. Run the validation commands below and record results in this plan.
11. If implementation changes durable product direction beyond this plan, update
   `ROADMAP.md`; otherwise keep roadmap text stable.

## Validation and Acceptance

Automated validation:

- `bun run ts:check`
- `bun run test:ripple`
- `bun test`
- `bun run build`
- `bun run package`
- `git diff --check`

Focused validation to add or run:

- Config tests proving:
  - no hosted API is configured when env vars are unset,
  - legacy `21st.dev` values are rejected,
  - Ripple-owned API/update/analytics env vars are accepted,
  - legacy non-21st env compatibility, if kept, is documented and tested.
- UserData migration tests proving:
  - an empty Ripple data dir receives safe legacy local state,
  - an existing Ripple data dir is not overwritten,
  - stale lock/cache files are not copied.
- CLI/platform tests or smoke checks proving:
  - the installed command name is `ripple`,
  - the old `1code` command is not newly installed,
  - legacy cleanup only removes symlinks/copies created by this app.
- Theme migration tests proving stored `21st-dark` and `21st-light` values map
  to Ripple-owned theme IDs.

String audit:

Run a primary-path audit and review every remaining hit:

```bash
rg -n "1Code|21st\\.dev|twentyfirst|\\.21st|dev\\.21st|1code|21st logo|21st Dark|21st Light|Agents-" package.json electron-builder.yml src/main src/preload src/renderer resources scripts build --glob '!**/*.png' --glob '!**/*.ico' --glob '!**/*.icns' --glob '!**/*.tiff'
```

Expected result: no hits in shipped primary paths. Allowed hits must be
explicitly documented legacy compatibility, migration code, test fixtures, or
historical docs that are not packaged into the app.

Package smoke:

- Inspect generated app metadata after `bun run package`:
  - macOS `Info.plist` product name is Ripple,
  - protocol schemes are `ripple` and not `twentyfirst-agents`,
  - app ID is Ripple-owned,
  - icons are the Ripple candidate,
  - packaged resources still include migrations, bundled agent binaries, and
    `hyperframes-templates`.
- Verify release manifest generation uses Ripple artifact names and does not
  instruct uploading to `cdn.21st.dev`.

Manual Electron acceptance:

- Launch with no hosted API, update, PostHog, or Sentry env vars.
- Observe that the app reaches Ripple local project entry without sign-in.
- Create a project under `~/Ripple`, select a template, preview it, create a
  comment, and open the `Renders` pane.
- Confirm app menu, About panel, window title/taskbar/Dock identity, settings,
  update UI, auth callback pages, notifications, and CLI install dialogs say
  Ripple.
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

Protocol migration is additive during development. Register `ripple-dev` for
new flows. If needed for one transition release, accept `twentyfirst-agents`
callbacks only as legacy inputs and never emit them in new auth URLs.

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
- `src/main/index.ts`
- `src/main/windows/main.ts`
- `src/main/lib/cli.ts`
- `src/main/lib/platform/darwin.ts`
- `src/main/lib/platform/linux.ts`
- `src/main/lib/platform/windows.ts`
- `resources/cli/ripple`
- `package.json`
- `electron-builder.yml`
- `scripts/patch-electron-dev.mjs`
- `scripts/generate-update-manifest.mjs`
- `src/renderer/components/ui/logo.tsx`
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
- PostHog/Sentry SDKs, disabled unless configured and allowed.
- OS protocol handlers for `ripple://` and `ripple-dev://`.
- OS CLI install locations: `/usr/local/bin/ripple` on macOS/Linux and
  `~/.local/bin/ripple.cmd` on Windows.
- Existing HyperFrames, Producer, FFprobe, template bundle, project, comment,
  revision, and export systems should continue to work unchanged.

## Artifacts and Notes

Initial audit commands:

- `rg -n "1Code|21st|twentyfirst|\\.21st|21st\\.dev|1code|dev\\.21st|twentyfirst-agents|Agents Dev|@1code|1code\\.dev|21st logo" src/main src/preload src/renderer resources scripts build package.json electron-builder.yml README-ripple.md docs --glob '!**/*.png' --glob '!**/*.ico' --glob '!**/*.icns' --glob '!**/*.tiff'`
- `sed -n '930,1125p' ROADMAP.md`
- `sed -n '1,220p' package.json`
- `sed -n '1,1040p' src/main/index.ts`
- `sed -n '1,320p' src/main/lib/analytics.ts`
- `sed -n '1,280p' src/main/auth-manager.ts`
- `sed -n '1,240p' src/main/lib/platform/darwin.ts`
- `sed -n '1,160p' resources/cli/1code`

Notable current hits:

- `package.json` app metadata still says `21st-desktop`, `1Code`,
  `dev.21st.agents`, and `twentyfirst-agents`.
- `src/main/index.ts` still emits old protocols, app names, About text,
  callback page titles, Windows app IDs, CLI labels, and dev userData names.
- `src/main/lib/analytics.ts` still has an inherited hardcoded PostHog key.
- `src/main/lib/trpc/routers/projects.ts` still writes clone defaults under
  `~/.21st/repos`.
- `build/ripple-logo-export-bw-clean/` contains a documented, unwired Ripple
  icon candidate.
