import { describe, expect, test } from "bun:test"
import { repairConversationCompatibilitySchema } from "./schema-repair"

const { Database } = require("bun:sqlite") as {
  Database: new (path: string) => any
}

function columnNames(database: any): string[] {
  return database
    .prepare("PRAGMA table_info(conversations)")
    .all()
    .map((column: any) => String(column.name))
}

describe("database startup schema repair", () => {
  test("adds missing conversation compatibility columns to drifted dev databases", () => {
    const database = new Database(":memory:")
    database.exec(`
      CREATE TABLE conversations (
        id text PRIMARY KEY NOT NULL,
        project_id text NOT NULL,
        kind text DEFAULT 'project' NOT NULL,
        title text,
        status text DEFAULT 'open' NOT NULL,
        updated_at integer
      )
    `)

    repairConversationCompatibilitySchema(database as any)
    repairConversationCompatibilitySchema(database as any)

    expect(columnNames(database)).toEqual(
      expect.arrayContaining([
        "mode",
        "session_id",
        "stream_id",
        "worktree_path",
        "branch",
        "base_branch",
        "pr_url",
        "pr_number",
      ]),
    )

    const indexes = database
      .prepare("PRAGMA index_list(conversations)")
      .all()
      .map((index: any) => String(index.name))
    expect(indexes).toContain("conversations_worktree_path_idx")
    expect(indexes).toContain("conversations_project_kind_updated_idx")

    database.close()
  })

  test("prepares drifted conversations tables for the 0014 legacy import", () => {
    const database = new Database(":memory:")
    database.exec(`
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
        created_at integer,
        updated_at integer,
        archived_at integer,
        deleted_at integer
      );
      CREATE TABLE chats (
        id text PRIMARY KEY NOT NULL,
        project_id text NOT NULL,
        name text,
        worktree_path text,
        branch text,
        base_branch text,
        pr_url text,
        pr_number integer,
        archived_at integer,
        is_hidden integer DEFAULT 0 NOT NULL,
        created_at integer,
        updated_at integer
      );
      CREATE TABLE sub_chats (
        id text PRIMARY KEY NOT NULL,
        chat_id text NOT NULL,
        name text,
        mode text DEFAULT 'agent' NOT NULL,
        session_id text,
        stream_id text,
        messages text DEFAULT '[]' NOT NULL,
        created_at integer,
        updated_at integer
      );
      CREATE TABLE revisions (
        id text PRIMARY KEY NOT NULL,
        thread_id text,
        sub_chat_id text,
        updated_at integer,
        created_at integer
      );
      INSERT INTO chats (id, project_id, name, worktree_path, branch, created_at, updated_at)
      VALUES ('chat-1', 'project-1', 'Project chat', '/tmp/project', NULL, 1, 1);
      INSERT INTO sub_chats (id, chat_id, name, mode, session_id, stream_id, messages, created_at, updated_at)
      VALUES ('sub-1', 'chat-1', 'Draft chat', 'agent', 'session-1', 'stream-1', '[]', 1, 2);
    `)

    repairConversationCompatibilitySchema(database as any)

    expect(() => {
      database.exec(`
        INSERT OR IGNORE INTO conversations (
          id,
          project_id,
          kind,
          title,
          status,
          mode,
          session_id,
          stream_id,
          worktree_path,
          branch,
          base_branch,
          pr_url,
          pr_number,
          created_at,
          updated_at
        )
        SELECT
          sub_chats.id,
          chats.project_id,
          'project',
          COALESCE(sub_chats.name, chats.name, 'New Chat'),
          'open',
          sub_chats.mode,
          sub_chats.session_id,
          sub_chats.stream_id,
          chats.worktree_path,
          chats.branch,
          chats.base_branch,
          chats.pr_url,
          chats.pr_number,
          COALESCE(sub_chats.created_at, chats.created_at),
          COALESCE(sub_chats.updated_at, chats.updated_at)
        FROM sub_chats
        INNER JOIN chats ON chats.id = sub_chats.chat_id;
      `)
    }).not.toThrow()

    expect(
      database
        .prepare("SELECT mode, session_id, worktree_path FROM conversations WHERE id = ?")
        .get("sub-1"),
    ).toMatchObject({
      mode: "agent",
      session_id: "session-1",
      worktree_path: "/tmp/project",
    })

    database.close()
  })

  test("is a no-op before the conversations table exists", () => {
    const database = new Database(":memory:")

    expect(() => repairConversationCompatibilitySchema(database as any)).not.toThrow()

    database.close()
  })
})
