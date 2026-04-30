import { eq } from "drizzle-orm"
import { z } from "zod"
import {
  RIPPLE_CONVERSATION_KINDS,
  titleFromConversationBody,
} from "../../../../shared/ripple-conversations"
import {
  commentThreads,
  compositions,
  conversations,
  getDatabase,
  projects,
  revisions,
} from "../../db"
import {
  createConversation,
  createProjectConversation,
  getConversationView,
  listProjectConversations,
} from "../../conversations/service"
import { publicProcedure, router } from "../index"

function assertProject(projectId: string): void {
  const project = getDatabase()
    .select({ id: projects.id, archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get()
  if (!project) throw new Error("Project not found.")
  if (project.archivedAt) throw new Error("Restore this project before chatting.")
}

function assertConversationAttachments(input: {
  projectId: string
  compositionId?: string | null
  commentThreadId?: string | null
  revisionId?: string | null
}): void {
  const db = getDatabase()

  if (input.compositionId) {
    const composition = db
      .select({
        id: compositions.id,
        projectId: compositions.projectId,
      })
      .from(compositions)
      .where(eq(compositions.id, input.compositionId))
      .get()
    if (!composition || composition.projectId !== input.projectId) {
      throw new Error("Composition does not belong to this project.")
    }
  }

  if (input.commentThreadId) {
    const thread = db
      .select({
        id: commentThreads.id,
        projectId: commentThreads.projectId,
        compositionId: commentThreads.compositionId,
      })
      .from(commentThreads)
      .where(eq(commentThreads.id, input.commentThreadId))
      .get()
    if (!thread || thread.projectId !== input.projectId) {
      throw new Error("Comment does not belong to this project.")
    }
    if (input.compositionId && thread.compositionId !== input.compositionId) {
      throw new Error("Comment does not belong to this composition.")
    }
  }

  if (input.revisionId) {
    const revision = db
      .select({
        id: revisions.id,
        projectId: revisions.projectId,
        compositionId: revisions.compositionId,
        threadId: revisions.threadId,
      })
      .from(revisions)
      .where(eq(revisions.id, input.revisionId))
      .get()
    if (!revision || revision.projectId !== input.projectId) {
      throw new Error("Generated change does not belong to this project.")
    }
    if (input.compositionId && revision.compositionId !== input.compositionId) {
      throw new Error("Generated change does not belong to this composition.")
    }
    if (input.commentThreadId && revision.threadId !== input.commentThreadId) {
      throw new Error("Generated change does not belong to this comment.")
    }
  }
}

export const conversationsRouter = router({
  list: publicProcedure
    .input(z.object({
      projectId: z.string(),
      includeDeleted: z.boolean().optional(),
    }))
    .query(({ input }) => {
      assertProject(input.projectId)
      return listProjectConversations(input)
    }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => getConversationView(input.id)),

  create: publicProcedure
    .input(z.object({
      projectId: z.string(),
      compositionId: z.string().nullable().optional(),
      commentThreadId: z.string().nullable().optional(),
      revisionId: z.string().nullable().optional(),
      kind: z.enum(RIPPLE_CONVERSATION_KINDS).default("project"),
      title: z.string().trim().min(1).max(120).nullable().optional(),
      initialBody: z.string().nullable().optional(),
    }))
    .mutation(({ input }) => {
      assertProject(input.projectId)
      assertConversationAttachments(input)
      const title = input.title ?? titleFromConversationBody(input.initialBody ?? "")
      if (input.kind === "project") {
        return createProjectConversation({
          projectId: input.projectId,
          compositionId: input.compositionId,
          title,
          initialBody: input.initialBody,
        })
      }
      return createConversation({
        projectId: input.projectId,
        compositionId: input.compositionId ?? null,
        commentThreadId: input.commentThreadId ?? null,
        revisionId: input.revisionId ?? null,
        kind: input.kind,
        title,
      })
    }),

  rename: publicProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().trim().min(1).max(120),
    }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const updated = db
        .update(conversations)
        .set({ title: input.title, updatedAt: new Date() })
        .where(eq(conversations.id, input.id))
        .returning()
        .get()
      if (!updated) throw new Error("Conversation not found.")
      return updated
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const now = new Date()
      const updated = db
        .update(conversations)
        .set({ status: "archived", archivedAt: now, updatedAt: now })
        .where(eq(conversations.id, input.id))
        .returning()
        .get()
      if (!updated) throw new Error("Conversation not found.")
      return updated
    }),
})
