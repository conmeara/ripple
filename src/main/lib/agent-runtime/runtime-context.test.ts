import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import {
  compositions,
  projects,
  workspaces,
} from "../db/schema"
import {
  appendRuntimeContextToPrompt,
  buildAgentRuntimeContextPrompt,
  normalizeAgentRuntimeContextPayload,
  resolveAgentRuntimeCurrentFrameSnapshot,
} from "./runtime-context"
import type { ResolvedWorkspaceContext } from "./workspace-context"

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
    CREATE TABLE compositions (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      name text NOT NULL,
      file_path text NOT NULL,
      data_composition_id text NOT NULL,
      width integer NOT NULL,
      height integer NOT NULL,
      parent_composition_id text,
      kind text DEFAULT 'root' NOT NULL,
      created_at integer,
      updated_at integer
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
    schema: { projects, compositions, workspaces },
  })
  return { sqlite, db }
}

describe("agent runtime live context", () => {
  test("normalizes renderer context without accepting arbitrary fields", () => {
    expect(normalizeAgentRuntimeContextPayload({
      compositionId: "composition-1",
      previewTimeSeconds: -2,
      previewFrame: 12.8,
      previewSource: { kind: "chat-worktree", conversationId: "conversation-1" },
      ignoredPath: "/outside",
    })).toEqual({
      projectId: null,
      compositionId: "composition-1",
      previewTimeSeconds: 0,
      previewFrame: 13,
      previewSource: { kind: "chat-worktree", conversationId: "conversation-1", chatId: null },
      commentThreadId: null,
      revisionId: null,
      exportJobId: null,
    })
  })

  test("builds provider-only prompt context from validated project state", () => {
    const { sqlite, db } = createTestDb()
    try {
      db.insert(projects)
        .values({
          id: "project-1",
          name: "Launch Promo",
          path: "/tmp/launch-promo",
          localPath: "/tmp/launch-promo",
          activeCompositionId: "composition-1",
        })
        .run()
      db.insert(compositions)
        .values({
          id: "composition-1",
          projectId: "project-1",
          name: "Main",
          filePath: "index.html",
          dataCompositionId: "main",
          width: 1920,
          height: 1080,
          kind: "root",
        })
        .run()
      const workspace = db.insert(workspaces)
        .values({
          id: "workspace-1",
          projectId: "project-1",
          kind: "main",
          targetType: "project",
          targetId: "project-1",
          path: "/tmp/launch-promo",
          isolationState: "main",
        })
        .returning()
        .get()
      const project = db.select().from(projects).get()!

      const context = buildAgentRuntimeContextPrompt({
        db: db as never,
        resolved: {
          workspace,
          project,
          cwd: "/tmp/launch-promo",
          projectPath: "/tmp/launch-promo",
          writableRoot: "/tmp/launch-promo",
          kind: "main",
          targetType: "project",
          targetId: "project-1",
        } satisfies ResolvedWorkspaceContext,
        runtime: {
          runKind: "chat",
          runtimeContext: {
            compositionId: "composition-1",
            previewTimeSeconds: 1.25,
            previewFrame: 38,
            previewSource: { kind: "main" },
          },
        },
      })

      expect(context).toContain("Project: Launch Promo")
      expect(context).toContain("Composition: Main (index.html)")
      expect(context).toContain("Preview time: 1.250s")
      expect(appendRuntimeContextToPrompt({
        prompt: "Make the title larger.",
        context,
      })).toContain("Ripple live context:")
    } finally {
      sqlite.close()
    }
  })

  test("resolves app-managed current-frame snapshots from the live preview context", () => {
    const { sqlite, db } = createTestDb()
    try {
      db.insert(projects)
        .values({
          id: "project-1",
          name: "Launch Promo",
          path: "/tmp/launch-promo",
          localPath: "/tmp/launch-promo",
          activeCompositionId: "composition-1",
        })
        .run()
      db.insert(compositions)
        .values({
          id: "composition-1",
          projectId: "project-1",
          name: "Main",
          filePath: "index.html",
          dataCompositionId: "main",
          width: 1280,
          height: 720,
          kind: "root",
        })
        .run()
      const workspace = db.insert(workspaces)
        .values({
          id: "workspace-1",
          projectId: "project-1",
          kind: "main",
          targetType: "project",
          targetId: "project-1",
          path: "/tmp/launch-promo",
          isolationState: "main",
        })
        .returning()
        .get()
      const project = db.select().from(projects).get()!

      const snapshot = resolveAgentRuntimeCurrentFrameSnapshot({
        db: db as never,
        resolved: {
          workspace,
          project,
          cwd: "/tmp/launch-promo",
          projectPath: "/tmp/launch-promo",
          writableRoot: "/tmp/launch-promo",
          kind: "main",
          targetType: "project",
          targetId: "project-1",
        } satisfies ResolvedWorkspaceContext,
        runtimeContext: {
          compositionId: "composition-1",
          previewTimeSeconds: 1.25,
          previewFrame: 38,
          previewSource: { kind: "main" },
        },
      })

      expect(snapshot).toEqual({
        projectPath: "/tmp/launch-promo",
        sourcePath: "/tmp/launch-promo",
        compositionPath: "index.html",
        sourceRevisionId: null,
        timeMs: 1250,
        fps: 30,
        width: 1280,
        height: 720,
      })
    } finally {
      sqlite.close()
    }
  })

  test("rejects renderer composition ids outside the selected project", () => {
    const { sqlite, db } = createTestDb()
    try {
      db.insert(projects)
        .values({
          id: "project-1",
          name: "Launch Promo",
          path: "/tmp/launch-promo",
          localPath: "/tmp/launch-promo",
          activeCompositionId: null,
        })
        .run()
      const workspace = db.insert(workspaces)
        .values({
          id: "workspace-1",
          projectId: "project-1",
          kind: "main",
          targetType: "project",
          targetId: "project-1",
          path: "/tmp/launch-promo",
          isolationState: "main",
        })
        .returning()
        .get()
      const project = db.select().from(projects).get()!

      expect(() => buildAgentRuntimeContextPrompt({
        db: db as never,
        resolved: {
          workspace,
          project,
          cwd: "/tmp/launch-promo",
          projectPath: "/tmp/launch-promo",
          writableRoot: "/tmp/launch-promo",
          kind: "main",
          targetType: "project",
          targetId: "project-1",
        } satisfies ResolvedWorkspaceContext,
        runtime: {
          runKind: "chat",
          runtimeContext: {
            compositionId: "other-project-composition",
          },
        },
      })).toThrow("could not validate this composition")
    } finally {
      sqlite.close()
    }
  })
})
