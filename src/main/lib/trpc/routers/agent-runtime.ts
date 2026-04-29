import { observable } from "@trpc/server/observable"
import { z } from "zod"
import {
  cancelAgentRun,
  executeAgentRun,
  getAgentProviderAuthStatus,
  getAgentRun,
  listAgentRunEvents,
  startAgentRun,
} from "../../agent-runtime/service"
import { listAgentConnections } from "../../agent-runtime/connection-registry"
import { processGeneratedChangeQueue } from "../../agent-runtime/generated-change-scheduler"
import {
  getBundledClaudeCodePath,
  getBundledCodexCliPath,
} from "../../agent-runtime/providers/bundled-binaries"
import { publicProcedure, router } from "../index"

const providerSchema = z.enum(["codex", "claude", "fake"])
const runtimeAuthConfigSchema = z.object({
  apiKey: z.string().trim().min(1).optional(),
}).optional()

const targetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("project"),
    projectId: z.string(),
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
      chatId: z.string().nullable().optional(),
      subChatId: z.string().nullable().optional(),
      commentThreadId: z.string().nullable().optional(),
      revisionId: z.string().nullable().optional(),
      authConfig: runtimeAuthConfigSchema,
      execute: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = startAgentRun(input)
      if (input.execute ?? true) {
        const run = await executeAgentRun(result.run.id, {
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
      chatId: z.string(),
      subChatId: z.string(),
      authConfig: runtimeAuthConfigSchema,
    }))
    .subscription(({ input }) => {
      return observable<any>((emit) => {
        let active = true

        const safeNext = (value: any) => {
          if (!active) return
          try {
            emit.next(value)
          } catch {
            active = false
          }
        }

        const safeComplete = () => {
          if (!active) return
          active = false
          try {
            emit.complete()
          } catch {
            // Ignore double completion.
          }
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
              chatId: input.chatId,
              subChatId: input.subChatId,
            })
            runId = result.run.id
            safeNext({
              type: "run",
              run: result.run,
              thread: result.thread,
              reused: result.reused,
            })
            for (const event of listAgentRunEvents(result.run.id)) {
              safeNext({ type: "event", event })
            }
            const run = await executeAgentRun(result.run.id, {
              authConfig: input.authConfig ?? null,
              onEvent: (event) => safeNext({ type: "event", event }),
            })
            safeNext({ type: "run-complete", run })
            safeComplete()
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
        }
      })
    }),

  executeRun: publicProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(({ input }) => executeAgentRun(input.runId)),

  cancelRun: publicProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(({ input }) => cancelAgentRun(input.runId)),

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
