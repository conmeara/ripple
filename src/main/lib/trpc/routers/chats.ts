import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"
import { BrowserWindow } from "electron"
import * as fs from "fs/promises"
import * as path from "path"
import simpleGit from "simple-git"
import { z } from "zod"
import { getAuthManager } from "../../../index"
import { getApiUrl } from "../../config"
import {
  trackChatArchived,
  trackChatCreated,
  trackChatDeleted,
} from "../../analytics"
import { conversations, getDatabase, projects } from "../../db"
import {
  createConversation,
  getConversationMessagesJson,
  getConversationUiMessages,
  replaceConversationMessages,
} from "../../conversations/service"
import {
  createWorktreeForChat,
  fetchGitHubPRStatus,
  getWorktreeDiff,
  hasOriginRemote,
  removeWorktree,
  sanitizeProjectName,
} from "../../git"
import type { WorktreeSetupResult } from "../../git/worktree-config"
import { computeContentHash, gitCache } from "../../git/cache"
import { splitUnifiedDiffByFile } from "../../git/diff-parser"
import { execWithShellEnv } from "../../git/shell-env"
import { applyRollbackStash } from "../../git/stash"
import { checkInternetConnection, checkOllamaStatus } from "../../ollama"
import { terminalManager } from "../../terminal/manager"
import { getLocalChatReusePaths } from "../../ripple-projects/chat-reuse"
import { acceptIsolatedWorkspace } from "../../revisions/isolated-workspace-acceptance"
import { markStaleProjectRevisionsUpdating } from "../../revisions/revision-staleness"
import { scheduleGeneratedChangeQueue } from "../../agent-runtime/generated-change-scheduler"
import { windowManager } from "../../../windows/window-manager"
import { publicProcedure, router } from "../index"

type WorktreeSetupFailurePayload = {
  kind: "create-failed" | "setup-failed"
  message: string
  projectId: string
}

function sendWorktreeSetupFailure(
  windowId: number | null,
  payload: WorktreeSetupFailurePayload,
): void {
  const targets: BrowserWindow[] = []

  if (windowId !== null) {
    const window = BrowserWindow.fromId(windowId)
    if (window && !window.isDestroyed()) {
      targets.push(window)
    }
  }

  if (targets.length === 0) {
    targets.push(...BrowserWindow.getAllWindows())
  }

  for (const window of targets) {
    if (window.isDestroyed()) continue
    window.webContents.send("worktree:setup-failed", payload)
  }
}

const publicChatColumns = {
  id: conversations.id,
  name: conversations.title,
  projectId: conversations.projectId,
  compositionId: conversations.compositionId,
  commentThreadId: conversations.commentThreadId,
  revisionId: conversations.revisionId,
  kind: conversations.kind,
  status: conversations.status,
  createdAt: conversations.createdAt,
  updatedAt: conversations.updatedAt,
  archivedAt: conversations.archivedAt,
  worktreePath: conversations.worktreePath,
  branch: conversations.branch,
  baseBranch: conversations.baseBranch,
  prUrl: conversations.prUrl,
  prNumber: conversations.prNumber,
}

type ConversationChat = typeof conversations.$inferSelect

function conversationToChat(conversation: ConversationChat) {
  return {
    id: conversation.id,
    name: conversation.title,
    projectId: conversation.projectId,
    compositionId: conversation.compositionId,
    commentThreadId: conversation.commentThreadId,
    revisionId: conversation.revisionId,
    kind: conversation.kind,
    status: conversation.status,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    archivedAt: conversation.archivedAt,
    worktreePath: conversation.worktreePath,
    branch: conversation.branch,
    baseBranch: conversation.baseBranch,
    prUrl: conversation.prUrl,
    prNumber: conversation.prNumber,
  }
}

function conversationToSubChat(conversation: ConversationChat, messagesJson?: string) {
  return {
    id: conversation.id,
    name: conversation.title,
    chatId: conversation.id,
    chat_id: conversation.id,
    sessionId: conversation.sessionId,
    session_id: conversation.sessionId,
    streamId: conversation.streamId,
    stream_id: conversation.streamId,
    mode: conversation.mode,
    messages: messagesJson ?? getConversationMessagesJson(conversation.id),
    createdAt: conversation.createdAt,
    created_at: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    updated_at: conversation.updatedAt,
  }
}

function getConversationOrThrow(id: string): ConversationChat {
  const conversation = getDatabase()
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .get()
  if (!conversation) throw new Error("Conversation not found")
  return conversation
}

function stripLegacyRippleCommentPrompt(text: string): string {
  const marker = "User comment:\n"
  const markerIndex = text.indexOf(marker)
  if (markerIndex === -1) return text

  const start = markerIndex + marker.length
  const endMarker = "\n\nWhen finished,"
  const end = text.indexOf(endMarker, start)
  return text.slice(start, end === -1 ? undefined : end).trim() || text
}

function revealRippleCommentChatMessages(chatId: string): void {
  const db = getDatabase()
  const messages = getConversationUiMessages(chatId, db)
  let changed = false
  const nextMessages = messages.map((message: any) => {
    if (message?.metadata?.source !== "ripple-comment") return message
    if (!Array.isArray(message.parts)) return message

    const nextParts = message.parts.map((part: any) => {
      if (part?.type !== "text" || typeof part.text !== "string") {
        return part
      }
      const nextText = stripLegacyRippleCommentPrompt(part.text)
      if (nextText === part.text) return part
      changed = true
      return { ...part, text: nextText }
    })

    return changed ? { ...message, parts: nextParts } : message
  })

  if (changed) {
    replaceConversationMessages({
      db,
      conversationId: chatId,
      messages: nextMessages,
    })
  }
}

// Fallback to truncated user message if AI generation fails
function getFallbackName(userMessage: string): string {
  const trimmed = userMessage.trim()
  if (trimmed.length <= 25) {
    return trimmed || "New Chat"
  }
  return trimmed.substring(0, 25) + "..."
}

/**
 * Generate text using local Ollama model
 * Used for chat title generation in offline mode
 * @param userMessage - The user message to generate a title for
 * @param model - Optional model to use (if not provided, uses recommended model)
 */
async function generateChatNameWithOllama(
  userMessage: string,
  model?: string | null
): Promise<string | null> {
  try {
    const ollamaStatus = await checkOllamaStatus()
    if (!ollamaStatus.available) {
      return null
    }

    // Use provided model, or recommended, or first available
    const modelToUse = model || ollamaStatus.recommendedModel || ollamaStatus.models[0]
    if (!modelToUse) {
      console.error("[Ollama] No model available")
      return null
    }

    const prompt = `Generate a very short (2-5 words) title for a coding chat that starts with this message. The title MUST be in the same language as the user's message. Only output the title, nothing else. No quotes, no explanations.

User message: "${userMessage.slice(0, 500)}"

Title:`

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelToUse,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 50,
        },
      }),
    })

    if (!response.ok) {
      console.error("[Ollama] Generate chat name failed:", response.status)
      return null
    }

    const data = await response.json()
    const result = data.response?.trim()
    if (result) {
      // Clean up the result - remove quotes, trim, limit length
      const cleaned = result
        .replace(/^["']|["']$/g, "")
        .replace(/^title:\s*/i, "")
        .trim()
        .slice(0, 50)
      if (cleaned.length > 0) {
        return cleaned
      }
    }
    return null
  } catch (error) {
    console.error("[Ollama] Generate chat name error:", error)
    return null
  }
}

/**
 * Generate commit message using local Ollama model
 * Used for commit message generation in offline mode
 * @param diff - The diff text
 * @param fileCount - Number of files changed
 * @param additions - Lines added
 * @param deletions - Lines deleted
 * @param model - Optional model to use (if not provided, uses recommended model)
 */
async function generateCommitMessageWithOllama(
  diff: string,
  fileCount: number,
  additions: number,
  deletions: number,
  model?: string | null
): Promise<string | null> {
  try {
    const ollamaStatus = await checkOllamaStatus()
    if (!ollamaStatus.available) {
      return null
    }

    // Use provided model, or recommended, or first available
    const modelToUse = model || ollamaStatus.recommendedModel || ollamaStatus.models[0]
    if (!modelToUse) {
      console.error("[Ollama] No model available")
      return null
    }

    const prompt = `Generate a conventional commit message for these changes. Use format: type: short description

Types: feat (new feature), fix (bug fix), docs, style, refactor, test, chore

Changes: ${fileCount} files, +${additions}/-${deletions} lines

Diff (truncated):
${diff.slice(0, 3000)}

Commit message:`

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelToUse,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 50,
        },
      }),
    })

    if (!response.ok) {
      console.error("[Ollama] Generate commit message failed:", response.status)
      return null
    }

    const data = await response.json()
    const result = data.response?.trim()
    if (result) {
      // Clean up - get just the first line
      const firstLine = result.split("\n")[0]?.trim()
      if (firstLine && firstLine.length > 0 && firstLine.length < 100) {
        return firstLine
      }
    }
    return null
  } catch (error) {
    console.error("[Ollama] Generate commit message error:", error)
    return null
  }
}

export const chatsRouter = router({
  /**
   * List all non-archived chats (optionally filter by project)
   */
  list: publicProcedure
    .input(z.object({ projectId: z.string().optional() }))
    .query(({ input }) => {
      const db = getDatabase()
      const conditions = [
        isNull(conversations.archivedAt),
        isNull(conversations.deletedAt),
        eq(conversations.kind, "project"),
        sql`exists (
          select 1 from projects
          where ${projects.id} = ${conversations.projectId}
          and ${projects.archivedAt} is null
        )`,
      ]
      if (input.projectId) {
        conditions.push(eq(conversations.projectId, input.projectId))
      }
      return db
        .select(publicChatColumns)
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.updatedAt))
        .all()
    }),

  /**
   * List archived chats (optionally filter by project)
   */
  listArchived: publicProcedure
    .input(z.object({ projectId: z.string().optional() }))
    .query(({ input }) => {
      const db = getDatabase()
      const conditions = [
        isNotNull(conversations.archivedAt),
        eq(conversations.kind, "project"),
      ]
      if (input.projectId) {
        conditions.push(eq(conversations.projectId, input.projectId))
      }
      return db
        .select(publicChatColumns)
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.archivedAt))
        .all()
    }),

  /**
   * Get a single chat-shaped conversation for the existing UI.
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      const conversation = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.id))
        .get()
      if (!conversation || conversation.deletedAt) return null

      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, conversation.projectId))
        .get()

      return {
        ...conversationToChat(conversation),
        subChats: [conversationToSubChat(conversation)],
        project,
      }
    }),

  /**
   * Create a new chat with optional git worktree
   */
  create: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().optional(),
        model: z.string().optional(),
        initialMessage: z.string().optional(),
        initialMessageParts: z
          .array(
            z.union([
              z.object({ type: z.literal("text"), text: z.string() }),
              z.object({
                type: z.literal("data-image"),
                data: z.object({
                  url: z.string(),
                  mediaType: z.string().optional(),
                  filename: z.string().optional(),
                  base64Data: z.string().optional(),
                }),
              }),
              z.object({
                type: z.literal("data-file"),
                data: z.object({
                  url: z.string(),
                  mediaType: z.string().optional(),
                  filename: z.string(),
                  base64Data: z.string().optional(),
                  size: z.number().optional(),
                }),
              }),
              // Hidden file content - sent to agent but not displayed in UI
              z.object({
                type: z.literal("file-content"),
                filePath: z.string(),
                content: z.string(),
              }),
            ]),
          )
          .optional(),
        baseBranch: z.string().optional(), // Branch to base the worktree off
        branchType: z.enum(["local", "remote"]).optional(), // Whether baseBranch is local or remote
        useWorktree: z.boolean().default(true), // If false, work directly in project dir
        mode: z.enum(["plan", "agent"]).default("agent"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      console.log("[chats.create] called with:", input)
      const db = getDatabase()
      const requestingWindow = ctx.getWindow?.() ?? BrowserWindow.getFocusedWindow()
      const requestingWindowId = requestingWindow?.id ?? null

      // Get project path
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .get()
      console.log("[chats.create] found project:", project)
      if (!project) throw new Error("Project not found")

      const conversation = createConversation({
        projectId: input.projectId,
        kind: "project",
        title: input.name ?? null,
        mode: input.mode,
      })

      if (requestingWindow) {
        const claimResult = windowManager.claimChat(conversation.id, requestingWindow.id)
        if (!claimResult.ok) {
          windowManager.focusChatOwner(conversation.id)
          throw new Error("This project conversation is already open in another window.")
        }
      }

      console.log(
        "[chats.create] created conversation:",
        conversation,
      )

      // Create initial conversation messages with user message (AI SDK format)
      // If initialMessageParts is provided, use it; otherwise fallback to text-only message
      let initialMessages: Array<Record<string, any>> = []
      const initialMetadata = input.model ? { model: input.model } : undefined

      if (input.initialMessageParts && input.initialMessageParts.length > 0) {
        initialMessages = [{
          id: `msg-${Date.now()}`,
          role: "user",
          parts: input.initialMessageParts,
          ...(initialMetadata ? { metadata: initialMetadata } : {}),
        }]
      } else if (input.initialMessage) {
        initialMessages = [{
          id: `msg-${Date.now()}`,
          role: "user",
          parts: [{ type: "text", text: input.initialMessage }],
          ...(initialMetadata ? { metadata: initialMetadata } : {}),
        }]
      }

      replaceConversationMessages({
        db,
        conversationId: conversation.id,
        messages: initialMessages,
      })
      let conversationRecord = getConversationOrThrow(conversation.id)
      console.log("[chats.create] initialized conversation messages:", initialMessages.length)

      // Worktree creation result (will be set if useWorktree is true)
      let worktreeResult: {
        worktreePath?: string
        branch?: string
        baseBranch?: string
      } = {}

      // Only create worktree if useWorktree is true
      if (input.useWorktree) {
        const branchType =
          input.branchType ??
          (await hasOriginRemote(project.path) ? undefined : "local")
        console.log(
          "[chats.create] creating worktree with baseBranch:",
          input.baseBranch,
          "type:",
          branchType,
        )
        const result = await createWorktreeForChat(
          project.path,
          sanitizeProjectName(project.name),
          conversation.id,
          input.baseBranch,
          branchType,
          {
            onSetupComplete: (setupResult: WorktreeSetupResult) => {
              if (setupResult.success) return
              const message =
                setupResult.errors[0] ||
                "Project setup could not finish."
              sendWorktreeSetupFailure(requestingWindowId, {
                kind: "setup-failed",
                message,
                projectId: project.id,
              })
            },
          },
        )
        console.log("[chats.create] worktree result:", result)

        if (
          result.success &&
          result.worktreePath &&
          path.resolve(result.worktreePath) !== path.resolve(project.path)
        ) {
          conversationRecord = db.update(conversations)
            .set({
              worktreePath: result.worktreePath,
              branch: result.branch,
              baseBranch: result.baseBranch,
              updatedAt: new Date(),
            })
            .where(eq(conversations.id, conversation.id))
            .returning()
            .get()
          worktreeResult = {
            worktreePath: result.worktreePath,
            branch: result.branch,
            baseBranch: result.baseBranch,
          }
        } else {
          console.warn(`[Worktree] Failed: ${result.error}`)
          const message = result.error || "Worktree setup could not finish."
          sendWorktreeSetupFailure(requestingWindowId, {
            kind: "create-failed",
            message,
            projectId: project.id,
          })
          db.delete(conversations).where(eq(conversations.id, conversation.id)).run()
          if (requestingWindow) {
            windowManager.releaseChat(conversation.id, requestingWindow.id)
          }
          throw new Error(message)
        }
      } else {
        // Local mode: use project path directly, no branch info
        console.log("[chats.create] local mode - using project path directly")
        conversationRecord = db.update(conversations)
          .set({
            worktreePath: project.path,
            branch: null,
            baseBranch: null,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conversation.id))
          .returning()
          .get()
        worktreeResult = { worktreePath: project.path }
      }

      const response = {
        ...conversationToChat(conversationRecord),
        worktreePath: worktreeResult.worktreePath || project.path,
        branch: worktreeResult.branch ?? null,
        baseBranch: worktreeResult.baseBranch ?? null,
        subChats: [
          conversationToSubChat(
            conversationRecord,
            JSON.stringify(initialMessages),
          ),
        ],
      }

      trackChatCreated({
        chatKind: "project_chat",
        isIsolated: input.useWorktree,
        entryPoint: "new_chat",
      })

      console.log("[chats.create] returning:", response)
      return response
    }),

  /**
   * Rename a chat
   */
  rename: publicProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const updated = db
        .update(conversations)
        .set({ title: input.name, updatedAt: new Date() })
        .where(eq(conversations.id, input.id))
        .returning()
        .get()
      if (!updated) throw new Error("Conversation not found")
      return conversationToChat(updated)
    }),

  /**
   * Archive a chat (also kills any terminal processes in the workspace)
   * Optionally deletes the worktree to free disk space
   */
  archive: publicProcedure
    .input(
      z.object({
        id: z.string(),
        deleteWorktree: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      const chat = getConversationOrThrow(input.id)

      // Archive immediately (optimistic)
      const result = db
        .update(conversations)
        .set({ archivedAt: new Date(), status: "archived", updatedAt: new Date() })
        .where(eq(conversations.id, input.id))
        .returning()
        .get()

      trackChatArchived("project_chat")

      // Kill terminal processes only for worktree-mode workspaces.
      // Local-mode terminals are shared across workspaces on the same project path,
      // so they should not be killed when a single workspace is archived.
      const isLocalMode = !chat?.branch
      if (!isLocalMode) {
        terminalManager.killByWorkspaceId(input.id).then((killResult) => {
          if (killResult.killed > 0) {
            console.log(
              `[chats.archive] Killed ${killResult.killed} terminal session(s) for workspace ${input.id}`,
            )
          }
        }).catch((error) => {
          console.error(`[chats.archive] Error killing processes:`, error)
        })
      }

      // Optionally delete worktree in background (don't await)
      if (input.deleteWorktree && chat?.worktreePath && chat?.branch) {
        const project = db
          .select()
          .from(projects)
          .where(eq(projects.id, chat.projectId))
          .get()

        if (project) {
          removeWorktree(project.path, chat.worktreePath).then((worktreeResult) => {
            if (worktreeResult.success) {
              console.log(
                `[chats.archive] Deleted worktree for workspace ${input.id}`,
              )
              // Clear worktreePath since it's deleted (keep branch for reference)
              db.update(conversations)
                .set({ worktreePath: null })
                .where(eq(conversations.id, input.id))
                .run()
            } else {
              console.warn(
                `[chats.archive] Failed to delete worktree: ${worktreeResult.error}`,
              )
            }
          }).catch((error) => {
            console.error(`[chats.archive] Error removing worktree:`, error)
          })
        }
      }

      // Invalidate git cache for this worktree
      if (chat?.worktreePath) {
        gitCache.invalidateStatus(chat.worktreePath)
        gitCache.invalidateParsedDiff(chat.worktreePath)
      }

      return result ? conversationToChat(result) : null
    }),

  /**
   * Restore an archived chat
   */
  restore: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const restored = db
        .update(conversations)
        .set({ archivedAt: null, status: "open", updatedAt: new Date() })
        .where(eq(conversations.id, input.id))
        .returning()
        .get()
      return restored ? conversationToChat(restored) : null
    }),

  reveal: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      revealRippleCommentChatMessages(input.id)
      const chat = db
        .update(conversations)
        .set({
          archivedAt: null,
          deletedAt: null,
          status: "open",
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, input.id))
        .returning()
        .get()
      if (!chat) throw new Error("Chat not found.")
      return conversationToChat(chat)
    }),

  /**
   * Accept a chat worktree by committing its pending changes and merging the
   * temporary branch back into the project.
   */
  acceptWorktree: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const chat = getConversationOrThrow(input.id)
      if (!chat.worktreePath || !chat.branch) {
        throw new Error("This chat is already editing Main.")
      }

      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, chat.projectId))
        .get()
      if (!project) throw new Error("Project not found.")
      if (project.archivedAt) {
        throw new Error("Restore this project before accepting changes.")
      }

      const projectPath = path.resolve(project.localPath || project.path)
      const worktreePath = path.resolve(chat.worktreePath)
      if (worktreePath === projectPath) {
        throw new Error("This chat is already editing Main.")
      }

      const projectGit = simpleGit(projectPath)
      const currentBranch = (await projectGit.branchLocal()).current
      const baseBranch = chat.baseBranch || currentBranch || "main"
      const acceptance = await acceptIsolatedWorkspace({
        strategy: "merge",
        projectPath,
        workspacePath: worktreePath,
        branch: chat.branch,
        baseBranch,
        commitMessage: "Accept Ripple worktree changes",
      })

      const cleanup = await removeWorktree(projectPath, worktreePath)
      if (!cleanup.success) {
        console.warn(
          `[chats.acceptWorktree] Accepted ${input.id} but could not remove worktree: ${cleanup.error}`,
        )
      }

      db.update(conversations)
        .set({
          updatedAt: new Date(),
          worktreePath: cleanup.success ? projectPath : chat.worktreePath,
          branch: cleanup.success ? null : chat.branch,
          baseBranch: cleanup.success ? null : chat.baseBranch,
        })
        .where(eq(conversations.id, input.id))
        .run()

      if (acceptance.acceptedProjectCommit) {
        markStaleProjectRevisionsUpdating({
          db,
          projectId: chat.projectId,
          currentCommit: acceptance.acceptedProjectCommit,
        })
        scheduleGeneratedChangeQueue({ projectId: chat.projectId })
      }

      gitCache.invalidateStatus(projectPath)
      gitCache.invalidateParsedDiff(projectPath)
      gitCache.invalidateAllFileContents(projectPath)
      gitCache.invalidateStatus(worktreePath)
      gitCache.invalidateParsedDiff(worktreePath)
      gitCache.invalidateAllFileContents(worktreePath)

      return {
        success: true,
        chatId: input.id,
        baseBranch,
        commitHash: acceptance.acceptedWorkspaceCommit ?? undefined,
        convertedToMain: cleanup.success,
        cleanupError: cleanup.success ? undefined : cleanup.error,
      }
    }),

  /**
   * Archive multiple chats at once (also kills terminal processes in each workspace)
   */
  archiveBatch: publicProcedure
    .input(z.object({ chatIds: z.array(z.string()) }))
    .mutation(({ input }) => {
      const db = getDatabase()
      if (input.chatIds.length === 0) return []

      // Identify worktree-mode workspaces before archiving (for terminal cleanup)
      const worktreeChats = db
        .select({ id: conversations.id, branch: conversations.branch })
        .from(conversations)
        .where(inArray(conversations.id, input.chatIds))
        .all()
        .filter((c) => c.branch != null)

      // Archive immediately (optimistic)
      const result = db
        .update(conversations)
        .set({ archivedAt: new Date(), status: "archived", updatedAt: new Date() })
        .where(inArray(conversations.id, input.chatIds))
        .returning()
        .all()

      // Kill terminal processes only for worktree-mode workspaces.
      // Local-mode terminals are shared and should not be killed.

      if (worktreeChats.length > 0) {
        Promise.all(
          worktreeChats.map((c) => terminalManager.killByWorkspaceId(c.id)),
        ).then((killResults) => {
          const totalKilled = killResults.reduce((sum, r) => sum + r.killed, 0)
          if (totalKilled > 0) {
            console.log(
              `[chats.archiveBatch] Killed ${totalKilled} terminal session(s) for ${worktreeChats.length} worktree workspace(s)`,
            )
          }
        }).catch((error) => {
          console.error(`[chats.archiveBatch] Error killing processes:`, error)
        })
      }

      return result.map(conversationToChat)
    }),

  /**
   * Delete a chat permanently (with worktree cleanup)
   */
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      const chat = db.select().from(conversations).where(eq(conversations.id, input.id)).get()

      // Cleanup worktree if it was created (has branch = was a real worktree, not just project path)
      if (chat?.worktreePath && chat?.branch) {
        const project = db
          .select()
          .from(projects)
          .where(eq(projects.id, chat.projectId))
          .get()
        if (project) {
          const result = await removeWorktree(project.path, chat.worktreePath)
          if (!result.success) {
            console.warn(`[Worktree] Cleanup failed: ${result.error}`)
          }
        }
      }

      // Kill terminal processes for worktree-mode workspaces.
      // Local-mode terminals are shared and should not be killed on delete.
      if (chat?.branch) {
        terminalManager.killByWorkspaceId(input.id).catch((error) => {
          console.error(`[chats.delete] Error killing processes:`, error)
        })
      }

      trackChatDeleted("project_chat")

      // Invalidate git cache for this worktree
      if (chat?.worktreePath) {
        gitCache.invalidateStatus(chat.worktreePath)
        gitCache.invalidateParsedDiff(chat.worktreePath)
      }

      const deleted = db.update(conversations)
        .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(conversations.id, input.id))
        .returning()
        .get()
      return deleted ? conversationToChat(deleted) : null
    }),

  // ============ Sub-chat procedures ============

  /**
   * Get a single sub-chat
   */
  getSubChat: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      const conversation = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.id))
        .get()

      if (!conversation || conversation.deletedAt) return null

      const project = conversation
        ? db
            .select()
            .from(projects)
            .where(eq(projects.id, conversation.projectId))
            .get()
        : null

      return {
        ...conversationToSubChat(conversation),
        chat: { ...conversationToChat(conversation), project },
      }
    }),

  /**
   * Create a new sub-chat
   */
  createSubChat: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        name: z.string().optional(),
        mode: z.enum(["plan", "agent"]).default("agent"),
      }),
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      const parent = getConversationOrThrow(input.chatId)
      const conversation = createConversation({
        projectId: parent.projectId,
        compositionId: parent.compositionId,
        kind: "project",
        title: input.name ?? "New Chat",
        mode: input.mode,
        worktreePath: parent.worktreePath,
        branch: parent.branch,
        baseBranch: parent.baseBranch,
      })
      return conversationToSubChat(conversation, "[]")
    }),

  /**
   * Fork a sub-chat from a specific message, preserving SDK session context.
   * Creates a new sub-chat with messages up to the target message,
   * copies the .jsonl session file, and marks it for forkSession resume.
   */
  forkSubChat: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        messageId: z.string(),
        messageIndex: z.number().int().nonnegative().optional(),
        name: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // 1. Get the source conversation
      const sourceConversation = getConversationOrThrow(input.subChatId)

      // 2. Parse messages and find the cutoff point
      const allMessages = getConversationUiMessages(sourceConversation.id, db)
      let cutoffIndex = allMessages.findIndex(
        (m: any) => m.id === input.messageId,
      )
      // Fallback: AI SDK generates its own message IDs on the client which differ
      // from the server-generated UUIDs stored in the DB. Use the message index
      // (passed from the client) as a fallback when the ID doesn't match.
      if (cutoffIndex === -1 && input.messageIndex !== undefined && input.messageIndex < allMessages.length) {
        cutoffIndex = input.messageIndex
      }
      if (cutoffIndex === -1) throw new Error("Message not found")

      // 3. Slice messages up to and including the target
      const messagesToFork = allMessages.slice(0, cutoffIndex + 1)

      // 4. Find sdkMessageUuid of last assistant message (for resumeSessionAt)
      const lastAssistant = [...messagesToFork]
        .reverse()
        .find((m: any) => m.role === "assistant") as any
      const forkAtSdkUuid = lastAssistant?.metadata?.sdkMessageUuid || null

      // 5. Generate new IDs for all messages + set shouldForkResume on last assistant
      const forkedMessages = messagesToFork.map((msg: any, i: number) => ({
        ...msg,
        id: `fork-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        metadata: {
          ...msg.metadata,
          shouldResume: undefined,
          ...(msg === lastAssistant &&
            forkAtSdkUuid && {
              shouldForkResume: true,
            }),
        },
      }))

      // 6. Generate fork name: [N] originalName
      let forkName = input.name
      if (!forkName) {
        // Strip existing [N] prefix from source name to get base name
        const sourceName = sourceConversation.title || "Chat"
        const baseName = sourceName.replace(/^\[\d+\]\s*/, "")

        // Find highest [N] among sibling conversations
        const siblings = db
          .select({ name: conversations.title })
          .from(conversations)
          .where(eq(conversations.projectId, sourceConversation.projectId))
          .all()

        let maxN = 0
        for (const s of siblings) {
          const match = s.name?.match(/^\[(\d+)\]/)
          if (match) {
            maxN = Math.max(maxN, parseInt(match[1], 10))
          }
        }

        forkName = `[${maxN + 1}] ${baseName}`
      }

      // 7. Insert new conversation with sessionId from original (needed for resume)
      const newConversation = createConversation({
        projectId: sourceConversation.projectId,
        compositionId: sourceConversation.compositionId,
        kind: sourceConversation.kind,
        title: forkName,
        mode: sourceConversation.mode,
        sessionId: sourceConversation.sessionId,
        worktreePath: sourceConversation.worktreePath,
        branch: sourceConversation.branch,
        baseBranch: sourceConversation.baseBranch,
      })
      replaceConversationMessages({
        db,
        conversationId: newConversation.id,
        messages: forkedMessages,
      })
      let newSubChat = conversationToSubChat(
        getConversationOrThrow(newConversation.id),
        JSON.stringify(forkedMessages),
      )

      // 8. Copy .jsonl session files to the new isolated config dir
      if (sourceConversation.sessionId) {
        try {
          const { app } = await import("electron")
          const userDataPath = app.getPath("userData")
          const sourceDir = path.join(
            userDataPath,
            "claude-sessions",
            input.subChatId,
            "projects",
          )
          const targetDir = path.join(
            userDataPath,
            "claude-sessions",
            newSubChat.id,
            "projects",
          )

          const sourceDirExists = await fs
            .stat(sourceDir)
            .then(() => true)
            .catch(() => false)

          if (sourceDirExists) {
            await fs.cp(sourceDir, targetDir, { recursive: true })
          }
        } catch (err) {
          console.warn("[forkSubChat] Failed to copy session files:", err)
          // Clear shouldForkResume since there's no .jsonl to fork from
          for (const m of forkedMessages) {
            if (m.metadata?.shouldForkResume) {
              delete m.metadata.shouldForkResume
            }
          }
          replaceConversationMessages({
            db,
            conversationId: newConversation.id,
            messages: forkedMessages,
          })
          newSubChat = conversationToSubChat(
            getConversationOrThrow(newConversation.id),
            JSON.stringify(forkedMessages),
          )
        }
      }

      console.log("[forkSubChat] Created", { id: newSubChat.id, name: forkName, messages: forkedMessages.length })

      return {
        subChat: newSubChat,
        messageCount: forkedMessages.length,
        forkAtSdkUuid,
      }
    }),

  /**
   * Update sub-chat messages
   */
  updateSubChatMessages: publicProcedure
    .input(z.object({ id: z.string(), messages: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const messages = JSON.parse(input.messages || "[]")
      replaceConversationMessages({
        db,
        conversationId: input.id,
        messages: Array.isArray(messages) ? messages : [],
      })
      return conversationToSubChat(getConversationOrThrow(input.id))
    }),

  /**
   * Rollback to a specific message by sdkMessageUuid
   * Handles both git state rollback and message truncation
   * Git rollback is done first - if it fails, the whole operation aborts
   */
  rollbackToMessage: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        sdkMessageUuid: z.string(),
      }),
    )
    .mutation(async ({ input }): Promise<
      | { success: false; error: string }
      | { success: true; messages: any[] }
    > => {
      const db = getDatabase()

      // 1. Get the conversation and its messages
      const conversation = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.subChatId))
        .get()
      if (!conversation) return { success: false, error: "Conversation not found" }

      // 2. Parse messages and find the target message by sdkMessageUuid
      const messages = getConversationUiMessages(conversation.id, db)
      const targetIndex = messages.findIndex(
        (m: any) => m.metadata?.sdkMessageUuid === input.sdkMessageUuid,
      )

      if (targetIndex === -1) {
        return { success: false, error: "Message not found" }
      }

      // 4. Rollback git state first - if this fails, abort the whole operation
      if (conversation.worktreePath) {
        const res = await applyRollbackStash(conversation.worktreePath, input.sdkMessageUuid)
        if (!res.success) {
          return { success: false, error: `Git rollback failed: ${res.error}` }
        }
        // If checkpoint wasn't found, we still fail because we can't safely rollback
        // without reverting the git state to match the message history
        if (!res.checkpointFound) {
          return { success: false, error: "Checkpoint not found - cannot rollback git state" }
        }
      }

      // 5. Truncate messages to include up to and including the target message
      let truncatedMessages = messages.slice(0, targetIndex + 1)

      // 5.5. Clear any old shouldResume flags, then set on the target message
      truncatedMessages = truncatedMessages.map((m: any, i: number) => {
        const { shouldResume, ...restMeta } = m.metadata || {}
        return {
          ...m,
          metadata: {
            ...restMeta,
            ...(i === truncatedMessages.length - 1 && { shouldResume: true }),
          },
        }
      })

      // 6. Update the conversation with truncated messages
      replaceConversationMessages({
        db,
        conversationId: input.subChatId,
        messages: truncatedMessages,
      })

      return {
        success: true,
        messages: truncatedMessages,
      }
    }),

  /**
   * Update sub-chat session ID (for Claude resume)
   */
  updateSubChatSession: publicProcedure
    .input(z.object({ id: z.string(), sessionId: z.string().nullable() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const updated = db
        .update(conversations)
        .set({ sessionId: input.sessionId })
        .where(eq(conversations.id, input.id))
        .returning()
        .get()
      return updated ? conversationToSubChat(updated) : null
    }),

  /**
   * Update sub-chat mode
   */
  updateSubChatMode: publicProcedure
    .input(z.object({ id: z.string(), mode: z.enum(["plan", "agent"]) }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const updated = db
        .update(conversations)
        .set({ mode: input.mode })
        .where(eq(conversations.id, input.id))
        .returning()
        .get()
      if (!updated) throw new Error("Conversation not found")
      return conversationToSubChat(updated)
    }),

  /**
   * Rename a sub-chat
   */
  renameSubChat: publicProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(({ input }) => {
      const db = getDatabase()
      const updated = db
        .update(conversations)
        .set({ title: input.name, updatedAt: new Date() })
        .where(eq(conversations.id, input.id))
        .returning()
        .get()
      if (!updated) throw new Error("Conversation not found")
      return conversationToSubChat(updated)
    }),

  /**
   * Delete a sub-chat
   */
  deleteSubChat: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .update(conversations)
        .set({
          status: "deleted",
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Get git diff for a chat's worktree
   */
  getDiff: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.chatId))
        .get()

      if (!chat?.worktreePath) {
        return { diff: null, error: "No worktree path" }
      }

      const result = await getWorktreeDiff(
        chat.worktreePath,
        chat.baseBranch ?? undefined,
      )

      if (!result.success) {
        return { diff: null, error: result.error }
      }

      return { diff: result.diff || "" }
    }),

  /**
   * Get parsed diff with prefetched file contents
   * This endpoint does all diff parsing on the server side to avoid blocking UI
   * Uses GitCache for instant responses when diff hasn't changed
   */
  getParsedDiff: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.chatId))
        .get()

      if (!chat?.worktreePath) {
        return {
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
          fileContents: {},
          error: "No worktree path",
        }
      }

      // 1. Get raw diff (only uncommitted changes - don't show branch diff after commit)
      const result = await getWorktreeDiff(
        chat.worktreePath,
        chat.baseBranch ?? undefined,
        { onlyUncommitted: true },
      )

      if (!result.success) {
        return {
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
          fileContents: {},
          error: result.error,
        }
      }

      // 2. Check cache using diff hash
      const diffHash = computeContentHash(result.diff || "")
      type ParsedDiffResponse = {
        files: ReturnType<typeof splitUnifiedDiffByFile>
        totalAdditions: number
        totalDeletions: number
        fileContents: Record<string, string>
      }
      const cached = gitCache.getParsedDiff<ParsedDiffResponse>(chat.worktreePath, diffHash)
      if (cached) {
        return cached
      }

      // 3. Parse diff into files
      const files = splitUnifiedDiffByFile(result.diff || "")

      // 4. Calculate totals
      const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0)
      const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

      // 5. Prefetch file contents (first 20 files, non-deleted, non-binary)
      const MAX_PREFETCH = 20
      const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

      const filesToFetch = files
        .filter((f) => !f.isBinary && !f.isDeletedFile)
        .slice(0, MAX_PREFETCH)
        .map((f) => ({
          key: f.key,
          filePath: f.newPath !== "/dev/null" ? f.newPath : f.oldPath,
        }))
        .filter((f) => f.filePath && f.filePath !== "/dev/null")

      const fileContents: Record<string, string> = {}

      // Read files in parallel
      await Promise.all(
        filesToFetch.map(async ({ key, filePath }) => {
          try {
            const fullPath = path.join(chat.worktreePath!, filePath)

            // Check file size first
            const stats = await fs.stat(fullPath)
            if (stats.size > MAX_FILE_SIZE) {
              return // Skip large files
            }

            const content = await fs.readFile(fullPath, "utf-8")

            // Quick binary check (NUL bytes in first 8KB)
            const checkLength = Math.min(content.length, 8192)
            for (let i = 0; i < checkLength; i++) {
              if (content.charCodeAt(i) === 0) {
                return // Skip binary files
              }
            }

            fileContents[key] = content
          } catch {
            // File might not exist or be unreadable - skip
          }
        }),
      )

      const response: ParsedDiffResponse = {
        files,
        totalAdditions,
        totalDeletions,
        fileContents,
      }

      // 6. Store in cache
      gitCache.setParsedDiff(chat.worktreePath, diffHash, response)
      return response
    }),

  /**
   * Generate a commit message using AI based on the diff
   * @param chatId - The chat ID to get worktree path from
   * @param filePaths - Optional list of file paths to generate message for (if not provided, uses all changed files)
   * @param ollamaModel - Optional Ollama model for offline generation
   */
  generateCommitMessage: publicProcedure
    .input(z.object({
      chatId: z.string(),
      filePaths: z.array(z.string()).optional(),
      ollamaModel: z.string().nullish(), // Optional model for offline mode
    }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.chatId))
        .get()

      if (!chat?.worktreePath) {
        throw new Error("No worktree path")
      }

      // Get the diff to understand what changed
      const result = await getWorktreeDiff(
        chat.worktreePath,
        chat.baseBranch ?? undefined,
      )

      if (!result.success || !result.diff) {
        throw new Error("Failed to get diff")
      }

      // Parse diff to get file list
      let files = splitUnifiedDiffByFile(result.diff)

      // Filter to only selected files if filePaths provided
      if (input.filePaths && input.filePaths.length > 0) {
        const selectedPaths = new Set(input.filePaths)
        files = files.filter((f) => {
          const filePath = f.newPath !== "/dev/null" ? f.newPath : f.oldPath
          // Match by exact path or by path suffix (handle different path formats)
          return selectedPaths.has(filePath) ||
            [...selectedPaths].some(sp => filePath.endsWith(sp) || sp.endsWith(filePath))
        })
        console.log(`[generateCommitMessage] Filtered ${files.length} files from ${input.filePaths.length} selected paths`)
      }

      if (files.length === 0) {
        throw new Error("No changes to commit")
      }

      // Build filtered diff text for API (only selected files)
      const filteredDiff = files.map(f => f.diffText).join('\n')
      const additions = files.reduce((sum, f) => sum + f.additions, 0)
      const deletions = files.reduce((sum, f) => sum + f.deletions, 0)

      // Check internet first - if offline, use Ollama
      const hasInternet = await checkInternetConnection()

      if (!hasInternet) {
        console.log("[generateCommitMessage] Offline - trying Ollama...")
        const ollamaMessage = await generateCommitMessageWithOllama(
          filteredDiff,
          files.length,
          additions,
          deletions,
          input.ollamaModel
        )
        if (ollamaMessage) {
          console.log("[generateCommitMessage] Generated via Ollama:", ollamaMessage)
          return { message: ollamaMessage }
        }
        console.log("[generateCommitMessage] Ollama failed, using heuristic fallback")
        // Fall through to heuristic fallback below
      } else {
        // Online - call web API to generate commit message
        let apiError: string | null = null
        try {
          const authManager = getAuthManager()
          const token = await authManager.getValidToken()
          const apiUrl = getApiUrl()

          if (!apiUrl) {
            apiError = "Hosted API not configured"
          } else if (!token) {
            apiError = "No auth token available"
          } else {
            const response = await fetch(
              `${apiUrl}/api/agents/generate-commit-message`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Desktop-Token": token,
                },
                body: JSON.stringify({
                  diff: filteredDiff.slice(0, 10000), // Limit diff size, use filtered diff
                  fileCount: files.length,
                  additions,
                  deletions,
                }),
              },
            )

            if (response.ok) {
              const data = await response.json()
              if (data.message) {
                return { message: data.message }
              }
              apiError = "API returned ok but no message in response"
            } else {
              apiError = `API returned ${response.status}`
            }
          }
        } catch (error) {
          apiError = `API call failed: ${error instanceof Error ? error.message : String(error)}`
        }

        if (apiError) {
          console.log("[generateCommitMessage] API error:", apiError)
        }
      }

      // Fallback: Generate commit message with conventional commits style
      const fileNames = files.map((f) => {
        const filePath = f.newPath !== "/dev/null" ? f.newPath : f.oldPath
        // Note: Git diff paths always use forward slashes
        return path.posix.basename(filePath) || filePath
      })

      // Detect commit type from file changes
      const hasNewFiles = files.some((f) => f.oldPath === "/dev/null")
      const hasDeletedFiles = files.some((f) => f.newPath === "/dev/null")
      const hasOnlyDeletions = files.every((f) => f.additions === 0 && f.deletions > 0)

      // Detect type from file paths
      const allPaths = files.map((f) => f.newPath !== "/dev/null" ? f.newPath : f.oldPath)
      const hasTestFiles = allPaths.some((p) => p.includes("test") || p.includes("spec"))
      const hasDocFiles = allPaths.some((p) => p.endsWith(".md") || p.includes("doc"))
      const hasConfigFiles = allPaths.some((p) =>
        p.includes("config") ||
        p.endsWith(".json") ||
        p.endsWith(".yaml") ||
        p.endsWith(".yml") ||
        p.endsWith(".toml")
      )

      // Determine commit type prefix
      let prefix = "chore"
      if (hasNewFiles && !hasDeletedFiles) {
        prefix = "feat"
      } else if (hasOnlyDeletions) {
        prefix = "chore"
      } else if (hasTestFiles && !hasDocFiles && !hasConfigFiles) {
        prefix = "test"
      } else if (hasDocFiles && !hasTestFiles && !hasConfigFiles) {
        prefix = "docs"
      } else if (allPaths.some((p) => p.includes("fix") || p.includes("bug"))) {
        prefix = "fix"
      } else if (files.length > 0 && files.every((f) => f.additions > 0 || f.deletions > 0)) {
        // Default to fix for modifications (most common case)
        prefix = "fix"
      }

      const uniqueFileNames = [...new Set(fileNames)]
      let message: string

      if (uniqueFileNames.length === 1) {
        message = `${prefix}: update ${uniqueFileNames[0]}`
      } else if (uniqueFileNames.length <= 3) {
        message = `${prefix}: update ${uniqueFileNames.join(", ")}`
      } else {
        message = `${prefix}: update ${uniqueFileNames.length} files`
      }

      console.log("[generateCommitMessage] Generated fallback message:", message)
      return { message }
    }),

  /**
   * Generate a name for a sub-chat using AI
   * Uses Ollama when offline, otherwise calls web API
   */
  generateSubChatName: publicProcedure
    .input(z.object({
      userMessage: z.string(),
      ollamaModel: z.string().nullish(), // Optional model for offline mode
    }))
    .mutation(async ({ input }) => {
      try {
        // Check internet first - if offline, use Ollama
        const hasInternet = await checkInternetConnection()

        if (!hasInternet) {
          console.log("[generateSubChatName] Offline - trying Ollama...")
          const ollamaName = await generateChatNameWithOllama(input.userMessage, input.ollamaModel)
          if (ollamaName) {
            console.log("[generateSubChatName] Generated name via Ollama:", ollamaName)
            return { name: ollamaName }
          }
          console.log("[generateSubChatName] Ollama failed, using fallback")
          return { name: getFallbackName(input.userMessage) }
        }

        // Online - use web API
        const authManager = getAuthManager()
        const token = await authManager.getValidToken()
        const apiUrl = getApiUrl()

        if (!apiUrl) {
          console.log("[generateSubChatName] Hosted API not configured, using fallback")
          return { name: getFallbackName(input.userMessage) }
        }

        console.log(
          "[generateSubChatName] Online - calling API with token:",
          token ? "present" : "missing",
        )

        const response = await fetch(
          `${apiUrl}/api/agents/sub-chat/generate-name`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token && { "X-Desktop-Token": token }),
            },
            body: JSON.stringify({ userMessage: input.userMessage }),
          },
        )

        console.log("[generateSubChatName] Response status:", response.status)

        if (!response.ok) {
          const errorText = await response.text()
          console.error(
            "[generateSubChatName] API error:",
            response.status,
            errorText,
          )
          return { name: getFallbackName(input.userMessage) }
        }

        const data = await response.json()
        console.log("[generateSubChatName] Generated name:", data.name)
        return { name: data.name || getFallbackName(input.userMessage) }
      } catch (error) {
        console.error("[generateSubChatName] Error:", error)
        return { name: getFallbackName(input.userMessage) }
      }
    }),

  // ============ PR-related procedures ============

  /**
   * Get PR context for message generation (branch info, uncommitted changes, etc.)
   */
  getPrContext: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.chatId))
        .get()

      if (!chat?.worktreePath) {
        return null
      }

      try {
        const git = simpleGit(chat.worktreePath)
        const status = await git.status()

        // Check if upstream exists
        let hasUpstream = false
        try {
          const tracking = await git.raw([
            "rev-parse",
            "--abbrev-ref",
            "@{upstream}",
          ])
          hasUpstream = !!tracking.trim()
        } catch {
          hasUpstream = false
        }

        return {
          branch: chat.branch || status.current || "unknown",
          baseBranch: chat.baseBranch || "main",
          uncommittedCount: status.files.length,
          hasUpstream,
        }
      } catch (error) {
        console.error("[getPrContext] Error:", error)
        return null
      }
    }),

  /**
   * Update PR info after Claude creates a PR
   */
  updatePrInfo: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        prUrl: z.string(),
        prNumber: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const result = db
        .update(conversations)
        .set({
          prUrl: input.prUrl,
          prNumber: input.prNumber,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, input.chatId))
        .returning()
        .get()

      return result
    }),

  /**
   * Get PR status from GitHub (via gh CLI)
   */
  getPrStatus: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.chatId))
        .get()

      if (!chat?.worktreePath) {
        return null
      }

      return await fetchGitHubPRStatus(chat.worktreePath)
    }),

  /**
   * Merge PR via gh CLI
   * First checks if PR is mergeable, returns helpful error if conflicts exist
   */
  mergePr: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        method: z.enum(["merge", "squash", "rebase"]).default("squash"),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.chatId))
        .get()

      if (!chat?.worktreePath || !chat?.prNumber) {
        throw new Error("No PR to merge")
      }

      // Check PR mergeability before attempting merge
      const prStatus = await fetchGitHubPRStatus(chat.worktreePath)
      if (prStatus?.pr?.mergeable === "CONFLICTING") {
        throw new Error(
          "MERGE_CONFLICT: This PR has merge conflicts with the base branch. " +
          "Please sync your branch with the latest changes from main to resolve conflicts."
        )
      }

      try {
        await execWithShellEnv(
          "gh",
          [
            "pr",
            "merge",
            String(chat.prNumber),
            `--${input.method}`,
            "--delete-branch",
          ],
          { cwd: chat.worktreePath },
        )
        return { success: true }
      } catch (error) {
        console.error("[mergePr] Error:", error)
        const errorMsg = error instanceof Error ? error.message : "Failed to merge PR"

        // Check for conflict-related error messages from gh CLI
        if (
          errorMsg.includes("not mergeable") ||
          errorMsg.includes("merge conflict") ||
          errorMsg.includes("cannot be cleanly created") ||
          errorMsg.includes("CONFLICTING")
        ) {
          throw new Error(
            "MERGE_CONFLICT: This PR has merge conflicts with the base branch. " +
            "Please sync your branch with the latest changes from main to resolve conflicts."
          )
        }

        throw new Error(errorMsg)
      }
    }),

  /**
   * Get file change stats for workspaces
   * Parses messages from specified sub-chats and aggregates Edit/Write tool calls
   * Supports two modes:
   * - openSubChatIds: query specific sub-chats (used by main sidebar)
   * - chatIds: query all sub-chats for given chats (used by archive popover)
   */
  getFileStats: publicProcedure
    .input(z.object({
      openSubChatIds: z.array(z.string()).optional(),
      chatIds: z.array(z.string()).optional(),
    }))
    .query(({ input }) => {
    const db = getDatabase()

    // Early return if nothing to check
    if ((!input.openSubChatIds || input.openSubChatIds.length === 0) &&
        (!input.chatIds || input.chatIds.length === 0)) {
      return []
    }

    const conversationIds = input.chatIds && input.chatIds.length > 0
      ? input.chatIds
      : input.openSubChatIds ?? []
    const conversationRows = conversationIds.length > 0
      ? db
          .select({ id: conversations.id })
          .from(conversations)
          .where(inArray(conversations.id, conversationIds))
          .all()
      : []
    const allChats: Array<{ chatId: string | null; subChatId: string; messages: string | null }> =
      conversationRows.map((conversation) => ({
        chatId: conversation.id,
        subChatId: conversation.id,
        messages: getConversationMessagesJson(conversation.id, db),
      }))

    // Aggregate stats per workspace (chatId)
    const statsMap = new Map<
      string,
      { additions: number; deletions: number; fileCount: number }
    >()

    for (const row of allChats) {
      if (!row.messages || !row.chatId) continue
      const chatId = row.chatId // TypeScript narrowing

      try {
        const messages = JSON.parse(row.messages) as Array<{
          role: string
          parts?: Array<{
            type: string
            input?: {
              file_path?: string
              old_string?: string
              new_string?: string
              content?: string
            }
          }>
        }>

        // Track file states for this sub-chat
        const fileStates = new Map<
          string,
          { originalContent: string | null; currentContent: string }
        >()

        for (const msg of messages) {
          if (msg.role !== "assistant") continue
          for (const part of msg.parts || []) {
            if (part.type === "tool-Edit" || part.type === "tool-Write") {
              const filePath = part.input?.file_path
              if (!filePath) continue
              // Skip session files
              if (
                filePath.includes("claude-sessions") ||
                filePath.includes("Application Support")
              )
                continue

              const oldString = part.input?.old_string || ""
              const newString =
                part.input?.new_string || part.input?.content || ""

              const existing = fileStates.get(filePath)
              if (existing) {
                existing.currentContent = newString
              } else {
                fileStates.set(filePath, {
                  originalContent: part.type === "tool-Write" ? null : oldString,
                  currentContent: newString,
                })
              }
            }
          }
        }

        // Calculate stats for this sub-chat and add to workspace total
        let subChatAdditions = 0
        let subChatDeletions = 0
        let subChatFileCount = 0

        for (const [, state] of fileStates) {
          const original = state.originalContent || ""
          if (original === state.currentContent) continue

          const oldLines = original ? original.split("\n").length : 0
          const newLines = state.currentContent
            ? state.currentContent.split("\n").length
            : 0

          if (!original) {
            // New file
            subChatAdditions += newLines
          } else {
            subChatAdditions += newLines
            subChatDeletions += oldLines
          }
          subChatFileCount += 1
        }

        // Add to workspace total
        const existing = statsMap.get(chatId) || {
          additions: 0,
          deletions: 0,
          fileCount: 0,
        }
        existing.additions += subChatAdditions
        existing.deletions += subChatDeletions
        existing.fileCount += subChatFileCount
        statsMap.set(chatId, existing)
      } catch {
        // Skip invalid JSON
      }
    }

    // Convert to array for easier consumption
    return Array.from(statsMap.entries()).map(([chatId, stats]) => ({
      chatId,
      ...stats,
    }))
  }),

  /**
   * Get sub-chats with pending plan approvals
   * Uses mode field as source of truth: mode="plan" + completed ExitPlanMode = pending approval
   * Logic must match active-chat.tsx hasUnapprovedPlan
   * REQUIRES openSubChatIds to avoid loading all sub-chats (performance optimization)
   */
  getPendingPlanApprovals: publicProcedure
    .input(z.object({ openSubChatIds: z.array(z.string()) }))
    .query(({ input }) => {
    const db = getDatabase()

    // Early return if no sub-chats to check
    if (input.openSubChatIds.length === 0) {
      return []
    }

    const allSubChats = db
      .select({
        chatId: conversations.id,
        subChatId: conversations.id,
        mode: conversations.mode,
        id: conversations.id,
      })
      .from(conversations)
      .where(inArray(conversations.id, input.openSubChatIds))
      .all()

    const pendingApprovals: Array<{ subChatId: string; chatId: string }> = []

    for (const row of allSubChats) {
      if (!row.subChatId || !row.chatId) continue

      // If mode is "agent", plan is already approved - skip
      if (row.mode === "agent") continue

      // Only check for ExitPlanMode in plan mode sub-chats
      const messagesJson = getConversationMessagesJson(row.id, db)
      if (!messagesJson) continue

      try {
        const messages = JSON.parse(messagesJson) as Array<{
          role: string
          content?: string
          parts?: Array<{
            type: string
            text?: string
            output?: unknown
          }>
        }>

        // Check if there's a completed ExitPlanMode in messages
        const hasCompletedExitPlanMode = (): boolean => {
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i]
            if (!msg) continue

            // If assistant message with completed ExitPlanMode, we found an unapproved plan
            if (msg.role === "assistant" && msg.parts) {
              const exitPlanPart = msg.parts.find(
                (p) => p.type === "tool-ExitPlanMode"
              )
              // Check if ExitPlanMode is completed (has output, even if empty)
              if (exitPlanPart && exitPlanPart.output !== undefined) {
                return true
              }
            }
          }
          return false
        }

        if (hasCompletedExitPlanMode()) {
          pendingApprovals.push({
            subChatId: row.subChatId,
            chatId: row.chatId,
          })
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return pendingApprovals
  }),

  /**
   * Get worktree status for archive dialog
   * Returns whether workspace has a worktree and uncommitted changes count
   */
  getWorktreeStatus: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.chatId))
        .get()

      // No worktree if no branch (local mode)
      if (!chat?.worktreePath || !chat?.branch) {
        return { hasWorktree: false, uncommittedCount: 0 }
      }

      try {
        const git = simpleGit(chat.worktreePath)
        const status = await git.status()

        return {
          hasWorktree: true,
          uncommittedCount: status.files.length,
        }
      } catch (error) {
        // Worktree path doesn't exist or git error
        console.warn("[getWorktreeStatus] Error checking worktree:", error)
        return { hasWorktree: false, uncommittedCount: 0 }
      }
    }),

  /**
   * Export a chat conversation to various formats.
   * Supports exporting entire workspace or a single sub-chat.
   * Useful for sharing, backup, or importing into other tools.
   */
  exportChat: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        subChatId: z.string().optional(), // If provided, export only this sub-chat
        format: z.enum(["json", "markdown", "text"]).default("markdown"),
      }),
    )
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.chatId))
        .get()

      if (!chat) {
        throw new Error("Chat not found")
      }

      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, chat.projectId))
        .get()

      const exportConversationId = input.subChatId ?? input.chatId
      const exportConversation = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, exportConversationId))
        .get()
      if (!exportConversation || exportConversation.projectId !== chat.projectId) {
        throw new Error("Conversation not found")
      }
      const chatSubChats: Array<{
        id: string
        name: string | null
        messages: string
      }> = [{
        id: exportConversation.id,
        name: exportConversation.title,
        messages: getConversationMessagesJson(exportConversation.id, db),
      }]

      // parse messages from sub-chats
      const allMessages: Array<{
        subChatId: string
        subChatName: string | null
        messages: Array<{
          id: string
          role: string
          parts: Array<{ type: string; text?: string; [key: string]: any }>
          metadata?: any
        }>
      }> = []

      for (const subChat of chatSubChats) {
        try {
          const messages = JSON.parse(subChat.messages || "[]")
          allMessages.push({
            subChatId: subChat.id,
            subChatName: subChat.name,
            messages,
          })
        } catch {
          // skip invalid json
        }
      }

      // Sanitize filename - remove characters that are invalid on Windows/macOS/Linux
      const sanitizeFilename = (name: string): string => {
        return name
          .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") // Invalid chars
          .replace(/\s+/g, "_") // Replace spaces with underscores
          .replace(/_+/g, "_") // Collapse multiple underscores
          .replace(/^_|_$/g, "") // Trim underscores from ends
          .slice(0, 100) // Limit length
          || "chat" // Fallback if empty
      }

      // Use sub-chat name if exporting single sub-chat, otherwise use chat name
      const exportName = input.subChatId && chatSubChats[0]?.name
        ? `${chat.title || "chat"}-${chatSubChats[0].name}`
        : (chat.title || "chat")
      const safeFilename = sanitizeFilename(exportName)

      if (input.format === "json") {
        return {
          format: "json" as const,
          content: JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              chat: {
                id: chat.id,
                name: chat.title,
                createdAt: chat.createdAt,
                branch: chat.branch,
                baseBranch: chat.baseBranch,
                prUrl: chat.prUrl,
              },
              project: project
                ? {
                    id: project.id,
                    name: project.name,
                    path: project.path,
                  }
                : null,
              conversations: allMessages,
            },
            null,
            2,
          ),
          filename: `${safeFilename}-${chat.id.slice(0, 8)}.json`,
        }
      }

      if (input.format === "text") {
        // plain text format
        let text = `# ${chat.title || "Untitled Chat"}\n`
        text += `exported: ${new Date().toISOString()}\n`
        if (project) {
          text += `project: ${project.name}\n`
        }
        text += `\n---\n\n`

        for (const subChatData of allMessages) {
          if (subChatData.subChatName) {
            text += `## ${subChatData.subChatName}\n\n`
          }

          for (const msg of subChatData.messages) {
            const role = msg.role === "user" ? "You" : "Assistant"
            text += `${role}:\n`

            for (const part of msg.parts || []) {
              if (part.type === "text" && part.text) {
                text += `${part.text}\n`
              } else if (part.type?.startsWith("tool-") && part.toolName) {
                text += `[used ${part.toolName} tool]\n`
              }
            }
            text += "\n"
          }
        }

        return {
          format: "text" as const,
          content: text,
          filename: `${safeFilename}-${chat.id.slice(0, 8)}.txt`,
        }
      }

      // markdown format (default)
      let markdown = `# ${chat.title || "Untitled Chat"}\n\n`
      markdown += `**Exported:** ${new Date().toISOString()}\n\n`
      if (project) {
        markdown += `**Project:** ${project.name}\n\n`
      }
      if (chat.branch) {
        markdown += `**Branch:** \`${chat.branch}\`\n\n`
      }
      if (chat.prUrl) {
        markdown += `**PR:** [${chat.prUrl}](${chat.prUrl})\n\n`
      }
      markdown += `---\n\n`

      for (const subChatData of allMessages) {
        if (subChatData.subChatName) {
          markdown += `## ${subChatData.subChatName}\n\n`
        }

        for (const msg of subChatData.messages) {
          const role = msg.role === "user" ? "**You**" : "**Assistant**"
          markdown += `### ${role}\n\n`

          for (const part of msg.parts || []) {
            if (part.type === "text" && part.text) {
              markdown += `${part.text}\n\n`
            } else if (part.type?.startsWith("tool-") && part.toolName) {
              const toolName = part.toolName
              if (toolName === "Bash" && part.input?.command) {
                markdown += `\`\`\`bash\n${part.input.command}\n\`\`\`\n\n`
              } else if (
                (toolName === "Edit" || toolName === "Write") &&
                part.input?.file_path
              ) {
                markdown += `> Modified: \`${part.input.file_path}\`\n\n`
              } else if (toolName === "Read" && part.input?.file_path) {
                markdown += `> Read: \`${part.input.file_path}\`\n\n`
              } else {
                markdown += `> *Used ${toolName} tool*\n\n`
              }
            }
          }
        }
      }

      return {
        format: "markdown" as const,
        content: markdown,
        filename: `${safeFilename}-${chat.id.slice(0, 8)}.md`,
      }
    }),

  /**
   * Get basic stats for a chat (message count, tool usage, etc.)
   * Supports both full chat stats and individual sub-chat stats.
   * Useful for showing chat summary in sidebar or export dialogs.
   */
  getChatStats: publicProcedure
    .input(z.object({
      chatId: z.string(),
      subChatId: z.string().optional(), // If provided, return stats for only this sub-chat
    }))
    .query(({ input }) => {
      const db = getDatabase()

      const targetConversationId = input.subChatId ?? input.chatId
      const targetConversation = db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, targetConversationId))
        .get()
      const chatSubChats = targetConversation
        ? [{
            id: targetConversation.id,
            messages: getConversationMessagesJson(targetConversation.id, db),
          }]
        : []

      let messageCount = 0
      let userMessageCount = 0
      let assistantMessageCount = 0
      let toolCalls = 0
      const toolUsage: Record<string, number> = {}
      let totalInputTokens = 0
      let totalOutputTokens = 0

      for (const subChat of chatSubChats) {
        try {
          const messages = JSON.parse(subChat.messages || "[]") as Array<{
            role: string
            parts?: Array<{ type: string; toolName?: string }>
            metadata?: { usage?: { inputTokens?: number; outputTokens?: number } }
          }>

          for (const msg of messages) {
            messageCount++
            if (msg.role === "user") {
              userMessageCount++
            } else if (msg.role === "assistant") {
              assistantMessageCount++

              // count tool calls
              for (const part of msg.parts || []) {
                if (part.type?.startsWith("tool-") && part.toolName) {
                  toolCalls++
                  toolUsage[part.toolName] = (toolUsage[part.toolName] || 0) + 1
                }
              }

              // aggregate token usage
              if (msg.metadata?.usage) {
                totalInputTokens += msg.metadata.usage.inputTokens || 0
                totalOutputTokens += msg.metadata.usage.outputTokens || 0
              }
            }
          }
        } catch {
          // skip invalid json
        }
      }

      return {
        messageCount,
        userMessageCount,
        assistantMessageCount,
        toolCalls,
        toolUsage,
        totalInputTokens,
        totalOutputTokens,
        subChatCount: chatSubChats.length,
      }
    }),
})
