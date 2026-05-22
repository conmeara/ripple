import {
  buildAgentRunActivityEvent,
  normalizeAgentRunActivityPayload,
} from "../agent-runtime/activity"
import {
  agentRuntimeSummaryPartFromEvent,
  designerFacingAgentRuntimeLine,
  titleForAgentRuntimeSummaryPart,
} from "../../../shared/agent-runtime-summary"

export interface RevisionActivityEvent {
  type: string
  providerType?: string | null
  payloadJson?: string | null
  payload?: Record<string, unknown> | null
}

function parsePayload(event: RevisionActivityEvent): Record<string, unknown> {
  if (event.payload && typeof event.payload === "object") return event.payload
  if (!event.payloadJson) return {}
  try {
    const parsed = JSON.parse(event.payloadJson)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function compactLabel(value: unknown): string | null {
  if (typeof value !== "string") return null
  const compact = value.replace(/\s+/g, " ").trim()
  if (!compact) return null
  return compact.length <= 90 ? compact : `${compact.slice(0, 87).trimEnd()}...`
}

function shouldUseStatusLabel(
  label: string | null,
  payload: Record<string, unknown>,
): label is string {
  if (!label) return false
  if (label.startsWith("Loaded Codex context")) return false
  if (label.startsWith("Loaded Claude context")) return false
  if (label === "Codex session ready") return false
  if (label === "Claude session ready") return false
  if (payload.sessionInit && typeof payload.sessionInit === "object") return false
  return true
}

const DIRECT_ACTIVITY_LINES = new Map<string, string>([
  ["file_change", "Updating composition"],
  ["reasoning", "Thinking"],
  ["assistant_text_delta", "Thinking"],
  ["assistant_message", "Thinking"],
  ["approval_request", "Approval needed"],
])

const TOOL_ACTIVITY_EVENT_TYPES = new Set([
  "tool_start",
  "tool_update",
  "tool_end",
])

const STATUS_ACTIVITY_LINES = new Map<string, string>([
  ["awaiting_approval", "Approval needed"],
  ["preparing", "Preparing the composition"],
  ["queued", "Thinking"],
  ["running", "Thinking"],
])

function toolActivityLine(
  event: RevisionActivityEvent,
  payload: Record<string, unknown>,
): string | null {
  const summaryPart = agentRuntimeSummaryPartFromEvent(event, payload)
  if (summaryPart) return titleForAgentRuntimeSummaryPart(summaryPart)

  const activity = normalizeAgentRunActivityPayload(
    buildAgentRunActivityEvent({
      eventType: event.type,
      providerType: event.providerType,
      payload,
    }).payload ?? null,
  )
  return activity ? designerFacingActivityLine(activity.label) : null
}

function designerFacingActivityLine(label: string): string {
  return designerFacingAgentRuntimeLine(label)
}

export function extractRevisionRunActivityLine(
  events: RevisionActivityEvent[],
): string | null {
  for (const event of [...events].reverse()) {
    const payload = parsePayload(event)

    if (event.type === "activity") {
      const activity = normalizeAgentRunActivityPayload(payload)
      if (activity) return designerFacingActivityLine(activity.label)
    }
    if (event.type !== "status") {
      const summaryPart = agentRuntimeSummaryPartFromEvent(event, payload)
      if (summaryPart) return titleForAgentRuntimeSummaryPart(summaryPart)
    }
    const directLine = DIRECT_ACTIVITY_LINES.get(event.type)
    if (directLine) return directLine
    if (TOOL_ACTIVITY_EVENT_TYPES.has(event.type)) {
      const line = toolActivityLine(event, payload)
      if (line) return line
    }
    if (event.type === "status") {
      const label = compactLabel(payload.label) || compactLabel(payload.message)
      if (shouldUseStatusLabel(label, payload)) return designerFacingActivityLine(label)
      const statusLine = STATUS_ACTIVITY_LINES.get(compactLabel(payload.status) ?? "")
      if (statusLine) return statusLine
    }
  }

  return null
}
