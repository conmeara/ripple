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

## Progress

- [x] 2026-05-03 / Codex: Read `PLANS.md`, `ROADMAP.md`, and audited the
  current main-process, renderer-process, settings, startup, and event call
  sites for analytics and Sentry.
- [x] 2026-05-03 / Codex: Discussed the open source distribution model, first
  PostHog account setup, explicit opt-in consent, and the one-PostHog-project
  default with `environment` tagging for any non-production captures.
- [ ] Implement Milestone 0: create and wire the first Ripple PostHog project
  configuration for official builds without committing inherited or hardcoded
  keys.
- [ ] Implement Milestone 1: document the Ripple analytics event map and privacy
  rules.
- [ ] Implement Milestone 2: replace inherited analytics initialization with
  consent-aware Ripple configuration.
- [ ] Implement Milestone 3: migrate current call sites from repo/chat events to
  Ripple product events and remove unused inherited helpers.
- [ ] Implement Milestone 4: expose settings/onboarding consent controls backed
  by main-process persisted preference state.
- [ ] Implement Milestone 5: validate behavior in development, test, and
  packaged-style paths.

## Surprises & Discoveries

- Observation: Main-process analytics currently has a hardcoded PostHog project
  key fallback and defaults to the public PostHog ingest host.
  Evidence: `src/main/lib/analytics.ts` defines `POSTHOG_DESKTOP_KEY` from
  `MAIN_VITE_POSTHOG_KEY` or a literal `phc_...` value, and
  `POSTHOG_HOST` defaults to `https://us.i.posthog.com`.
- Observation: Renderer analytics uses a different PostHog client and only
  initializes when `VITE_POSTHOG_KEY` is present.
  Evidence: `src/renderer/lib/analytics.ts` imports `posthog-js`, reads
  `VITE_POSTHOG_KEY`, disables autocapture/session recording, and exposes only a
  renderer `message_sent` helper.
- Observation: The user-facing analytics preference is opt-out, not explicit
  opt-in, and the copy still says "Agents" while claiming anonymous usage data.
  Evidence: `analyticsOptOutAtom` defaults to `false`; the settings switch says
  "Help us improve Agents..." even though auth paths can identify users by
  email.
- Observation: Main-process opt-out state is in memory only and is synced from
  renderer after the renderer app mounts. Startup can initialize analytics,
  identify a saved user, and track app-opened before the persisted renderer
  opt-out value reaches the main process.
  Evidence: `src/main/index.ts` calls `initAnalytics()`, `identify(...)`, and
  `trackAppOpened()` during `app.whenReady()`. `src/renderer/App.tsx` later
  reads `preferences:analytics-opt-out` from `localStorage` and calls
  `desktopApi.setAnalyticsOptOut(...)`.
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
- Decision: Onboarding may collect an optional user email separately from
  analytics consent, but analytics events should use a random install or
  analytics user ID by default and must not include the email in event
  properties.
  Rationale: Email can support updates, support, or account flows without
  turning product analytics into personally identifying activity logs.
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

## Outcomes & Retrospective

Not started.

## Context and Orientation

The repository still contains analytics from the 1Code desktop app. There are
two PostHog clients:

`src/main/lib/analytics.ts` is the main-process analytics module. It imports
`posthog-node`, stores a singleton `posthog`, tracks `currentUserId`, keeps an
in-memory `userOptedOut` flag, and writes `.first_launch_tracked` under
Electron `app.getPath("userData")`. It skips analytics in development unless
`FORCE_ANALYTICS=true`. It records common properties such as app version,
platform, arch, Electron version, Node version, subscription plan, and
connection method. It currently exposes generic `capture` and `identify`
helpers plus inherited event helpers for desktop open, first launch, auth,
project opened, workspace lifecycle, message sent, PR created, commit created,
and sub-chat created.

`src/renderer/lib/analytics.ts` is the renderer analytics module. It imports
`posthog-js`, reads `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST`, skips localhost
unless `window.__FORCE_ANALYTICS__` is exposed from preload, disables
autocapture, pageview, pageleave, and session recording, and persists PostHog
state in localStorage. It checks `preferences:analytics-opt-out` directly from
localStorage before capture or identify. It currently exposes a renderer
`message_sent` helper.

Startup currently initializes analytics in both processes. In main,
`src/main/index.ts` initializes Sentry before app readiness when packaged and a
DSN exists. During `app.whenReady()`, it initializes the auth manager, calls
`initAnalytics()`, identifies a saved authenticated user if present, and tracks
app-opened. During hosted auth callback handling, it tracks auth completion and
sets subscription plan enrichment. In renderer, `src/renderer/App.tsx` calls
`initAnalytics()`, syncs the renderer-local opt-out flag to the main process,
identifies the current user, and resets the renderer PostHog client on unmount.

Consent currently lives in renderer state. `analyticsOptOutAtom` in
`src/renderer/lib/atoms/index.ts` stores `preferences:analytics-opt-out` and
defaults to `false`, which means sharing is enabled by default. The settings UI
in `src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx`
shows "Share Usage Analytics" and says it helps improve "Agents". Toggling the
switch updates the atom and calls `desktopApi.setAnalyticsOptOut(...)`, which
goes through `src/preload/index.ts` to the `analytics:set-opt-out` handler in
`src/main/windows/main.ts`.

Current event call sites are narrow and inherited. `src/main/lib/trpc/routers/projects.ts`
tracks `project_opened` when folder-based or GitHub clone-based projects are
created or reopened. `src/main/lib/trpc/routers/chats.ts` tracks workspace
creation, archival, deletion, and PR creation. Renderer chat components track
`message_sent` for user sends and queued sends. `src/main/lib/trpc/routers/claude.ts`
sets an analytics connection method based on Claude subscription, API key,
custom model, or offline Ollama.

There is no Ripple-owned event map yet for onboarding, project creation,
HyperFrames preview readiness, comment threads, isolated revision proposals,
export attempts, export completion/failure, or setup failures.

## Plan of Work

First, set up the Ripple-owned PostHog account/project as deployment
configuration rather than source-controlled identity. Create one PostHog project
for Ripple, record the host/region, and feed its project key and host into
official packaged builds through environment or release configuration. Remove
the inherited hardcoded key fallback. Local source builds should be
unconfigured by default, so forks and contributors do not accidentally send
events to Ripple. If a developer needs to test analytics locally, they can opt
into a force mode with explicit configuration and an `environment: "development"`
or `environment: "test"` property.

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

Third, collapse analytics provider ownership into the main process. Replace the
hardcoded PostHog key fallback with explicit configuration, keep dev/test off by
default, and persist analytics consent somewhere the main process can read
before the first analytics event. The main analytics module should expose
query/update consent APIs, a typed capture function, an initialization status,
and no-op behavior when disabled. Provider errors should be caught and logged
without interrupting local workflows.

Fourth, migrate the renderer. Remove the independent `posthog-js` initialization
or turn `src/renderer/lib/analytics.ts` into a typed IPC client that asks the
main process to record allowed UI events. Update settings copy from Agents to
Ripple and make the control truthful about whether sharing is off, on, or
unconfigured. Phase 17 onboarding can reuse the same consent APIs for the
optional email plus analytics opt-in screen, so this phase should keep the API
surface onboarding-ready even if the first-run screen ships later. Email capture
and analytics capture should remain separate flows unless the user explicitly
opts into a later account-linked analytics policy.

Fifth, replace inherited event helpers and call sites with Ripple events.
Project APIs should record project-created and project-opened using sanitized
properties such as project kind, template id, has asset count, or setup status,
not local paths or repository identifiers. HyperFrames preview APIs should
record preview-ready and preview-failed. Comment/revision routers should record
comment and revision lifecycle events. Export services should record export
started, succeeded, failed, format, quality preset, duration bucket, and error
category without output paths or user media details. Existing chat/workspace/PR
events should either be removed or translated only where they still correspond
to a Ripple concept.

Sixth, audit Sentry and crash/error telemetry. Decide whether it follows the
analytics consent flag or gets a separate crash-reporting flag. Remove or
sanitize extras that include absolute paths, stderr, prompt/message content, or
chat identifiers before any production capture.

Finally, add tests around configuration, consent, event sanitization, and
call-site behavior. Validation should prove that disabled/unconfigured
analytics does not throw, opted-out users produce no provider captures, dev/test
builds do not capture unless explicitly forced, and event names/properties match
the documented map.

## Concrete Steps

Run commands from `/Users/conmeara/code/ripple` unless noted otherwise.

1. Confirm the current dirty worktree and avoid touching unrelated files.
2. Create the first Ripple PostHog project. Record the project host/region and
   project key in local/release configuration, not as a source-controlled
   hardcoded fallback.
3. Decide the official build variable names. Prefer a main-process-only
   configuration path such as `MAIN_VITE_RIPPLE_POSTHOG_KEY` and
   `MAIN_VITE_RIPPLE_POSTHOG_HOST`, or rename the existing `MAIN_VITE_POSTHOG_*`
   variables only if the migration is mechanical and well-tested.
4. Add an `environment` property to the common event properties with values such
   as `production`, `development`, and `test`. Production official builds should
   be the only normal sender; development/test should be disabled unless forced.
5. Add the event map, either inside this plan's Artifacts section during design
   or as a separate checked-in document such as `docs/analytics-event-map.md`
   when implementation begins.
6. Update `src/main/lib/analytics.ts` to remove the hardcoded PostHog key,
   centralize provider initialization, read persisted consent before startup
   events, catch provider errors, and expose typed event helpers.
7. Add main-process IPC or tRPC procedures for reading/updating analytics
   consent and for renderer-requested analytics events.
8. Update `src/preload/index.ts` and `src/preload/index.d.ts` for the consent
   and renderer event APIs.
9. Convert `src/renderer/lib/analytics.ts` from a PostHog provider module into a
   renderer facade, or delete it after replacing imports with the new IPC
   client.
10. Update `src/renderer/App.tsx` so it no longer races startup opt-out state
   and no longer identifies users directly from the renderer analytics client.
11. Update the settings UI in
   `src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx`
   or its Ripple successor with accurate Ripple language and persisted consent
   state.
12. Replace current event call sites in `projects.ts`, `chats.ts`, renderer chat
   components, HyperFrames preview/router code, comments/revisions services,
   and export services with typed Ripple events.
13. Audit Sentry initialization and capture extras, then align it with the
   chosen consent/sanitization model.
14. Add focused tests for consent/config/sanitization. Prefer dependency
   injection for a fake analytics provider over networked PostHog tests.
15. Run validation commands and update this ExecPlan with results and any
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
- Toggle analytics sharing on without configured provider. Expected: settings
  reflects that sharing is enabled locally but no provider is configured, and no
  user workflow is blocked.
- In an official-build-like environment with the Ripple PostHog key/host
  configured, complete the opt-in path and send one test event. Expected:
  PostHog receives a sanitized Ripple event with `environment: "production"` and
  no email, file path, prompt, message, comment body, media, or output path.
- In a local source-build environment without analytics configuration, complete
  the opt-in path. Expected: analytics status is `unconfigured`; no event is
  sent and no workflow is blocked.
- Trigger preview, comment, revision, and export success/failure paths.
  Expected: events match the event map and do not include prompts, messages,
  absolute paths, repository URLs, branch/worktree names, output paths, or user
  email.

Acceptance criteria:

- No primary-path event, comment, or settings copy reports as 1Code, 21st.dev,
  Agents, workspace, PR, commit, branch, worktree, or sub-chat unless it is an
  explicitly advanced/debug-only surface.
- Analytics initializes only when configured and permitted.
- Analytics and crash/error telemetry failures are logged but never interrupt
  project creation/opening, preview, comments/review, revision acceptance, or
  export.
- Users can understand and change analytics consent from settings, and Phase 17
  onboarding can reuse the same persisted consent API.
- The onboarding-ready API supports optional email entry and analytics opt-in as
  separate choices; analytics payloads do not include email by default.
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

- `posthog-node` in `src/main/lib/analytics.ts`
- `posthog-js` in `src/renderer/lib/analytics.ts`
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
- `src/shared/analytics/events.ts` with typed Ripple event names and property
  schemas, or an equivalent main-owned type module imported by renderer through
  safe shared code.

Environment/configuration:

- Existing `MAIN_VITE_POSTHOG_KEY`, `MAIN_VITE_POSTHOG_HOST`,
  `VITE_POSTHOG_KEY`, and `VITE_POSTHOG_HOST`
- Existing `MAIN_VITE_SENTRY_DSN`
- Existing `FORCE_ANALYTICS=true` development override
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
| `analytics_consent_updated` | user changes analytics choice | `enabled`, `source` |
| `onboarding_started` | first-run onboarding opens | `entry_reason` |
| `onboarding_completed` | first-run onboarding finishes | `analytics_choice`, `email_provided`, `provider_choice`, `created_project` |
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
- user email, API keys, tokens, provider credentials, provider-native thread or
  session IDs
- raw stderr/stdout, unsanitized exception details, or environment dumps
