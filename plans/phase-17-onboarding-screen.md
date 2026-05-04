# Phase 17 Optional Onboarding And First Project Entry

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

Ripple needs a first-run experience that feels like a motion-design app, not a
developer tool or mandatory account gate. After this phase, a fresh install
opens a compact Ripple onboarding dialog that lets a user optionally create or
connect a Ripple account with email, optionally receive weekly app updates, and
optionally opt into anonymous product analytics. The dialog then leads into the
existing create/open project flow, where the user can create a local motion
project under `~/Ripple` or open an existing Ripple project without mandatory
sign-in, choosing a provider, connecting GitHub, or learning repository terms.

The visible behavior is a first-run modal with two clearly separated choices:
an optional account/email/update section and an optional analytics section. The
account step should stay lightweight like the first mockup: email first,
weekly-update intent nearby, no sign-in wall, and clear skip behavior. The
analytics toggle is off by default. The analytics section includes a "Let me
show you" link to a public transparency document created in Phase 16, so users
can inspect what Ripple records and what it never records. Skipping everything
still lands the user in project creation/opening.

## Progress

- [x] 2026-05-04 / Codex: Captured user decisions for optional email, weekly
  app update emails, off-by-default analytics, and a public transparency link.
- [x] 2026-05-04 / Codex: Updated the plan so the email section is an optional
  Ripple account/profile path, not merely a local email preference.
- [x] 2026-05-04 / Codex: Decided v1 should capture opted-in update emails in
  PostHog contact/person data instead of adding Supabase or a full hosted
  account backend before launch interest is proven.
- [x] 2026-05-04 / Codex: Decided the onboarding blitz should reuse the legacy
  app's compact pop-up/dialog patterns and include a post-account provider
  connection step for Claude Code and Codex side by side.
- [ ] Implement Milestone 1: audit the inherited onboarding/auth/profile
  surfaces and define the new first-run state model.
- [ ] Implement Milestone 2: build the first-run dialog and settings-backed
  account/preferences for email, weekly updates, and analytics consent.
- [ ] Implement Milestone 3: connect the dialog to the project entry screen
  without blocking create/open project workflows.
- [ ] Implement Milestone 4: adapt account/profile/settings copy so optional
  email does not read as mandatory hosted sign-in.
- [ ] Implement Milestone 5: validate fresh install, returning user, skipped
  onboarding, and reset/debug paths.

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

## Decision Log

- Decision: The first-run dialog starts with an optional Ripple account/profile
  section backed by email. The implementation should reuse the inherited app
  account/profile affordances where they are useful, but it must be Ripple-owned
  and cannot depend on upstream 1Code/21st.dev auth service assumptions.
  Rationale: The user wants accounts in the app like the legacy foundation,
  while preserving local-first app entry and optional participation.
  Date/Author: 2026-05-04 / Codex.
- Decision: Creating, connecting, or updating a Ripple account is always
  optional. The account endpoint may be online-only, but a missing, offline, or
  failing account service cannot block local project creation, preview,
  comments, review, or export.
  Rationale: Ripple should have accounts without turning first launch back into
  a hosted-auth gate.
  Date/Author: 2026-05-04 / Codex.
- Decision: The email section includes a separate weekly app updates toggle.
  The app must store whether an email was provided and whether weekly updates
  are enabled as separate preferences.
  Rationale: A user may provide an email for account/profile purposes without
  agreeing to weekly updates, and vice versa should not be implied.
  Date/Author: 2026-05-04 / Codex.
- Decision: For the first release, if the user enters an email and enables
  weekly app updates, Ripple should send that email to PostHog as a dedicated
  contact opt-in/person-property update. This does not create a full hosted
  Ripple account and does not require Supabase or a new backend.
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
  artifact with "Let me show you" or equivalent copy.
  Rationale: Users should be able to inspect the event map/code and verify that
  Ripple excludes project files, prompts, agent conversations, comments, media,
  exports, and file paths.
  Date/Author: 2026-05-04 / Codex.
- Decision: Provider setup remains optional and secondary. Codex/Claude setup
  may be offered after project entry or from settings, but cannot be a first-run
  gate before create/open project.
  Rationale: Ripple's first session should succeed for local preview/export
  basics before an agent provider is configured.
  Date/Author: 2026-05-04 / Codex.
- Decision: The onboarding dialog should include a provider connection step
  after the account/email/update and analytics choices. Show Claude Code and
  Codex side by side, enabled by default as preferred agent connections, with
  live status (`Checking`, `Ready`, `Setup needed`) and direct connect/refresh
  actions.
  Rationale: The user wants early users to see both agent paths as part of
  first-run readiness, while still preserving the local-first skip path.
  Date/Author: 2026-05-04 / Codex.
- Decision: Provider cards should reuse the legacy app's dialog/modal content
  and runtime hooks where possible instead of rebuilding provider auth UI from
  scratch.
  Rationale: The legacy modal patterns already handle Codex OAuth/API key,
  Claude command-copy/refresh, ready badges, and retry behavior.
  Date/Author: 2026-05-04 / Codex.

## Outcomes & Retrospective

Not started.

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
`codex-onboarding-page.tsx`. These are useful for optional provider setup, but
their language and sequencing should not define first-run app entry.

The current account/auth stack lives in `src/main/auth-manager.ts`,
`src/main/auth-store.ts`, `src/main/windows/main.ts`, `src/preload/index.ts`,
`src/renderer/login.html`, and profile/settings components. Phase 15 is
decoupling mandatory hosted auth. Phase 17 should reuse the useful pieces:
optional account creation/sign-in, local account/profile persistence, settings
surfaces, and profile display. It should replace upstream service assumptions
with a Ripple-owned account adapter and must not reintroduce a mandatory hosted
sign-in gate.

Analytics consent is being moved to a main-owned, consent-aware implementation
in Phase 16. Phase 17 should consume that API rather than reinitializing
PostHog from the renderer.

## Plan of Work

First, define first-run state. Add a small persisted model for
`onboardingSeen`, optional account state, `contactEmail`,
`weeklyUpdatesEnabled`, and the analytics consent state owned by Phase 16.
Account state should distinguish at least skipped, pending/offline, signed-in,
and signed-out/deleted states so the UI can be truthful without blocking local
work. Prefer main-process persistence for anything that affects startup
behavior. Renderer localStorage is acceptable for UI-only first-run dismissal,
but any analytics consent must be readable before startup analytics can fire.

Second, create a Ripple-specific first-run dialog component, likely under
`src/renderer/features/onboarding/ripple-first-run-dialog.tsx` or a similar
PascalCase component path matching existing conventions. The dialog should
appear before or alongside `ProjectEntryPage` when no onboarding-seen preference
exists. It should use the legacy app's compact pop-up/dialog patterns rather
than a full-page marketing wizard, and it should be keyboard accessible.

Third, build the dialog content in two sections. The first section offers an
optional Ripple account/profile with an email field and a weekly update toggle.
Keep the copy light enough to preserve the first-screen design direction, but
make the data model account-aware rather than local-email-only. The second
section offers analytics consent with copy like "Help me improve the project" and
"Share anonymous product analytics. This never includes project files, prompts,
agent conversations, comments, media, exports, or file paths." The analytics
toggle is off by default. Add a "Let me show you" link to the Phase 16 public
analytics transparency artifact.

Fourth, add a provider connection step inside the same onboarding dialog. Show
two connection cards side by side: `Claude Code` / `Claude Agent SDK` and
`Codex` / `Codex App Server`. Both cards are enabled by default as available
agent paths, and each card shows live connection state, the current setup
method, and a small ready badge when connected. When connected, show concise
model readiness such as default/recommended models available through that
provider; keep model toggles enabled by default and move detailed model
management to Settings. If either provider is not connected, offer the same
actions the legacy dialogs already use: Claude command copy plus refresh, and
Codex ChatGPT login/API key flow plus retry. Include `Set up later` or
`Continue without agents` so this step never blocks create/open project.

Fifth, connect preferences and account behavior. The implementation should
adapt the legacy account/profile flow into an optional Ripple account path. For
v1, store the account/email/update choices locally and capture opted-in weekly
update contacts through the dedicated Phase 16 PostHog contact helper. Keep a
recoverable contact sync status when PostHog capture cannot complete, and never
strand the user because contact capture failed. Full hosted Ripple account
creation should remain a later account phase unless a Ripple-owned endpoint is
configured before release. Never send email in anonymous analytics events.

Sixth, return the user to project creation/opening. The dialog should have
clear `Continue` and `Skip` actions, both of which dismiss onboarding and reveal
project entry. `Create Project` and `Open Existing Project` remain the primary
actions once the dialog is dismissed.

Seventh, revise settings. Update profile/account/preferences surfaces so users can
create/sign in to the optional Ripple account, change email, change weekly
updates, sign out/delete local account state, change analytics consent, and
manage Claude/Codex connections later. Use Ripple terms. Detailed provider
setup belongs in settings or provider-specific modals, while first-run only
summarizes readiness and offers fast connect/skip actions.

Finally, add tests and smoke coverage for fresh install, returning users,
skipped onboarding, optional account creation, optional email, analytics off by
default, analytics opt-in, sign-out/delete-account state, and broken/offline
registration.

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
3. Add a first-run account/preference model. Prefer shared types for
   `accountStatus`, `accountUserId`, `contactEmail`,
   `weeklyUpdatesEnabled`, `contactSyncStatus`, `onboardingSeen`, and
   `analyticsConsent`.
4. Implement the first-run dialog and wire it into `AppContent` so it appears
   only for fresh local users and never blocks project entry after skip.
5. Reuse or extract the legacy provider dialog pieces from
   `claude-login-modal.tsx`, `codex-login-modal.tsx`, and
   `codex-login-content.tsx` into a two-card onboarding provider step with live
   `agentRuntime.authStatus` checks for both providers.
6. Adapt the legacy account/profile path into an optional Ripple account
   procedure. For v1, preserve local account intent and use the Phase 16
   PostHog contact helper to sync opted-in weekly update emails. If a full
   Ripple account endpoint is configured later, create/update the account there
   without changing the onboarding UI.
7. Wire analytics consent through Phase 16 APIs; do not initialize PostHog from
   the dialog.
8. Add the "Let me show you" link to the Phase 16 GitHub/Gist transparency
   artifact and open it externally.
9. Update settings/profile/preferences copy from account-gated language to
   optional Ripple account/profile language.
10. Keep provider setup optional and reachable after project entry or from
   settings.
11. Add focused tests for first-run state, provider readiness states, and
    project-entry routing.
12. Run validation commands and update this ExecPlan with results.

## Validation and Acceptance

Validation commands:

- `bun run ts:check`
- `bun test src/renderer/features/onboarding`
- `bun test src/renderer/features/sidebar/project-chat-selection.test.ts`
- `bun run test:ripple`

Manual smoke checks:

- Clear first-run/project selection state and start the app. Expected: a Ripple
  onboarding dialog appears over or before project entry.
- Leave account/email blank, leave weekly updates off, leave analytics off, and
  continue. Expected: onboarding dismisses and the user can create or open a
  local project.
- Enter an email, enable weekly updates, leave analytics off, and continue.
  Expected: Ripple stores the local account/profile preference, sends the email
  through the dedicated PostHog contact opt-in path when configured, records
  retryable contact sync state if capture fails, sends no anonymous analytics
  event containing the email, and keeps project entry available.
- Enable analytics and click "Let me show you". Expected: the public
  transparency document opens externally; analytics consent persists through
  the Phase 16 API.
- Continue to the provider step with neither provider connected. Expected:
  Claude Code and Codex appear side by side, both enabled as preferred agent
  paths, both show setup-needed states, and the user can continue without
  connecting them.
- Connect Codex or refresh an existing Codex login. Expected: the card moves to
  `Ready`, shows model availability, and does not force a project restart.
- Connect Claude Code or refresh an existing Claude login. Expected: the card
  moves to `Ready`, shows model availability, and does not force a project
  restart.
- Restart after completing or skipping onboarding. Expected: the dialog does
  not reappear unless reset through a debug or settings action.
- Simulate failed PostHog contact capture or a future failed account
  registration endpoint. Expected: local preferences/account intent remain
  saved, the user is not blocked, and the failure is shown only as a recoverable
  notice or log.
- Sign out or delete the optional account state from settings. Expected:
  account/profile state changes do not delete local projects, comments,
  revisions, exports, provider settings, or analytics consent unless the user
  explicitly changes those separate preferences.

Acceptance criteria:

- First-run onboarding offers optional Ripple account creation/sign-in but does
  not require account creation, provider selection, GitHub, dependency setup, or
  repository concepts.
- Email, weekly update emails, and analytics consent are separate choices.
- In v1, weekly-update email opt-in captures the email through the dedicated
  PostHog contact path; leaving weekly updates off keeps email local only.
- Analytics is off by default.
- Claude Code and Codex first-run provider cards are enabled by default,
  skippable, and show clear ready/setup states.
- The analytics copy states that Ripple does not send project files, prompts,
  agent conversations, comments, media, exports, or file paths.
- The transparency link opens a real public document from Phase 16.
- Create/open project remains the primary path into Ripple.
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
creation. If a user clears their email, do not delete unrelated account/auth
data unless they explicitly sign out or delete account data.

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
- optional Ripple account/profile adapter if the legacy auth manager needs a
  narrow replacement boundary
- Phase 16 analytics consent APIs

External dependencies:

- Phase 16 PostHog configuration, dedicated contact capture helper, and public
  transparency artifact
- Ripple-owned account endpoint or a documented legacy-compatible account
  adapter that can be safely repointed away from upstream services for a later
  full-account phase

## Artifacts and Notes

Draft onboarding copy:

- Account section title: `Stay in the loop`
- Email field label: `Email`
- Email helper: `Optional. Ripple can email you about releases and future
  account features. Ripple works locally if you skip.`
- Weekly updates toggle: `Email me weekly app updates`
- Weekly updates helper: `If enabled, Ripple sends this email to my update list.
  Anonymous product analytics is separate.`
- Analytics section title: `Help me improve the project`
- Analytics helper: `Share anonymous product analytics. This never includes project files, prompts, agent conversations, comments, media, exports, or file paths.`
- Provider step title: `Connect agents`
- Provider step helper: `Ripple can use Claude Code and Codex for agent-backed
  motion edits. You can connect either one now or set them up later.`
- Claude provider card: `Claude Code` / `Claude Agent SDK` / `Ready` or
  `Setup needed`
- Codex provider card: `Codex` / `Codex App Server` / `Ready` or `Setup needed`
- Transparency link: `Let me show you`
- Primary action: `Continue`
- Secondary action: `Skip`

Open questions before implementation:

- What exact Ripple-owned account endpoint/provider should back the later
  full-account phase, and can the inherited auth flow be repointed safely
  without upstream 1Code/21st.dev coupling?
- Should the first-run dialog appear before the project form, or as a modal
  layered over the project form?
- What exact public URL should "Let me show you" open after Phase 16 publishes
  the transparency artifact?
