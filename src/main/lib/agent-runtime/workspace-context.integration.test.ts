import { beforeAll, describe, expect, mock, test } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  chats,
  conversations,
  projects,
  workspaces,
} from "../db/schema"

type WorkspaceContextModule = typeof import("./workspace-context")

let workspaceContext: WorkspaceContextModule

beforeAll(async () => {
  mock.module("electron", () => ({
    app: {
      getPath: () => "/tmp/ripple-workspace-context-test",
      isPackaged: false,
    },
  }))
  workspaceContext = await import("./workspace-context")
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
    CREATE TABLE chats (
      id text PRIMARY KEY NOT NULL,
      name text,
      project_id text NOT NULL,
      created_at integer,
      updated_at integer,
      archived_at integer,
      is_hidden integer DEFAULT 0 NOT NULL,
      worktree_path text,
      branch text,
      base_branch text,
      pr_url text,
      pr_number integer
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
    CREATE TABLE workspaces (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      kind text NOT NULL,
      target_type text NOT NULL,
      target_id text NOT NULL,
      path text NOT NULL,
      base_project_commit text,
      isolation_state text DEFAULT 'isolated' NOT NULL,
      created_at integer,
      updated_at integer,
      archived_at integer
    );
  `)
  const db = drizzle(sqlite, {
    schema: { projects, chats, conversations, workspaces },
  })
  return { sqlite, db }
}

describe("resolveAgentWorkspaceContext", () => {
  test("resolves normal project conversations to Main", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-main-workspace-"))
    const projectPath = join(root, "project")
    const { sqlite, db } = createTestDb()
    try {
      await mkdir(projectPath)
      db.insert(projects)
        .values({
          id: "project-1",
          name: "Launch Promo",
          path: projectPath,
          localPath: projectPath,
        })
        .run()
      db.insert(conversations)
        .values({
          id: "conversation-main",
          projectId: "project-1",
          kind: "project",
          title: "Main chat",
          status: "open",
          mode: "agent",
          worktreePath: projectPath,
          branch: null,
        })
        .run()

      const resolved = workspaceContext.resolveAgentWorkspaceContext({
        type: "conversation",
        conversationId: "conversation-main",
      }, db as never)

      expect(resolved.kind).toBe("main")
      expect(resolved.targetType).toBe("conversation")
      expect(resolved.cwd).toBe(projectPath)
      expect(resolved.writableRoot).toBe(projectPath)
    } finally {
      sqlite.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  test("resolves registered conversation drafts to isolated writable roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "ripple-draft-workspace-"))
    const projectPath = join(root, "project")
    const draftPath = join(root, "draft")
    const { sqlite, db } = createTestDb()
    try {
      await mkdir(projectPath)
      await mkdir(draftPath)
      db.insert(projects)
        .values({
          id: "project-1",
          name: "Launch Promo",
          path: projectPath,
          localPath: projectPath,
        })
        .run()
      db.insert(conversations)
        .values({
          id: "conversation-draft",
          projectId: "project-1",
          kind: "project",
          title: "Draft chat",
          status: "open",
          mode: "agent",
          worktreePath: draftPath,
          branch: "ripple/draft-chat",
          baseBranch: "base-commit",
        })
        .run()
      db.insert(workspaces)
        .values({
          id: "workspace-draft",
          projectId: "project-1",
          kind: "chat_worktree",
          targetType: "conversation",
          targetId: "conversation-draft",
          path: draftPath,
          baseProjectCommit: "base-commit",
          isolationState: "isolated",
        })
        .run()

      const resolved = workspaceContext.resolveAgentWorkspaceContext({
        type: "conversation",
        conversationId: "conversation-draft",
      }, db as never)

      expect(resolved.kind).toBe("chat_worktree")
      expect(resolved.targetType).toBe("conversation")
      expect(resolved.targetId).toBe("conversation-draft")
      expect(resolved.cwd).toBe(draftPath)
      expect(resolved.projectPath).toBe(projectPath)
      expect(resolved.writableRoot).toBe(draftPath)
      expect(resolved.workspace.baseProjectCommit).toBe("base-commit")
    } finally {
      sqlite.close()
      await rm(root, { recursive: true, force: true })
    }
  })
})
