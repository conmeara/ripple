import { z } from "zod"
import {
  RIPPLE_COMMENT_FILTERS,
  RIPPLE_COMMENT_THREAD_STATUSES,
  type RippleCommentAnchorInput,
} from "../../../../shared/ripple-comments"
import {
  acceptRevision,
  addCommentReply,
  createCommentThread,
  createRevisionForThread,
  deleteCommentThread,
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

export const revisionsRouter = router({
  listThreads: publicProcedure
    .input(z.object({
      projectId: z.string(),
      compositionId: z.string().nullable().optional(),
      filter: z.enum(RIPPLE_COMMENT_FILTERS).optional(),
    }))
    .query(({ input }) => listCommentThreads(input)),

  createThread: publicProcedure
    .input(z.object({
      projectId: z.string(),
      compositionId: z.string().nullable().optional(),
      body: z.string(),
      anchor: anchorInput,
      createRevision: z.boolean().optional(),
      model: z.string().optional(),
      clientRequestId: z.string().optional(),
    }))
    .mutation(({ input }) => createCommentThread(input)),

  addReply: publicProcedure
    .input(z.object({
      threadId: z.string(),
      body: z.string(),
      createRevision: z.boolean().optional(),
      model: z.string().optional(),
      clientRequestId: z.string().optional(),
    }))
    .mutation(({ input }) => addCommentReply(input)),

  createFromThread: publicProcedure
    .input(z.object({
      threadId: z.string(),
      body: z.string(),
      baseRevisionId: z.string().nullable().optional(),
      model: z.string().optional(),
    }))
    .mutation(({ input }) => createRevisionForThread(input)),

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
    .mutation(({ input }) => updateStaleRevisionProposal(input.revisionId)),

  processQueueUpdates: publicProcedure
    .input(z.object({ projectId: z.string().nullable().optional() }).optional())
    .mutation(({ input }) => processQueuedRevisionUpdates(input ?? {})),

  recoverQueue: publicProcedure
    .input(z.object({ projectId: z.string().nullable().optional() }).optional())
    .mutation(({ input }) => recoverRevisionQueueOnStartup(input ?? {})),

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
    .mutation(({ input }) => acceptRevision(input.revisionId)),

  reject: publicProcedure
    .input(z.object({ revisionId: z.string() }))
    .mutation(({ input }) => rejectRevision(input.revisionId)),
})
