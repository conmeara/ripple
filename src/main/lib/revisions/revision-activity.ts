import {
  buildAgentRunActivityEvent,
  normalizeAgentRunActivityPayload,
} from "../agent-runtime/activity"
import {
  compactAgentRuntimeString,
  titleForAgentRuntimeSummaryPart,
  type AgentRuntimeSummaryPart,
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

const LEGACY_ACTIVITY_LINE_MAP = new Map<string, string>([
  ["Agent is thinking", "Thinking"],
  ["Agent is working", "Thinking"],
  ["Editing files", "Updating composition"],
  ["Checking the project", "Checking project"],
  ["Reviewing the frame", "Checking current frame"],
  ["Reading context", "Explored project"],
  ["Looking up reference", "Explored project"],
  ["Using a project tool", "Working on project"],
  ["Writing a response", "Thinking"],
  ["Waiting for approval", "Approval needed"],
])

function toolActivityLine(
  event: RevisionActivityEvent,
  payload: Record<string, unknown>,
): string | null {
  const summaryPart = summaryPartForRuntimeEvent(event, payload)
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
  return LEGACY_ACTIVITY_LINE_MAP.get(label) ?? label
}

function summaryPartForRuntimeEvent(
  event: RevisionActivityEvent,
  payload: Record<string, unknown>,
): AgentRuntimeSummaryPart | null {
  const toolName = compactAgentRuntimeString(payload.toolName) ??
    compactAgentRuntimeString(payload.tool)
  const toolCallId = compactAgentRuntimeString(payload.toolCallId) ??
    compactAgentRuntimeString(payload.id) ??
    compactAgentRuntimeString(payload.itemId)
  const state = event.type === "tool_start" || event.type === "tool_update"
    ? "input-available"
    : event.type === "tool_end"
      ? "output-available"
      : undefined
  const input = payload.input && typeof payload.input === "object"
    ? payload.input
    : payload.command || payload.args
      ? {
        ...(payload.command ? { command: payload.command } : {}),
        ...(payload.args ? { args: payload.args } : {}),
      }
      : undefined
  const output = payload.output ?? payload.result

  if (toolName) {
    return {
      type: `tool-${toolName}`,
      toolName,
      toolCallId: toolCallId ?? `${event.type}-${toolName}`,
      ...(state ? { state } : {}),
      ...(input ? { input } : {}),
      ...(output !== undefined ? { output } : {}),
    }
  }

  if (event.type === "file_change") {
    return {
      type: "data-agent-runtime",
      data: {
        kind: "file_change",
        label: "Updating composition",
        payload,
      },
    }
  }

  if (event.type === "approval_request") {
    return {
      type: "data-agent-runtime",
      data: {
        kind: "approval",
        label: "Approval needed",
        payload,
      },
    }
  }

  if (event.type === "reasoning") {
    return {
      type: "reasoning",
      text: payload.delta ?? payload.text,
    }
  }

  return null
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
