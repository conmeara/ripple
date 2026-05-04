export const analyticsConsentValues = ["unset", "granted", "denied"] as const

export type AnalyticsConsent = (typeof analyticsConsentValues)[number]

export const contactSyncStatuses = [
  "idle",
  "pending",
  "synced",
  "failed",
  "optedOutPending",
] as const

export type ContactSyncStatus = (typeof contactSyncStatuses)[number]

export const analyticsEnvironments = ["production", "development", "test"] as const

export type AnalyticsEnvironment = (typeof analyticsEnvironments)[number]

export type AnalyticsPropertyValue = string | number | boolean | null

export type AnalyticsProperties = Record<string, AnalyticsPropertyValue | undefined>

interface AnalyticsEventDefinition {
  description: string
  required: readonly string[]
  optional: readonly string[]
}

export const commonAnalyticsProperties = [
  "app_version",
  "platform",
  "environment",
  "capture_source",
] as const

export const rippleAnalyticsEvents = {
  ripple_app_opened: {
    description: "Ripple opened after analytics consent and provider configuration allowed capture.",
    required: ["first_permitted_launch"],
    optional: ["launch_kind"],
  },
  ripple_analytics_consent_granted: {
    description: "The user explicitly enabled anonymous product analytics.",
    required: ["consent_source"],
    optional: [],
  },
  ripple_onboarding_completed: {
    description: "The first-run onboarding flow completed or was skipped.",
    required: ["completion_state"],
    optional: ["profile_choice", "analytics_choice", "update_email_choice"],
  },
  ripple_first_run_setup_failed: {
    description: "A non-blocking first-run setup or environment check failed.",
    required: ["setup_step", "error_category"],
    optional: ["runtime_status"],
  },
  ripple_project_created: {
    description: "A local Ripple project was created or imported into the app.",
    required: ["creation_source", "project_kind", "result"],
    optional: ["template_id", "setup_status", "composition_count_bucket"],
  },
  ripple_project_opened: {
    description: "An existing Ripple or HyperFrames project was opened.",
    required: ["open_source", "project_kind"],
    optional: ["setup_status", "composition_count_bucket"],
  },
  ripple_template_selected: {
    description: "A built-in motion template was selected.",
    required: ["template_id", "template_category"],
    optional: ["target"],
  },
  ripple_composition_created: {
    description: "A new HyperFrames composition was created.",
    required: ["creation_source", "result"],
    optional: ["template_id", "composition_kind"],
  },
  ripple_composition_selected: {
    description: "A composition became the active editing or preview target.",
    required: ["selection_source"],
    optional: ["composition_kind"],
  },
  ripple_preview_ready: {
    description: "The HyperFrames preview became available.",
    required: ["preview_source"],
    optional: ["runtime_status", "duration_bucket", "composition_kind"],
  },
  ripple_preview_failed: {
    description: "The HyperFrames preview failed to become available.",
    required: ["preview_source", "error_category"],
    optional: ["runtime_status", "composition_kind"],
  },
  ripple_timeline_interaction: {
    description: "A timeline operation changed clip or playback state.",
    required: ["action"],
    optional: ["target_kind"],
  },
  ripple_asset_imported: {
    description: "Assets were imported into a project.",
    required: ["asset_kind", "result"],
    optional: ["asset_count_bucket"],
  },
  ripple_chat_created: {
    description: "A project chat or revision chat was created.",
    required: ["chat_kind", "is_isolated"],
    optional: ["entry_point"],
  },
  ripple_chat_archived: {
    description: "A project chat was archived from the local workspace list.",
    required: ["chat_kind"],
    optional: [],
  },
  ripple_chat_deleted: {
    description: "A project chat was deleted from the local workspace list.",
    required: ["chat_kind"],
    optional: [],
  },
  ripple_chat_message_sent: {
    description: "A user submitted a chat instruction without message content.",
    required: ["entry_point", "mode"],
    optional: ["connection_method"],
  },
  ripple_agent_run_started: {
    description: "An agent run started for a chat or revision.",
    required: ["trigger", "mode"],
    optional: ["connection_method"],
  },
  ripple_agent_run_completed: {
    description: "An agent run completed without raw transcript or file data.",
    required: ["result", "mode"],
    optional: ["duration_bucket", "connection_method"],
  },
  ripple_agent_run_failed: {
    description: "An agent run failed without raw error output.",
    required: ["error_category", "mode"],
    optional: ["connection_method"],
  },
  ripple_comment_created: {
    description: "A frame or project comment thread was created.",
    required: ["comment_scope"],
    optional: ["frame_bucket", "element_target"],
  },
  ripple_comment_replied: {
    description: "A reply was added to a comment thread.",
    required: ["comment_scope"],
    optional: [],
  },
  ripple_comment_resolved: {
    description: "A comment thread was resolved.",
    required: ["comment_scope"],
    optional: [],
  },
  ripple_revision_requested: {
    description: "A comment-driven revision was requested.",
    required: ["revision_source"],
    optional: ["comment_scope"],
  },
  ripple_revision_previewed: {
    description: "A generated revision preview was viewed.",
    required: ["preview_source"],
    optional: ["result"],
  },
  ripple_revision_accepted: {
    description: "A generated revision was accepted into the main project.",
    required: ["acceptance_source"],
    optional: ["change_count_bucket"],
  },
  ripple_revision_rejected: {
    description: "A generated revision was rejected or discarded.",
    required: ["rejection_source"],
    optional: ["change_count_bucket"],
  },
  ripple_export_panel_opened: {
    description: "The export surface was opened.",
    required: ["open_source"],
    optional: ["format"],
  },
  ripple_export_started: {
    description: "An export job started.",
    required: ["format", "quality_preset"],
    optional: ["duration_bucket"],
  },
  ripple_export_succeeded: {
    description: "An export job completed successfully.",
    required: ["format", "quality_preset", "duration_bucket"],
    optional: ["render_time_bucket"],
  },
  ripple_export_failed: {
    description: "An export job failed without raw logs, paths, or media details.",
    required: ["format", "quality_preset", "error_category"],
    optional: ["duration_bucket"],
  },
  ripple_export_cancelled: {
    description: "An export job was cancelled.",
    required: ["format"],
    optional: ["quality_preset"],
  },
} as const satisfies Record<string, AnalyticsEventDefinition>

export type RippleAnalyticsEventName = keyof typeof rippleAnalyticsEvents

export interface RippleAnalyticsEventPayload {
  name: RippleAnalyticsEventName
  properties?: AnalyticsProperties
}

export interface SanitizedAnalyticsEventPayload {
  name: RippleAnalyticsEventName
  properties: Record<string, AnalyticsPropertyValue>
}

export type AnalyticsCaptureStatus =
  | "captured"
  | "disabled"
  | "unconfigured"
  | "consent_required"
  | "invalid_event"
  | "provider_error"

export interface AnalyticsCaptureResult {
  status: AnalyticsCaptureStatus
  captured: boolean
  reason?: string
}

export interface AnalyticsStatus {
  consent: AnalyticsConsent
  environment: AnalyticsEnvironment
  configured: boolean
  runtimeEnabled: boolean
  captureEnabled: boolean
  reason: string
  provider: "posthog" | "none"
  contactSyncStatus: ContactSyncStatus
}

export interface UpdateContactPreferenceInput {
  email?: string | null
  weeklyUpdatesEnabled: boolean
  source?: string
}

export interface UpdateContactPreferenceState {
  email: string | null
  weeklyUpdatesEnabled: boolean
  syncStatus: ContactSyncStatus
  updatedAt: string
  lastError?: string | null
}

export const contactEventNames = [
  "ripple_contact_opt_in",
  "ripple_contact_updated",
  "ripple_contact_opt_out",
] as const

export type RippleContactEventName = (typeof contactEventNames)[number]

export class AnalyticsPayloadError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = "AnalyticsPayloadError"
  }
}

const forbiddenValuePatterns: Array<{ code: string; pattern: RegExp }> = [
  { code: "email_value", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { code: "absolute_path", pattern: /(^|[\s"'(:=])(?:~\/|file:\/\/|[A-Z]:[\\/]|\\\\[^\\/\s]+[\\/]|\\Users\\|\/(?:[^/\s"'<>|]+\/?)+)/i },
  { code: "repo_url", pattern: /(git@|github\.com[:/]|gitlab\.com[:/]|bitbucket\.org[:/]|\.git\b)/i },
  { code: "secret_value", pattern: /(sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|xox[baprs]-|phc_[A-Za-z0-9_]{12,})/i },
]

const MAX_STRING_VALUE_LENGTH = 120

function isAllowedEventName(name: string): name is RippleAnalyticsEventName {
  return Object.prototype.hasOwnProperty.call(rippleAnalyticsEvents, name)
}

function assertAllowedProperty(
  eventName: RippleAnalyticsEventName,
  propertyName: string,
): void {
  const definition = rippleAnalyticsEvents[eventName]
  const allowed = new Set<string>([
    ...commonAnalyticsProperties,
    ...definition.required,
    ...definition.optional,
  ])
  if (!allowed.has(propertyName)) {
    throw new AnalyticsPayloadError(
      `Property "${propertyName}" is not allowed on "${eventName}".`,
      "unknown_property",
    )
  }
}

function sanitizePropertyValue(
  propertyName: string,
  value: unknown,
): AnalyticsPropertyValue {
  if (value === null) return null
  if (typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new AnalyticsPayloadError(
        `Property "${propertyName}" must be a finite number.`,
        "invalid_number",
      )
    }
    return value
  }
  if (typeof value !== "string") {
    throw new AnalyticsPayloadError(
      `Property "${propertyName}" must be a primitive analytics value.`,
      "invalid_value_type",
    )
  }

  const trimmed = value.trim()
  if (trimmed.length > MAX_STRING_VALUE_LENGTH) {
    throw new AnalyticsPayloadError(
      `Property "${propertyName}" is too long for analytics.`,
      "string_too_long",
    )
  }
  for (const forbidden of forbiddenValuePatterns) {
    if (forbidden.pattern.test(trimmed)) {
      throw new AnalyticsPayloadError(
        `Property "${propertyName}" looks like forbidden payload data.`,
        forbidden.code,
      )
    }
  }
  if (/[\r\n]/.test(trimmed)) {
    throw new AnalyticsPayloadError(
      `Property "${propertyName}" must not contain multiline content.`,
      "multiline_value",
    )
  }
  return trimmed
}

export function sanitizeAnalyticsEventPayload(input: {
  name: string
  properties?: Record<string, unknown> | null
}): SanitizedAnalyticsEventPayload {
  if (!isAllowedEventName(input.name)) {
    throw new AnalyticsPayloadError(
      `Unknown analytics event "${input.name}".`,
      "unknown_event",
    )
  }

  const rawProperties = input.properties ?? {}
  const properties: Record<string, AnalyticsPropertyValue> = {}

  for (const [propertyName, value] of Object.entries(rawProperties)) {
    if (value === undefined) continue
    assertAllowedProperty(input.name, propertyName)
    properties[propertyName] = sanitizePropertyValue(propertyName, value)
  }

  const definition = rippleAnalyticsEvents[input.name]
  for (const required of definition.required) {
    if (!(required in properties)) {
      throw new AnalyticsPayloadError(
        `Missing required analytics property "${required}" for "${input.name}".`,
        "missing_required_property",
      )
    }
  }

  return {
    name: input.name,
    properties,
  }
}

export function bucketCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0"
  if (count === 1) return "1"
  if (count <= 3) return "2-3"
  if (count <= 10) return "4-10"
  return "11+"
}

export function bucketSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "unknown"
  if (seconds < 5) return "under_5s"
  if (seconds < 15) return "5_15s"
  if (seconds < 60) return "15_60s"
  if (seconds < 300) return "1_5m"
  return "over_5m"
}

export function categorizeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "")
  const value = raw.toLowerCase()
  if (!value) return "unknown"
  if (value.includes("cancel")) return "cancelled"
  if (value.includes("timeout") || value.includes("timed out")) return "timeout"
  if (value.includes("permission") || value.includes("eacces")) return "permission"
  if (value.includes("network") || value.includes("fetch") || value.includes("econn")) return "network"
  if (value.includes("missing") || value.includes("not found") || value.includes("enoent")) return "missing_dependency"
  if (value.includes("ffmpeg") || value.includes("ffprobe")) return "media_tool"
  if (value.includes("hyperframes")) return "hyperframes"
  if (value.includes("auth") || value.includes("api key")) return "provider_auth"
  return "unknown"
}
