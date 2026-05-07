import { observable } from "@trpc/server/observable"
import { eq } from "drizzle-orm"
import { z } from "zod"
import {
  MAX_AGENT_RUNTIME_ATTACHMENT_BASE64_CHARS,
  MAX_AGENT_RUNTIME_ATTACHMENTS,
  validateAgentRuntimeAttachments,
} from "../../../../shared/agent-runtime-attachments"
import {
  cancelAgentRun,
  executeAgentRun,
  getAgentProviderAuthStatus,
  getAgentRun,
  listAgentRunEvents,
  respondToAgentRunApproval,
  startAgentRun,
  subscribeToAllAgentRunEvents,
  subscribeToAgentRunEvents,
} from "../../agent-runtime/service"
import { isActiveAgentRunStatus } from "../../agent-runtime/types"
import { listAgentConnections } from "../../agent-runtime/connection-registry"
import { processGeneratedChangeQueue } from "../../agent-runtime/generated-change-scheduler"
import {
  getBundledClaudeCodePath,
  getBundledCodexCliPath,
} from "../../agent-runtime/providers/bundled-binaries"
import {
  agentRuns,
  agentThreads,
  getDatabase,
} from "../../db"
import { publicProcedure, router } from "../index"

const providerSchema = z.enum(["codex", "claude", "fake"])
const runtimeAuthConfigSchema = z.object({
  apiKey: z.string().trim().min(1).optional(),
}).optional()
const runtimeAttachmentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("image"),
    base64Data: z.string().min(1).max(MAX_AGENT_RUNTIME_ATTACHMENT_BASE64_CHARS),
    mediaType: z.string().min(1),
    filename: z.string().optional(),
    size: z.number().optional(),
  }),
  z.object({
    type: z.literal("file"),
    base64Data: z.string().min(1).max(MAX_AGENT_RUNTIME_ATTACHMENT_BASE64_CHARS),
    mediaType: z.string().optional(),
    filename: z.string().min(1),
    size: z.number().optional(),
  }),
])
const runtimeAttachmentsSchema = z
  .array(runtimeAttachmentSchema)
  .max(MAX_AGENT_RUNTIME_ATTACHMENTS)
  .superRefine((attachments, ctx) => {
    const message = validateAgentRuntimeAttachments(attachments)
    if (!message) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message,
    })
  })

const runtimeContextSchema = z.object({
  projectId: z.string().nullable().optional(),
  compositionId: z.string().nullable().optional(),
  previewTimeSeconds: z.number().finite().nonnegative().nullable().optional(),
  previewFrame: z.number().int().nonnegative().nullable().optional(),
  previewSource: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("main") }),
    z.object({
      kind: z.literal("comment-revision"),
      revisionId: z.string(),
    }),
    z.object({
      kind: z.literal("chat-worktree"),
      conversationId: z.string().nullable().optional(),
      chatId: z.string().nullable().optional(),
    }),
    z.object({
      kind: z.literal("export"),
      exportJobId: z.string().nullable().optional(),
      sourceLabel: z.string().nullable().optional(),
    }),
  ]).nullable().optional(),
  commentThreadId: z.string().nullable().optional(),
  revisionId: z.string().nullable().optional(),
  exportJobId: z.string().nullable().optional(),
}).optional().nullable()

const targetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("project"),
    projectId: z.string(),
  }),
  z.object({
    type: z.literal("conversation"),
    conversationId: z.string(),
  }),
  z.object({
    type: z.literal("chat"),
    chatId: z.string(),
  }),
  z.object({
    type: z.literal("revision"),
    revisionId: z.string(),
  }),
])

function getGeneratedChangeRunProject(runId: string) {
  return getDatabase()
    .select({
      run: agentRuns,
      projectId: agentThreads.projectId,
    })
    .from(agentRuns)
    .innerJoin(agentThreads, eq(agentThreads.id, agentRuns.agentThreadId))
    .where(eq(agentRuns.id, runId))
    .get() ?? null
}

export const agentRuntimeRouter = router({
  listConnections: publicProcedure.query(() => listAgentConnections()),

  authStatus: publicProcedure
    .input(z.object({ provider: providerSchema }))
    .query(({ input }) => getAgentProviderAuthStatus(input.provider)),

  setupCommand: publicProcedure
    .input(z.object({ provider: z.enum(["codex", "claude"]) }))
    .query(({ input }) => {
      if (input.provider === "codex") {
        const binaryPath = getBundledCodexCliPath()
        return {
          provider: input.provider,
          command: binaryPath,
          args: ["login", "--device-auth"],
          shellCommand: `"${binaryPath}" login --device-auth`,
        }
      }

      const binaryPath = getBundledClaudeCodePath()
      return {
        provider: input.provider,
        command: binaryPath,
        args: ["auth", "login"],
        shellCommand: `"${binaryPath}" auth login`,
      }
    }),

  startRun: publicProcedure
    .input(z.object({
      target: targetSchema,
      provider: providerSchema,
      prompt: z.string().min(1),
      requestId: z.string().min(1),
      runKind: z.enum(["chat", "generated_change"]),
      mode: z.enum(["plan", "agent"]).optional(),
      model: z.string().nullable().optional(),
      conversationId: z.string().nullable().optional(),
      chatId: z.string().nullable().optional(),
      subChatId: z.string().nullable().optional(),
      commentThreadId: z.string().nullable().optional(),
      revisionId: z.string().nullable().optional(),
      attachments: runtimeAttachmentsSchema.optional(),
      authConfig: runtimeAuthConfigSchema,
      runtimeContext: runtimeContextSchema,
      execute: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = startAgentRun(input)
      if (input.execute ?? true) {
        const run = await executeAgentRun(result.run.id, {
          attachments: input.attachments,
          authConfig: input.authConfig ?? null,
        })
        return { ...result, run }
      }
      return result
    }),

  chat: publicProcedure
    .input(z.object({
      target: targetSchema,
      provider: providerSchema,
      prompt: z.string().min(1),
      requestId: z.string().min(1),
      mode: z.enum(["plan", "agent"]).optional(),
      model: z.string().nullable().optional(),
      conversationId: z.string().nullable().optional(),
      chatId: z.string().nullable().optional(),
      subChatId: z.string().nullable().optional(),
      attachments: runtimeAttachmentsSchema.optional(),
      authConfig: runtimeAuthConfigSchema,
      runtimeContext: runtimeContextSchema,
    }))
    .subscription(({ input }) => {
      return observable<any>((emit) => {
        let active = true
        let unsubscribe: (() => void) | null = null

        const safeNext = (value: any) => {
          if (!active) return
          try {
            emit.next(value)
          } catch {
            active = false
          }
        }

        const isTerminalRun = (runId: string): boolean => {
          const run = getAgentRun(runId)
          return Boolean(run && !isActiveAgentRunStatus(run.status))
        }

        const isTerminalStatusEvent = (event: any): boolean => {
          if (event?.type !== "status") return false
          let rawPayload = event.payload ?? {}
          if (typeof event.payloadJson === "string") {
            try {
              rawPayload = JSON.parse(event.payloadJson || "{}")
            } catch {
              rawPayload = {}
            }
          }
          const status = rawPayload?.status
          return typeof status === "string" && !isActiveAgentRunStatus(status)
        }

        const emittedEvents = new Set<string>()
        const safeEvent = (event: any) => {
          const key = event?.id ?? `${event?.agentRunId}:${event?.sequence}`
          if (key && emittedEvents.has(key)) return
          if (key) emittedEvents.add(key)
          safeNext({ type: "event", event })
        }

        const safeComplete = () => {
          if (!active) return
          active = false
          unsubscribe?.()
          unsubscribe = null
          try {
            emit.complete()
          } catch {
            // Ignore double completion.
          }
        }

        const completeWithRun = (runId: string) => {
          if (!active) return
          const run = getAgentRun(runId)
          if (run) {
            safeNext({ type: "run-complete", run })
          }
          safeComplete()
        }

        ;(async () => {
          let runId: string | null = null
          try {
            const result = startAgentRun({
              target: input.target,
              provider: input.provider,
              prompt: input.prompt,
              requestId: input.requestId,
              runKind: "chat",
              mode: input.mode,
              model: input.model,
              conversationId: input.conversationId,
              chatId: input.chatId,
              subChatId: input.subChatId,
              runtimeContext: input.runtimeContext ?? null,
            })
            runId = result.run.id
            unsubscribe = subscribeToAgentRunEvents(result.run.id, (event) => {
              safeEvent(event)
              if (isTerminalStatusEvent(event)) {
                completeWithRun(result.run.id)
              }
            })
            safeNext({
              type: "run",
              run: result.run,
              thread: result.thread,
              reused: result.reused,
            })
            for (const event of listAgentRunEvents(result.run.id)) {
              safeEvent(event)
              if (isTerminalStatusEvent(event)) {
                completeWithRun(result.run.id)
                return
              }
            }
            if (isTerminalRun(result.run.id)) {
              completeWithRun(result.run.id)
              return
            }
            void executeAgentRun(result.run.id, {
              attachments: input.attachments,
              authConfig: input.authConfig ?? null,
            })
              .then((run) => {
                if (!active || isActiveAgentRunStatus(run.status)) return
                completeWithRun(result.run.id)
              })
              .catch((error) => {
                if (!active) return
                safeNext({
                  type: "error",
                  runId: result.run.id,
                  message: error instanceof Error ? error.message : String(error),
                })
                safeComplete()
              })
          } catch (error) {
            safeNext({
              type: "error",
              runId,
              message: error instanceof Error ? error.message : String(error),
            })
            safeComplete()
          }
        })()

        return () => {
          active = false
          unsubscribe?.()
          unsubscribe = null
        }
      })
    }),

  generatedChangeEvents: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .subscription(({ input }) => {
      return observable<any>((emit) => {
        const unsubscribe = subscribeToAllAgentRunEvents((event) => {
          if (event.type !== "file_change") return
          const runProject = getGeneratedChangeRunProject(event.agentRunId)
          if (
            !runProject ||
            runProject.projectId !== input.projectId ||
            runProject.run.runKind !== "generated_change"
          ) {
            return
          }
          emit.next({
            type: "event",
            event,
            run: runProject.run,
            projectId: runProject.projectId,
          })
        })
        return unsubscribe
      })
    }),

  executeRun: publicProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(({ input }) => executeAgentRun(input.runId)),

  cancelRun: publicProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(({ input }) => cancelAgentRun(input.runId)),

  respondApproval: publicProcedure
    .input(z.object({
      approvalId: z.string(),
      approved: z.boolean(),
      message: z.string().optional(),
      response: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(({ input }) => respondToAgentRunApproval({
      approvalId: input.approvalId,
      approved: input.approved,
      message: input.message ?? null,
      response: input.response ?? null,
    })),

  getRun: publicProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ input }) => getAgentRun(input.runId)),

  listRunEvents: publicProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ input }) => listAgentRunEvents(input.runId)),

  processGeneratedChanges: publicProcedure
    .input(z.object({ projectId: z.string().nullable().optional() }).optional())
    .mutation(({ input }) => processGeneratedChangeQueue(input ?? {})),
})
