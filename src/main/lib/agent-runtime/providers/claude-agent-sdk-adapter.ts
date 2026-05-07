import { execFile } from "node:child_process"
import { app } from "electron"
import { promisify } from "node:util"
import type {
  AgentProviderAdapter,
  AgentProviderEventSink,
  AgentProviderRunInput,
  AgentProviderRunResult,
  ProviderAuthStatus,
} from "../types"
import { buildClaudeEnv } from "../../claude"
import { buildAgentsOption } from "../../trpc/routers/agent-utils"
import { prepareAgentRuntimePrompt } from "../prompt-mentions"
import { prepareRuntimeAttachments } from "../runtime-attachments"
import { getBundledClaudeCodePath } from "./bundled-binaries"
import {
  formatClaudeCapabilityLabel,
  loadClaudeRuntimeCapabilities,
} from "./claude-runtime-capabilities"
import { buildRippleAgentToolEnvironment } from "../cli-tools-env"
import {
  buildClaudeElicitationApprovalRequest,
  buildClaudeElicitationResult,
  buildClaudeToolApprovalRequest,
  isRippleClaudeAutoAllowedTool,
} from "./claude-agent-sdk-approval"

function getRepoRoot(): string | undefined {
  return app.isPackaged ? undefined : app.getAppPath()
}

const execFileAsync = promisify(execFile)

const activeControllers = new Map<string, AbortController>()

export const RIPPLE_CLAUDE_AUTO_ALLOWED_TOOLS = [
  "Bash(ripple frame-sheet)",
  "Bash(ripple frame-sheet *)",
] as const

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" ? value as Record<string, any> : null
}

function stringifySdkTextBlock(block: any): string | null {
  if (!block || typeof block !== "object") return null
  if (block.type === "text" && typeof block.text === "string") {
    return block.text
  }
  return null
}

function extractAssistantText(message: any): string | null {
  const blocks = message?.message?.content
  if (!Array.isArray(blocks)) return null
  const text = blocks
    .map(stringifySdkTextBlock)
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .trim()
  return text || null
}

function toolUseKey(toolUseId: string, parentToolUseId?: string | null): string {
  return parentToolUseId ? `${parentToolUseId}:${toolUseId}` : toolUseId
}

function blockKey(message: any, event: any): string {
  return `${message.uuid ?? message.session_id ?? "message"}:${event?.index ?? "0"}`
}

function stringifyToolResult(value: unknown): string | Record<string, unknown> | null {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    const text = value
      .map((part) => {
        const record = asRecord(part)
        if (record?.type === "text" && typeof record.text === "string") return record.text
        if (typeof part === "string") return part
        return null
      })
      .filter((part): part is string => Boolean(part))
      .join("\n")
      .trim()
    if (text) return text
    return { content: value }
  }
  if (value && typeof value === "object") return value as Record<string, unknown>
  return null
}

function authLabel(status: Record<string, unknown>): string {
  if (status.loggedIn === true) {
    const authMethod = typeof status.authMethod === "string"
      ? status.authMethod
      : "configured"
    if (authMethod === "claude.ai") {
      return "Claude local login ready"
    }
    return "Claude connection ready"
  }
  return "Connect Claude before asking it to edit"
}

export class ClaudeAgentSdkAdapter implements AgentProviderAdapter {
  readonly provider = "claude"
  readonly runtime = "claude_agent_sdk"

  async checkAuth(): Promise<ProviderAuthStatus> {
    try {
      const binaryPath = getBundledClaudeCodePath()
      const { stdout } = await execFileAsync(binaryPath, ["auth", "status", "--json"], {
        timeout: 15_000,
      })
      const status = safeJsonParse(stdout)
      const connected = status.loggedIn === true
      return {
        provider: this.provider,
        runtime: this.runtime,
        connected,
        authMode: typeof status.authMethod === "string" ? status.authMethod : null,
        label: authLabel(status),
        safeAccount: {
          apiProvider: status.apiProvider,
          subscriptionType: status.subscriptionType,
          hasOrganization: typeof status.orgName === "string" && Boolean(status.orgName),
        },
        setupAction: connected ? "none" : "claude_login",
      }
    } catch (error) {
      return {
        provider: this.provider,
        runtime: this.runtime,
        connected: false,
        authMode: null,
        label: error instanceof Error ? error.message : "Claude setup is not available.",
        setupAction: "claude_login",
      }
    }
  }

  async run(
    input: AgentProviderRunInput,
    sink: AgentProviderEventSink,
  ): Promise<AgentProviderRunResult> {
    const auth = await this.checkAuth()
    if (!auth.connected) {
      throw new Error(auth.label)
    }

    const abortController = new AbortController()
    activeControllers.set(input.run.id, abortController)
    const binaryPath = getBundledClaudeCodePath()
    let summary: string | null = null
    let providerSessionId: string | null = input.thread.providerSessionId ?? null
    let usage: Record<string, unknown> | null = null
    let compactToolCallId: string | null = null
    const activeStreamBlocks = new Map<
      string,
      | {
          kind: "tool"
          toolCallId: string
          toolName: string
          inputJson: string
        }
      | { kind: "thinking"; id: string }
    >()
    const startedToolCallIds = new Set<string>()
    const completedToolCallIds = new Set<string>()
    const toolNamesByKey = new Map<string, string>()

    const getToolCallId = (toolUseId: string, parentToolUseId?: string | null) =>
      toolUseKey(toolUseId, parentToolUseId)

    const emitToolStart = async (payload: {
      providerType: string
      providerId?: string | null
      toolUseId: string
      parentToolUseId?: string | null
      toolName: string
      input?: unknown
      inputStreaming?: boolean
      title?: string
    }) => {
      const toolCallId = getToolCallId(payload.toolUseId, payload.parentToolUseId)
      toolNamesByKey.set(toolCallId, payload.toolName)
      if (startedToolCallIds.has(toolCallId)) return toolCallId
      startedToolCallIds.add(toolCallId)
      await sink.emit({
        type: "tool_start",
        providerType: payload.providerType,
        providerId: payload.providerId ?? toolCallId,
        payload: {
          toolCallId,
          toolName: payload.toolName,
          input: payload.input,
          inputStreaming: payload.inputStreaming,
          title: payload.title,
        },
      })
      return toolCallId
    }

    const emitToolInputAvailable = async (payload: {
      providerType: string
      providerId?: string | null
      toolCallId: string
      toolName: string
      input: unknown
    }) => {
      await sink.emit({
        type: "tool_update",
        providerType: payload.providerType,
        providerId: payload.providerId ?? payload.toolCallId,
        payload: {
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          input: payload.input,
          inputAvailable: true,
        },
      })
    }

    const emitToolEnd = async (payload: {
      providerType: string
      providerId?: string | null
      toolCallId: string
      toolName: string
      output?: unknown
      error?: string | boolean
      status?: string
    }) => {
      if (completedToolCallIds.has(payload.toolCallId)) return
      completedToolCallIds.add(payload.toolCallId)
      await sink.emit({
        type: "tool_end",
        providerType: payload.providerType,
        providerId: payload.providerId ?? payload.toolCallId,
        payload: {
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          output: payload.output,
          error: payload.error,
          status: payload.status,
        },
      })
    }

    try {
      const sdk = await import("@anthropic-ai/claude-agent-sdk")
      const promptContext = prepareAgentRuntimePrompt(input.prompt)
      const preparedAttachments = await prepareRuntimeAttachments({
        runId: input.run.id,
        cwd: input.cwd,
        attachments: input.attachments,
      })
      const finalPrompt = [
        promptContext.prompt,
        preparedAttachments.promptSuffix,
      ].filter(Boolean).join("\n\n")
      const agentsOption = await buildAgentsOption(
        promptContext.agentMentions,
        input.cwd,
      )
      const capabilities = await loadClaudeRuntimeCapabilities(
        input.cwd,
        input.projectPath,
        input.workspaceKind,
      )
      const capabilityLabel = formatClaudeCapabilityLabel(capabilities.summary)
      if (
        capabilityLabel ||
        promptContext.agentMentions.length > 0 ||
        promptContext.skillMentions.length > 0 ||
        promptContext.toolMentions.length > 0
      ) {
        await sink.emit({
          type: "status",
          providerType: "claude:capabilities",
          providerId: input.run.id,
          payload: {
            status: "running",
            label: capabilityLabel ?? "Loaded Claude context",
            capabilities: capabilities.summary,
            mentions: {
              agents: promptContext.agentMentions,
              skills: promptContext.skillMentions,
              tools: promptContext.toolMentions,
            },
          },
        })
      }

      const env = buildRippleAgentToolEnvironment({
        baseEnv: buildClaudeEnv({
          customEnv: {
            CLAUDE_AGENT_SDK_CLIENT_APP: "ripple-desktop/phase-13",
          },
        }),
        repoRoot: getRepoRoot(),
        workspaceRoot: input.cwd,
      })
      const nativeAttachmentBlocks = [
        ...preparedAttachments.imageContentBlocks,
        ...preparedAttachments.documentContentBlocks,
      ]
      const sdkPrompt = nativeAttachmentBlocks.length > 0
        ? (async function* () {
            yield {
              type: "user" as const,
              message: {
                role: "user" as const,
                content: [
                  ...nativeAttachmentBlocks,
                  ...(finalPrompt.trim()
                    ? [{ type: "text" as const, text: finalPrompt }]
                    : []),
                ],
              },
              parent_tool_use_id: null,
            }
          })()
        : finalPrompt
      const canUseTool = async (
        toolName: string,
        toolInput: Record<string, unknown>,
        options: any,
      ) => {
        const toolUseID = String(options?.toolUseID ?? `${toolName}-${Date.now()}`)
        const normalizedInput = asRecord(toolInput) ?? {}
        if (
          abortController.signal.aborted ||
          options?.signal?.aborted ||
          sink.isCancellationRequested()
        ) {
          return {
            behavior: "deny" as const,
            message: "Agent run cancelled.",
            toolUseID,
            decisionClassification: "user_reject" as const,
          }
        }
        if (isRippleClaudeAutoAllowedTool(toolName, normalizedInput)) {
          return {
            behavior: "allow" as const,
            toolUseID,
            decisionClassification: "user_temporary" as const,
          }
        }
        const approvalRequest = buildClaudeToolApprovalRequest({
          toolName,
          toolInput: normalizedInput,
          options: {
            ...options,
            toolUseID,
          },
        })
        const approval = await sink.requestApproval(approvalRequest)
        if (approval.approved) {
          return {
            behavior: "allow" as const,
            ...(toolName === "AskUserQuestion" && approval.response
              ? { updatedInput: approval.response }
              : {}),
            toolUseID,
            decisionClassification: "user_temporary" as const,
          }
        }
        return {
          behavior: "deny" as const,
          message: approval.message ?? "Denied by user.",
          toolUseID,
          decisionClassification: "user_reject" as const,
        }
      }
      const onElicitation = async (request: any, options: any) => {
        if (
          abortController.signal.aborted ||
          options?.signal?.aborted ||
          sink.isCancellationRequested()
        ) {
          return { action: "cancel" as const }
        }
        const approval = await sink.requestApproval(
          buildClaudeElicitationApprovalRequest(request),
        )
        return buildClaudeElicitationResult({ request, approval })
      }
      const stream = sdk.query({
        prompt: sdkPrompt,
        options: {
          abortController,
          cwd: input.cwd,
          pathToClaudeCodeExecutable: binaryPath,
          systemPrompt: capabilities.systemPrompt,
          permissionMode: input.mode === "plan" ? "plan" : "default",
          includePartialMessages: true,
          tools: { type: "preset", preset: "claude_code" },
          allowedTools: [...RIPPLE_CLAUDE_AUTO_ALLOWED_TOOLS],
          canUseTool,
          onElicitation,
          settingSources: capabilities.settingSources,
          skills: capabilities.skills,
          ...(Object.keys(agentsOption).length > 0 ? { agents: agentsOption } : {}),
          ...(Object.keys(capabilities.mcpServers).length > 0
            ? { mcpServers: capabilities.mcpServers as any }
            : {}),
          ...(capabilities.plugins.length > 0 ? { plugins: capabilities.plugins } : {}),
          ...(input.model ? { model: input.model } : {}),
          ...(providerSessionId ? { resume: providerSessionId } : {}),
          env,
        },
      })

      for await (const message of stream) {
        if (sink.isCancellationRequested()) {
          abortController.abort()
          throw new Error("Run cancelled.")
        }

        const messageAny = message as any
        if (typeof messageAny.session_id === "string") {
          providerSessionId = messageAny.session_id
          await sink.setProviderIds({ providerSessionId })
        }

        if (messageAny.type === "stream_event") {
          const event = messageAny.event
          if (event?.type === "content_block_start") {
            const contentBlock = event.content_block
            if (contentBlock?.type === "tool_use") {
              const toolUseId = String(contentBlock.id ?? `${messageAny.uuid}-${event.index}`)
              const toolName = String(contentBlock.name ?? "AgentTool")
              const toolCallId = await emitToolStart({
                providerType: event.type,
                providerId: toolUseId,
                toolUseId,
                parentToolUseId: messageAny.parent_tool_use_id,
                toolName,
                input: contentBlock.input,
                inputStreaming: true,
              })
              activeStreamBlocks.set(blockKey(messageAny, event), {
                kind: "tool",
                toolCallId,
                toolName,
                inputJson: "",
              })
            } else if (contentBlock?.type === "thinking") {
              activeStreamBlocks.set(blockKey(messageAny, event), {
                kind: "thinking",
                id: `${messageAny.uuid ?? "thinking"}-${event.index ?? 0}`,
              })
            }
            continue
          }

          if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
            const delta = String(event.delta.text ?? "")
            await sink.emit({
              type: "assistant_text_delta",
              providerType: event.type,
              providerId: messageAny.uuid,
              payload: { delta },
            })
          } else if (event?.type === "content_block_delta" && event.delta?.type === "thinking_delta") {
            const delta = String(event.delta.thinking ?? "")
            if (delta) {
              const active = activeStreamBlocks.get(blockKey(messageAny, event))
              await sink.emit({
                type: "reasoning",
                providerType: event.type,
                providerId: active?.kind === "thinking" ? active.id : messageAny.uuid,
                payload: { delta },
              })
            }
          } else if (event?.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
            const active = activeStreamBlocks.get(blockKey(messageAny, event))
            const partial = String(event.delta.partial_json ?? "")
            if (active?.kind === "tool" && partial) {
              active.inputJson += partial
              await sink.emit({
                type: "tool_update",
                providerType: event.type,
                providerId: active.toolCallId,
                payload: {
                  toolCallId: active.toolCallId,
                  toolName: active.toolName,
                  inputTextDelta: partial,
                },
              })
            }
          } else if (event?.type === "content_block_stop") {
            const active = activeStreamBlocks.get(blockKey(messageAny, event))
            activeStreamBlocks.delete(blockKey(messageAny, event))
            if (active?.kind === "tool") {
              await emitToolInputAvailable({
                providerType: event.type,
                providerId: active.toolCallId,
                toolCallId: active.toolCallId,
                toolName: active.toolName,
                input: safeJsonParse(active.inputJson),
              })
            }
          }
          continue
        }

        if (messageAny.type === "system" && messageAny.subtype === "init") {
          providerSessionId = messageAny.session_id ?? providerSessionId
          await sink.setProviderIds({ providerSessionId })
          await sink.emit({
            type: "status",
            providerType: "system:init",
            providerId: messageAny.uuid,
            payload: {
              status: "running",
              sessionInit: {
                tools: Array.isArray(messageAny.tools) ? messageAny.tools : [],
                mcpServers: Array.isArray(messageAny.mcp_servers) ? messageAny.mcp_servers : [],
                plugins: Array.isArray(messageAny.plugins) ? messageAny.plugins : [],
                skills: Array.isArray(messageAny.skills) ? messageAny.skills : [],
                model: messageAny.model,
                permissionMode: messageAny.permissionMode,
                cwd: messageAny.cwd,
              },
            },
          })
          continue
        }

        if (messageAny.type === "system" && messageAny.subtype === "status") {
          if (messageAny.status === "compacting") {
            compactToolCallId = `compact-${messageAny.uuid ?? messageAny.session_id ?? input.run.id}`
            await sink.emit({
              type: "tool_start",
              providerType: "system:status",
              providerId: compactToolCallId,
              payload: {
                toolCallId: compactToolCallId,
                toolName: "Compact",
                status: "compacting",
                input: {
                  permissionMode: messageAny.permissionMode,
                },
              },
            })
          }
          continue
        }

        if (messageAny.type === "system" && messageAny.subtype === "compact_boundary") {
          const toolCallId = compactToolCallId ?? `compact-${messageAny.uuid ?? messageAny.session_id ?? input.run.id}`
          await emitToolEnd({
            providerType: "system:compact_boundary",
            providerId: toolCallId,
            toolCallId,
            toolName: "Compact",
            output: messageAny.compact_metadata,
            status: "completed",
          })
          compactToolCallId = null
          continue
        }

        if (messageAny.type === "system" && messageAny.subtype === "files_persisted") {
          await sink.emit({
            type: "file_change",
            providerType: "system:files_persisted",
            providerId: messageAny.uuid,
            payload: {
              files: messageAny.files,
              failed: messageAny.failed,
              processedAt: messageAny.processed_at,
            },
          })
          continue
        }

        if (
          messageAny.type === "system" &&
          (
            messageAny.subtype === "hook_started" ||
            messageAny.subtype === "hook_progress" ||
            messageAny.subtype === "hook_response"
          )
        ) {
          await sink.emit({
            type: "status",
            providerType: `system:${messageAny.subtype}`,
            providerId: messageAny.uuid ?? messageAny.hook_id,
            payload: {
              status: "running",
              label:
                messageAny.subtype === "hook_started"
                  ? `Running ${messageAny.hook_name ?? "hook"}`
                  : messageAny.subtype === "hook_response"
                    ? `${messageAny.hook_name ?? "Hook"} ${messageAny.outcome ?? "completed"}`
                    : `${messageAny.hook_name ?? "Hook"} running`,
              output: messageAny.output,
              stdout: messageAny.stdout,
              stderr: messageAny.stderr,
              exitCode: messageAny.exit_code,
            },
          })
          continue
        }

        if (messageAny.type === "system" && messageAny.subtype === "task_started") {
          const toolUseId = String(messageAny.task_id)
          await emitToolStart({
            providerType: "system:task_started",
            providerId: toolUseId,
            toolUseId,
            parentToolUseId: messageAny.tool_use_id,
            toolName: "Task",
            input: {
              subagent_type: messageAny.task_type ?? "Agent",
              description: messageAny.description,
            },
          })
          continue
        }

        if (messageAny.type === "system" && messageAny.subtype === "task_notification") {
          const toolCallId = getToolCallId(String(messageAny.task_id))
          await emitToolEnd({
            providerType: "system:task_notification",
            providerId: toolCallId,
            toolCallId,
            toolName: "Task",
            output: {
              summary: messageAny.summary,
              outputFile: messageAny.output_file,
              status: messageAny.status,
            },
            status: messageAny.status,
            error: messageAny.status === "failed" ? "Task failed." : undefined,
          })
          continue
        }

        if (messageAny.type === "tool_progress") {
          const toolCallId = getToolCallId(
            String(messageAny.tool_use_id),
            messageAny.parent_tool_use_id,
          )
          const toolName = String(messageAny.tool_name ?? toolNamesByKey.get(toolCallId) ?? "AgentTool")
          toolNamesByKey.set(toolCallId, toolName)
          await sink.emit({
            type: "tool_update",
            providerType: "tool_progress",
            providerId: toolCallId,
            payload: {
              toolCallId,
              toolName,
              elapsedTimeSeconds: messageAny.elapsed_time_seconds,
              message: `${toolName} is still running`,
            },
          })
          continue
        }

        if (messageAny.type === "tool_use_summary") {
          await sink.emit({
            type: "status",
            providerType: "tool_use_summary",
            providerId: messageAny.uuid,
            payload: {
              status: "running",
              label: messageAny.summary,
              precedingToolUseIds: messageAny.preceding_tool_use_ids,
            },
          })
          continue
        }

        if (messageAny.type === "auth_status") {
          await sink.emit({
            type: messageAny.error ? "error" : "status",
            providerType: "auth_status",
            providerId: messageAny.uuid,
            payload: {
              status: "running",
              label: Array.isArray(messageAny.output)
                ? messageAny.output.join("\n")
                : undefined,
              message: messageAny.error,
            },
          })
          if (messageAny.error) continue
        }

        if (messageAny.type === "assistant") {
          const blocks = Array.isArray(messageAny.message?.content)
            ? messageAny.message.content
            : []
          for (const block of blocks) {
            if (block?.type === "thinking" && typeof block.thinking === "string") {
              await sink.emit({
                type: "reasoning",
                providerType: "assistant:thinking",
                providerId: `${messageAny.uuid}-thinking`,
                payload: { text: block.thinking },
              })
            }
            if (block?.type === "tool_use") {
              const toolUseId = String(block.id)
              const toolName = String(block.name ?? "AgentTool")
              const toolCallId = await emitToolStart({
                providerType: "assistant:tool_use",
                providerId: toolUseId,
                toolUseId,
                parentToolUseId: messageAny.parent_tool_use_id,
                toolName,
                input: block.input,
              })
              if (startedToolCallIds.has(toolCallId)) {
                await emitToolInputAvailable({
                  providerType: "assistant:tool_use",
                  providerId: toolCallId,
                  toolCallId,
                  toolName,
                  input: block.input,
                })
              }
            }
          }
          if (messageAny.message?.usage) {
            await sink.emit({
              type: "usage",
              providerType: "assistant:usage",
              providerId: messageAny.uuid,
              payload: { usage: messageAny.message.usage },
            })
          }
        }

        if (messageAny.type === "user" || messageAny.type === "user_replay") {
          const blocks = Array.isArray(messageAny.message?.content)
            ? messageAny.message.content
            : []
          for (const block of blocks) {
            if (block?.type !== "tool_result" || typeof block.tool_use_id !== "string") {
              continue
            }
            const toolCallId = getToolCallId(
              block.tool_use_id,
              messageAny.parent_tool_use_id,
            )
            const output =
              stringifyToolResult(block.content) ??
              stringifyToolResult(messageAny.tool_use_result) ??
              ""
            await emitToolEnd({
              providerType: "user:tool_result",
              providerId: toolCallId,
              toolCallId,
              toolName: toolNamesByKey.get(toolCallId) ?? "AgentTool",
              output,
              error: block.is_error ? "Tool returned an error." : undefined,
              status: block.is_error ? "failed" : "completed",
            })
          }
        }

        const assistantText = extractAssistantText(messageAny)
        if (assistantText) {
          summary = assistantText
          await sink.emit({
            type: "assistant_message",
            providerType: messageAny.type,
            providerId: messageAny.uuid,
            payload: { text: assistantText },
          })
        }

        if (messageAny.type === "result") {
          providerSessionId = messageAny.session_id ?? providerSessionId
          usage = {
            usage: messageAny.usage,
            modelUsage: messageAny.modelUsage,
            totalCostUsd: messageAny.total_cost_usd,
            durationMs: messageAny.duration_ms,
            subtype: messageAny.subtype,
          }
          await sink.emit({
            type: "usage",
            providerType: "result",
            providerId: messageAny.uuid,
            payload: usage,
          })

          if (messageAny.is_error) {
            throw new Error(
              Array.isArray(messageAny.errors) && messageAny.errors.length > 0
                ? messageAny.errors.join("\n")
                : messageAny.subtype || "Claude could not complete this run.",
            )
          }
          if (typeof messageAny.result === "string" && messageAny.result.trim()) {
            summary = messageAny.result.trim()
          }
        }
      }

      return {
        summary,
        providerSessionId,
        usage,
      }
    } finally {
      activeControllers.delete(input.run.id)
    }
  }

  async cancel(runId: string): Promise<void> {
    activeControllers.get(runId)?.abort()
  }
}
