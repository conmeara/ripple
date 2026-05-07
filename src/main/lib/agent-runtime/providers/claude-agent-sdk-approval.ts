import type {
  AgentProviderApprovalDecision,
  AgentProviderApprovalKind,
  AgentProviderApprovalRequestInput,
} from "../types"

const CLAUDE_AUTO_ALLOWED_VISUAL_CONTEXT =
  /^ripple\s+(?:snapshot|frame-sheet)(?:\s|$)/
const SHELL_CONTROL_CHARS = new Set([";", "&", "|", "<", ">", "\n", "\r"])

type ClaudePermissionOptions = {
  signal?: AbortSignal
  suggestions?: unknown[]
  blockedPath?: string
  decisionReason?: string
  title?: string
  displayName?: string
  description?: string
  toolUseID: string
  agentID?: string
}

type ClaudeElicitationRequest = {
  serverName: string
  message: string
  mode?: "form" | "url"
  url?: string
  elicitationId?: string
  requestedSchema?: Record<string, unknown>
  title?: string
  displayName?: string
  description?: string
}

type McpElicitationResult = {
  action: "accept" | "decline" | "cancel"
  content?: Record<string, string | number | boolean | string[]>
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function commandFromToolInput(input: Record<string, unknown>): string | null {
  return (
    stringValue(input.command) ||
    stringValue(input.cmd) ||
    stringValue(input.bash_command) ||
    null
  )
}

function hasShellControlOperator(command: string): boolean {
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    const next = command[index + 1]

    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }
    if (char === "\"" && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }
    if (!inSingleQuote && char === "`") return true
    if (!inSingleQuote && char === "$" && next === "(") return true
    if (!inSingleQuote && !inDoubleQuote && SHELL_CONTROL_CHARS.has(char)) {
      return true
    }
  }

  return false
}

export function isRippleClaudeAutoAllowedTool(
  toolName: string,
  toolInput: Record<string, unknown>,
): boolean {
  if (toolName !== "Bash") return false
  const command = commandFromToolInput(toolInput)
  if (!command || hasShellControlOperator(command)) return false
  return CLAUDE_AUTO_ALLOWED_VISUAL_CONTEXT.test(command)
}

function looksNetworkRelated(
  toolName: string,
  input: Record<string, unknown>,
  options: ClaudePermissionOptions,
): boolean {
  if (toolName === "WebFetch" || toolName === "WebSearch") return true
  const haystack = [
    options.title,
    options.description,
    options.decisionReason,
    commandFromToolInput(input),
  ].filter(Boolean).join("\n")
  return /\b(network|internet|web|fetch|url|https?:\/\/)\b/i.test(haystack)
}

function approvalKindForClaudeTool(
  toolName: string,
  input: Record<string, unknown>,
  options: ClaudePermissionOptions,
): AgentProviderApprovalKind {
  if (toolName === "AskUserQuestion") return "question"
  if (looksNetworkRelated(toolName, input, options)) return "network"
  if (toolName === "Bash") return "command"
  if (
    toolName === "Edit" ||
    toolName === "MultiEdit" ||
    toolName === "Write" ||
    toolName === "NotebookEdit"
  ) {
    return "file_change"
  }
  return "tool"
}

function promptForClaudeTool(
  toolName: string,
  input: Record<string, unknown>,
  options: ClaudePermissionOptions,
): string {
  return (
    stringValue(options.title) ||
    stringValue(options.description) ||
    stringValue(options.displayName) ||
    (toolName === "Bash" && commandFromToolInput(input)
      ? `Claude wants to run: ${commandFromToolInput(input)}`
      : null) ||
    `Claude wants to use ${toolName}.`
  )
}

export function buildClaudeToolApprovalRequest(input: {
  toolName: string
  toolInput: Record<string, unknown>
  options: ClaudePermissionOptions
}): AgentProviderApprovalRequestInput {
  const kind = approvalKindForClaudeTool(
    input.toolName,
    input.toolInput,
    input.options,
  )
  const command = commandFromToolInput(input.toolInput)
  return {
    providerRequestId: input.options.toolUseID,
    kind,
    prompt: promptForClaudeTool(input.toolName, input.toolInput, input.options),
    providerType: "claude:canUseTool",
    providerId: input.options.toolUseID,
    details: {
      providerName: "Claude",
      toolName: input.toolName,
      input: input.toolInput,
      toolUseID: input.options.toolUseID,
      agentID: input.options.agentID,
      blockedPath: input.options.blockedPath,
      decisionReason: input.options.decisionReason,
      title: input.options.title,
      displayName: input.options.displayName,
      description: input.options.description,
      suggestions: input.options.suggestions,
    },
    payload: {
      providerName: "Claude",
      kind: kind === "question" ? "user_input" : kind,
      toolName: input.toolName,
      input: input.toolInput,
      questions: input.toolName === "AskUserQuestion"
        ? input.toolInput.questions
        : undefined,
      command,
      toolUseID: input.options.toolUseID,
      blockedPath: input.options.blockedPath,
      reason: input.options.decisionReason ?? input.options.description,
      title: input.options.title,
      displayName: input.options.displayName,
      description: input.options.description,
      decision: "pending",
      canApprove: true,
    },
  }
}

function schemaProperties(schema: unknown): Record<string, any> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return {}
  const properties = (schema as Record<string, any>).properties
  return properties && typeof properties === "object" && !Array.isArray(properties)
    ? properties
    : {}
}

function schemaRequiredFields(schema: unknown): Set<string> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return new Set()
  const required = (schema as Record<string, any>).required
  return new Set(Array.isArray(required)
    ? required.filter((item): item is string => typeof item === "string")
    : [])
}

function questionsFromSchema(schema: unknown): Array<Record<string, unknown>> {
  const properties = schemaProperties(schema)
  const required = schemaRequiredFields(schema)
  return Object.entries(properties).map(([id, property]) => {
    const prop = property && typeof property === "object" && !Array.isArray(property)
      ? property as Record<string, any>
      : {}
    const options = Array.isArray(prop.enum)
      ? prop.enum.map((value) => ({ label: String(value) }))
      : prop.type === "boolean"
        ? [{ label: "true" }, { label: "false" }]
        : []
    const title = stringValue(prop.title)
    const description = stringValue(prop.description)
    return {
      id,
      header: title ?? id,
      question: description ?? title ?? id,
      isSecret: prop.format === "password" || prop.writeOnly === true,
      required: required.has(id),
      options,
    }
  })
}

export function buildClaudeElicitationApprovalRequest(
  request: ClaudeElicitationRequest,
): AgentProviderApprovalRequestInput {
  const providerRequestId =
    request.elicitationId ||
    `elicitation:${request.serverName}:${request.message}`
  const questions = request.mode === "form"
    ? questionsFromSchema(request.requestedSchema)
    : []
  return {
    providerRequestId,
    kind: "question",
    prompt:
      stringValue(request.title) ||
      stringValue(request.description) ||
      stringValue(request.message) ||
      `${request.serverName} asked for input.`,
    providerType: "claude:onElicitation",
    providerId: providerRequestId,
    details: {
      providerName: "Claude",
      serverName: request.serverName,
      message: request.message,
      mode: request.mode,
      url: request.url,
      elicitationId: request.elicitationId,
      requestedSchema: request.requestedSchema,
      title: request.title,
      displayName: request.displayName,
      description: request.description,
      questions,
    },
    payload: {
      providerName: "Claude",
      kind: request.mode === "url" ? "network" : "user_input",
      serverName: request.serverName,
      message: request.message,
      mode: request.mode,
      url: request.url,
      title: request.title,
      displayName: request.displayName,
      description: request.description,
      questions,
      decision: "pending",
      canApprove: true,
    },
  }
}

function coerceElicitationValue(value: unknown, schema: Record<string, any>): string | number | boolean | string[] | null {
  if (schema.type === "boolean") {
    if (typeof value === "boolean") return value
    if (typeof value === "string") {
      if (value.toLowerCase() === "true") return true
      if (value.toLowerCase() === "false") return false
    }
  }
  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  if (schema.type === "array") {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item))
        .filter((item) => item.length > 0)
    }
    if (typeof value === "string") {
      return value.split(",").map((item) => item.trim()).filter(Boolean)
    }
  }
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return value
  return null
}

export function buildClaudeElicitationResult(input: {
  request: ClaudeElicitationRequest
  approval: AgentProviderApprovalDecision
}): McpElicitationResult {
  if (!input.approval.approved) return { action: "decline" }
  if (input.request.mode !== "form") return { action: "accept" }

  const response = input.approval.response ?? {}
  const rawAnswers =
    response.content && typeof response.content === "object" && !Array.isArray(response.content)
      ? response.content as Record<string, unknown>
      : response.answers && typeof response.answers === "object" && !Array.isArray(response.answers)
        ? response.answers as Record<string, unknown>
        : {}
  const properties = schemaProperties(input.request.requestedSchema)
  const content: Record<string, string | number | boolean | string[]> = {}
  for (const [key, property] of Object.entries(properties)) {
    if (!(key in rawAnswers)) continue
    const schema = property && typeof property === "object" && !Array.isArray(property)
      ? property as Record<string, any>
      : {}
    const value = coerceElicitationValue(rawAnswers[key], schema)
    if (value !== null) content[key] = value
  }
  return { action: "accept", content }
}
