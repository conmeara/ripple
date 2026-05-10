import {
  buildAgentRunActivityEvent,
  normalizeAgentRunActivityPayload,
} from "../agent-runtime/activity"

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

function toolActivityLine(
  event: RevisionActivityEvent,
  payload: Record<string, unknown>,
): string | null {
  const activity = normalizeAgentRunActivityPayload(
    buildAgentRunActivityEvent({
      eventType: event.type,
      providerType: event.providerType,
      payload,
    }).payload ?? null,
  )
  return activity?.label ?? null
}

export function extractRevisionRunActivityLine(
  events: RevisionActivityEvent[],
): string | null {
  for (const event of [...events].reverse()) {
    const payload = parsePayload(event)

    if (event.type === "activity") {
      const activity = normalizeAgentRunActivityPayload(payload)
      if (activity) return activity.label
    }
    if (event.type === "file_change") return "Editing files"
    if (event.type === "reasoning") return "Agent is thinking"
    if (event.type === "assistant_text_delta") return "Writing a response"
    if (event.type === "assistant_message") return "Writing a response"
    if (
      event.type === "tool_start" ||
      event.type === "tool_update" ||
      event.type === "tool_end"
    ) {
      const line = toolActivityLine(event, payload)
      if (line) return line
    }
    if (event.type === "approval_request") return "Waiting for approval"
    if (event.type === "status") {
      const label = compactLabel(payload.label) || compactLabel(payload.message)
      if (shouldUseStatusLabel(label, payload)) return label
      switch (compactLabel(payload.status)) {
        case "awaiting_approval":
          return "Waiting for approval"
        case "preparing":
          return "Preparing the composition"
        case "queued":
        case "running":
          return "Agent is thinking"
      }
    }
  }

  return null
}
