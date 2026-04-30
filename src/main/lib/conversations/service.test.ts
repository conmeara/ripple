import { beforeAll, describe, expect, mock, test } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { eq } from "drizzle-orm"
import {
  commentThreads,
  conversationMessages,
  conversations,
  projects,
} from "../db/schema"

type ConversationService = typeof import("./service")

let service: ConversationService

beforeAll(async () => {
  mock.module("electron", () => ({
    app: {
      getPath: () => "/tmp/ripple-conversation-service-test",
      isPackaged: false,
    },
  }))
  service = await import("./service")
})

function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.exec(`
    CREATE TABLE projects (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      slug text,
      local_path text UNIQUE,
      path text NOT NULL UNIQUE,
      aspect_ratio_preset text,
      active_composition_id text,
      template_id text,
      setup_status text DEFAULT 'unknown' NOT NULL,
      setup_error text,
      last_setup_check_at integer,
      created_at integer,
      updated_at integer,
      archived_at integer,
      git_remote_url text,
      git_provider text,
      git_owner text,
      git_repo text,
      icon_path text
    );
    CREATE TABLE conversations (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      composition_id text,
      comment_thread_id text,
      revision_id text,
      kind text DEFAULT 'project' NOT NULL,
      title text,
      summary text,
      status text DEFAULT 'open' NOT NULL,
      mode text DEFAULT 'agent' NOT NULL,
      session_id text,
      stream_id text,
      worktree_path text,
      branch text,
      base_branch text,
      pr_url text,
      pr_number integer,
      created_at integer,
      updated_at integer,
      archived_at integer,
      deleted_at integer
    );
    CREATE TABLE conversation_messages (
      id text PRIMARY KEY NOT NULL,
      conversation_id text NOT NULL,
      agent_run_id text,
      source_event_id text,
      role text NOT NULL,
      body text DEFAULT '' NOT NULL,
      parts_json text DEFAULT '[]' NOT NULL,
      metadata_json text DEFAULT '{}' NOT NULL,
      created_at integer
    );
    CREATE TABLE comment_threads (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      composition_id text,
      conversation_id text,
      anchor_type text DEFAULT 'frame' NOT NULL,
      start_time_ms integer DEFAULT 0 NOT NULL,
      end_time_ms integer,
      start_frame integer DEFAULT 0 NOT NULL,
      end_frame integer,
      element_selector text,
      clip_key text,
      source_file text,
      screenshot_path text,
      client_request_id text,
      status text DEFAULT 'open' NOT NULL,
      latest_revision_id text,
      created_at integer,
      updated_at integer,
      resolved_at integer,
      deleted_at integer
    );
  `)
  const db = drizzle(sqlite, {
    schema: { projects, conversations, conversationMessages, commentThreads },
  })
  return { sqlite, db: db as any }
}

function seedProject(db: ReturnType<typeof createTestDb>["db"], id = "project-1") {
  db.insert(projects)
    .values({
      id,
      name: "Launch Promo",
      path: `/tmp/${id}`,
      localPath: `/tmp/${id}`,
      createdAt: new Date(1),
      updatedAt: new Date(1),
    })
    .run()
}

describe("Ripple conversation service", () => {
  test("lists only project conversations for normal chat history", () => {
    const { sqlite, db } = createTestDb()
    try {
      seedProject(db)
      const older = service.createProjectConversation({
        projectId: "project-1",
        initialBody: "Make a launch title card.",
        db,
      })
      const newer = service.createProjectConversation({
        projectId: "project-1",
        initialBody: "Continue the old lower third.",
        db,
      })
      const commentConversation = db
        .insert(conversations)
        .values({
          id: "comment-conversation-1",
          projectId: "project-1",
          kind: "comment",
          status: "open",
          title: "Frame comment",
          mode: "agent",
          createdAt: new Date(4),
          updatedAt: new Date(4),
        })
        .returning()
        .get()
      db.update(conversations)
        .set({ deletedAt: new Date(5), updatedAt: new Date(5) })
        .where(eq(conversations.id, older.id))
        .run()

      service.appendConversationMessage({
        db,
        conversationId: newer.id,
        role: "user",
        body: "Continue the old lower third.",
      })
      service.appendConversationMessage({
        db,
        conversationId: commentConversation.id,
        role: "user",
        body: "This frame is too quiet.",
      })

      expect(service.listProjectConversations({ projectId: "project-1", db }).map((item) => item.id))
        .toEqual([newer.id])
      expect(
        service.listProjectConversations({
          projectId: "project-1",
          includeDeleted: true,
          db,
        }).map((item) => item.id),
      ).toEqual([newer.id, older.id])
    } finally {
      sqlite.close()
    }
  })

  test("attaches comment threads to a reusable comment conversation", () => {
    const { sqlite, db } = createTestDb()
    try {
      seedProject(db)
      const thread = db
        .insert(commentThreads)
        .values({
          id: "thread-1",
          projectId: "project-1",
          anchorType: "frame",
          startTime: 3000,
          startFrame: 90,
          status: "open",
          createdAt: new Date(1),
          updatedAt: new Date(1),
        })
        .returning()
        .get()

      const first = service.ensureCommentConversation({
        thread,
        title: "Frame 90",
        db,
      })
      const refreshedThread = db
        .select()
        .from(commentThreads)
        .where(eq(commentThreads.id, thread.id))
        .get()!
      const second = service.ensureCommentConversation({
        thread: refreshedThread,
        title: "Should not create another",
        db,
      })

      expect(first.kind).toBe("comment")
      expect(first.commentThreadId).toBe("thread-1")
      expect(second.id).toBe(first.id)
      expect(refreshedThread.conversationId).toBe(first.id)
    } finally {
      sqlite.close()
    }
  })

  test("reopens archived conversations on user replies without duplicating generated prompts", () => {
    const { sqlite, db } = createTestDb()
    try {
      seedProject(db)
      const conversation = service.createProjectConversation({
        projectId: "project-1",
        initialBody: "Initial prompt",
        db,
      })
      db.update(conversations)
        .set({
          status: "archived",
          archivedAt: new Date(2),
          deletedAt: new Date(2),
        })
        .where(eq(conversations.id, conversation.id))
        .run()

      service.appendConversationMessage({
        db,
        conversationId: conversation.id,
        role: "user",
        body: "Make the title warmer.",
        metadata: { agentRunId: "run-1" },
      })
      service.appendConversationMessage({
        db,
        conversationId: conversation.id,
        role: "user",
        body: "Make the title warmer.",
        metadata: { agentRunId: "run-1" },
      })

      const view = service.getConversationView(conversation.id, db)!
      expect(view.status).toBe("open")
      expect(view.archivedAt).toBeNull()
      expect(view.deletedAt).toBeNull()
      expect(view.messages).toHaveLength(1)
      expect(view.messages[0]?.body).toBe("Make the title warmer.")
    } finally {
      sqlite.close()
    }
  })

  test("round-trips rich chat messages used by reopened transcripts", () => {
    const { sqlite, db } = createTestDb()
    try {
      seedProject(db)
      const conversation = service.createProjectConversation({
        projectId: "project-1",
        initialBody: "Use this reference.",
        db,
      })

      service.replaceConversationMessages({
        db,
        conversationId: conversation.id,
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [
              { type: "text", text: "Use this reference." },
              {
                type: "data-image",
                data: { filename: "frame.png", mediaType: "image/png" },
              },
            ],
            metadata: { source: "ripple-chat" },
          },
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              { type: "reasoning", text: "Checking timing." },
              { type: "tool-Bash", input: { command: "git diff" } },
              { type: "text", text: "Updated the title card." },
            ],
            metadata: { agentRunId: "run-1" },
          },
        ],
      })

      expect(service.getConversationUiMessages(conversation.id, db)).toEqual([
        {
          id: "user-1",
          role: "user",
          parts: [
            { type: "text", text: "Use this reference." },
            {
              type: "data-image",
              data: { filename: "frame.png", mediaType: "image/png" },
            },
          ],
          metadata: { source: "ripple-chat" },
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "Checking timing." },
            { type: "tool-Bash", input: { command: "git diff" } },
            { type: "text", text: "Updated the title card." },
          ],
          metadata: { agentRunId: "run-1" },
        },
      ])
      expect(JSON.parse(service.getConversationMessagesJson(conversation.id, db)))
        .toHaveLength(2)
      expect(service.getConversationView(conversation.id, db)?.latestMessageBody).toBe(
        "Updated the title card.",
      )
    } finally {
      sqlite.close()
    }
  })
})
