import type {
  AgentRunActivityKind,
  AgentRunActivityPayload,
  AgentRunEventInput,
} from "./types"

const ACTIVITY_KIND_SET = new Set<AgentRunActivityKind>([
  "thinking",
  "preparing",
  "reviewing",
  "checking",
  "editing",
  "searching",
  "reading",
  "tooling",
  "writing",
  "waiting",
])

const DEFAULT_ACTIVITY_LABELS: Record<AgentRunActivityKind, string> = {
  thinking: "Agent is thinking",
  preparing: "Preparing the composition",
  reviewing: "Reviewing the frame",
  checking: "Checking the project",
  editing: "Editing files",
  searching: "Looking up reference",
  reading: "Reading context",
  tooling: "Using a project tool",
  writing: "Writing a response",
  waiting: "Waiting for approval",
}

function compactString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const compact = value.replace(/\s+/g, " ").trim()
  if (!compact) return null
  return compact.length <= 90 ? compact : `${compact.slice(0, 87).trimEnd()}...`
}

function isRawTechnicalLabel(label: string): boolean {
  const lower = label.toLowerCase()
  return (
    /(^|\s)(bun|npm|pnpm|yarn|node|python|python3|git|rg|grep|sed|cat|curl|cd|rm|mkdir)\s/.test(lower) ||
    lower.includes(" --") ||
    lower.includes(" && ") ||
    lower.includes(" || ") ||
    /(^|\s)(\/users\/|\/tmp\/|\.\/|\.\.\/|src\/|docs\/|test\/)/.test(lower)
  )
}

function safeActivityLabel(value: unknown): string | null {
  const label = compactString(value)
  if (!label) return null
  return isRawTechnicalLabel(label) ? null : label
}

function normalizeActivityKind(value: unknown): AgentRunActivityKind | null {
  if (typeof value !== "string") return null
  return ACTIVITY_KIND_SET.has(value as AgentRunActivityKind)
    ? value as AgentRunActivityKind
    : null
}

function textFromSignal(input: {
  eventType?: string | null
  providerType?: string | null
  payload?: Record<string, unknown> | null
}): string {
  const payload = input.payload ?? {}
  const parts = [
    input.eventType,
    input.providerType,
    payload.toolName,
    payload.tool,
    payload.server,
    payload.action,
    payload.title,
    payload.label,
    payload.message,
  ]
    .map(compactString)
    .filter((part): part is string => Boolean(part))
  return parts.join(" ").toLowerCase()
}

export function normalizeAgentRunActivityPayload(
  payload: Record<string, unknown> | null | undefined,
): AgentRunActivityPayload | null {
  if (!payload || typeof payload !== "object") return null
  const kind = normalizeActivityKind(payload.kind)
  if (!kind) return null
  return {
    kind,
    label: safeActivityLabel(payload.label) ?? DEFAULT_ACTIVITY_LABELS[kind],
    ...(typeof payload.source === "string" && payload.source.trim()
      ? { source: payload.source.trim() }
      : {}),
  }
}

export function classifyAgentRunActivity(input: {
  eventType?: string | null
  providerType?: string | null
  payload?: Record<string, unknown> | null
  kind?: AgentRunActivityKind | null
}): AgentRunActivityKind {
  if (input.kind) return input.kind
  const text = textFromSignal(input)

  if (
    text.includes("approval") ||
    text.includes("askuserquestion") ||
    text.includes("elicitation")
  ) {
    return "waiting"
  }
  if (
    text.includes("todowrite") ||
    text.includes("todo") ||
    text.includes("plan")
  ) {
    return "thinking"
  }
  if (
    text.includes("filechange") ||
    text.includes("file_change") ||
    text.includes("files_persisted") ||
    text.includes("diff/updated") ||
    text.includes(" edit") ||
    text.includes("multiedit") ||
    text.includes("write")
  ) {
    return "editing"
  }
  if (
    text.includes("commandexecution") ||
    text.includes("bash") ||
    text.includes("shell") ||
    text.includes("terminal")
  ) {
    return "checking"
  }
  if (
    text.includes("websearch") ||
    text.includes("webfetch") ||
    text.includes("fetch") ||
    text.includes("browser") ||
    text.includes("search") ||
    text.includes("lookup") ||
    text.includes("look up") ||
    text.includes("find")
  ) {
    return "searching"
  }
  if (
    text.includes("imageview") ||
    text.includes("viewimage") ||
    text.includes("screenshot") ||
    text.includes("frame") ||
    text.includes("visual")
  ) {
    return "reviewing"
  }
  if (
    text.includes("compact") ||
    text.includes("prepar")
  ) {
    return "preparing"
  }
  if (
    text.includes("skill") ||
    text.includes("instruction") ||
    text.includes("docs") ||
    text.includes("read") ||
    text.includes("grep") ||
    text.includes("glob") ||
    text.includes(" ls") ||
    text.includes("list") ||
    text.includes("open") ||
    text.includes("context")
  ) {
    return "reading"
  }
  if (
    text.includes("assistant") ||
    text.includes("text_delta") ||
    text.includes("message")
  ) {
    return "writing"
  }
  if (
    text.includes("reasoning") ||
    text.includes("thinking") ||
    text.includes("plan")
  ) {
    return "thinking"
  }
  return "tooling"
}

export function buildAgentRunActivityEvent(input: {
  eventType?: string | null
  providerType?: string | null
  providerId?: string | null
  payload?: Record<string, unknown> | null
  kind?: AgentRunActivityKind | null
  label?: unknown
  source?: string
}): AgentRunEventInput {
  const kind = classifyAgentRunActivity(input)
  const label = safeActivityLabel(input.label) ?? DEFAULT_ACTIVITY_LABELS[kind]
  return {
    type: "activity",
    providerType: input.providerType,
    providerId: input.providerId,
    payload: {
      kind,
      label,
      ...(input.source ? { source: input.source } : {}),
    },
  }
}

export function buildProviderSummaryActivityEvent(input: {
  providerType?: string | null
  providerId?: string | null
  summary?: unknown
  source?: string
}): AgentRunEventInput | null {
  const label = safeActivityLabel(input.summary)
  if (!label) return null
  return buildAgentRunActivityEvent({
    eventType: "status",
    providerType: input.providerType,
    providerId: input.providerId,
    payload: { label },
    label,
    source: input.source,
  })
}
