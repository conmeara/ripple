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

const ACTIVITY_CLASSIFICATION_RULES: Array<{
  kind: AgentRunActivityKind
  signals: readonly string[]
}> = [
  {
    kind: "waiting",
    signals: ["approval", "askuserquestion", "elicitation"],
  },
  {
    kind: "thinking",
    signals: ["todowrite", "todo", "plan"],
  },
  {
    kind: "editing",
    signals: [
      "filechange",
      "file_change",
      "files_persisted",
      "diff/updated",
      " edit",
      "multiedit",
      "write",
    ],
  },
  {
    kind: "checking",
    signals: ["commandexecution", "bash", "shell", "terminal"],
  },
  {
    kind: "searching",
    signals: [
      "websearch",
      "webfetch",
      "fetch",
      "browser",
      "search",
      "lookup",
      "look up",
      "find",
    ],
  },
  {
    kind: "reviewing",
    signals: ["imageview", "viewimage", "screenshot", "frame", "visual"],
  },
  {
    kind: "preparing",
    signals: ["compact", "prepar"],
  },
  {
    kind: "reading",
    signals: [
      "skill",
      "instruction",
      "docs",
      "read",
      "grep",
      "glob",
      " ls",
      "list",
      "open",
      "context",
    ],
  },
  {
    kind: "writing",
    signals: ["assistant", "text_delta", "message"],
  },
  {
    kind: "thinking",
    signals: ["reasoning", "thinking", "plan"],
  },
]

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

function includesAny(text: string, signals: readonly string[]): boolean {
  return signals.some((signal) => text.includes(signal))
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
  return ACTIVITY_CLASSIFICATION_RULES.find((rule) =>
    includesAny(text, rule.signals)
  )?.kind ?? "tooling"
}

export function buildAgentRunActivityEvent(input: {
  eventType?: string | null
  providerType?: string | null
  providerId?: string | null
  payload?: Record<string, unknown> | null
  kind?: AgentRunActivityKind | null
  label?: unknown
  source?: string
  refs?: AgentRunEventInput["refs"]
}): AgentRunEventInput {
  const kind = classifyAgentRunActivity(input)
  const label = safeActivityLabel(input.label) ?? DEFAULT_ACTIVITY_LABELS[kind]
  return {
    type: "activity",
    providerType: input.providerType,
    providerId: input.providerId,
    refs: input.refs,
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
