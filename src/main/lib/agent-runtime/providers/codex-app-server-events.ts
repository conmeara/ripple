import type { AgentRunEventInput } from "../types"

export type JsonRpcMessage = {
  id?: number | string
  method?: string
  params?: any
  result?: any
  error?: any
}

export function extractItemText(item: any): string | null {
  if (!item || typeof item !== "object") return null
  if (item.type === "agentMessage" && typeof item.text === "string") {
    return item.text
  }
  if (item.type === "AgentMessage" && Array.isArray(item.content)) {
    const text = item.content
      .map((content: any) => typeof content?.text === "string" ? content.text : null)
      .filter((part: string | null): part is string => Boolean(part))
      .join("\n")
      .trim()
    return text || null
  }
  return null
}

export function isTurnComplete(message: JsonRpcMessage, turnId: string | null): boolean {
  if (message.method !== "turn/completed") return false
  if (!turnId) return true
  return message.params?.turn?.id === turnId
}

export function getCodexAppServerErrorMessage(
  message: JsonRpcMessage,
): string | null {
  if (message.method !== "error" && !message.error) return null

  const candidate =
    message.params?.error?.message ??
    message.params?.message ??
    message.error?.message ??
    message.error

  if (typeof candidate === "string") {
    try {
      const parsed = JSON.parse(candidate)
      if (typeof parsed?.detail === "string") return parsed.detail
      if (typeof parsed?.message === "string") return parsed.message
    } catch {
      // Use the raw app-server message when it is not JSON.
    }
    return candidate
  }

  if (candidate && typeof candidate === "object") {
    if (typeof candidate.detail === "string") return candidate.detail
    if (typeof candidate.message === "string") return candidate.message
  }

  return "Codex App Server reported an error."
}

export function isCodexAppServerThreadNotFoundError(message: string): boolean {
  try {
    const parsed = JSON.parse(message)
    if (typeof parsed?.message === "string") {
      return /thread not found/i.test(parsed.message)
    }
    if (typeof parsed?.detail === "string") {
      return /thread not found/i.test(parsed.detail)
    }
  } catch {
    // Fall through to the plain string check below.
  }
  return /thread not found/i.test(message)
}

function getToolName(item: any): string | null {
  if (!item || typeof item !== "object") return null
  switch (item.type) {
    case "commandExecution":
      return "Bash"
    case "fileChange":
      return "Edit"
    case "contextCompaction":
      return "Compact"
    case "mcpToolCall":
      return [item.server, item.tool].filter(Boolean).join("/")
    case "collabAgentToolCall":
      return String(item.tool || "Agent")
    case "webSearch":
      return "WebSearch"
    case "imageView":
      return "ViewImage"
    default:
      return null
  }
}

function toolPayload(item: any): Record<string, unknown> {
  if (!item || typeof item !== "object") return {}
  switch (item.type) {
    case "commandExecution":
      return {
        toolName: "Bash",
        command: item.command,
        cwd: item.cwd,
        parsed_cmd: item.commandActions,
        status: item.status,
        exitCode: item.exitCode,
        output: item.aggregatedOutput,
        durationMs: item.durationMs,
      }
    case "fileChange":
      return {
        toolName: "Edit",
        changes: item.changes,
        status: item.status,
      }
    case "mcpToolCall":
      return {
        toolName: getToolName(item),
        server: item.server,
        tool: item.tool,
        status: item.status,
        arguments: item.arguments,
        result: item.result,
        error: item.error,
        durationMs: item.durationMs,
      }
    case "collabAgentToolCall":
      return {
        toolName: getToolName(item),
        status: item.status,
        prompt: item.prompt,
        receiverThreadIds: item.receiverThreadIds,
      }
    case "webSearch":
      return {
        toolName: "WebSearch",
        query: item.query,
        action: item.action,
      }
    case "imageView":
      return {
        toolName: "ViewImage",
        path: item.path,
      }
    case "contextCompaction":
      return {
        toolName: "Compact",
        status: "compacting",
      }
    default:
      return {}
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function extractSessionArray(params: any, ...keys: string[]): string[] | undefined {
  for (const key of keys) {
    if (!Array.isArray(params?.[key])) continue
    const direct = toStringArray(params?.[key])
    return direct
  }
  return undefined
}

function extractMcpServers(params: any): unknown[] | undefined {
  const candidates = [
    params?.mcpServers,
    params?.mcp_servers,
    params?.mcp?.servers,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
    if (candidate && typeof candidate === "object") {
      return Object.entries(candidate).map(([name, config]) => ({
        name,
        config,
      }))
    }
  }
  return undefined
}

export function normalizeCodexAppServerNotification(
  message: JsonRpcMessage,
): AgentRunEventInput[] {
  const params = message.params ?? {}
  const item = params.item
  const providerId = item?.id ?? params.itemId ?? params.turnId ?? params.turn?.id ?? null

  if (message.method === "turn/started") {
    return [{
      type: "status",
      providerType: message.method,
      providerId,
      payload: { status: "running" },
    }]
  }

  if (message.method === "sessionConfigured") {
    const tools = extractSessionArray(params, "tools", "toolNames", "availableTools")
    const mcpServers = extractMcpServers(params)
    const plugins = extractSessionArray(params, "plugins", "pluginNames")
    const skills = extractSessionArray(params, "skills", "skillNames")
    return [{
      type: "status",
      providerType: message.method,
      providerId: params.sessionId ?? null,
      payload: {
        status: "running",
        label: "Codex session ready",
        sessionInit: {
          ...(tools !== undefined ? { tools } : {}),
          ...(mcpServers !== undefined ? { mcpServers } : {}),
          ...(plugins !== undefined ? { plugins } : {}),
          ...(skills !== undefined ? { skills } : {}),
          model: params.model,
          reasoningEffort: params.reasoningEffort,
          rolloutPath: params.rolloutPath,
          apps: params.apps,
          connectors: params.connectors,
        },
      },
    }]
  }

  if (message.method === "thread/tokenUsage/updated") {
    return [{
      type: "usage",
      providerType: message.method,
      providerId,
      payload: {
        tokenUsage: params.tokenUsage,
        modelContextWindow: params.tokenUsage?.modelContextWindow,
      },
    }]
  }

  if (message.method === "item/agentMessage/delta") {
    return [{
      type: "assistant_text_delta",
      providerType: message.method,
      providerId: params.itemId,
      payload: { delta: String(params.delta ?? "") },
    }]
  }

  if (
    message.method === "item/reasoning/summaryTextDelta" ||
    message.method === "item/reasoning/textDelta" ||
    message.method === "item/plan/delta"
  ) {
    return [{
      type: "reasoning",
      providerType: message.method,
      providerId: params.itemId,
      payload: { delta: String(params.delta ?? "") },
    }]
  }

  if (message.method === "item/started") {
    const toolName = getToolName(item)
    if (!toolName) return []
    return [{
      type: "tool_start",
      providerType: message.method,
      providerId,
      payload: toolPayload(item),
    }]
  }

  if (
    message.method === "item/commandExecution/outputDelta" ||
    message.method === "item/fileChange/outputDelta"
  ) {
    return [{
      type: "tool_update",
      providerType: message.method,
      providerId: params.itemId,
      payload: { delta: String(params.delta ?? "") },
    }]
  }

  if (message.method === "item/commandExecution/terminalInteraction") {
    return [{
      type: "tool_update",
      providerType: message.method,
      providerId: params.itemId,
      payload: {
        toolName: "Bash",
        stdin: params.stdin,
        processId: params.processId,
      },
    }]
  }

  if (message.method === "item/mcpToolCall/progress") {
    return [{
      type: "tool_update",
      providerType: message.method,
      providerId: params.itemId,
      payload: { message: String(params.message ?? "") },
    }]
  }

  if (message.method === "item/completed") {
    const events: AgentRunEventInput[] = []
    const text = extractItemText(item)
    if (text) {
      events.push({
        type: "assistant_message",
        providerType: message.method,
        providerId,
        payload: { text },
      })
    }

    const toolName = getToolName(item)
    if (toolName) {
      events.push({
        type: "tool_end",
        providerType: message.method,
        providerId,
        payload: toolPayload(item),
      })
    }

    return events
  }

  if (message.method === "turn/diff/updated") {
    return [{
      type: "file_change",
      providerType: message.method,
      providerId: params.turnId,
      payload: { diff: params.diff },
    }]
  }

  if (message.method === "thread/compacted") {
    return [{
      type: "status",
      providerType: message.method,
      providerId: params.turnId,
      payload: {
        status: "running",
        label: "Compacted context",
      },
    }]
  }

  if (message.method === "configWarning") {
    return [{
      type: "status",
      providerType: message.method,
      providerId,
      payload: {
        status: "running",
        label: params.summary,
        details: params.details,
        path: params.path,
        range: params.range,
      },
    }]
  }

  if (message.method === "windows/worldWritableWarning") {
    return [{
      type: "status",
      providerType: message.method,
      providerId,
      payload: {
        status: "running",
        label: "Codex warned about a writable directory",
        details: params,
      },
    }]
  }

  if (message.method === "error") {
    return [{
      type: "error",
      providerType: message.method,
      payload: params,
    }]
  }

  return []
}
