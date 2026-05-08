import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { eq } from "drizzle-orm"
import type { RippleRevisionStatus } from "../../../shared/ripple-comments"
import { revisions } from "../db/schema"
import { markStaleProjectRevisionsUpdating } from "./revision-staleness"

function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.exec(`
    CREATE TABLE revisions (
      id text PRIMARY KEY NOT NULL,
      thread_id text NOT NULL,
      project_id text NOT NULL,
      composition_id text,
      conversation_id text,
      chat_id text,
      sub_chat_id text,
      agent_provider text,
      agent_model text,
      agent_thread_id text,
      agent_run_id text,
      base_revision_id text,
      base_project_commit text,
      base_project_hash text,
      context_path text,
      branch text,
      prompt text NOT NULL,
      status text DEFAULT 'queued' NOT NULL,
      preview_context_key text,
      diff_summary text,
      error_message text,
      created_at integer,
      updated_at integer,
      resolved_at integer
    );
  `)
  const db = drizzle(sqlite, { schema: { revisions } })
  return { sqlite, db: db as any }
}

function insertRevision(
  db: ReturnType<typeof createTestDb>["db"],
  input: {
    id: string
    projectId?: string
    baseProjectCommit?: string | null
    status?: RippleRevisionStatus
  },
) {
  db.insert(revisions)
    .values({
      id: input.id,
      threadId: `thread-${input.id}`,
      projectId: input.projectId ?? "project-1",
      prompt: "Update this comment",
      status: input.status ?? "proposed",
      baseProjectCommit: "baseProjectCommit" in input
        ? input.baseProjectCommit
        : "old-main",
      errorMessage: "Previous warning",
      createdAt: new Date(1),
      updatedAt: new Date(1),
    })
    .run()
}

describe("revision staleness", () => {
  test("marks only stale proposed revisions for automatic replay", () => {
    const { sqlite, db } = createTestDb()
    try {
      insertRevision(db, { id: "accepted", baseProjectCommit: "old-main" })
      insertRevision(db, { id: "stale", baseProjectCommit: "old-main" })
      insertRevision(db, { id: "current", baseProjectCommit: "new-main" })
      insertRevision(db, { id: "missing-base", baseProjectCommit: null })
      insertRevision(db, { id: "failed", baseProjectCommit: "old-main", status: "failed" })
      insertRevision(db, { id: "other-project", projectId: "project-2", baseProjectCommit: "old-main" })

      const marked = markStaleProjectRevisionsUpdating({
        db,
        projectId: "project-1",
        currentCommit: "new-main",
        acceptedRevisionId: "accepted",
      })

      expect(marked).toBe(1)
      expect(
        db.select().from(revisions).where(eq(revisions.id, "stale")).get()?.status,
      ).toBe("updating")
      expect(
        db.select().from(revisions).where(eq(revisions.id, "stale")).get()?.errorMessage,
      ).toBeNull()
      expect(
        db.select().from(revisions).where(eq(revisions.id, "accepted")).get()?.status,
      ).toBe("proposed")
      expect(
        db.select().from(revisions).where(eq(revisions.id, "current")).get()?.status,
      ).toBe("proposed")
      expect(
        db.select().from(revisions).where(eq(revisions.id, "missing-base")).get()?.status,
      ).toBe("proposed")
      expect(
        db.select().from(revisions).where(eq(revisions.id, "failed")).get()?.status,
      ).toBe("failed")
      expect(
        db.select().from(revisions).where(eq(revisions.id, "other-project")).get()?.status,
      ).toBe("proposed")
    } finally {
      sqlite.close()
    }
  })
})
