# Ripple Analytics Event Map

Ripple analytics are optional anonymous product-health events. They exist to
answer whether the motion workflow works: project creation, preview readiness,
comments, revisions, exports, and setup health. They are not a record of a
user's creative work.

Anonymous events use the `anon:<installId>` identity generated locally by
Ripple. Weekly update contacts, when a user explicitly enables them, use a
separate `contact:<contactId>` identity and a separate contact event path.
Those identities must never be identified, aliased, or merged.

## Common Properties

Every anonymous event is sanitized and may include these common properties:

- `app_version`
- `platform`
- `environment`: `production`, `development`, or `test`
- `capture_source`

Development and test captures are disabled by default. If a developer forces
analytics locally for validation, events must include `environment` so they can
be filtered out of product analytics.

## Forbidden Payloads

Anonymous analytics must never include:

- project files, file contents, media contents, screenshots, or exports
- prompts, chat messages, agent conversations, comment bodies, or diffs
- absolute local file paths, output paths, branch names, worktree names, repo
  URLs, PR URLs, commit hashes, provider session IDs, chat IDs, project IDs,
  revision IDs, or workspace IDs
- stdout, stderr, raw logs, stack traces, debug payloads, API keys, tokens,
  secrets, or user email

The implementation enforces this with an allowlist and sanitizer in
`src/shared/ripple-analytics.ts` before the main-process PostHog boundary can
capture an event.

## Anonymous Product Events

| Event | When It Fires | Required Properties | Optional Properties |
| --- | --- | --- | --- |
| `ripple_app_opened` | App opened after consent and provider configuration allow capture. | `first_permitted_launch` | `launch_kind` |
| `ripple_analytics_consent_granted` | User explicitly enables anonymous analytics. | `consent_source` |  |
| `ripple_onboarding_completed` | First-run onboarding completes or is skipped. | `completion_state` | `profile_choice`, `analytics_choice`, `update_email_choice` |
| `ripple_first_run_setup_failed` | Non-blocking first-run setup or environment check fails. | `setup_step`, `error_category` | `runtime_status` |
| `ripple_project_created` | A local Ripple project is created or imported. | `creation_source`, `project_kind`, `result` | `template_id`, `setup_status`, `composition_count_bucket` |
| `ripple_project_opened` | An existing Ripple or HyperFrames project is opened. | `open_source`, `project_kind` | `setup_status`, `composition_count_bucket` |
| `ripple_template_selected` | A built-in template is selected. | `template_id`, `template_category` | `target` |
| `ripple_composition_created` | A composition is created. | `creation_source`, `result` | `template_id`, `composition_kind` |
| `ripple_composition_selected` | A composition becomes active. | `selection_source` | `composition_kind` |
| `ripple_preview_ready` | HyperFrames preview becomes available. | `preview_source` | `runtime_status`, `duration_bucket`, `composition_kind` |
| `ripple_preview_failed` | HyperFrames preview fails to become available. | `preview_source`, `error_category` | `runtime_status`, `composition_kind` |
| `ripple_timeline_interaction` | Timeline state changes. | `action` | `target_kind` |
| `ripple_asset_imported` | Assets are imported. | `asset_kind`, `result` | `asset_count_bucket` |
| `ripple_chat_created` | A project chat or revision chat is created. | `chat_kind`, `is_isolated` | `entry_point` |
| `ripple_chat_archived` | A project chat is archived. | `chat_kind` |  |
| `ripple_chat_deleted` | A project chat is deleted. | `chat_kind` |  |
| `ripple_chat_message_sent` | User submits a chat instruction. | `entry_point`, `mode` | `connection_method` |
| `ripple_agent_run_started` | Agent run starts. | `trigger`, `mode` | `connection_method` |
| `ripple_agent_run_completed` | Agent run completes. | `result`, `mode` | `duration_bucket`, `connection_method` |
| `ripple_agent_run_failed` | Agent run fails. | `error_category`, `mode` | `connection_method` |
| `ripple_comment_created` | Comment thread is created. | `comment_scope` | `frame_bucket`, `element_target` |
| `ripple_comment_replied` | Reply is added to a comment. | `comment_scope` |  |
| `ripple_comment_resolved` | Comment thread is resolved. | `comment_scope` |  |
| `ripple_revision_requested` | Comment-driven revision is requested. | `revision_source` | `comment_scope` |
| `ripple_revision_previewed` | Generated revision preview is viewed. | `preview_source` | `result` |
| `ripple_revision_accepted` | Generated revision is accepted. | `acceptance_source` | `change_count_bucket` |
| `ripple_revision_rejected` | Generated revision is rejected. | `rejection_source` | `change_count_bucket` |
| `ripple_export_panel_opened` | Export surface opens. | `open_source` | `format` |
| `ripple_export_started` | Export job starts. | `format`, `quality_preset` | `duration_bucket` |
| `ripple_export_succeeded` | Export job succeeds. | `format`, `quality_preset`, `duration_bucket` | `render_time_bucket` |
| `ripple_export_failed` | Export job fails. | `format`, `quality_preset`, `error_category` | `duration_bucket` |
| `ripple_export_cancelled` | Export job is cancelled. | `format` | `quality_preset` |

## Contact Events

Contact events are not anonymous product analytics and are not gated by the
analytics consent toggle. They are used only when a user explicitly enables
weekly app update emails.

| Event | When It Fires | Email Allowed |
| --- | --- | --- |
| `ripple_contact_opt_in` | User enters an email and enables weekly updates. | Yes |
| `ripple_contact_updated` | User changes the update email while still opted in. | Yes |
| `ripple_contact_opt_out` | User disables weekly update emails. | Yes, only if previously stored locally |

Contact events use `contact:<contactId>`, never `anon:<installId>`, and Ripple
does not call PostHog `identify` or `alias` for either path.
