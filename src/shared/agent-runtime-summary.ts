import type { AgentRuntimeProviderRefs } from "./agent-runtime-ui-projection"

export type AgentRuntimeSummaryStatus = "pending" | "done" | "error"

export type AgentRuntimeSummaryKind =
  | "thinking"
  | "project_inspection"
  | "visual_context"
  | "motion_edit"
  | "verification"
  | "approval"
  | "status"
  | "assistant_text"
  | "project_tool"

export type AgentRuntimeVisualKind = "snapshot" | "frame_sheet"

export interface AgentRuntimeProductSummary {
  id: string
  kind: AgentRuntimeSummaryKind
  status: AgentRuntimeSummaryStatus
  title: string
  subtitle?: string
  details?: AgentRuntimeSummaryDetail[]
  providerRefs?: AgentRuntimeProviderRefs[]
}

export interface AgentRuntimeSummaryDetail {
  id: string
  label: string
  value: string
  visibility?: "default" | "debug"
}

export type AgentRuntimeSummaryPart = Record<string, any>

export type AgentRuntimeDataPartKind = "status" | "file_change" | "approval"

export interface AgentRuntimeDataPartData {
  kind: AgentRuntimeDataPartKind
  label?: string
  providerRefs?: AgentRuntimeProviderRefs | AgentRuntimeProviderRefs[]
  payload?: Record<string, unknown>
  summary?: AgentRuntimeProductSummary
}

export interface AgentRuntimeDataPart extends AgentRuntimeSummaryPart {
  type: "data-agent-runtime"
  id?: string
  data: AgentRuntimeDataPartData
  providerRefs?: AgentRuntimeProviderRefs | AgentRuntimeProviderRefs[]
}

export interface AgentRuntimeSummaryEventLike {
  id?: string
  type?: string
  providerId?: string | null
  providerType?: string | null
  payloadJson?: string | null
  payload?: Record<string, unknown> | null
}

const SUMMARY_KINDS = new Set<AgentRuntimeSummaryKind>([
  "thinking",
  "project_inspection",
  "visual_context",
  "motion_edit",
  "verification",
  "approval",
  "status",
  "assistant_text",
  "project_tool",
])

const SUMMARY_STATUSES = new Set<AgentRuntimeSummaryStatus>([
  "pending",
  "done",
  "error",
])

const LEGACY_AGENT_RUNTIME_LINES = new Map<string, string>([
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

const LATEST_DIRECT_ACTIVITY_LINES = new Map<string, string>([
  ["reasoning", "Thinking"],
  ["assistant_text_delta", "Thinking"],
  ["assistant_message", "Thinking"],
  ["approval_request", "Approval needed"],
])

const LATEST_STATUS_ACTIVITY_LINES = new Map<string, string>([
  ["awaiting_approval", "Approval needed"],
  ["preparing", "Preparing the composition"],
  ["queued", "Thinking"],
  ["running", "Thinking"],
])

const LATEST_ACTIVITY_KIND_LINES = new Map<string, string>([
  ["thinking", "Thinking"],
  ["preparing", "Preparing the composition"],
  ["reviewing", "Checking current frame"],
  ["checking", "Checking project"],
  ["editing", "Updating composition"],
  ["searching", "Explored project"],
  ["reading", "Explored project"],
  ["tooling", "Working on project"],
  ["writing", "Thinking"],
  ["waiting", "Approval needed"],
])

export function isAgentRuntimeRecord(value: unknown): value is AgentRuntimeSummaryPart {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function isAgentRuntimeProductSummary(
  value: unknown,
): value is AgentRuntimeProductSummary {
  return isAgentRuntimeRecord(value) &&
    typeof value.id === "string" &&
    SUMMARY_KINDS.has(value.kind) &&
    SUMMARY_STATUSES.has(value.status) &&
    typeof value.title === "string" &&
    value.title.trim().length > 0
}

export function agentRuntimeSummaryFromPart(
  part: AgentRuntimeSummaryPart,
): AgentRuntimeProductSummary | null {
  const summary = part.summary ?? part.data?.summary
  return isAgentRuntimeProductSummary(summary) ? summary : null
}

export function shouldHideAgentRuntimeDataPart(part: AgentRuntimeSummaryPart): boolean {
  if (part.type !== "data-agent-runtime" || part.data?.kind !== "status") return false
  const label = compactAgentRuntimeString(part.data?.label) ??
    compactAgentRuntimeString(part.data?.payload?.label)
  return Boolean(
    part.data?.payload?.capabilities ||
      part.data?.payload?.sessionInit ||
      label?.startsWith("Loaded Codex context") ||
      label?.startsWith("Loaded Claude context"),
  )
}

export function titleForAgentRuntimeDataPart(
  part: AgentRuntimeSummaryPart,
  status?: AgentRuntimeSummaryStatus,
): string | null {
  if (part.type !== "data-agent-runtime") return null
  if (shouldHideAgentRuntimeDataPart(part)) return null
  const summary = agentRuntimeSummaryFromPart(part)
  if (summary) return summary.title
  return titleForAgentRuntimeSummaryPart(part, status ?? agentRuntimePartStatus(part))
}

export function compactAgentRuntimeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function designerFacingAgentRuntimeLine(value: string): string {
  const mapped = LEGACY_AGENT_RUNTIME_LINES.get(value) ?? value
  return technicalAgentRuntimeLine(mapped) ?? mapped
}

export function designerFacingAgentRuntimeErrorLine(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim()
  if (!compact) return "Agent needs attention"

  const lower = compact.toLowerCase()
  if (/\b(cancelled|canceled|aborted|stopped)\b/.test(lower)) {
    return "This generated change was cancelled."
  }
  if (/\b(usage limit|rate limit|quota|billing)\b/.test(lower)) {
    return "Agent usage limit reached"
  }
  if (/\b(auth|authentication|api key|sign in|login|permission denied)\b/.test(lower)) {
    return "Agent sign-in needed"
  }
  if (/\b(timeout|timed out)\b/.test(lower)) {
    return "Agent timed out"
  }
  if (
    /\b(bash|stderr|stdout|test|lint|check|validat|render|export)\b/.test(lower)
  ) {
    return "Project check failed"
  }
  if (
    lower.includes("agent run failed") ||
    lower.includes("agent run ended with status") ||
    isUnsafeAgentRuntimeDefaultCopy(compact)
  ) {
    return "Agent needs attention"
  }

  return compact
}

export function isUnsafeAgentRuntimeDefaultCopy(value: string): boolean {
  const compact = value.replace(/\s+/g, " ").trim()
  if (!compact) return false
  const lower = compact.toLowerCase()
  return (
    /\b(bash|edit|write|mcp|provider|providerid|codex|claude|stdout|stderr)\b/i.test(compact) ||
    /(^|\s)(bun|npm|pnpm|yarn|node|python|python3|git|rg|grep|sed|cat|curl|cd|rm|mkdir|ls|find|awk|tail|head)\s/.test(lower) ||
    /(^|\s)\/(users|private|tmp)\//i.test(compact) ||
    /(^|\s)(src|docs|test)\//i.test(compact) ||
    lower.includes(" --") ||
    lower.includes(" && ") ||
    lower.includes(" || ") ||
    /^[\[{]\s*["{\[]/.test(compact)
  )
}

function technicalAgentRuntimeLine(value: string): string | null {
  if (!isUnsafeAgentRuntimeDefaultCopy(value)) return null
  const lower = value.toLowerCase()
  if (lower.includes("ripple frame-sheet")) return "Checking frame sheet"
  if (lower.includes("ripple snapshot")) return "Checking current frame"
  if (lower.includes("hyperframes render") || /\brender\b/.test(lower)) return "Rendering preview"
  if (lower.includes("export")) return "Preparing export"
  if (
    /\bbash\b/i.test(value) ||
    lower.includes("git diff") ||
    lower.includes("hyperframes lint") ||
    lower.includes("hyperframes check") ||
    lower.includes("bun test") ||
    lower.includes("npm test") ||
    /\b(test|lint|check|validat)\b/.test(lower)
  ) {
    return "Checking project"
  }
  if (/\b(edit|write)\b/i.test(value)) return "Updating composition"
  if (/\b(read|grep|glob|rg|sed|cat|ls|find|tail|head)\b/.test(lower)) return "Explored project"
  return "Working on project"
}

export function truncateAgentRuntimeString(value: string, max = 600): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}...`
}

export function formatAgentRuntimeJson(value: unknown): string {
  if (typeof value === "string") return truncateAgentRuntimeString(value)
  try {
    return truncateAgentRuntimeString(JSON.stringify(value, null, 2))
  } catch {
    return truncateAgentRuntimeString(String(value))
  }
}

export function agentRuntimeBasename(path: unknown): string | null {
  const value = compactAgentRuntimeString(path)
  if (!value) return null
  const normalized = value.replaceAll("\\", "/")
  const name = normalized.split("/").filter(Boolean).pop()
  return name ?? value
}

export function pluralAgentRuntimeCount(
  count: number,
  singular: string,
  pluralValue = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : pluralValue}`
}

export function agentRuntimePartId(
  part: AgentRuntimeSummaryPart,
  index: number,
  prefix: string,
): string {
  return compactAgentRuntimeString(part.id) ||
    compactAgentRuntimeString(part.toolCallId) ||
    `${prefix}-${index}`
}

export function agentRuntimeProviderRefsFromPart(
  part: AgentRuntimeSummaryPart,
): AgentRuntimeProviderRefs[] {
  if (Array.isArray(part.providerRefs)) {
    return part.providerRefs.filter(isAgentRuntimeRecord) as AgentRuntimeProviderRefs[]
  }
  const direct = isAgentRuntimeRecord(part.providerRefs)
    ? [part.providerRefs as AgentRuntimeProviderRefs]
    : []
  const dataRefs = isAgentRuntimeRecord(part.data?.providerRefs)
    ? [part.data.providerRefs as AgentRuntimeProviderRefs]
    : []
  const payloadRefs = isAgentRuntimeRecord(part.data?.payload?.providerRefs)
    ? [part.data.payload.providerRefs as AgentRuntimeProviderRefs]
    : []
  return [...direct, ...dataRefs, ...payloadRefs]
}

export function agentRuntimePartStatus(
  part: AgentRuntimeSummaryPart,
  options: { allowPending?: boolean } = {},
): AgentRuntimeSummaryStatus {
  const summaryStatus = agentRuntimeSummaryFromPart(part)?.status
  if (summaryStatus === "error") return "error"
  if (summaryStatus === "pending") {
    return options.allowPending === false ? "done" : "pending"
  }
  const state = compactAgentRuntimeString(part.state)?.toLowerCase()
  if (state?.includes("error")) return "error"
  const runtimeStatus = compactAgentRuntimeString(part.data?.payload?.status)?.toLowerCase() ??
    compactAgentRuntimeString(part.data?.status)?.toLowerCase()
  const runtimeKind = compactAgentRuntimeString(part.data?.payload?.kind)?.toLowerCase()
  const isPendingState =
    state === "input-streaming" ||
    state === "input-available" ||
    state === "streaming" ||
    state === "pending" ||
    runtimeStatus === "running" ||
    runtimeStatus === "pending" ||
    runtimeStatus === "awaiting_approval" ||
    (part.type === "data-agent-runtime" && (runtimeKind === "thinking" || runtimeKind === "preparing"))
  if (isPendingState || part.preliminary === true) {
    return options.allowPending === false ? "done" : "pending"
  }
  return "done"
}

export function agentRuntimeCommandForPart(part: AgentRuntimeSummaryPart): string | null {
  const input = isAgentRuntimeRecord(part.input) ? part.input : {}
  const command = input.command ?? part.command
  if (Array.isArray(command)) {
    return command.map(String).join(" ")
  }
  return compactAgentRuntimeString(command)
}

export function isAgentRuntimeMcpToolPart(part: AgentRuntimeSummaryPart): boolean {
  const type = compactAgentRuntimeString(part.type) ?? ""
  const toolName = compactAgentRuntimeString(part.toolName) ?? ""
  return type.startsWith("tool-mcp__") || toolName.startsWith("mcp__")
}

export function isAgentRuntimeVisualCommand(command: string | null): boolean {
  return Boolean(command && /\bripple\s+(snapshot|frame-sheet)\b/.test(command))
}

export function isAgentRuntimeProjectInspectionCommand(command: string | null): boolean {
  if (!command) return false
  if (isAgentRuntimeVisualCommand(command)) return false
  const normalized = command.toLowerCase()
  return /\b(ls|sed|cat|rg|grep|find|head|tail|awk)\b/.test(normalized)
}

export function isAgentRuntimeChangeReviewCommand(command: string | null): boolean {
  return Boolean(command && /\bgit\s+diff\b/.test(command.toLowerCase()))
}

export function agentRuntimeVisualToolKind(
  part: AgentRuntimeSummaryPart,
): AgentRuntimeVisualKind | null {
  const type = compactAgentRuntimeString(part.type)?.replace(/^tool-/, "") ?? ""
  const toolName = compactAgentRuntimeString(part.toolName) ?? ""
  const command = agentRuntimeCommandForPart(part)

  if (isAgentRuntimeVisualCommand(command)) {
    return command?.includes("frame-sheet") ? "frame_sheet" : "snapshot"
  }

  const fromType = visualKindFromText(type)
  if (
    fromType &&
    (
      type.includes("ripple_visual_context") ||
      type.startsWith("ripple_") ||
      type === "snapshot" ||
      type === "frame_sheet"
    )
  ) {
    return fromType
  }

  const fromToolName = visualKindFromText(toolName)
  if (
    fromToolName &&
    (
      toolName.includes("ripple_visual_context") ||
      toolName.startsWith("ripple_") ||
      toolName === "snapshot" ||
      toolName === "frame_sheet"
    )
  ) {
    return fromToolName
  }

  return null
}

export function classifyAgentRuntimeSummaryPart(
  part: AgentRuntimeSummaryPart,
): AgentRuntimeSummaryKind {
  if (part.type === "reasoning" || part.type === "tool-Thinking") return "thinking"
  if (agentRuntimeVisualToolKind(part)) return "visual_context"
  if (part.type === "tool-Edit" || part.type === "tool-Write") return "motion_edit"
  if (part.type === "tool-Bash") {
    const command = agentRuntimeCommandForPart(part)
    if (isAgentRuntimeProjectInspectionCommand(command)) return "project_inspection"
    return "verification"
  }
  if (
    part.type === "tool-Read" ||
    part.type === "tool-Grep" ||
    part.type === "tool-Glob" ||
    part.type === "tool-WebSearch" ||
    part.type === "tool-WebFetch"
  ) {
    return "project_inspection"
  }
  if (part.type === "data-agent-runtime") {
    if (part.data?.kind === "file_change") return "motion_edit"
    if (part.data?.kind === "approval") return "approval"
    return "status"
  }
  if (part.type === "text") return "assistant_text"
  return "project_tool"
}

export function agentRuntimeSummaryPartFromEvent(
  event: AgentRuntimeSummaryEventLike,
  payload: Record<string, unknown> = event.payload ?? {},
): AgentRuntimeSummaryPart | null {
  const toolName = compactAgentRuntimeString(payload.toolName) ??
    compactAgentRuntimeString(payload.tool)
  const toolCallId = compactAgentRuntimeString(payload.toolCallId) ??
    compactAgentRuntimeString(payload.id) ??
    compactAgentRuntimeString(payload.itemId)
  const state = event.type === "tool_start" || event.type === "tool_update"
    ? "input-available"
    : event.type === "tool_end"
      ? isAgentRuntimeFailedEventPayload(payload) ? "output-error" : "output-available"
      : undefined
  const input = isAgentRuntimeRecord(payload.input)
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
      toolCallId: toolCallId ?? `${event.type ?? "event"}-${toolName}`,
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
        label: "Updated composition",
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

  if (event.type === "assistant_text_delta" || event.type === "assistant_message") {
    return {
      type: "text",
      text: payload.delta ?? payload.text,
    }
  }

  if (event.type === "status") {
    const label = compactAgentRuntimeString(payload.label) ??
      compactAgentRuntimeString(payload.message)
    if (!label) return null
    return {
      type: "data-agent-runtime",
      data: {
        kind: "status",
        label,
        payload,
      },
    }
  }

  return null
}

function parseAgentRuntimeEventPayload(
  event: AgentRuntimeSummaryEventLike,
): Record<string, unknown> {
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

function latestActivityPayloadLine(payload: Record<string, unknown>): string | null {
  if (payload.capabilities && typeof payload.capabilities === "object") return null
  if (payload.sessionInit && typeof payload.sessionInit === "object") return null

  const label = compactAgentRuntimeString(payload.label) ??
    compactAgentRuntimeString(payload.message)
  if (
    label?.startsWith("Loaded Codex context") ||
    label?.startsWith("Loaded Claude context") ||
    label === "Codex session ready" ||
    label === "Claude session ready"
  ) {
    return null
  }

  if (label) return designerFacingAgentRuntimeLine(label)

  const kind = compactAgentRuntimeString(payload.kind)?.toLowerCase()
  return kind ? LATEST_ACTIVITY_KIND_LINES.get(kind) ?? null : null
}

function signalTextForAgentRuntimeEvent(
  event: AgentRuntimeSummaryEventLike,
  payload: Record<string, unknown>,
): string {
  return [
    event.type,
    event.providerType,
    payload.toolName,
    payload.tool,
    payload.server,
    payload.action,
    payload.title,
    payload.label,
    payload.message,
  ]
    .map(compactAgentRuntimeString)
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
}

function latestToolFallbackLine(
  event: AgentRuntimeSummaryEventLike,
  payload: Record<string, unknown>,
): string | null {
  const signal = signalTextForAgentRuntimeEvent(event, payload)
  if (!signal) return null
  if (/\b(approval|askuserquestion|elicitation)\b/.test(signal)) return "Approval needed"
  if (/\b(filechange|file_change|files_persisted|diff\/updated|edit|write|multiedit)\b/.test(signal)) {
    return "Updating composition"
  }
  if (/\b(frame|snapshot|screenshot|imageview|viewimage|visual)\b/.test(signal)) {
    return signal.includes("sheet") ? "Checking frame sheet" : "Checking current frame"
  }
  if (/\b(export)\b/.test(signal)) return "Preparing export"
  if (/\b(render)\b/.test(signal)) return "Rendering preview"
  if (/\b(commandexecution|bash|shell|terminal|lint|check|test|validat)\b/.test(signal)) {
    return "Checking project"
  }
  if (/\b(read|grep|glob|rg|search|find|sed|cat|ls|list|websearch|webfetch)\b/.test(signal)) {
    return "Explored project"
  }
  return "Working on project"
}

function isAgentRuntimeFailedEventPayload(payload: Record<string, unknown>): boolean {
  const status = compactAgentRuntimeString(payload.status)?.toLowerCase()
  return Boolean(payload.error) ||
    status === "failed" ||
    status === "error" ||
    status === "declined"
}

export function latestAgentRuntimeActivityLine(
  events: AgentRuntimeSummaryEventLike[],
): string | null {
  for (const event of [...events].reverse()) {
    const payload = parseAgentRuntimeEventPayload(event)

    if (event.type === "activity") {
      const activityLine = latestActivityPayloadLine(payload)
      if (activityLine) return activityLine
      continue
    }

    const directLine = event.type ? LATEST_DIRECT_ACTIVITY_LINES.get(event.type) : null
    if (directLine) return directLine

    if (event.type !== "status") {
      const summaryPart = agentRuntimeSummaryPartFromEvent(event, payload)
      if (summaryPart) return titleForAgentRuntimeSummaryPart(summaryPart)
    }

    if (
      event.type === "tool_start" ||
      event.type === "tool_update" ||
      event.type === "tool_end"
    ) {
      const fallbackLine = latestToolFallbackLine(event, payload)
      if (fallbackLine) return fallbackLine
    }

    if (event.type === "status") {
      const labelLine = latestActivityPayloadLine(payload)
      if (labelLine) return labelLine

      const status = compactAgentRuntimeString(payload.status)?.toLowerCase()
      const statusLine = status ? LATEST_STATUS_ACTIVITY_LINES.get(status) : null
      if (statusLine) return statusLine
    }
  }

  return null
}

export function titleForAgentRuntimeSummaryPart(
  part: AgentRuntimeSummaryPart,
  status = agentRuntimePartStatus(part),
): string {
  const kind = classifyAgentRuntimeSummaryPart(part)
  switch (kind) {
    case "thinking":
      return "Thinking"
    case "visual_context": {
      const visualKind = agentRuntimeVisualToolKind(part)
      if (visualKind === "frame_sheet") {
        if (status === "error") return "Frame sheet check failed"
        return status === "pending" ? "Checking frame sheet" : "Checked frame sheet"
      }
      if (status === "error") return "Current-frame check failed"
      return status === "pending" ? "Checking current frame" : "Checked current frame"
    }
    case "motion_edit":
      if (status === "error") return "Composition update failed"
      return status === "pending" ? "Updating composition" : "Updated composition"
    case "verification": {
      const command = agentRuntimeCommandForPart(part)?.toLowerCase() ?? ""
      if (status === "error") {
        if (isAgentRuntimeChangeReviewCommand(command)) return "Change check failed"
        if (/\bexport\b/.test(command)) return "Export failed"
        if (/\brender\b/.test(command)) return "Preview render failed"
        return "Project check failed"
      }
      if (isAgentRuntimeChangeReviewCommand(command)) {
        return status === "pending" ? "Checking changes" : "Checked changes"
      }
      if (/\bexport\b/.test(command)) return status === "pending" ? "Preparing export" : "Prepared export"
      if (/\brender\b/.test(command)) return status === "pending" ? "Rendering preview" : "Rendered preview"
      return status === "pending" ? "Checking project" : "Checked project"
    }
    case "approval":
      return "Approval needed"
    case "status":
      return designerFacingAgentRuntimeLine(
        compactAgentRuntimeString(part.data?.label) ??
          compactAgentRuntimeString(part.data?.payload?.label) ??
          "Working",
      )
    case "project_inspection":
      if (status === "error") return "Project check failed"
      return status === "pending" ? "Exploring project" : "Explored project"
    case "assistant_text":
      return "Response"
    default:
      if (status === "error") return "Project operation failed"
      return status === "pending" ? "Working on project" : "Updated project"
  }
}

export function summarizeAgentRuntimePart(
  part: AgentRuntimeSummaryPart,
  index = 0,
): AgentRuntimeProductSummary {
  const status = agentRuntimePartStatus(part)
  const kind = classifyAgentRuntimeSummaryPart(part)
  return {
    id: agentRuntimePartId(part, index, "runtime-summary"),
    kind,
    status,
    title: titleForAgentRuntimeSummaryPart(part, status),
    providerRefs: agentRuntimeProviderRefsFromPart(part),
  }
}

function visualKindFromText(value: string): AgentRuntimeVisualKind | null {
  const normalized = value.toLowerCase().replaceAll("-", "_")
  if (normalized.includes("frame_sheet") || normalized.includes("framesheet")) {
    return "frame_sheet"
  }
  if (normalized.includes("snapshot")) return "snapshot"
  return null
}
