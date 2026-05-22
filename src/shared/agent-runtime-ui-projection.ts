import {
  designerFacingAgentRuntimeLine,
  summarizeAgentRuntimePart,
} from "./agent-runtime-summary"

type AnyRecord = Record<string, any>

export type RuntimeEventLike = {
  id?: string
  type?: string
  agentRunId?: string | null
  sequence?: number | null
  createdAt?: Date | string | number | null
  provider?: string | null
  providerId?: string | null
  providerType?: string | null
  payloadJson?: string | null
  payload?: Record<string, unknown> | null
}

export type UIMessageChunkLike = Record<string, any>

export interface AgentRuntimeProviderRefs {
  eventId?: string | null
  sequence?: number | null
  createdAt?: string | null
  provider?: string | null
  runId?: string | null
  requestId?: string | null
  turnId?: string | null
  itemId?: string | null
  providerId?: string | null
  providerType?: string | null
  rawProviderMethod?: string | null
  rawPayload?: unknown
}

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

function normalizeTimestamp(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string" && value.trim()) return value
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  return null
}

function normalizeRefsValue(value: unknown): AgentRuntimeProviderRefs | null {
  return isRecord(value) ? value as AgentRuntimeProviderRefs : null
}

function eventProviderRefs(
  event: RuntimeEventLike,
  payload: Record<string, unknown>,
): AgentRuntimeProviderRefs {
  const payloadRefs = normalizeRefsValue(payload.providerRefs)
  return {
    ...(payloadRefs ?? {}),
    eventId: compactLabel(payloadRefs?.eventId) ?? compactLabel(event.id) ?? null,
    sequence: typeof event.sequence === "number" ? event.sequence : payloadRefs?.sequence ?? null,
    createdAt:
      normalizeTimestamp(event.createdAt) ??
      normalizeTimestamp(payloadRefs?.createdAt),
    provider:
      compactLabel(event.provider) ??
      compactLabel(payloadRefs?.provider) ??
      null,
    runId:
      compactLabel(event.agentRunId) ??
      compactLabel(payloadRefs?.runId) ??
      null,
    requestId:
      compactLabel(payloadRefs?.requestId) ??
      compactLabel(payload.requestId) ??
      null,
    turnId:
      compactLabel(payloadRefs?.turnId) ??
      compactLabel(payload.turnId) ??
      compactLabel((payload.turn as AnyRecord | undefined)?.id) ??
      null,
    itemId:
      compactLabel(payloadRefs?.itemId) ??
      compactLabel(payload.itemId) ??
      compactLabel(payload.toolCallId) ??
      compactLabel(payload.tool_use_id) ??
      compactLabel(payload.callId) ??
      compactLabel(event.providerId) ??
      null,
    providerId:
      compactLabel(event.providerId) ??
      compactLabel(payloadRefs?.providerId) ??
      null,
    providerType:
      compactLabel(event.providerType) ??
      compactLabel(payloadRefs?.providerType) ??
      null,
    rawProviderMethod:
      compactLabel(payloadRefs?.rawProviderMethod) ??
      compactLabel(event.providerType) ??
      compactLabel(event.type) ??
      null,
    rawPayload:
      payloadRefs && "rawPayload" in payloadRefs
        ? payloadRefs.rawPayload
        : payload,
  }
}

function stableEventId(prefix: string, event: RuntimeEventLike): string {
  return `${prefix}-${event.providerId || event.id || Math.random().toString(36).slice(2)}`
}

function textStreamKey(
  event: RuntimeEventLike,
  payload: Record<string, unknown>,
  refs: AgentRuntimeProviderRefs,
): string | null {
  return (
    compactLabel(refs.itemId) ??
    compactLabel(refs.providerId) ??
    compactLabel(payload.itemId) ??
    compactLabel(event.providerId) ??
    compactLabel(event.id) ??
    null
  )
}

function appendProviderRefs(part: AnyRecord, refs: unknown): void {
  if (!isRecord(refs)) return
  const existing = Array.isArray(part.providerRefs)
    ? part.providerRefs.filter(isRecord)
    : []
  const eventId = compactLabel((refs as AnyRecord).eventId)
  if (eventId && existing.some((item) => item.eventId === eventId)) return
  part.providerRefs = [...existing, refs]
}

function chunkRefs(chunk: UIMessageChunkLike): AgentRuntimeProviderRefs | null {
  return normalizeRefsValue(chunk.providerRefs)
}

function terminalStatus(value: unknown): "completed" | "failed" | "cancelled" | "recoverable" | null {
  if (value === "completed" || value === "failed" || value === "cancelled" || value === "recoverable") {
    return value
  }
  return null
}

type RuntimeClosureStatus =
  | "completed"
  | "failed"
  | "cancelled"
  | "recoverable"
  | "awaiting_approval"
  | "interrupted"

function runtimeClosureStatus(value: unknown): RuntimeClosureStatus {
  if (
    value === "completed" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "recoverable" ||
    value === "awaiting_approval"
  ) {
    return value
  }
  return "interrupted"
}

function runtimeClosureErrorText(
  status: RuntimeClosureStatus,
  payload?: Record<string, unknown>,
): string {
  const message = compactLabel(payload?.message) ?? compactLabel(payload?.error)
  if (message) return message
  if (status === "cancelled") return "Tool stopped because the run was cancelled."
  if (status === "recoverable") return "Tool stopped because Ripple restarted during the run."
  if (status === "awaiting_approval") return "Tool paused while waiting for approval."
  if (status === "failed") return "Tool stopped because the run failed."
  return "Tool stopped before it completed."
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

function activityStatusLabel(payload: Record<string, unknown>): string | null {
  const kind = compactLabel(payload.kind)?.toLowerCase()
  const label = compactLabel(payload.label)
  const normalizedLabel = label?.toLowerCase()

  if (kind === "writing" || normalizedLabel?.includes("writing a response")) {
    return null
  }

  if (kind === "thinking" || normalizedLabel?.includes("thinking")) {
    return "Thinking"
  }

  if (kind === "loading" || kind === "preparing") {
    return label ?? "Preparing project"
  }

  return null
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

function runtimeDataChunk(input: {
  id: string
  providerRefs: AgentRuntimeProviderRefs
  data: Record<string, unknown>
  summaryPart?: AnyRecord
}): UIMessageChunkLike {
  const part = input.summaryPart ?? {
    type: "data-agent-runtime",
    id: input.id,
    providerRefs: [input.providerRefs],
    data: input.data,
  }
  const summary = summarizeAgentRuntimePart(part)
  const label = input.data.kind === "approval"
    ? summary.title
    : typeof input.data.label === "string"
    ? designerFacingAgentRuntimeLine(input.data.label)
    : summary.title
  return {
    type: "data-agent-runtime",
    id: input.id,
    providerRefs: input.providerRefs,
    data: {
      ...input.data,
      label,
      summary,
    },
  }
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
  private reasoningText = ""
  private streamedTextKeys = new Set<string>()
  private lastActivityKey: string | null = null
  private startedTools = new Map<string, { toolName: string; output: string }>()

  project(event: RuntimeEventLike): UIMessageChunkLike[] {
    const payload = parseRuntimeEventPayload(event)
    const providerRefs = eventProviderRefs(event, payload)

    switch (event.type) {
      case "request.opened":
      case "turn.started":
        return []
      case "user-input.requested":
        return this.closeOpenRuntimeItems(providerRefs, "awaiting_approval", payload)
      case "item.completed":
        return this.closeRuntimeItem(event, payload, providerRefs)
      case "request.completed":
      case "turn.completed":
      case "session.exited":
        return this.closeOpenRuntimeItems(
          providerRefs,
          runtimeClosureStatus(payload.status),
          payload,
        )
      case "assistant_text_delta": {
        const delta = typeof payload.delta === "string" ? payload.delta : ""
        if (!delta) return []
        const endReasoning = this.endReasoning()
        const streamKey = textStreamKey(event, payload, providerRefs)
        if (streamKey) this.streamedTextKeys.add(streamKey)
        return [
          ...endReasoning,
          ...this.ensureTextStarted(event),
          { type: "text-delta", id: this.textPartId, delta, providerRefs },
        ]
      }
      case "assistant_message": {
        if (event.providerType === "user" || event.providerType?.startsWith("user:")) {
          return []
        }
        const streamKey = textStreamKey(event, payload, providerRefs)
        if (streamKey && this.streamedTextKeys.has(streamKey)) return []
        if (!streamKey && this.textPartId) return []
        const text = typeof payload.text === "string" ? payload.text : ""
        if (!text) return []
        const endReasoning = this.endReasoning()
        return [
          ...endReasoning,
          ...this.ensureTextStarted(event),
          { type: "text-delta", id: this.textPartId, delta: text, providerRefs },
        ]
      }
      case "reasoning": {
        const streamKind =
          payload.streamKind === "reasoning_summary"
            ? "reasoning_summary"
            : payload.streamKind === "reasoning_text"
              ? "reasoning_text"
              : undefined
        const isSummary = streamKind === "reasoning_summary"
        const text =
          typeof payload.delta === "string"
            ? payload.delta
            : typeof payload.text === "string"
              ? payload.text
              : ""
        if (!text) return []
        const chunks: UIMessageChunkLike[] = []
        if (!this.reasoningPartId) {
          chunks.push(...this.endText())
          this.reasoningPartId = stableEventId("reasoning", event)
          chunks.push({ type: "reasoning-start", id: this.reasoningPartId, providerRefs })
        }

        // The startsWith de-dupe only applies to full-text replacements (Claude
        // persisted thinking). Summary deltas are routed to the part's summary
        // headline, so they must not advance this.reasoningText (the detail stream).
        const delta = !isSummary && typeof payload.text === "string" && !payload.delta && this.reasoningText
          ? text.startsWith(this.reasoningText)
            ? text.slice(this.reasoningText.length)
            : ""
          : text

        if (delta) {
          if (!isSummary) this.reasoningText += delta
          chunks.push({
            type: "reasoning-delta",
            id: this.reasoningPartId,
            delta,
            ...(streamKind ? { streamKind } : {}),
            providerRefs,
          })
        }
        if (!isSummary && typeof payload.text === "string" && !payload.delta) {
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
        const fileChangeId = stableEventId("file-change", event)
        return [
          ...this.endText(),
          ...this.endReasoning(),
          runtimeDataChunk({
            id: fileChangeId,
            providerRefs,
            data: {
              kind: "file_change",
              label: "Updated composition",
              providerRefs,
              payload,
            },
          }),
        ]
      case "approval_request":
        return [runtimeDataChunk({
          id: stableEventId("approval", event),
          providerRefs,
          data: {
            kind: "approval",
            label: approvalRequestLabel(payload),
            providerRefs,
            payload,
          },
        })]
      case "usage": {
        const messageMetadata = extractRuntimeUsageMetadata(payload)
        return Object.keys(messageMetadata).length > 0
          ? [{ type: "message-metadata", messageMetadata }]
          : []
      }
      case "status": {
        const label = compactLabel(payload.label)
        const status = terminalStatus(payload.status)
        const closure = status
          ? this.closeOpenRuntimeItems(providerRefs, status, payload)
          : []
        if (!shouldProjectStatusEvent(event, payload)) return closure
        return [...closure, runtimeDataChunk({
          id: stableEventId("status", event),
          providerRefs,
          data: {
            kind: "status",
            label: label ?? "Recovered provider thread",
            providerRefs,
            payload,
          },
        })]
      }
      case "activity":
        return this.projectActivity(event, payload)
      case "error": {
        const errorText =
          typeof payload.message === "string"
            ? payload.message
            : "The agent run failed."
        return [
          ...this.closeOpenRuntimeItems(providerRefs, "failed", payload),
          { type: "error", errorText },
        ]
      }
      default:
        return []
    }
  }

  finish(): UIMessageChunkLike[] {
    return this.closeOpenRuntimeItems()
  }

  private ensureTextStarted(event: RuntimeEventLike): UIMessageChunkLike[] {
    if (this.textPartId) return []
    this.textPartId = stableEventId("text", event)
    return [{
      type: "text-start",
      id: this.textPartId,
      providerRefs: eventProviderRefs(event, parseRuntimeEventPayload(event)),
    }]
  }

  private projectActivity(
    event: RuntimeEventLike,
    payload: Record<string, unknown>,
  ): UIMessageChunkLike[] {
    if (this.textPartId || this.reasoningPartId || this.startedTools.size > 0) return []

    const label = activityStatusLabel(payload)
    if (!label) return []

    const key = `${compactLabel(payload.kind) ?? "activity"}:${label}`
    if (this.lastActivityKey === key) return []
    this.lastActivityKey = key

    const providerRefs = eventProviderRefs(event, payload)
    return [runtimeDataChunk({
      id: stableEventId("activity", event),
      providerRefs,
      data: {
        kind: "status",
        label,
        providerRefs,
        payload,
      },
    })]
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
    this.reasoningText = ""
    return [{ type: "reasoning-end", id }]
  }

  private closeRuntimeItem(
    event: RuntimeEventLike,
    payload: Record<string, unknown>,
    providerRefs: AgentRuntimeProviderRefs,
  ): UIMessageChunkLike[] {
    const toolCallId = toolCallIdFor(event, payload)
    const state = this.startedTools.get(toolCallId)
    if (!state) {
      return [...this.endText(), ...this.endReasoning()]
    }
    this.startedTools.delete(toolCallId)
    const status = runtimeClosureStatus(payload.status ?? (isToolFailure(payload) ? "failed" : "completed"))
    if (status !== "completed") {
      return [{
        type: "tool-output-error",
        toolCallId,
        errorText: runtimeClosureErrorText(status, payload),
        providerExecuted: true,
        providerRefs,
      }]
    }
    return [{
      type: "tool-output-available",
      toolCallId,
      output: toolOutputFor(state.toolName, {
        ...payload,
        status: payload.status ?? "completed",
      }, state.output || undefined),
      providerExecuted: true,
      providerRefs,
    }]
  }

  private closeOpenRuntimeItems(
    providerRefs?: AgentRuntimeProviderRefs | null,
    status: RuntimeClosureStatus = "completed",
    payload?: Record<string, unknown>,
  ): UIMessageChunkLike[] {
    const chunks: UIMessageChunkLike[] = [
      ...this.endText(),
      ...this.endReasoning(),
    ]
    for (const [toolCallId, state] of this.startedTools.entries()) {
      if (status !== "completed") {
        chunks.push({
          type: "tool-output-error",
          toolCallId,
          errorText: runtimeClosureErrorText(status, payload),
          providerExecuted: true,
          providerRefs,
        })
        continue
      }
      chunks.push({
        type: "tool-output-available",
        toolCallId,
        output: toolOutputFor(state.toolName, { status: "completed" }, state.output || undefined),
        providerExecuted: true,
        providerRefs,
      })
    }
    this.startedTools.clear()
    return chunks
  }

  private ensureToolStarted(
    event: RuntimeEventLike,
    payload: Record<string, unknown>,
  ): UIMessageChunkLike[] {
    const toolCallId = toolCallIdFor(event, payload)
    const existing = this.startedTools.get(toolCallId)
    if (existing) return []

    const toolName = toolNameFromPayload(event, payload)
    const providerRefs = eventProviderRefs(event, payload)
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
        providerRefs,
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
    const providerRefs = eventProviderRefs(event, payload)
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
        providerRefs,
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
    const providerRefs = eventProviderRefs(event, payload)

    if (typeof payload.inputTextDelta === "string") {
      return [
        ...chunks,
        {
          type: "tool-input-delta",
          toolCallId,
          inputTextDelta: payload.inputTextDelta,
          providerRefs,
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
          providerRefs,
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
        providerRefs,
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
    const providerRefs = eventProviderRefs(event, payload)

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
          providerRefs,
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
        providerRefs,
      },
    ]
  }
}

function applyChunkToAssistantParts(
  parts: AnyRecord[],
  chunk: UIMessageChunkLike,
): void {
  const refs = chunkRefs(chunk)
  if (chunk.type === "text-start") {
    const part = { type: "text", text: "", state: "streaming", id: chunk.id }
    appendProviderRefs(part, refs)
    parts.push(part)
    return
  }
  if (chunk.type === "text-delta") {
    const part = parts.find((item) => item.id === chunk.id && item.type === "text")
    if (part) {
      part.text += chunk.delta
      appendProviderRefs(part, refs)
    }
    return
  }
  if (chunk.type === "text-end") {
    const part = parts.find((item) => item.id === chunk.id && item.type === "text")
    if (part) part.state = "done"
    return
  }
  if (chunk.type === "reasoning-start") {
    const part = { type: "reasoning", text: "", state: "streaming", id: chunk.id }
    appendProviderRefs(part, refs)
    parts.push(part)
    return
  }
  if (chunk.type === "reasoning-delta") {
    const part = parts.find((item) => item.id === chunk.id && item.type === "reasoning")
    if (part) {
      if (chunk.streamKind === "reasoning_summary") {
        part.summary = `${typeof part.summary === "string" ? part.summary : ""}${chunk.delta}`
      } else {
        part.text += chunk.delta
      }
      appendProviderRefs(part, refs)
    }
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
    appendProviderRefs(part, refs)
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
    appendProviderRefs(part, refs)
    part.inputText = `${typeof part.inputText === "string" ? part.inputText : ""}${chunk.inputTextDelta ?? ""}`
    part.state = "input-streaming"
    return
  }
  if (chunk.type === "tool-output-available" || chunk.type === "tool-output-error") {
    const part = parts.find((item) => item.toolCallId === chunk.toolCallId)
    if (!part) return
    appendProviderRefs(part, refs)
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
      providerRefs: refs ? [refs] : undefined,
      data: chunk.data,
    })
  }
}

export function buildAgentRuntimeAssistantProjection(input: {
  events: RuntimeEventLike[]
  messageId?: string
  metadata?: Record<string, unknown>
  fallbackText: string
  finalize?: boolean
  includeFallback?: boolean
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
  if (input.finalize !== false) {
    for (const chunk of projector.finish()) {
      applyChunkToAssistantParts(parts, chunk)
    }
  }

  if (
    input.includeFallback !== false &&
    !parts.some((part) => part.type === "text" && part.text?.trim())
  ) {
    parts.push({ type: "text", text: input.fallbackText, state: "done" })
  }

  return {
    id: input.messageId ?? `agent-runtime-${Math.random().toString(36).slice(2)}`,
    role: "assistant",
    parts,
    metadata,
  }
}
