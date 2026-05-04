import { z } from "zod"
import {
  RIPPLE_COMMENT_FILTERS,
  RIPPLE_COMMENT_THREAD_STATUSES,
  type RippleCommentAnchorInput,
} from "../../../../shared/ripple-comments"
import {
  MAX_AGENT_RUNTIME_ATTACHMENT_BASE64_CHARS,
  MAX_AGENT_RUNTIME_ATTACHMENTS,
  validateAgentRuntimeAttachments,
} from "../../../../shared/agent-runtime-attachments"
import {
  acceptRevision,
  addCommentReply,
  createCommentThread,
  createRevisionForThread,
  deleteCommentThread,
  listCommentActivitySummary,
  listCommentThreads,
  refreshRevisionProposal,
  rejectRevision,
  resolveCommentThread,
  restoreCommentThread,
  updateStaleRevisionProposal,
} from "../../revisions/comment-revisions"
import {
  claimNextRevisionRun,
  claimRevisionRun,
  cleanupTerminalRevisionWorktrees,
  completeRevisionRun,
  failRevisionRun,
  listRevisionQueueDiagnostics,
  processQueuedRevisionUpdates,
  recoverRevisionQueueOnStartup,
} from "../../revisions/revision-queue"
import { scheduleGeneratedChangeQueue } from "../../agent-runtime/generated-change-scheduler"
import { publicProcedure, router } from "../index"

const anchorInput = z.object({
  anchorType: z.enum(["frame", "range", "element"]).optional(),
  startTime: z.number().min(0).nullable().optional(),
  endTime: z.number().min(0).nullable().optional(),
  startFrame: z.number().int().min(0).nullable().optional(),
  endFrame: z.number().int().min(0).nullable().optional(),
  elementSelector: z.string().nullable().optional(),
  clipKey: z.string().nullable().optional(),
  sourceFile: z.string().nullable().optional(),
  screenshotPath: z.string().nullable().optional(),
}) satisfies z.ZodType<RippleCommentAnchorInput>
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
const agentProviderInput = z.enum(["codex", "claude", "fake"]).optional()

export const revisionsRouter = router({
  listThreads: publicProcedure
    .input(z.object({
      projectId: z.string(),
      compositionId: z.string().nullable().optional(),
      filter: z.enum(RIPPLE_COMMENT_FILTERS).optional(),
    }))
    .query(({ input }) => listCommentThreads(input)),

  listActivitySummary: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) => listCommentActivitySummary(input)),

  createThread: publicProcedure
    .input(z.object({
      projectId: z.string(),
      compositionId: z.string().nullable().optional(),
      body: z.string(),
      anchor: anchorInput,
      attachments: runtimeAttachmentsSchema.optional(),
      createRevision: z.boolean().optional(),
      agentProvider: agentProviderInput,
      model: z.string().optional(),
      clientRequestId: z.string().optional(),
      sourceRevisionId: z.string().nullable().optional(),
      captureVisualContext: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const thread = await createCommentThread(input)
      scheduleGeneratedChangeQueue({ projectId: thread.projectId })
      return thread
    }),

  addReply: publicProcedure
    .input(z.object({
      threadId: z.string(),
      body: z.string(),
      attachments: runtimeAttachmentsSchema.optional(),
      createRevision: z.boolean().optional(),
      agentProvider: agentProviderInput,
      model: z.string().optional(),
      clientRequestId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const thread = await addCommentReply(input)
      scheduleGeneratedChangeQueue({ projectId: thread.projectId })
      return thread
    }),

  createFromThread: publicProcedure
    .input(z.object({
      threadId: z.string(),
      body: z.string(),
      baseRevisionId: z.string().nullable().optional(),
      attachments: runtimeAttachmentsSchema.optional(),
      agentProvider: agentProviderInput,
      model: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const revision = await createRevisionForThread(input)
      scheduleGeneratedChangeQueue({ projectId: revision.projectId })
      return revision
    }),

  setThreadStatus: publicProcedure
    .input(z.object({
      threadId: z.string(),
      status: z.enum(RIPPLE_COMMENT_THREAD_STATUSES),
    }))
    .mutation(({ input }) => {
      if (input.status === "resolved") {
        return resolveCommentThread(input.threadId)
      }
      throw new Error("Only resolving comment threads is supported here.")
    }),

  deleteThread: publicProcedure
    .input(z.object({ threadId: z.string() }))
    .mutation(({ input }) => deleteCommentThread(input.threadId)),

  restoreThread: publicProcedure
    .input(z.object({ threadId: z.string() }))
    .mutation(({ input }) => restoreCommentThread(input.threadId)),

  refreshProposal: publicProcedure
    .input(z.object({ revisionId: z.string() }))
    .mutation(({ input }) => refreshRevisionProposal(input.revisionId)),

  updateStaleProposal: publicProcedure
    .input(z.object({ revisionId: z.string() }))
    .mutation(async ({ input }) => {
      const thread = await updateStaleRevisionProposal(input.revisionId)
      scheduleGeneratedChangeQueue({ projectId: thread.projectId })
      return thread
    }),

  processQueueUpdates: publicProcedure
    .input(z.object({ projectId: z.string().nullable().optional() }).optional())
    .mutation(async ({ input }) => {
      const result = await processQueuedRevisionUpdates(input ?? {})
      scheduleGeneratedChangeQueue(input ?? {})
      return result
    }),

  recoverQueue: publicProcedure
    .input(z.object({ projectId: z.string().nullable().optional() }).optional())
    .mutation(async ({ input }) => {
      const result = await recoverRevisionQueueOnStartup(input ?? {})
      scheduleGeneratedChangeQueue(input ?? {})
      return result
    }),

  cleanupWorktrees: publicProcedure
    .input(z.object({ projectId: z.string().nullable().optional() }).optional())
    .mutation(({ input }) => cleanupTerminalRevisionWorktrees(input ?? {})),

  diagnostics: publicProcedure
    .input(z.object({ projectId: z.string().nullable().optional() }).optional())
    .query(({ input }) => listRevisionQueueDiagnostics(input ?? {})),

  claimNextRun: publicProcedure
    .input(z.object({ projectId: z.string().nullable().optional() }).optional())
    .mutation(({ input }) => claimNextRevisionRun(input ?? {})),

  markRunning: publicProcedure
    .input(z.object({ revisionId: z.string() }))
    .mutation(({ input }) => claimRevisionRun(input.revisionId)),

  completeBackgroundRun: publicProcedure
    .input(z.object({ revisionId: z.string() }))
    .mutation(({ input }) => completeRevisionRun(input.revisionId)),

  failBackgroundRun: publicProcedure
    .input(z.object({
      revisionId: z.string(),
      errorMessage: z.string(),
    }))
    .mutation(({ input }) => failRevisionRun(input)),

  accept: publicProcedure
    .input(z.object({ revisionId: z.string() }))
    .mutation(async ({ input }) => {
      const thread = await acceptRevision(input.revisionId)
      scheduleGeneratedChangeQueue({ projectId: thread.projectId })
      return thread
    }),

  reject: publicProcedure
    .input(z.object({ revisionId: z.string() }))
    .mutation(({ input }) => rejectRevision(input.revisionId)),
})
