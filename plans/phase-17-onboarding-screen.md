# Phase 17 Optional Onboarding And First Project Entry

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

Ripple needs a first-run experience that feels like a motion-design app, not a
developer tool or mandatory account gate. After this phase, a fresh install
opens a compact Ripple onboarding dialog that lets a user optionally enter an
email for Ripple updates and optionally opt into anonymous product analytics.
Automatic in-app update checks default on and remain adjustable from Settings
instead of appearing as a first-run decision. The dialog then leads into the
existing create/open project flow, where the user can create a local motion
project under
`~/Ripple` or open an existing Ripple project without mandatory sign-in,
choosing a provider, connecting GitHub, or learning repository terms.

The visible behavior is a first-run modal split into two short pages. Page one
contains only the optional email-update field and the optional analytics choice.
Page two presents Claude Code and Codex as the core agent connection step, while
still preserving a set-up-later escape hatch so project entry is not blocked.
The email step should stay lightweight: email field only, no duplicate update
toggle, no sign-in wall, no account promise, and clear blank-field behavior. The
analytics toggle is off by default. The analytics section includes a public
transparency link, so users can inspect what Ripple records and what it never
records. Skipping setup still lands the user in project creation/opening.

## Progress

- [x] 2026-05-04 / Codex: Captured user decisions for optional email, weekly
  app update emails, off-by-default analytics, and a public transparency link.
- [x] 2026-05-04 / Codex: Updated the plan so the email section is an optional
  Ripple profile/contact preference for v1, not a fake account promise.
- [x] 2026-05-04 / Codex: Decided v1 should capture opted-in update emails in
  PostHog contact/person data instead of adding Supabase or a full hosted
  account backend before launch interest is proven.
- [x] 2026-05-04 / Codex: Decided the onboarding blitz should reuse the legacy
  app's compact pop-up/dialog patterns and include a post-profile provider
  connection step for Claude Code and Codex side by side.
- [x] 2026-05-04 / Codex: Ran an Oracle manual-paste audit of Phases 16-18 and
  tightened v1 wording, provider optionality, and onboarding state-machine
  rules.
- [x] 2026-05-04 / Codex: Implemented Milestone 1 by auditing the inherited
  project entry, provider setup modals, analytics IPC, and profile/settings
  surfaces against the Phase 17 state model.
- [x] 2026-05-04 / Codex: Implemented Milestone 2 with persisted first-run,
  local profile email, weekly update email, automatic update-check preference,
  and analytics consent state, plus the dedicated main-process contact
  preference read API.
- [x] 2026-05-04 / Codex: Implemented Milestone 3 by showing a compact
  `RippleFirstRunDialog` over `ProjectEntryPage`; skip and continue both reveal
  the existing Create Project / Open Existing Project destination.
- [x] 2026-05-04 / Codex: Implemented Milestone 4 by replacing the read-only
  inherited account profile tab with optional Ripple profile/contact
  preferences and adding the analytics transparency link to Settings.
- [x] 2026-05-04 / Codex: Implemented Milestone 5 automated validation:
  focused onboarding/analytics tests, `bun run ts:check`, `bun run test:ripple`,
  `bun run build`, `git diff --check`, and a targeted primary-path string
  audit all passed.
- [x] 2026-05-04 / Codex: Ran a live Electron dev smoke with Computer Use.
  Existing dev state opened a project shell first; clicking `New Project`
  showed the compact first-run dialog over `ProjectEntryPage` with email,
  weekly updates, automatic update checks, analytics transparency, and
  Claude/Codex readiness cards visible. The smoke exposed an autofocus
  accessibility warning, which was fixed by disabling the background project
  name autofocus while first-run onboarding is visible.
- [x] 2026-05-04 / Codex: Simplified the onboarding based on follow-up UX
  feedback and a quick copy/research pass: the dialog now uses two staged pages,
  moves agent setup to page two, removes the automatic update-check toggle from
  onboarding, defaults automatic update checks on, and suppresses the orange
  focus outline around the first-run panel.
- [x] 2026-05-04 / Codex: Refined the compact onboarding copy again: removed the
  `First run` eyebrow, removed the redundant product-update toggle, made email
  presence imply update opt-in, shortened analytics copy, and reframed the
  second page as `Connect your agent`.
- [x] 2026-05-04 / Codex: Reworked the second page to echo the original 1Code
  provider auth screens: Codex on the left, Claude Code on the right, dual
  Ripple/provider icon pills, subscription-oriented titles, full-width connect
  buttons, and visible `Codex App Server` / `Claude Agent SDK` status strips.
- [x] 2026-05-04 / Codex: Tightened second-page alignment and replaced the
  motion-revision explainer with original-style subscription copy:
  `Connect your Codex or Claude Code subscription.`
- [x] 2026-05-04 / Codex: Removed repeated provider-card subtitles, renamed
  `Connect OpenAI Codex` to `OpenAI Codex`, and fixed card spacing so icon,
  title, status, and connect controls align across Codex and Claude Code.
- [x] 2026-05-04 / Codex: Addressed review findings by keeping first-run email
  entry as an unsaved draft until completion and moving automatic update-check
  preference storage/IPC into the main process so packaged startup/focus checks
  honor the Settings toggle.
- [x] 2026-05-04 / Codex: Completed the final onboarding closeout after the
  second-page spacing polish. Live dev smoke verified page one, page two,
  Codex-left / Claude-right provider cards, both setup modals, and
  `Start creating` dismissal; a small Radix accessibility warning in the
  provider setup modals was fixed with hidden titles/descriptions.

## Surprises & Discoveries

- Observation: The current renderer already falls back to project entry when no
  selected project exists.
  Evidence: `src/renderer/App.tsx` renders `ProjectEntryPage` when
  `selectedProjectAtom` is missing or invalid.
- Observation: The current project entry screen already creates local Ripple
  projects and opens existing projects.
  Evidence: `src/renderer/features/onboarding/project-entry-page.tsx` calls
  `trpc.projects.createRippleProject` and
  `trpc.projects.openRippleProjectFolder`, and displays "Local files are saved
  in ~/Ripple".
- Observation: Inherited onboarding state is still provider/account-oriented.
  Evidence: `src/renderer/features/onboarding/*` includes Claude/Codex/API-key
  onboarding pages, and `src/renderer/lib/atoms/index.ts` stores provider
  onboarding keys such as `onboarding:billing-method`,
  `onboarding:anthropic-completed`, and `onboarding:codex-completed`.
- Observation: The legacy app already has compact provider login dialogs that
  should be reused or adapted for the first-run provider step.
  Evidence: `src/renderer/components/dialogs/claude-login-modal.tsx` and
  `src/renderer/components/dialogs/codex-login-modal.tsx` use
  `AlertDialogContent` with centered provider icons, connection status, `Ready`
  badges, refresh/connect actions, and close controls.
- Observation: The existing Models settings tab already presents Claude and
  Codex side by side as agent connections and shows available models with
  provider icons and enabled switches.
  Evidence:
  `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`
  contains an `Agent Connections` section for `Claude Agent SDK` and
  `Codex App Server`, plus a merged Claude/Codex model list with switches.
- Observation: The inherited profile tab assumes an authenticated user email.
  Evidence:
  `src/renderer/components/dialogs/settings-tabs/agents-profile-tab.tsx`
  renders read-only `user?.email` from `desktopApi.getUser()`.
- Observation: The Codex login modal can auto-start provider connection work,
  which is useful for an explicit setup modal but unsafe for first-run
  onboarding.
  Evidence: `src/renderer/components/dialogs/codex-login-modal.tsx` defaults
  `autoStart` to `true`; the first-run provider card must pass
  `autoStart={false}` and start only after the user clicks `Connect`.
- Observation: The legacy Claude setup copy includes Terminal instructions,
  which should not appear directly in the primary first-run dialog.
  Evidence: `src/renderer/components/dialogs/claude-login-modal.tsx` includes
  command-copy setup UI. That content can remain inside an explicit provider
  setup modal after the user chooses to connect.
- Observation: Phase 16 already exposes the main-process analytics and contact
  boundaries that Phase 17 needs, but the renderer did not have a read API for
  the stored update-contact preference.
  Evidence: `src/main/lib/analytics.ts` already had
  `syncUpdateContactPreference(...)`; Phase 17 added
  `getUpdateContactPreference()` plus `analytics:get-update-contact` IPC and
  preload typing.
- Observation: The public transparency URL can point at the checked-in GitHub
  document now.
  Evidence: `gh repo view conmeara/ripple --json visibility,nameWithOwner,url`
  returned `visibility: PUBLIC`, and the onboarding/settings link uses
  `https://github.com/conmeara/ripple/blob/main/docs/privacy/analytics.md`.
- Observation: The first-run modal must own initial focus; otherwise Radix
  hides the background while the project-name input still has focus.
  Evidence: The live Electron smoke produced an `aria-hidden` focus warning
  before `ProjectEntryPage` was changed to set `autoFocus={!showFirstRunDialog}`.

## Decision Log

- Decision: The v1 first-run dialog starts with an optional Ripple profile or
  email-preferences section backed by local email storage and Phase 16 contact
  sync when weekly updates are enabled. It must not call this "account
  creation" unless a real Ripple account endpoint ships.
  Rationale: The user wants the legacy account direction later, but v1 contact
  capture through PostHog cannot honestly imply sign-in, sync, recovery, or
  hosted account ownership.
  Date/Author: 2026-05-04 / Codex.
- Decision: A real optional Ripple account remains a future adapter behind
  `MAIN_VITE_RIPPLE_API_URL` or a dedicated account boundary. Missing, offline,
  or failing account/contact services cannot block local project creation,
  preview, comments, review, or export.
  Rationale: Ripple can grow accounts without turning first launch back into a
  hosted-auth gate or over-promising v1 capabilities.
  Date/Author: 2026-05-04 / Codex.
- Decision: The first-run email section has no separate weekly app updates
  toggle. Entering an email means the user wants Ripple release notes and early
  feature news; leaving it blank opts out.
  Rationale: The duplicate opt-in row made the dialog feel heavier and repeated
  the same intent already expressed by the optional email field.
  Date/Author: 2026-05-04 / Codex.
- Decision: For the first release, if the user enters an email and enables
  weekly app updates, Ripple should send that email to PostHog as a dedicated
  contact opt-in path. If PostHog person properties are used, they must stay
  under a separate `contact:<id>` identity and must never merge with anonymous
  analytics. This does not create a full hosted Ripple account and does not
  require Supabase or a new backend.
  Rationale: The user needs a real way to email early users about V2/full
  accounts while avoiding premature backend infrastructure.
  Date/Author: 2026-05-04 / Codex.
- Decision: Email contact capture must be separate from anonymous analytics.
  Weekly update consent may trigger the contact capture path even when
  analytics consent is off; analytics consent may never imply permission to send
  or store an email.
  Rationale: The first-run UI can ask for both, but trust depends on separating
  the two decisions.
  Date/Author: 2026-05-04 / Codex.
- Decision: Analytics is a separate section below email. The toggle is off by
  default and uses personal open source copy such as "Help me improve the
  project."
  Rationale: Analytics consent must not be bundled with email, account, or app
  update preferences.
  Date/Author: 2026-05-04 / Codex.
- Decision: The analytics section links to a public Phase 16 transparency
  artifact with clear inspection copy such as `See exactly what can be sent`.
  Rationale: Users should be able to inspect the event map/code and verify that
  Ripple excludes project files, prompts, agent conversations, comments, media,
  exports, and file paths.
  Date/Author: 2026-05-04 / Codex.
- Decision: Agent connection is a core first-run onboarding step, not copyframed
  as an optional add-on. The app still cannot hard-gate create/open project on a
  provider connection.
  Rationale: Agents are central to Ripple's product value, while the app must
  still honor the local-first promise if a provider setup is unavailable.
  Date/Author: 2026-05-04 / Codex.
- Decision: The onboarding dialog should include provider-readiness cards after
  the email/update and analytics choices. Show Claude Code and Codex side by
  side by default as agent connection cards, with live status (`Checking`,
  `Ready`, `Setup needed`) and a direct connect action.
  Rationale: The user wants early users to see both agent paths as part of
  first-run readiness, while still preserving the local-first skip path.
  Date/Author: 2026-05-04 / Codex.
- Decision: Provider cards should reuse the legacy app's dialog/modal content
  and runtime hooks where possible instead of rebuilding provider auth UI from
  scratch.
  Rationale: The legacy modal patterns already handle Codex OAuth/API key,
  Claude command-copy/refresh, ready badges, and retry behavior.
  Date/Author: 2026-05-04 / Codex.
- Decision: Provider status checks must fail open and cannot block `Start
  creating`, `Set up later`, `Create Project`, or `Open Existing Project`. Legacy
  provider setup copy, including Terminal commands or OAuth/API-key flows, may
  appear only inside explicit provider modals after the user clicks `Connect`.
  Rationale: Provider readiness is useful, but Ripple's primary path should
  still feel like entering a motion app rather than completing developer setup.
  Date/Author: 2026-05-04 / Codex.
- Decision: Automatic in-app update checks are a separate preference from
  weekly email updates. They default on, are not shown during first-run
  onboarding, and can be changed later in Settings; manual update checks remain
  available.
  Rationale: First-run onboarding should focus on consent and agent connection.
  App update checks are expected utility behavior and do not need to
  consume space in the first-run decision set.
  Date/Author: 2026-05-04 / Codex.
- Decision: First-run onboarding uses staged disclosure: page one for email and
  analytics, page two for connecting an agent.
  Rationale: Splitting these concerns reduces cognitive load, keeps the trust
  choices readable, and makes provider setup clearly secondary.
  Date/Author: 2026-05-04 / Codex.
- Decision: First-run appears as a compact modal/dialog layered over
  `ProjectEntryPage`, not as a full-page marketing wizard or launch gate.
  `Set up later` and `Start creating` dismiss the dialog and reveal the same
  create/open project screen.
  Rationale: The user liked the compact first-screen direction and the product
  must keep create/open project as the primary first-run action.
  Date/Author: 2026-05-04 / Codex.
- Decision: Provider cards should read as motion-editing agent setup, not
  developer setup. Use plain card language such as `Claude Code` and `Codex`,
  with `Claude Agent SDK` / `Codex App Server` only as secondary detail in
  settings or explicit setup modals.
  Rationale: Motion designers and marketers should not have to parse provider
  implementation names before they can create a project.
  Date/Author: 2026-05-04 / Codex.

## Outcomes & Retrospective

Phase 17 now ships a simple local-first first-run experience over project
entry. A fresh no-project user sees a compact two-page Ripple dialog. Page one
contains an optional email-updates field and an off-by-default anonymous
analytics toggle with a public transparency link. Page two contains side-by-side
Codex / Claude Code agent connection cards that borrow the original 1Code
provider-auth shape while keeping Ripple's current app-server/runtime labels.
The provider cards open the existing setup modals only after an explicit
`Connect` click; Codex first-run setup passes `autoStart={false}`.
Automatic app update checks default on and are controlled from Settings instead
of first-run onboarding.

Email update intent is derived from whether the user enters an email and remains
separate from anonymous analytics. Update opt-in syncs through the dedicated
Phase 16 contact path, leaving email out of anonymous onboarding analytics.
Clearing a stored email now clears the contact preference instead of falling
back to the previous email.

Review follow-up fixed two preference regressions. Typing an email and choosing
`Set up later` no longer writes that draft into persisted profile state, and
automatic update checks are now a main-process preference used by packaged
startup and focus checks. Manual checks remain available.

Validation evidence from `/Users/conmeara/code/ripple`:

- `bun test src/renderer/features/onboarding src/main/lib/analytics.test.ts src/shared/ripple-analytics.test.ts` passed with 19 tests.
- `bun run ts:check` passed.
- `bun run test:ripple` passed with 354 tests.
- `bun run build` passed; Vite emitted existing bundle/dynamic-import warnings only.
- `git diff --check` passed.
- Live Electron dev smoke showed the compact first-run dialog over
  `ProjectEntryPage` after clicking `New Project`; the autofocus warning found
  during smoke was fixed and `bun run ts:check` plus `bun run build` passed
  after that fix.
- Final closeout smoke after the second-page layout polish verified the
  simplified page-one copy, page-two `Connect your agent` copy, aligned
  `OpenAI Codex` and `Claude Code` cards, both provider setup dialogs, and
  `Start creating` dismissal back to project entry. Final gates passed:
  `bun test src/renderer/features/onboarding`, `bun run ts:check`,
  `bun run test:ripple`, `bun run build`, and `git diff --check`.
- Targeted primary-path string audit over `RippleFirstRunDialog`,
  `ProjectEntryPage`, `AgentsProfileTab`, and `AgentsBetaTab` found no
  `workspace`, `PR`, `commit`, `branch`, `worktree`, `repo`, `clone`,
  `sub-chat`, `account email`, `dev mode?`, `bypasses CDN cache`, `Terminal`,
  `OAuth`, `API-key`, or `command-copy` strings.

## Context and Orientation

The renderer entry point is `src/renderer/App.tsx`. It wraps the app in Jotai,
theme, tooltip, and tRPC providers, then `AppContent` decides whether to show
`ProjectEntryPage` or the main `AgentsLayout`. This is already close to the
Ripple target because no selected project means the user sees project entry
rather than a mandatory hosted login.

`src/renderer/features/onboarding/project-entry-page.tsx` is the current local
project entry screen. It renders a project name input, a `Create Project`
button, an `Open Existing Project` button, archived project restore rows, and a
template gallery. It uses `selectedProjectAtom` and `toSelectedProject` from
`src/renderer/features/agents/atoms` to enter the app shell after a project is
created or opened.

The old provider onboarding pages still live in
`src/renderer/features/onboarding/anthropic-onboarding-page.tsx`,
`api-key-onboarding-page.tsx`, `billing-method-page.tsx`, and
`codex-onboarding-page.tsx`. These are useful for provider setup flows, but
their language and sequencing should not define first-run app entry.

The current account/auth stack lives in `src/main/auth-manager.ts`,
`src/main/auth-store.ts`, `src/main/windows/main.ts`, `src/preload/index.ts`,
`src/renderer/login.html`, and profile/settings components. Phase 15 is
decoupling mandatory hosted auth. Phase 17 should reuse only the useful pieces:
local profile persistence, settings surfaces, and future account adapter
boundaries. It should not present v1 email capture as sign-in or hosted account
creation unless a Ripple-owned endpoint is actually configured. Any later
account adapter must replace upstream service assumptions and must not
reintroduce a mandatory hosted sign-in gate.

Analytics consent is being moved to a main-owned, consent-aware implementation
in Phase 16. Phase 17 should consume that API rather than reinitializing
PostHog from the renderer.

## Plan of Work

First, define first-run state. Add a small persisted model for
`onboardingState`, optional profile/contact state, `contactEmail`,
`weeklyUpdatesEnabled`, and the analytics consent state owned by Phase 16.
Automatic update checks are a Settings-owned preference that defaults on rather
than an onboarding choice. Onboarding should have explicit states such as
`notSeen`, `seenSkipped`, `completed`, `dismissedBeforeProject`, and
`resetForDebug`. `Set up later` and `Start creating` both unlock project entry.
Failed email sync, failed account adapter calls, and failed provider status
checks must not revert onboarding or strand the user. Prefer main-process
persistence for anything that affects startup behavior. Renderer localStorage is
acceptable for UI-only first-run dismissal, but analytics consent must be
readable before startup analytics can fire.

Second, create a Ripple-specific first-run dialog component, likely under
`src/renderer/features/onboarding/ripple-first-run-dialog.tsx` or a similar
PascalCase component path matching existing conventions. The dialog appears as
a compact modal layered over `ProjectEntryPage` when no onboarding-seen
preference exists. It should use the legacy app's compact pop-up/dialog
patterns rather than a full-page marketing wizard, and it should be keyboard
accessible. The project form remains visible context behind the dialog so
create/open project stays psychologically primary.

Third, build the dialog content as two staged pages. Page one offers a v1
Ripple email-updates preference with one optional email field, plus a separate
analytics consent choice. Keep the copy light enough to
preserve the first-screen design direction, but do not imply sign-in, sync,
recovery, or account ownership. The analytics section explains that anonymous
analytics help improve the project with anonymous product stats, and that
Ripple never sends email, agent conversations, project files, prompts, comments,
media, paths, or creative content. The analytics toggle is off by default. Add
a public transparency link to the Phase 16 analytics artifact.

Fourth, add a provider connection step inside the same onboarding dialog. Show
two connection cards side by side as motion-editing agent cards. Primary card
language should be user-facing, such as `Claude Code` and `Codex`;
implementation labels such as `Claude Agent SDK` and `Codex App Server` belong
in secondary text, settings, or explicit setup modals. Each card shows live
connection state and a small ready badge when connected. Status checks must
time out or fail open. Detailed model management belongs in Settings. If either
provider is not connected, offer a plain `Connect` action that opens the legacy
setup modal. Do not show Terminal commands, OAuth/API-key instructions, or
provider setup details directly on the primary onboarding path. For Codex, pass
`autoStart={false}` in first-run and start the flow only after the user clicks
connect. Include `Back` and `Start creating` so this step never blocks
create/open project.

Fifth, connect preferences and future account behavior. For v1, store the
email/update choices locally and capture opted-in update contacts
through the dedicated Phase 16 PostHog contact helper. Keep a recoverable
contact sync status when PostHog capture cannot complete, and never strand the
user because contact capture failed. Full hosted Ripple account creation should
remain a later account phase unless a Ripple-owned endpoint is configured before
release. Never send email in anonymous analytics events.

Sixth, return the user to project creation/opening. The first page should have
`Set up later` and `Continue`; the provider page should have `Back` and
`Start creating`. Skipping or continuing must reveal project entry.
`Create Project` and `Open Existing Project` remain the primary actions once
the dialog is dismissed.

Seventh, revise settings. Update profile/preferences surfaces so users can
change email, change weekly email updates, change automatic in-app update
checks, change analytics consent, clear local profile/contact state, and manage
Claude/Codex connections later. If a real Ripple account adapter exists later,
settings can offer sign-in/sign-out there without making local projects depend
on it. Use Ripple terms. Detailed provider setup belongs in settings or
provider-specific modals, while first-run only summarizes readiness and offers
fast connect/skip actions.

Finally, add tests and smoke coverage for fresh install, returning users,
skipped onboarding, optional email updates, analytics off by default, analytics
opt-in, contact clearing, automatic update-check default, provider check
timeout, and broken/offline contact or future account registration.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Confirm Phase 16 has exposed persisted analytics consent APIs and a public
   analytics transparency URL or local placeholder.
2. Audit `src/renderer/App.tsx`,
   `src/renderer/features/onboarding/project-entry-page.tsx`,
   `src/renderer/features/onboarding/*`,
   `src/renderer/lib/atoms/index.ts`,
   `src/renderer/components/dialogs/settings-tabs/agents-profile-tab.tsx`, and
   settings tab wiring.
3. Add a first-run profile/preference model. Prefer shared types for
   `onboardingState`, `profileStatus`, `contactEmail`,
   `weeklyUpdatesEnabled`, `contactSyncStatus`, `contactLastErrorCategory`,
   and `analyticsConsent`.
4. Implement the first-run dialog and wire it into `AppContent` so it appears
   only for fresh local users as a compact modal over `ProjectEntryPage` and
   never blocks project entry after skip.
5. Reuse or extract the legacy provider dialog pieces from
   `claude-login-modal.tsx`, `codex-login-modal.tsx`, and
   `codex-login-content.tsx` into a two-card onboarding provider step with live
   `agentRuntime.authStatus` checks for both providers. Checks must time out or
   fail open, and first-run Codex setup must pass `autoStart={false}`.
6. Adapt the legacy profile/account path into an optional Ripple profile
   preference for v1. Preserve local profile/contact intent and use the Phase 16
   PostHog contact helper to sync opted-in weekly update emails. If a full
   Ripple account endpoint is configured later, create/update the account there
   without changing the onboarding UI.
7. Wire analytics consent through Phase 16 APIs; do not initialize PostHog from
   the dialog.
8. Add the public transparency link to the Phase 16 GitHub/Gist transparency
   artifact and open it externally.
9. Update settings/profile/preferences copy from account-gated language to
   optional Ripple profile/contact language, with future account language only
   behind a real configured endpoint.
10. Keep provider setup optional and reachable after project entry or from
   settings.
11. Add focused tests for first-run state-machine transitions, provider
    readiness timeout/failure states, profile/contact sync state, automatic
    update-check default behavior, and project-entry routing.
12. Add a primary UI string audit for first-run/profile/provider/update copy:
    `Agents`, `workspace`, `PR`, `commit`, `branch`, `worktree`, `repo`,
    `clone`, `sub-chat`, `account email`, `dev mode?`, and `bypasses CDN cache`
    must not appear in primary onboarding or motion-workflow surfaces.
13. Run validation commands and update this ExecPlan with results.

## Validation and Acceptance

Validation commands:

- `bun run ts:check`
- `bun test src/renderer/features/onboarding`
- `bun test src/renderer/features/sidebar/project-chat-selection.test.ts`
- `bun run test:ripple`

Manual smoke checks:

- Clear first-run/project selection state and start the app. Expected: a Ripple
  onboarding dialog appears as a compact modal over project entry; the user can
  see they are headed toward Create Project / Open Existing Project rather than
  a marketing wizard.
- Leave email blank, leave analytics off, and continue. Expected: onboarding
  dismisses and the user can create or open a local project.
- Enter an email, leave analytics off, and continue. Expected: Ripple stores the
  local profile/contact preference, treats the email as update opt-in, sends the
  email through the dedicated PostHog contact opt-in path when configured,
  records retryable contact sync state if capture fails, sends no anonymous
  analytics event containing the email, and keeps project entry available.
- Open Settings after a fresh first-run. Expected: automatic update checks are
  on by default, can be turned off there, and do not imply weekly email updates
  or analytics consent.
- Enable analytics and click the public transparency link. Expected: the public
  transparency document opens externally; analytics consent persists through
  the Phase 16 API.
- Continue to the provider step with neither provider connected. Expected:
  Claude Code and Codex appear side by side as agent connection cards, both show
  setup-needed states, and the user can continue to project without connecting
  them.
- Simulate provider status checks timing out or failing. Expected: the cards
  show recoverable setup-needed/error states, onboarding can still continue, and
  Create/Open Project remains available.
- Click Codex `Connect` from first-run. Expected: the Codex setup modal opens
  only after the click and does not auto-start on first-run dialog render.
- Connect Codex. Expected: the card moves to `Ready` after status refresh and
  does not force a project restart.
- Connect Claude Code. Expected: the card moves to `Ready` after status refresh
  and does not force a project restart.
- Restart after completing or skipping onboarding. Expected: the dialog does
  not reappear unless reset through a debug or settings action.
- Simulate failed PostHog contact capture or a future failed account
  registration endpoint. Expected: local preferences/profile intent remain
  saved, the user is not blocked, and the failure is shown only as a recoverable
  notice or log.
- Clear the optional profile/contact state or sign out of a future account from
  settings. Expected: profile/contact/account state changes do not delete local
  projects, comments, revisions, exports, provider settings, or analytics
  consent unless the user explicitly changes those separate preferences.
- With account/profile disabled, provider disabled, GitHub unavailable,
  analytics unconfigured, update checks disabled, and email blank, run app
  entry, create project, open project, preview, comment, accept/reject an
  existing mocked or fixture-generated revision, export, and manually check for
  updates. Expected: all local-first workflows continue to work. Creating a new
  agent-backed revision may still prompt for provider setup.
- Turn automatic update checks off in Settings. Expected: manual `Check Now` is
  still available and works without enabling automatic checks.
- Run a primary UI string audit for onboarding/profile/provider/update surfaces.
  Expected: legacy/developer strings such as `Agents`, `workspace`, `PR`,
  `commit`, `branch`, `worktree`, `repo`, `clone`, `sub-chat`,
  `account email`, `dev mode?`, and `bypasses CDN cache` are absent from the
  primary path.

Acceptance criteria:

- First-run onboarding offers an optional email-updates field but does not claim
  account creation/sign-in unless a real Ripple account endpoint is configured,
  and does not require account creation, provider selection, GitHub, dependency
  setup, or repository concepts.
- Email update opt-in, automatic in-app update checks, and analytics consent are
  separate choices.
- In v1, entering an email captures the email through the dedicated PostHog
  contact path; leaving the email blank opts out of update emails.
- Analytics is off by default.
- Claude Code and Codex first-run provider cards are shown by default as core
  agent connection cards, fail open, and show clear ready/setup states.
- The analytics copy states that Ripple does not send project files, prompts,
  agent conversations, comments, media, exports, or file paths.
- The transparency link opens a real public document from Phase 16.
- Create/open project remains the primary path into Ripple.
- The first-run UI is a compact modal over project entry, not a full-page
  onboarding app or marketing page.
- Returning users resume their last valid project or project entry without
  being stranded by onboarding state.

## Idempotence and Recovery

Onboarding preference writes must be repeatable. If the dialog is dismissed and
the app crashes before project creation, the next launch should either resume
project entry or show the dialog only if the preference write never completed.

If analytics APIs are unavailable because Phase 16 is incomplete, keep the
dialog's analytics section disabled or store a local pending preference, then
default to no analytics capture. Never infer consent from email or weekly update
preference.

If PostHog contact capture or later account registration fails, preserve local
preferences and provide a safe retry from settings. Do not block local project
creation. If a user clears their email, do not delete unrelated provider/auth
data unless they explicitly sign out of a future account or delete that account
data.

State recovery rules:

| State | Entry | Exit / recovery |
| --- | --- | --- |
| `notSeen` | Fresh local user with no onboarding preference | Show compact dialog over `ProjectEntryPage`; `Set up later` -> `seenSkipped`; `Start creating` -> `completed` unless the app exits mid-write. |
| `seenSkipped` | User skipped onboarding | Do not show the dialog again; project entry remains available; settings can reopen the same preferences. |
| `completed` | User continued through onboarding | Do not show the dialog again; project entry or last project resumes normally. |
| `dismissedBeforeProject` | App closed/crashed after dialog dismissal but before project creation | Resume project entry; optionally show a non-blocking reminder, never force onboarding. |
| `resetForDebug` | QA/settings reset only | Show the dialog again without clearing projects, comments, revisions, exports, providers, analytics consent, contact preferences, or update preferences unless separately requested. |

Contact-sync failure, provider timeout, account-adapter failure, and project
creation failure must not move the user back to `notSeen` or block
`ProjectEntryPage`.

## Interfaces and Dependencies

Likely renderer files:

- `src/renderer/App.tsx`
- `src/renderer/features/onboarding/project-entry-page.tsx`
- `src/renderer/features/onboarding/index.ts`
- new first-run dialog component under `src/renderer/features/onboarding/`
- `src/renderer/components/dialogs/claude-login-modal.tsx`
- `src/renderer/components/dialogs/codex-login-modal.tsx`
- `src/renderer/features/agents/components/codex-login-content.tsx`
- `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`
- `src/renderer/lib/atoms/index.ts`
- `src/renderer/components/dialogs/settings-tabs/agents-profile-tab.tsx`
- `src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx`
- settings sidebar/content wiring

Likely main/preload files:

- `src/main/auth-manager.ts`
- `src/main/auth-store.ts`
- `src/main/windows/main.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- optional Ripple profile/contact adapter for v1 and a future Ripple account
  adapter if the legacy auth manager needs a narrow replacement boundary
- Phase 16 analytics consent APIs
- Settings-owned Phase 18 update-check preference surfaces; automatic checks
  default on and are not part of first-run onboarding

External dependencies:

- Phase 16 PostHog configuration, dedicated contact capture helper, and public
  transparency artifact
- Ripple-owned account endpoint or a documented legacy-compatible account
  adapter that can be safely repointed away from upstream services for a later
  full-account phase

## Artifacts and Notes

Current onboarding copy:

- Step 1 title: `Set up Ripple`
- Profile section title: `Email updates`
- Email field label: `Email`
- Email helper: `Get release notes and early feature news. Optional.`
- Email field helper: `Leave blank to skip updates.`
- Analytics section title: `Anonymous analytics`
- Analytics helper: `Help me improve the project with anonymous product stats.`
- Analytics toggle: `Share anonymous product stats`
- Analytics exclusion helper: `Ripple never sends your email, agent
  conversations, project files, prompts, comments, media, paths, or creative
  content.`
- Provider step title: `Connect your agent`
- Provider step helper: `Connect your Codex or Claude Code subscription.`
- Codex provider card: `OpenAI Codex` / `Codex App Server` / `Ready` or
  `Setup needed`
- Claude provider card: `Claude Code` / `Claude Agent SDK` / `Ready` or
  `Setup needed`
- Provider setup detail rule: `Claude Agent SDK`, `Codex App Server`, Terminal
  commands, OAuth, API-key fields, and command-copy setup belong only in the
  explicit setup modal after the user clicks `Connect`.
- Transparency link: `See exactly what can be sent`
- Step 1 primary action: `Continue`
- Step 1 secondary action: `Set up later`
- Step 2 primary action: `Start creating`
- Step 2 secondary action: `Back`

Resolved UX decisions before implementation:

- The first-run dialog appears as a compact modal layered over
  `ProjectEntryPage`; it is not a full-page marketing wizard.

Open questions before implementation:

- For the later full-account phase, what exact Ripple-owned account
  endpoint/provider should back sign-in, and can the inherited auth flow be
  repointed safely without upstream 1Code/21st.dev coupling?
