type AnyRecord = Record<string, any>

export type RuntimeEventLike = {
  id?: string
  type?: string
  providerId?: string | null
  providerType?: string | null
  payloadJson?: string | null
  payload?: Record<string, unknown> | null
}

export type UIMessageChunkLike = Record<string, any>

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null
}

export function parseRuntimeEventPayload(
  event: RuntimeEventLike,
): Record<string, unknown> {
  if (event.payload && typeof event.payload === "object") return event.payload
  if (!event.payloadJson) return {}
  try {
    const parsed = JSON.parse(event.payloadJson)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function compactLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function stableEventId(prefix: string, event: RuntimeEventLike): string {
  return `${prefix}-${event.providerId || event.id || Math.random().toString(36).slice(2)}`
}

function normalizeMcpToolName(payload: Record<string, unknown>): string | null {
  const server = compactLabel(payload.server)
  const tool = compactLabel(payload.tool)
  if (server && tool) {
    return `mcp__${server}__${tool.replaceAll("/", "__")}`
  }

  const toolName = compactLabel(payload.toolName)
  if (!toolName) return null
  if (toolName.includes("/") && !toolName.startsWith("Tool:")) {
    const [serverName, ...toolNameParts] = toolName.split("/")
    const normalizedTool = toolNameParts.join("__").replaceAll("/", "__")
    if (serverName && normalizedTool) return `mcp__${serverName}__${normalizedTool}`
  }
  return null
}

function toolNameFromPayload(
  event: RuntimeEventLike,
  payload: Record<string, unknown>,
): string {
  const mcpName = normalizeMcpToolName(payload)
  if (mcpName) return mcpName

  const rawToolName = compactLabel(payload.toolName) || compactLabel(payload.tool)
  if (rawToolName) {
    if (rawToolName === "commandExecution") return "Bash"
    if (rawToolName === "fileChange") return fileToolName(payload)
    if (rawToolName === "webSearch") return "WebSearch"
    if (rawToolName === "imageView") return "Read"
    return rawToolName
  }

  const providerType = event.providerType || ""
  if (providerType.includes("commandExecution")) return "Bash"
  if (providerType.includes("fileChange")) return fileToolName(payload)
  if (providerType.includes("mcpToolCall")) return mcpName ?? "Tool"
  if (providerType.includes("webSearch")) return "WebSearch"
  return "AgentTool"
}

function fileToolName(payload: Record<string, unknown>): string {
  const changes = Array.isArray(payload.changes) ? payload.changes : []
  const firstChange = changes.find(isRecord)
  const kind = firstChange?.kind
  if (isRecord(kind) && kind.type === "add") return "Write"
  return "Edit"
}

function withoutKeys(input: AnyRecord, keys: string[]): AnyRecord {
  const next = { ...input }
  for (const key of keys) delete next[key]
  return next
}

function firstChange(payload: Record<string, unknown>): AnyRecord | null {
  const changes = Array.isArray(payload.changes) ? payload.changes : []
  return changes.find(isRecord) ?? null
}

function diffToStructuredPatch(diff: unknown): Array<{ lines: string[] }> | undefined {
  if (typeof diff !== "string" || diff.length === 0) return undefined
  return [{ lines: diff.split("\n") }]
}

function fileToolInput(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const change = firstChange(payload)
  const path =
    compactLabel(payload.file_path) ||
    compactLabel(payload.path) ||
    compactLabel(change?.path)
  return {
    ...withoutKeys(payload as AnyRecord, ["toolName", "output", "result"]),
    ...(path ? { file_path: path } : {}),
  }
}

function fileToolOutput(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const change = firstChange(payload)
  const structuredPatch =
    diffToStructuredPatch(change?.diff) ||
    diffToStructuredPatch(payload.diff)
  return {
    status: payload.status,
    changes: payload.changes,
    ...(structuredPatch ? { structuredPatch } : {}),
  }
}

function toolInputFor(
  toolName: string,
  payload: Record<string, unknown>,
): unknown {
  if (isRecord(payload.input)) return payload.input

  if (toolName === "Bash") {
    return {
      command: payload.command,
      cwd: payload.cwd,
      parsed_cmd: payload.parsed_cmd,
    }
  }

  if (toolName === "Edit" || toolName === "Write") {
    return fileToolInput(payload)
  }

  if (toolName.startsWith("mcp__")) {
    return isRecord(payload.arguments)
      ? payload.arguments
      : withoutKeys(payload as AnyRecord, [
          "toolName",
          "server",
          "tool",
          "status",
          "result",
          "error",
          "durationMs",
        ])
  }

  if (toolName === "Task") {
    return {
      subagent_type: payload.tool ?? "Agent",
      description: payload.prompt ?? payload.description ?? "",
    }
  }

  if (toolName === "WebSearch") {
    return { query: payload.query, action: payload.action }
  }

  if (toolName === "Compact") {
    return { status: payload.status ?? "compacting" }
  }

  return withoutKeys(payload as AnyRecord, ["toolName", "output", "result"])
}

function toolOutputFor(
  toolName: string,
  payload: Record<string, unknown>,
  accumulatedOutput?: string,
): unknown {
  if (payload.output !== undefined && !accumulatedOutput) return payload.output
  if (payload.result !== undefined && !accumulatedOutput) return payload.result

  if (toolName === "Bash") {
    const output = accumulatedOutput ?? compactLabel(payload.output) ?? ""
    return {
      stdout: output,
      output,
      stderr: payload.stderr,
      exitCode: payload.exitCode ?? payload.exit_code,
      durationMs: payload.durationMs,
    }
  }

  if (toolName === "Edit" || toolName === "Write") {
    return fileToolOutput(payload)
  }

  if (toolName.startsWith("mcp__")) {
    if (payload.error) return { error: payload.error }
    return payload.result ?? payload.message ?? payload
  }

  if (toolName === "Compact") {
    return { status: payload.status ?? "compacted", completed: true }
  }

  return payload.output ?? payload.result ?? payload
}

function toolCallIdFor(
  event: RuntimeEventLike,
  payload: Record<string, unknown>,
): string {
  return (
    compactLabel(payload.toolCallId) ||
    compactLabel(payload.tool_use_id) ||
    compactLabel(payload.callId) ||
    compactLabel(event.providerId) ||
    compactLabel(event.id) ||
    `tool-${Math.random().toString(36).slice(2)}`
  )
}

function isToolFailure(payload: Record<string, unknown>): boolean {
  if (payload.error) return true
  const status = compactLabel(payload.status)?.toLowerCase()
  return status === "failed" || status === "error" || status === "declined"
}

function shouldProjectStatusEvent(
  event: RuntimeEventLike,
  payload: Record<string, unknown>,
): boolean {
  const label = compactLabel(payload.label)
  const recovery = compactLabel(payload.recovery)

  if (event.providerType?.endsWith(":capabilities")) return false
  if (isRecord(payload.capabilities) || isRecord(payload.sessionInit)) return false
  if (label?.startsWith("Loaded Codex context")) return false
  if (label?.startsWith("Loaded Claude context")) return false

  return Boolean(label || recovery)
}

function approvalRequestLabel(payload: Record<string, unknown>): string {
  if (payload.kind === "user_input") return "Agent asked for input"
  if (payload.status === "pending") return "Approval needed"
  if (payload.status === "denied" || payload.status === "cancelled") {
    return "Request denied"
  }
  if (payload.kind === "command") return "Approved command"
  if (payload.kind === "file_change") return "Approved file change"
  return "Approved tool request"
}

export function extractRuntimeUsageMetadata(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const usage = isRecord(payload.usage) ? payload.usage : payload
  const total = isRecord(payload.total) ? payload.total : null
  const last = isRecord(payload.last) ? payload.last : null
  const tokenUsage = isRecord(payload.tokenUsage) ? payload.tokenUsage : null
  const tokenUsageTotal = isRecord(tokenUsage?.total) ? tokenUsage.total : null
  const tokenUsageLast = isRecord(tokenUsage?.last) ? tokenUsage.last : null

  const inputTokens =
    usage.inputTokens ??
    usage.input_tokens ??
    total?.inputTokens ??
    tokenUsageTotal?.inputTokens ??
    tokenUsageLast?.inputTokens
  const outputTokens =
    usage.outputTokens ??
    usage.output_tokens ??
    total?.outputTokens ??
    tokenUsageTotal?.outputTokens ??
    tokenUsageLast?.outputTokens
  const totalTokens =
    usage.totalTokens ??
    usage.total_tokens ??
    total?.totalTokens ??
    tokenUsageTotal?.totalTokens
  const cacheReadInputTokens =
    usage.cacheReadInputTokens ??
    usage.cache_read_input_tokens ??
    usage.cachedInputTokens ??
    usage.cached_input_tokens ??
    total?.cachedInputTokens ??
    tokenUsageTotal?.cachedInputTokens ??
    tokenUsageLast?.cachedInputTokens
  const cacheCreationInputTokens =
    usage.cacheCreationInputTokens ?? usage.cache_creation_input_tokens
  const reasoningTokens =
    usage.reasoningTokens ??
    usage.reasoning_output_tokens ??
    usage.reasoningOutputTokens ??
    total?.reasoningOutputTokens ??
    tokenUsageTotal?.reasoningOutputTokens ??
    tokenUsageLast?.reasoningOutputTokens

  return {
    ...(typeof inputTokens === "number" ? { inputTokens } : {}),
    ...(typeof outputTokens === "number" ? { outputTokens } : {}),
    ...(typeof totalTokens === "number"
      ? { totalTokens }
      : typeof inputTokens === "number" && typeof outputTokens === "number"
        ? { totalTokens: inputTokens + outputTokens }
        : {}),
    ...(typeof cacheReadInputTokens === "number" ? { cacheReadInputTokens } : {}),
    ...(typeof cacheCreationInputTokens === "number" ? { cacheCreationInputTokens } : {}),
    ...(typeof reasoningTokens === "number" ? { reasoningTokens } : {}),
    ...(typeof payload.modelContextWindow === "number" ? { modelContextWindow: payload.modelContextWindow } : {}),
    ...(typeof payload.totalCostUsd === "number" ? { totalCostUsd: payload.totalCostUsd } : {}),
    ...(typeof payload.total_cost_usd === "number" ? { totalCostUsd: payload.total_cost_usd } : {}),
    ...(typeof payload.durationMs === "number" ? { durationMs: payload.durationMs } : {}),
    ...(typeof payload.duration_ms === "number" ? { durationMs: payload.duration_ms } : {}),
    ...(typeof payload.subtype === "string" ? { resultSubtype: payload.subtype } : {}),
    ...(typeof payload.resultSubtype === "string" ? { resultSubtype: payload.resultSubtype } : {}),
  }
}

export class AgentRuntimeUIProjector {
  private textPartId: string | null = null
  private reasoningPartId: string | null = null
  private sawTextDelta = false
  private startedTools = new Map<string, { toolName: string; output: string }>()

  project(event: RuntimeEventLike): UIMessageChunkLike[] {
    const payload = parseRuntimeEventPayload(event)

    switch (event.type) {
      case "assistant_text_delta": {
        const delta = typeof payload.delta === "string" ? payload.delta : ""
        if (!delta) return []
        const endReasoning = this.endReasoning()
        this.sawTextDelta = true
        return [
          ...endReasoning,
          ...this.ensureTextStarted(event),
          { type: "text-delta", id: this.textPartId, delta },
        ]
      }
      case "assistant_message": {
        if (this.sawTextDelta) return []
        const text = typeof payload.text === "string" ? payload.text : ""
        if (!text) return []
        const endReasoning = this.endReasoning()
        this.sawTextDelta = true
        return [
          ...endReasoning,
          ...this.ensureTextStarted(event),
          { type: "text-delta", id: this.textPartId, delta: text },
        ]
      }
      case "reasoning": {
        const delta =
          typeof payload.delta === "string"
            ? payload.delta
            : typeof payload.text === "string"
              ? payload.text
              : ""
        if (!delta) return []
        const id = stableEventId("reasoning", event)
        const chunks: UIMessageChunkLike[] = []
        if (this.reasoningPartId && this.reasoningPartId !== id) {
          chunks.push(...this.endReasoning())
        }
        if (!this.reasoningPartId) {
          chunks.push(...this.endText())
          this.reasoningPartId = id
          chunks.push({ type: "reasoning-start", id })
        }
        chunks.push({ type: "reasoning-delta", id, delta })
        if (typeof payload.text === "string" && !payload.delta) {
          chunks.push(...this.endReasoning())
        }
        return chunks
      }
      case "tool_start":
        return this.projectToolStart(event, payload)
      case "tool_update":
        return this.projectToolUpdate(event, payload)
      case "tool_end":
        return this.projectToolEnd(event, payload)
      case "file_change":
        return [
          ...this.endText(),
          ...this.endReasoning(),
          {
            type: "data-agent-runtime",
            id: stableEventId("file-change", event),
            data: {
              kind: "file_change",
              label: "Updated proposal diff",
              payload,
            },
          },
        ]
      case "approval_request":
        return [{
          type: "data-agent-runtime",
          id: stableEventId("approval", event),
          data: {
            kind: "approval",
            label: approvalRequestLabel(payload),
            payload,
          },
        }]
      case "usage": {
        const messageMetadata = extractRuntimeUsageMetadata(payload)
        return Object.keys(messageMetadata).length > 0
          ? [{ type: "message-metadata", messageMetadata }]
          : []
      }
      case "status": {
        const label = compactLabel(payload.label)
        if (!shouldProjectStatusEvent(event, payload)) return []
        return [{
          type: "data-agent-runtime",
          id: stableEventId("status", event),
          data: {
            kind: "status",
            label: label ?? "Recovered provider thread",
            payload,
          },
        }]
      }
      case "activity":
        return []
      case "error": {
        const errorText =
          typeof payload.message === "string"
            ? payload.message
            : "The agent run failed."
        return [{ type: "error", errorText }]
      }
      default:
        return []
    }
  }

  finish(): UIMessageChunkLike[] {
    return [...this.endText(), ...this.endReasoning()]
  }

  private ensureTextStarted(event: RuntimeEventLike): UIMessageChunkLike[] {
    if (this.textPartId) return []
    this.textPartId = stableEventId("text", event)
    return [{ type: "text-start", id: this.textPartId }]
  }

  private endText(): UIMessageChunkLike[] {
    if (!this.textPartId) return []
    const id = this.textPartId
    this.textPartId = null
    return [{ type: "text-end", id }]
  }

  private endReasoning(): UIMessageChunkLike[] {
    if (!this.reasoningPartId) return []
    const id = this.reasoningPartId
    this.reasoningPartId = null
    return [{ type: "reasoning-end", id }]
  }

  private ensureToolStarted(
    event: RuntimeEventLike,
    payload: Record<string, unknown>,
  ): UIMessageChunkLike[] {
    const toolCallId = toolCallIdFor(event, payload)
    const existing = this.startedTools.get(toolCallId)
    if (existing) return []

    const toolName = toolNameFromPayload(event, payload)
    this.startedTools.set(toolCallId, { toolName, output: "" })
    return [
      ...this.endText(),
      ...this.endReasoning(),
      {
        type: "tool-input-start",
        toolCallId,
        toolName,
        providerExecuted: true,
        title: compactLabel(payload.title),
      },
    ]
  }

  private projectToolStart(
    event: RuntimeEventLike,
    payload: Record<string, unknown>,
  ): UIMessageChunkLike[] {
    const toolCallId = toolCallIdFor(event, payload)
    const toolName = toolNameFromPayload(event, payload)
    const chunks = this.ensureToolStarted(event, payload)
    if (payload.inputStreaming === true) return chunks
    return [
      ...chunks,
      {
        type: "tool-input-available",
        toolCallId,
        toolName,
        input: toolInputFor(toolName, payload),
        providerExecuted: true,
        title: compactLabel(payload.title),
      },
    ]
  }

  private projectToolUpdate(
    event: RuntimeEventLike,
    payload: Record<string, unknown>,
  ): UIMessageChunkLike[] {
    const toolCallId = toolCallIdFor(event, payload)
    const toolName = toolNameFromPayload(event, payload)
    const chunks = this.ensureToolStarted(event, payload)

    if (typeof payload.inputTextDelta === "string") {
      return [
        ...chunks,
        {
          type: "tool-input-delta",
          toolCallId,
          inputTextDelta: payload.inputTextDelta,
        },
      ]
    }

    if (payload.inputAvailable === true || payload.input !== undefined) {
      return [
        ...chunks,
        {
          type: "tool-input-available",
          toolCallId,
          toolName,
          input: toolInputFor(toolName, payload),
          providerExecuted: true,
          title: compactLabel(payload.title),
        },
      ]
    }

    const state = this.startedTools.get(toolCallId)
    if (state && typeof payload.delta === "string") {
      state.output += payload.delta
    }
    const accumulated = state?.output
    return [
      ...chunks,
      {
        type: "tool-output-available",
        toolCallId,
        output: toolOutputFor(toolName, payload, accumulated),
        providerExecuted: true,
        preliminary: true,
      },
    ]
  }

  private projectToolEnd(
    event: RuntimeEventLike,
    payload: Record<string, unknown>,
  ): UIMessageChunkLike[] {
    const toolCallId = toolCallIdFor(event, payload)
    const toolName = toolNameFromPayload(event, payload)
    const chunks = this.ensureToolStarted(event, payload)

    if (isToolFailure(payload)) {
      this.startedTools.delete(toolCallId)
      return [
        ...chunks,
        {
          type: "tool-output-error",
          toolCallId,
          errorText:
            typeof payload.error === "string"
              ? payload.error
              : "Tool execution failed.",
          providerExecuted: true,
        },
      ]
    }

    const accumulated = this.startedTools.get(toolCallId)?.output
    this.startedTools.delete(toolCallId)
    return [
      ...chunks,
      {
        type: "tool-output-available",
        toolCallId,
        output: toolOutputFor(toolName, payload, accumulated),
        providerExecuted: true,
      },
    ]
  }
}

function applyChunkToAssistantParts(
  parts: AnyRecord[],
  chunk: UIMessageChunkLike,
): void {
  if (chunk.type === "text-start") {
    parts.push({ type: "text", text: "", state: "streaming", id: chunk.id })
    return
  }
  if (chunk.type === "text-delta") {
    const part = parts.find((item) => item.id === chunk.id && item.type === "text")
    if (part) part.text += chunk.delta
    return
  }
  if (chunk.type === "text-end") {
    const part = parts.find((item) => item.id === chunk.id && item.type === "text")
    if (part) part.state = "done"
    return
  }
  if (chunk.type === "reasoning-start") {
    parts.push({ type: "reasoning", text: "", state: "streaming", id: chunk.id })
    return
  }
  if (chunk.type === "reasoning-delta") {
    const part = parts.find((item) => item.id === chunk.id && item.type === "reasoning")
    if (part) part.text += chunk.delta
    return
  }
  if (chunk.type === "reasoning-end") {
    const part = parts.find((item) => item.id === chunk.id && item.type === "reasoning")
    if (part) part.state = "done"
    return
  }
  if (chunk.type === "tool-input-start" || chunk.type === "tool-input-available") {
    const type = `tool-${chunk.toolName}`
    let part = parts.find((item) => item.toolCallId === chunk.toolCallId)
    if (!part) {
      part = {
        type,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        state: "input-streaming",
      }
      parts.push(part)
    }
    part.type = type
    part.toolName = chunk.toolName
    if (chunk.title) part.title = chunk.title
    if (chunk.type === "tool-input-available") {
      part.input = chunk.input
      part.state = "input-available"
      part.providerExecuted = chunk.providerExecuted
    }
    return
  }
  if (chunk.type === "tool-input-delta") {
    const part = parts.find((item) => item.toolCallId === chunk.toolCallId)
    if (!part) return
    part.inputText = `${typeof part.inputText === "string" ? part.inputText : ""}${chunk.inputTextDelta ?? ""}`
    part.state = "input-streaming"
    return
  }
  if (chunk.type === "tool-output-available" || chunk.type === "tool-output-error") {
    const part = parts.find((item) => item.toolCallId === chunk.toolCallId)
    if (!part) return
    if (chunk.type === "tool-output-error") {
      part.state = "output-error"
      part.errorText = chunk.errorText
      return
    }
    part.state = "output-available"
    part.output = chunk.output
    part.result = chunk.output
    part.preliminary = chunk.preliminary
    return
  }
  if (typeof chunk.type === "string" && chunk.type.startsWith("data-")) {
    parts.push({
      type: chunk.type,
      id: chunk.id,
      data: chunk.data,
    })
  }
}

export function buildAgentRuntimeAssistantProjection(input: {
  events: RuntimeEventLike[]
  messageId?: string
  metadata?: Record<string, unknown>
  fallbackText: string
}): {
  id: string
  role: "assistant"
  parts: AnyRecord[]
  metadata: Record<string, unknown>
} {
  const projector = new AgentRuntimeUIProjector()
  const parts: AnyRecord[] = []
  const metadata = { ...(input.metadata ?? {}) }

  for (const event of input.events) {
    for (const chunk of projector.project(event)) {
      if (chunk.type === "message-metadata") {
        Object.assign(metadata, chunk.messageMetadata)
      } else if (chunk.type !== "error") {
        applyChunkToAssistantParts(parts, chunk)
      }
    }
  }
  for (const chunk of projector.finish()) {
    applyChunkToAssistantParts(parts, chunk)
  }

  if (!parts.some((part) => part.type === "text" && part.text?.trim())) {
    parts.push({ type: "text", text: input.fallbackText, state: "done" })
  }

  return {
    id: input.messageId ?? `agent-runtime-${Math.random().toString(36).slice(2)}`,
    role: "assistant",
    parts,
    metadata,
  }
}
