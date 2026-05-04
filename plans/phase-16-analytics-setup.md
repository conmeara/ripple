# Phase 16 Analytics Setup

This ExecPlan must be maintained according to `PLANS.md`.

## Purpose / Big Picture

Ripple needs a small, privacy-conscious analytics system that helps the product
team understand whether local-first motion workflows are healthy without making
analytics part of the user journey. After this phase, Ripple can record
consented product-health events for project creation and opening, preview
readiness, comments and revisions, exports, onboarding completion, and setup
failures. Users can understand and change analytics consent, and local project
creation, preview, review, and export keep working even when analytics is
disabled, unconfigured, offline, or failing.

The visible behavior is a Ripple-labeled analytics preference in settings and,
when Phase 17 wires onboarding, the same choice from first-run onboarding.
Internally, the inherited 1Code/PostHog event surface is replaced by a
Ripple-owned event map and a single predictable initialization path.

This phase also includes the first Ripple PostHog account/project setup. For
the initial open source release, use one Ripple-owned PostHog project rather
than separate production and staging projects. Official builds receive that
project's key and host through build-time configuration. Local source builds,
development, and tests remain analytics-disabled unless explicitly forced, and
forced captures must include an `environment` property so they can be filtered
out of product analysis.

For the first release, PostHog also acts as the temporary update-contact sink
for users who explicitly enter an email and enable weekly app updates. This is
not anonymous product analytics: it must use a dedicated contact opt-in event
or isolated contact-person update under a `contact:<id>` identity, must not be
gated by analytics opt-in, must never merge with `anon:<installId>` analytics,
and must be described separately in onboarding and privacy copy.

## Progress

- [x] 2026-05-03 / Codex: Read `PLANS.md`, `ROADMAP.md`, and audited the
  current main-process, renderer-process, settings, startup, and event call
  sites for analytics and Sentry.
- [x] 2026-05-03 / Codex: Discussed the open source distribution model, first
  PostHog account setup, explicit opt-in consent, and the one-PostHog-project
  default with `environment` tagging for any non-production captures.
- [x] 2026-05-04 / Codex: Created the Ripple PostHog project, renamed it to
  `Ripple`, and recorded its local-only configuration in an ignored `.env`.
- [x] 2026-05-04 / Codex: Decided the Phase 17 first-run dialog should collect
  optional Ripple profile/email update-subscription intent separately from
  analytics consent, and that analytics consent remains off by default with a
  public transparency link.
- [x] 2026-05-04 / Codex: Decided not to add Supabase or a full account backend
  for v1; opted-in update emails will be captured in the existing PostHog
  project as a separate contact list path while full accounts remain future
  work.
- [x] 2026-05-04 / Codex: Ran an Oracle manual-paste audit of Phases 16-18 and
  updated this plan to match the current post-Phase-15 no-op analytics source.
- [x] 2026-05-04 / Codex: Updated `.env.example` to omit renderer analytics
  keys and document the main-process consent boundary.
- [ ] Implement Milestone 0: document the Ripple analytics event map, privacy
  rules, public transparency artifact, sanitizer, and forbidden-payload tests
  while the provider remains disabled.
- [ ] Implement Milestone 1: replace inherited analytics initialization with a
  main-owned persisted consent store, startup consent ordering, and typed
  anonymous capture boundary.
- [ ] Implement Milestone 2: delete or quarantine inherited analytics helpers
  and migrate current call sites from repo/chat events to sanitized Ripple
  product events.
- [ ] Implement Milestone 3: add the dedicated email contact-capture helper and
  sync-state model without merging contact identity into anonymous analytics.
- [ ] Implement Milestone 4: expose settings/onboarding consent controls backed
  by main-process persisted preference state.
- [ ] Implement Milestone 5: wire the existing Ripple PostHog project
  configuration into official builds only after Milestones 0-4 pass and without
  committing inherited or hardcoded keys.
- [ ] Implement Milestone 6: validate behavior in development, test, and
  packaged-style paths.

## Surprises & Discoveries

- Observation: Phase 15 already replaced active analytics providers with no-op
  facades, so Phase 16 starts from disabled code rather than a live PostHog
  migration.
  Evidence: `src/main/lib/analytics.ts` logs "Disabled for Phase 15", never
  initializes PostHog, and `src/main/lib/config.ts` returns `false` from
  `isAnalyticsRuntimeEnabled()`.
- Observation: Renderer analytics is now a no-op facade, but it still keeps
  inherited localStorage opt-out and identify-shaped APIs that Phase 16 must
  retire before re-enabling analytics.
  Evidence: `src/renderer/lib/analytics.ts` no longer imports `posthog-js`, but
  still reads `preferences:analytics-opt-out` and exposes `identify`,
  `capture`, and `trackMessageSent` shims.
- Observation: The user-facing analytics preference is opt-out, not explicit
  opt-in, and the copy still says "Agents" while claiming anonymous usage data.
  Evidence: `analyticsOptOutAtom` defaults to `false`; the settings switch says
  "Help us improve Agents..." even though auth paths can identify users by
  email.
- Observation: Even with providers disabled, startup still contains the old
  analytics race shape that would become unsafe if a provider were re-enabled
  without a main-owned consent store.
  Evidence: `src/main/index.ts` calls `initAnalytics()`, `identify(...)`, and
  `trackAppOpened()` during `app.whenReady()`. `src/renderer/App.tsx` later
  reads `preferences:analytics-opt-out`, calls
  `desktopApi.setAnalyticsOptOut(...)`, and calls renderer `identify(user.id,
  { email, name })`.
- Observation: The event taxonomy is still inherited from the developer-tool
  model.
  Evidence: current helper events include `desktop_opened`, `first_launch`,
  `auth_completed`, `project_opened`, `workspace_created`,
  `workspace_archived`, `workspace_deleted`, `message_sent`, `pr_created`,
  `commit_created`, and `sub_chat_created`. Main-process call sites are in
  `projects.ts` and `chats.ts`; renderer message events are in
  `active-chat.tsx` and `queue-processor.tsx`.
- Observation: Sentry is privacy-adjacent and should be handled in this phase or
  explicitly separated. It initializes in production main and renderer paths,
  and existing error captures can include `cwd`, chat IDs, sub-chat IDs, stderr,
  and debug info.
  Evidence: `src/main/index.ts`, `src/preload/index.ts`,
  `src/renderer/main.tsx`, `src/renderer/features/agents/lib/ipc-chat-transport.ts`,
  and `src/main/lib/trpc/routers/claude.ts`.
- Observation: The first Ripple PostHog project is available and renamed from
  `Default project` to `Ripple`.
  Evidence: PostHog project ID `281249`, region `US Cloud`, capture host
  `https://us.i.posthog.com`, project token recorded in ignored `.env` via
  `MAIN_VITE_RIPPLE_ANALYTICS_KEY` and
  `MAIN_VITE_RIPPLE_ANALYTICS_HOST`. Any old local renderer analytics copies
  are legacy setup residue and must not be used by Phase 16.
- Observation: The checked-in env example now documents only main-process
  Ripple analytics variables.
  Evidence: `.env.example` includes `MAIN_VITE_RIPPLE_ANALYTICS_KEY` and
  `MAIN_VITE_RIPPLE_ANALYTICS_HOST`, and notes that renderer analytics keys are
  intentionally omitted because Phase 16 routes analytics through a
  main-process consent boundary.

## Decision Log

- Decision: Phase 16 will make analytics disabled unless both configuration and
  explicit user permission are present. Development and test builds should be
  off by default, with an explicit local force mode for verification.
  Rationale: Ripple is local-first, and analytics must never be a hidden
  prerequisite for project creation, preview, comments, review, or export.
  Date/Author: 2026-05-03 / Codex.
- Decision: Initial Ripple analytics will use one Ripple-owned PostHog project,
  not separate production/staging projects.
  Rationale: One project is simpler for the first open source release and still
  professional if local/dev/test captures are disabled by default and any forced
  diagnostic captures carry a filterable `environment` property.
  Date/Author: 2026-05-03 / Codex.
- Decision: For v1, onboarding should describe email entry as a Ripple profile,
  contact, or update preference unless a real Ripple account backend is
  implemented. Analytics events should use a random install analytics ID and
  must not include email in event properties.
  Rationale: Email capture can support launch updates and future account
  interest without implying sign-in, sync, recovery, or hosted account ownership
  before those capabilities exist.
  Date/Author: 2026-05-03 / Codex.
- Decision: Main process should own analytics provider initialization,
  persisted consent, event sanitization, and shutdown. Renderer code may request
  typed UI events through IPC, but should not initialize a second independent
  analytics provider.
  Rationale: A single main-process path can respect consent before first event,
  avoid duplicate identity state, simplify tests, and keep provider details out
  of UI code.
  Date/Author: 2026-05-03 / Codex.
- Decision: Analytics event properties must use Ripple product language and
  avoid prompts, messages, file contents, absolute local paths, repository URLs,
  branch/worktree names, media contents, or user email.
  Rationale: Product-health analytics should explain workflow health without
  collecting creative work or developer-environment details.
  Date/Author: 2026-05-03 / Codex.
- Decision: Treat Sentry/crash reporting as part of the same privacy review
  unless a later decision explicitly splits it into a separate crash-reporting
  preference.
  Rationale: Existing Sentry extras can include local paths and chat identifiers,
  so it has the same trust implications as analytics.
  Date/Author: 2026-05-03 / Codex.
- Decision: Analytics opt-in defaults to off. The onboarding/settings copy
  should frame the choice as helping improve a personal open source project and
  state that analytics are anonymous product analytics.
  Rationale: The user explicitly wants a trust-first, optional analytics prompt
  rather than inherited opt-out behavior.
  Date/Author: 2026-05-04 / Codex.
- Decision: The Phase 17 first-run dialog includes an optional Ripple
  profile/email section before analytics. Email entry and a "weekly app
  updates" preference are separate from analytics consent, and the app remains
  usable without entering an email or signing in.
  Rationale: Ripple can support update contacts and future hosted account
  interest without making local project creation depend on a hosted account.
  Date/Author: 2026-05-04 / Codex.
- Decision: For v1, do not create a Supabase or full hosted account backend just
  to collect launch-interest email addresses. When a user enters an email and
  explicitly enables weekly app updates, send that email to PostHog as a
  dedicated contact opt-in path. The preferred implementation may use a
  separate `contact:<id>` distinct ID and email-bearing contact event/person
  properties, but it must never alias, merge, or reuse the anonymous
  `anon:<installId>` analytics identity. Store the same preference locally with
  sync status, and keep full hosted account sync for a later account phase.
  Rationale: The user wants to contact early users about V2 and future account
  features without committing to backend infrastructure before product interest
  is proven.
  Date/Author: 2026-05-04 / Codex.
- Decision: Contact capture and anonymous product analytics are separate
  consent paths even if both use the same PostHog project for v1. Normal product
  analytics events must never include email. The only allowed email-bearing
  payload is the dedicated contact opt-in/update path, and only after the weekly
  updates toggle is enabled.
  Rationale: This preserves the anonymous analytics promise while still making
  the release useful for contacting opted-in early users.
  Date/Author: 2026-05-04 / Codex.
- Decision: Implement two separate provider helpers: anonymous
  `captureAnalyticsEvent(...)` and email-bearing
  `syncUpdateContactPreference(...)`. Never call `identify`, `alias`, or merge
  the anonymous install ID with the contact/email distinct ID.
  Rationale: PostHog can store both anonymous product events and identified
  contact records, but Ripple's privacy promise depends on hard identity
  boundaries in code, tests, and docs.
  Date/Author: 2026-05-04 / Codex.
- Decision: Remote crash/error reporting is off by default until Ripple has a
  separate crash-reporting opt-in or an explicit local-only error-reporting
  design. Any future exception extras must pass the same sanitizer rules as
  analytics.
  Rationale: Analytics off is not meaningful if Sentry can still send local
  paths, chat identifiers, stderr, provider details, or creative context.
  Date/Author: 2026-05-04 / Codex.
- Decision: Turning analytics off must not send an "analytics disabled" product
  event. Local logs and local preference writes are allowed; provider captures
  after revocation are not.
  Rationale: Revoking consent should end product analytics transmission rather
  than create one final remote event.
  Date/Author: 2026-05-04 / Codex.
- Decision: If Ripple records a remote consent event, it may only record the
  grant path after consent is granted. Revocation and denial are local-only and
  must not create a final remote analytics event.
  Rationale: The event map must not contradict the privacy promise that turning
  analytics off stops transmission.
  Date/Author: 2026-05-04 / Codex.
- Decision: First-launch analytics must be idempotent under disabled and
  unconfigured analytics. Either write the existing first-launch marker only
  after a permitted analytics event is accepted for capture, or replace it with
  a separate local first-app-run state that does not suppress the first real
  opted-in launch metric.
  Rationale: Marking first launch while analytics is disabled is not a privacy
  violation, but it corrupts activation metrics once the user later opts in.
  Date/Author: 2026-05-04 / Codex.
- Decision: Phase 16 must create a public transparency artifact for analytics,
  preferably a checked-in GitHub document and optionally a Gist, and Phase 17
  onboarding should link to it with "Let me show you" or equivalent copy.
  Rationale: The user wants people to inspect the actual event/privacy code and
  trust that project files, prompts, agent conversations, media, comments, and
  file paths are excluded.
  Date/Author: 2026-05-04 / Codex.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Phase 15 left analytics intentionally disabled. `src/main/lib/config.ts`
currently returns `false` from `isAnalyticsRuntimeEnabled()`.
`src/main/lib/analytics.ts` and `src/renderer/lib/analytics.ts` are no-op
facades with inherited helper names, not active PostHog clients. They still
carry old concepts such as `identify`, renderer `preferences:analytics-opt-out`,
`trackMessageSent`, and helper events for desktop open, auth, project opened,
workspace lifecycle, PR created, commit created, and sub-chat created. Phase 16
must replace those shims with Ripple-owned consent, event typing, and provider
boundaries before any real capture is enabled.

The unsafe inherited shape is still visible in startup code. In main,
`src/main/index.ts` initializes Sentry before app readiness when packaged and a
DSN exists. During `app.whenReady()`, it initializes the auth manager, calls
`initAnalytics()`, identifies a saved authenticated user if present, and tracks
app-opened. In renderer, `src/renderer/App.tsx` calls no-op
`initAnalytics()`, syncs the renderer-local opt-out flag to the main process,
identifies the current user with email/name-shaped traits, and resets the
renderer facade on unmount. That is harmless only while analytics is disabled;
Phase 16 must move consent and identity decisions into a main-owned persisted
store before any startup event can fire.

Consent currently has legacy names and storage. `analyticsOptOutAtom` in
`src/renderer/lib/atoms/index.ts` stores `preferences:analytics-opt-out` and
defaults to `false`, which historically meant sharing was enabled by default.
The settings UI in
`src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx`
still uses inherited "Agents" language. The new model should be
`analyticsConsent: "unset" | "granted" | "denied"`, default to unset/disabled,
and live somewhere the main process can read before app-opened tracking.

Current event call sites are narrow and inherited.
`src/main/lib/trpc/routers/projects.ts` tracks `project_opened` when
folder-based or GitHub clone-based projects are created or reopened.
`src/main/lib/trpc/routers/chats.ts` tracks workspace creation, archival,
deletion, and PR creation. Renderer chat components track `message_sent` for
user sends and queued sends. `src/main/lib/trpc/routers/claude.ts` sets an
analytics connection method based on Claude subscription, API key, custom model,
or offline Ollama. New Ripple events must avoid raw project/conversation/chat
identifiers and use buckets or categories instead.

There is no Ripple-owned event map yet for onboarding, project creation,
HyperFrames preview readiness, comment threads, isolated revision proposals,
export attempts, export completion/failure, or setup failures.

## Plan of Work

First, start from the current disabled analytics source and keep provider
configuration inactive until the event map, privacy docs, consent store,
sanitizer, forbidden-payload tests, and legacy-helper quarantine are in place.
The Ripple PostHog project already exists, but Phase 16 should not wire its key
and host into official builds until the consent/sanitization path is safe. Local
source builds should remain unconfigured and disabled by default, so forks and
contributors do not accidentally send events to Ripple. If a developer needs to
test analytics locally, they can opt into a force mode with explicit
configuration and an `environment: "development"` or `environment: "test"`
property, but that force mode must still respect the new consent boundary in
normal local use.

The first project is now created in PostHog as `Ripple`, project ID `281249`,
region `US Cloud`, with capture host `https://us.i.posthog.com`. The project
token is present only in the ignored local `.env` and should be moved into
release/CI secrets for official builds only after the safe capture boundary is
implemented rather than hardcoded into source. A personal PostHog API key is not
required for Phase 16 unless a later task automates dashboard, insight, or
project administration.

Second, define the event contract before changing call sites. Add a documented
event map that names every Phase 16 event, when it fires, required properties,
allowed optional properties, and explicit forbidden data. The initial map should
cover app/session health, onboarding completion or skip, project created/opened,
template selection, composition creation/selection, runtime readiness, preview
ready/failure, timeline interactions, asset imports, chat and agent run
lifecycles, comment created/replied/resolved, revision requested/previewed/
accepted/rejected, export opened/started/succeeded/failed/cancelled, and
first-run setup failure. The map should use product terms such as project,
composition, preview, timeline, asset, chat, comment, revision, and export.
Publish a human-readable privacy and event-map document in the repository, and
if desired mirror it to a Gist for the onboarding "Let me show you" link. The
document must explain the allowed event map and the forbidden payload classes in
plain language.

Third, collapse analytics provider ownership into the main process before any
provider can be re-enabled. Add a persisted
`analyticsConsent: "unset" | "granted" | "denied"` state, default to
unset/disabled, migrate any old renderer opt-out value once, and load consent
before `trackAppOpened()` or any first-run event. The main analytics module
should expose query/update consent APIs, a typed capture function, an
initialization status, and no-op behavior when disabled, denied, unset,
unconfigured, offline, or failing. Use a random install analytics ID; never use
email, account identity, provider identity, project ID, conversation ID, or
revision ID as the anonymous analytics distinct ID. First-launch tracking must
not be marked as remotely captured unless a permitted event is accepted by the
capture boundary; otherwise keep first-app-run as a separate local state.

Fourth, implement two hard-separated capture paths. `captureAnalyticsEvent(...)`
is anonymous, analytics-consent-gated, and should send no person profile, email,
raw local object IDs, prompts, messages, comments, paths, stdout/stderr, or
provider session identifiers. `syncUpdateContactPreference(...)` is
weekly-update-consent-gated, can send email-bearing contact events and, if
needed, contact/person properties for the update list, and is not dependent on
analytics consent. Namespace identifiers so they cannot be merged accidentally,
for example `anon:<installId>` for analytics and
`contact:<generatedOrHashedContactId>` for contact sync. Never `identify`,
`alias`, or otherwise merge the anonymous install identity with the contact
identity. If this cannot be made unambiguous with PostHog person profiles, fall
back to a dedicated contact event payload and no person properties.

Fifth, migrate the renderer. Remove the independent renderer analytics
provider shape and turn `src/renderer/lib/analytics.ts` into a typed IPC client
or delete it after imports move to the new IPC surface. Remove renderer
`identify(...)` and old localStorage opt-out sync as the primary consent path;
keep only a one-time migration shim after the main-owned consent store exists.
Update settings copy from Agents to Ripple and make the control truthful about
whether sharing is off, on, or unconfigured. Phase 17 onboarding can reuse the
same consent APIs for the optional profile/email preferences plus analytics
opt-in screen. The analytics prompt copy should say, in spirit: "Help me
improve the project" and "Share anonymous product analytics. This never
includes project files, prompts, agent conversations, comments, media, exports,
or file paths."

Sixth, replace inherited event helpers and call sites with Ripple events.
Project APIs should record project-created and project-opened using sanitized
properties such as project kind, template id, has asset count, or setup status,
not local paths or repository identifiers. HyperFrames preview APIs should
record preview-ready and preview-failed. Comment/revision routers should record
comment and revision lifecycle events. Export services should record export
started, succeeded, failed, format, quality preset, duration bucket, and error
category without output paths or user media details. Existing chat/workspace/PR
events should either be removed or translated only where they still correspond
to a Ripple concept.

Before the PostHog provider is re-enabled, delete or make unreachable inherited
helpers/events that can send raw identifiers or legacy developer concepts,
including `trackAuthCompleted`, `trackWorkspaceCreated`,
`trackWorkspaceArchived`, `trackWorkspaceDeleted`, `trackPRCreated`,
`trackCommitCreated`, `trackSubChatCreated`, renderer `identify(...)`, and any
helper that emits raw `project_id`, `workspace_id`, `sub_chat_id`, repository,
auth user, branch, worktree, PR, or commit data.

Seventh, treat Sentry and crash/error telemetry as part of the Phase 16 trust
boundary. For the first release, keep remote crash/error reporting off unless a
separate explicit crash-reporting opt-in is implemented. If any remote error
capture remains configured, sanitize exception extras so they cannot include
absolute paths, stderr/stdout, prompts/messages, comments, project identifiers,
provider debug payloads, environment dumps, or chat/conversation IDs.

Finally, add tests around configuration, consent, event sanitization, and
call-site behavior. Validation should prove that disabled/unconfigured
analytics does not throw, opted-out users produce no provider captures, dev/test
builds do not capture unless explicitly forced, and event names/properties match
the documented map. It should also prove that all local-first workflows still
run with account/profile disabled, provider disabled, GitHub unavailable,
analytics unconfigured, update checks disabled, and email blank.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Confirm the current dirty worktree and avoid touching unrelated files.
2. Add the event map and trust document as checked-in public docs, such as
   `docs/analytics-event-map.md` and `docs/privacy/analytics.md`, then record
   the public GitHub or Gist URL that Phase 17 should open from onboarding.
3. Add the typed event allowlist and sanitizer before any provider wiring.
   Tests must fail on emails, prompts, messages, comments, screenshots, media,
   output paths, raw local object IDs, repository URLs, branch/worktree names,
   stdout/stderr, provider session IDs, and unsanitized exceptions.
4. Add a main-owned persisted consent store with
   `analyticsConsent: "unset" | "granted" | "denied"`, default unset/disabled.
   Load it before `trackAppOpened()` or any first-run event and migrate old
   renderer `preferences:analytics-opt-out` only after the new store exists.
5. Update `src/main/lib/analytics.ts` from the current no-op facade into the
   main-owned provider boundary, but keep provider capture disabled until the
   event map, sanitizer, consent store, and legacy-helper removal are validated.
   It must centralize provider initialization, read persisted consent before
   startup events, catch provider errors, expose typed event helpers, and keep
   capture as a no-op when consent is unset, denied, unconfigured, offline, or
   failing.
6. Update first-launch handling in `trackAppOpened()`, `isFirstLaunch()`, and
   `markFirstLaunchTracked()`: write the first-launch analytics marker only
   after a permitted app-open event is accepted by the capture boundary, or
   replace it with a separate local first-app-run state.
7. Add main-process IPC or tRPC procedures for reading/updating analytics
   consent and for renderer-requested analytics events.
8. Update `src/preload/index.ts` and `src/preload/index.d.ts` for the consent
   and renderer event APIs.
9. Convert `src/renderer/lib/analytics.ts` from the current no-op compatibility
   facade into a typed IPC client, or delete it after replacing imports with the
   new IPC client. The renderer must not initialize `posthog-js` or call
   renderer-side `identify(...)`.
10. Update `src/renderer/App.tsx` so it no longer races startup opt-out state
   and no longer identifies users directly from the renderer analytics client.
11. Update the settings UI in
   `src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx`
   or its Ripple successor with accurate Ripple language and persisted consent
   state.
12. Delete or quarantine inherited analytics helpers before any provider is
   re-enabled: `trackAuthCompleted`, `trackWorkspaceCreated`,
   `trackWorkspaceArchived`, `trackWorkspaceDeleted`, `trackPRCreated`,
   `trackCommitCreated`, `trackSubChatCreated`, renderer `identify(...)`, and
   any helper that emits raw `project_id`, `workspace_id`, `sub_chat_id`,
   repository, auth user, branch, worktree, PR, or commit data.
13. Replace current event call sites in `projects.ts`, `chats.ts`, renderer chat
   components, HyperFrames preview/router code, comments/revisions services,
   and export services with typed Ripple events.
14. Add or prepare the profile/contact preference surface for Phase 17:
   optional email, weekly update opt-in, contact sync state, analytics consent,
   and in-app update-check preference must be separate stored preferences and
   separate event flows.
15. Add a dedicated contact-capture helper for Phase 17 that can send
   `ripple_contact_opt_in`, `ripple_contact_updated`, and
   `ripple_contact_opt_out` only when the user explicitly enables weekly app
   update emails. The preferred implementation may use a separate
   `contact:<id>` distinct ID and email-bearing contact event/person
   properties, but it must never alias, merge, or reuse the anonymous
   `anon:<installId>` analytics identity. Track local contact sync status with
   states such as `pending`, `synced`, `failed`, and `optedOutPending`.
16. Audit Sentry initialization and capture extras, keep remote crash/error
   reporting disabled unless a separate explicit crash-reporting opt-in exists,
   and add a sanitizer for any future exception extras.
17. Only after steps 2-16 pass, use the existing `Ripple` PostHog project.
   Record the project host/region and project key in local/release
   configuration, not as a source-controlled hardcoded fallback. Current local
   `.env` uses `MAIN_VITE_RIPPLE_ANALYTICS_KEY` and
   `MAIN_VITE_RIPPLE_ANALYTICS_HOST`. `.env.example` intentionally omits
   renderer analytics keys because the renderer must not initialize a second
   provider.
18. Decide the official build variable names. Prefer the existing
   main-process-only `MAIN_VITE_RIPPLE_ANALYTICS_KEY` and
   `MAIN_VITE_RIPPLE_ANALYTICS_HOST` names unless a mechanical rename is
   justified and tested.
19. Add an `environment` property to the common event properties with values such
   as `production`, `development`, and `test`. Production official builds should
   be the only normal sender; development/test should be disabled unless forced.
20. Add focused tests for consent/config/sanitization. Prefer dependency
   injection for a fake analytics provider over networked PostHog tests.
21. Run validation commands and update this ExecPlan with results and any
   follow-up risks.

## Validation and Acceptance

Validation commands:

- `bun run ts:check`
- `bun test src/main/lib/analytics`
- `bun test src/renderer/lib/analytics`
- `bun run test:ripple`

Additional smoke checks:

- Start the app in development with normal environment. Expected: analytics
  reports disabled/unconfigured in logs or diagnostics and captures no events.
- Start with explicit local force configuration and a fake/test provider.
  Expected: only documented Ripple events are captured, with sanitized
  properties.
- Toggle analytics sharing off, restart the app, and open/create a project.
  Expected: the main process knows consent is off before startup tracking, and
  no app-opened/project events are captured.
- Turn analytics off after previously granting consent. Expected: the app writes
  the local preference, stops future captures immediately, and does not send an
  "analytics disabled" product event.
- Toggle analytics sharing on without configured provider. Expected: settings
  reflects that sharing is enabled locally but no provider is configured, and no
  user workflow is blocked.
- In an official-build-like environment with the Ripple PostHog key/host
  configured, complete the opt-in path and send one test event. Expected:
  PostHog receives a sanitized Ripple event with `environment: "production"` and
  no email, file path, prompt, message, comment body, media, or output path.
- Grant analytics consent. Expected: if `analytics_consent_granted` or an
  equivalent consent event is sent, it is sent only after consent is granted.
  Denial and revocation remain local-only and send no final remote event.
- Restart while analytics is disabled or unconfigured, then later grant
  analytics consent. Expected: first-launch analytics is not silently lost by a
  marker written during disabled/no-op tracking; either the first permitted
  app-open is counted or first-app-run is tracked as a clearly separate local
  state.
- In an official-build-like environment with the Ripple PostHog key/host
  configured, enter an email and enable weekly app updates while leaving
  analytics off. Expected: PostHog receives only the dedicated contact opt-in
  event/person update with email and consent metadata; normal analytics events
  remain off.
- Disable weekly updates after opting in. Expected: PostHog receives a dedicated
  contact opt-out/update and local `contactSyncStatus` reflects the result.
- In a local source-build environment without analytics configuration, complete
  the opt-in path. Expected: analytics status is `unconfigured`; no event is
  sent and no workflow is blocked.
- Trigger preview, comment, revision, and export success/failure paths.
  Expected: events match the event map and do not include prompts, messages,
  absolute paths, repository URLs, branch/worktree names, output paths, or user
  email.
- With account/profile disabled, provider disabled, GitHub unavailable,
  analytics unconfigured, update checks disabled, and email blank, run app
  entry, create project, open project, preview, comment, accept/reject an
  existing mocked or fixture-generated revision, export, and manual update check
  smoke paths. Expected: all local-first workflows continue to work and no
  analytics capture is attempted. Creating a new agent-backed revision may still
  prompt for optional provider setup.
- Trigger representative crash/error paths with analytics off and crash
  reporting unconfigured. Expected: no remote Sentry event is sent; any local
  log uses sanitized categories rather than raw paths, stderr, prompts,
  messages, project IDs, or provider debug payloads.
- Run a source audit before enabling the provider. Expected: inherited helpers
  such as `trackAuthCompleted`, workspace lifecycle tracking, PR/commit/sub-chat
  tracking, renderer `identify(...)`, and raw ID event properties are deleted,
  unreachable, or wrapped by tests that prove they cannot emit legacy payloads.
- Run a primary UI string audit for `Agents`, `workspace`, `PR`, `commit`,
  `branch`, `worktree`, `repo`, `clone`, `sub-chat`, `account email`,
  `dev mode?`, and `bypasses CDN cache`. Expected: none appear in primary
  onboarding, analytics, profile, update, or motion-workflow surfaces.

Acceptance criteria:

- No primary-path event, comment, or settings copy reports as 1Code, 21st.dev,
  Agents, workspace, PR, commit, branch, worktree, or sub-chat unless it is an
  explicitly advanced/debug-only surface.
- Analytics initializes only when configured and permitted.
- Analytics and crash/error telemetry failures are logged but never interrupt
  project creation/opening, preview, comments/review, revision acceptance, or
  export.
- Remote crash/error telemetry is disabled by default or controlled by a
  separate explicit crash-reporting opt-in; analytics consent alone does not
  authorize raw exception telemetry.
- Users can understand and change analytics consent from settings, and Phase 17
  onboarding can reuse the same persisted consent API.
- The onboarding-ready API supports optional Ripple profile/email entry and
  analytics opt-in as separate choices; analytics payloads do not include email
  by default.
- Opted-in update emails are captured through a dedicated PostHog contact path
  for v1, without adding a Supabase/full-account backend and without treating
  email capture as anonymous analytics.
- Anonymous analytics and contact capture never share, alias, identify, or merge
  distinct IDs. Analytics uses an `anon:<installId>`-style ID; contact capture
  uses a separate `contact:<generatedOrHashedContactId>`-style ID.
- `posthog-js` is not initialized by the renderer. Renderer code can only
  request typed captures through the main-process IPC/tRPC boundary after
  main-owned consent is loaded.
- Official builds must not set `MAIN_VITE_SENTRY_DSN` unless a separate
  crash-reporting consent preference and sanitizer are implemented.
- Development, test, and packaged-app behavior is documented and covered by
  tests or smoke evidence.

## Idempotence and Recovery

The event map and typed helpers should be additive until all call sites migrate.
If implementation is interrupted, keep old helpers available as no-op shims or
thin wrappers around the new typed capture path until imports are removed. Do
not delete `posthog-node` or `posthog-js` dependencies until the final import
audit proves they are unused.

Consent migration must be safe to run repeatedly. If only renderer localStorage
contains an old opt-out value, the first new settings/onboarding load should
copy it into main-process persisted preference state, then future startup should
read the main-process value directly. If migration fails, default to analytics
disabled and log a warning.

Provider initialization should tolerate missing environment variables, invalid
keys, network failures, and provider SDK throws. In all cases, capture should
return without throwing into product workflows.

## Interfaces and Dependencies

Current dependencies:

- `posthog-node` dependency is available for the future main-process provider,
  but `src/main/lib/analytics.ts` is currently a no-op facade.
- `posthog-js` may still exist as a dependency, but
  `src/renderer/lib/analytics.ts` should not initialize it in the final Phase 16
  architecture.
- `@sentry/electron/main` in `src/main/index.ts` and Claude runtime error paths
- `@sentry/electron/renderer` in `src/preload/index.ts`,
  `src/renderer/main.tsx`, and renderer transport error paths
- Electron `app.getPath("userData")` for first-launch marker and likely future
  persisted consent
- `desktopApi.setAnalyticsOptOut` preload bridge and
  `analytics:set-opt-out` IPC handler

Candidate new interfaces:

- `analytics:get-consent`
- `analytics:set-consent`
- `analytics:get-status`
- `analytics:capture`
- `contact:get-preference`
- `contact:set-preference`
- `contact:sync-now`
- `src/shared/analytics/events.ts` with typed Ripple event names and property
  schemas, allowed property buckets, forbidden keys, and a sanitizer, or an
  equivalent main-owned type module imported by renderer through safe shared
  code.
- `src/main/lib/contact-capture.ts` or an equivalent main-owned helper for
  `syncUpdateContactPreference(...)`.

Environment/configuration:

- Preferred `MAIN_VITE_RIPPLE_ANALYTICS_KEY` and
  `MAIN_VITE_RIPPLE_ANALYTICS_HOST` for official builds
- Renderer analytics env vars should be removed from `.env.example` or marked
  obsolete unless a future design explicitly needs them
- Existing `MAIN_VITE_SENTRY_DSN`
- Existing `FORCE_ANALYTICS=true` development override should be replaced or
  narrowed so it cannot bypass consent in normal local use
- Candidate Ripple-owned replacements should avoid hardcoded provider project
  keys and make test/local behavior explicit. Prefer one official Ripple
  PostHog project for the first release, with `environment` and `app_channel`
  common properties for filtering.

## Artifacts and Notes

Current inherited event helpers in `src/main/lib/analytics.ts`:

| Helper | Event | Current product model |
| --- | --- | --- |
| `trackAppOpened` | `desktop_opened`, `first_launch` | generic desktop app |
| `trackAuthCompleted` | `auth_completed` | hosted account/auth |
| `trackProjectOpened` | `project_opened` | repo/folder project |
| `trackWorkspaceCreated` | `workspace_created` | chat/worktree workspace |
| `trackWorkspaceArchived` | `workspace_archived` | chat/worktree workspace |
| `trackWorkspaceDeleted` | `workspace_deleted` | chat/worktree workspace |
| `trackMessageSent` | `message_sent` | chat/sub-chat |
| `trackPRCreated` | `pr_created` | GitHub PR |
| `trackCommitCreated` | `commit_created` | Git commit |
| `trackSubChatCreated` | `sub_chat_created` | legacy sub-chat |

Candidate Ripple event map:

| Event | Fires when | Allowed example properties |
| --- | --- | --- |
| `app_opened` | Ripple starts after consent/config checks | `first_launch`, `app_version`, `platform`, `environment`, `app_channel` |
| `analytics_consent_granted` | user grants analytics consent | `source`, `consent_version` |
| `profile_preference_updated` | user changes optional local profile/email/update preferences | `profile_status`, `email_provided`, `weekly_updates_enabled`, `source` |
| `ripple_contact_opt_in` | user explicitly enables weekly app update emails | `contact_id`, `email`, `weekly_updates_enabled`, `consent_version`, `source`, `app_version`, `platform` |
| `ripple_contact_updated` | user changes contact email or update preference | `contact_id`, `email_provided`, `weekly_updates_enabled`, `consent_version`, `source` |
| `ripple_contact_opt_out` | user disables weekly app update emails | `contact_id`, `weekly_updates_enabled`, `source` |
| `onboarding_started` | first-run onboarding opens | `entry_reason` |
| `onboarding_completed` | first-run onboarding finishes | `analytics_choice`, `profile_choice`, `email_provided`, `weekly_updates_enabled`, `provider_choice`, `created_project` |
| `onboarding_skipped` | optional onboarding is skipped | `step` |
| `project_create_started` | user starts creating a project | `source`, `template_category`, `aspect_ratio` |
| `project_created` | a Ripple project is scaffolded | `template_id`, `template_category`, `aspect_ratio`, `setup_status` |
| `project_opened` | an existing Ripple project opens | `source`, `composition_count_bucket`, `project_count_bucket` |
| `project_open_failed` | project open validation fails | `error_category`, `source` |
| `composition_created` | a new composition is created from a template | `template_id`, `template_category`, `aspect_ratio` |
| `composition_selected` | active composition changes | `source`, `composition_kind` |
| `template_selected` | user selects a project/composition starter | `template_id`, `template_category`, `target`, `aspect_ratio` |
| `readiness_check_completed` | runtime/setup readiness check finishes | `status`, `missing_component_category` |
| `setup_failed` | first-run/runtime readiness check fails | `check`, `error_category`, `blocking` |
| `preview_ready` | HyperFrames preview becomes usable | `composition_kind`, `duration_bucket`, `fps`, `time_to_ready_bucket` |
| `preview_failed` | preview cannot start or load | `error_category`, `environment_status` |
| `preview_reloaded` | user/app reloads preview source | `source`, `result` |
| `timeline_shown` | timeline becomes visible | `source` |
| `timeline_interaction` | user uses timeline controls | `action`, `result` |
| `asset_import_started` | user starts asset import/drop | `source`, `asset_kind`, `count_bucket` |
| `asset_import_succeeded` | asset import completes | `asset_kind`, `count_bucket` |
| `asset_import_failed` | asset import fails or is rejected | `asset_kind`, `error_category` |
| `chat_started` | user starts or reopens a project chat | `source`, `provider_configured` |
| `agent_run_started` | Codex/Claude run starts | `provider_family`, `source`, `workspace_kind` |
| `agent_run_completed` | agent run reaches terminal state | `provider_family`, `source`, `status`, `duration_bucket`, `error_category` |
| `comment_created` | frame/time/element comment is saved | `anchor_type`, `has_screenshot`, `frame_bucket` |
| `comment_opened_in_chat` | comment expands into full chat | `anchor_type`, `revision_status` |
| `comment_resolved` | comment thread is resolved/restored/deleted | `action`, `revision_status` |
| `revision_requested` | comment/chat asks an agent for isolated changes | `source`, `provider_family`, `has_visual_context` |
| `revision_previewed` | user previews a generated proposal | `source`, `provider_family` |
| `revision_accepted` | user accepts a generated proposal | `source`, `changed_file_count_bucket` |
| `revision_rejected` | user rejects a generated proposal | `source`, `reason_category` |
| `export_opened` | user opens the Renders/export surface | `source` |
| `export_started` | render/export job is queued or started | `format`, `quality_preset`, `composition_kind`, `source_context` |
| `export_succeeded` | export completes | `format`, `duration_bucket`, `render_time_bucket` |
| `export_failed` | export fails or is cancelled | `format`, `error_category`, `stage` |
| `export_cancelled` | user cancels export | `format`, `stage` |

Candidate top-level metrics and funnels:

- Activation: first app open to first preview-ready.
- Creation: project-create started to project-created to preview-ready.
- Template usage: selected template category and target, without project or
  composition names.
- Review loop: comment-created to revision-requested to revision-previewed to
  accepted/rejected.
- Agent reliability: agent-run started to completed, by provider family and
  workspace kind.
- Export reliability: export-opened to export-started to export-succeeded or
  export-failed, by format and quality preset.
- Retention/progress: project count bucket, active project count bucket, and
  days-since-first-open bucket for opted-in installs.

Forbidden analytics payload data:

- prompt text, chat messages, comment body text, transcript content
- file contents, generated code, media contents, screenshots, frame images
- absolute local paths, home directory names, repository URLs, branch names,
  worktree names, output paths
- raw project IDs, conversation IDs, comment thread IDs, revision IDs,
  workspace IDs, sub-chat IDs, provider run/session IDs, or database primary
  keys
- user email, API keys, tokens, provider credentials, provider-native thread or
  session IDs
- raw stderr/stdout, unsanitized exception details, or environment dumps

Exception: user email is allowed only in the dedicated PostHog contact capture
path for users who explicitly opt into weekly app update emails. It is still
forbidden in anonymous product analytics events, crash reports, session replay,
autocapture, logs, and exported transparency examples.

Local PostHog setup recorded on 2026-05-04:

- Project name: `Ripple`
- Project ID: `281249`
- Region: `US Cloud`
- Capture host: `https://us.i.posthog.com`
- App/settings host: `https://us.posthog.com`
- Token storage: ignored local `.env`, with release/CI secret wiring still
  required before official builds.

Contact preference model needed by Phase 16/17:

- `contactEmail`
- `weeklyUpdatesEnabled`
- `contactConsentVersion`
- `contactSyncStatus`
- `contactLastSyncedAt`
- `contactLastErrorCategory`
- `contactOptedOutAt`

Contact capture implementation rule:

- Preferred: `syncUpdateContactPreference(...)` uses a separate
  `contact:<generatedOrHashedContactId>` distinct ID and may set email-bearing
  contact event/person properties for update-list management.
- Required: it never aliases, merges, identifies, or reuses the anonymous
  `anon:<installId>` analytics identity.
- Fallback: if PostHog person properties make that boundary ambiguous, store the
  email only as a dedicated contact event payload and do not use person
  properties.

This can live in a main-process JSON preference store under Electron
`userData` or in SQLite, but contact sync must be main-owned if the main process
owns PostHog contact capture.
