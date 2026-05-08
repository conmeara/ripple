import { describe, expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { readFile, rm, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { eq } from "drizzle-orm"
import simpleGit from "simple-git"
import { revisions } from "../db/schema"
import { acceptIsolatedWorkspace } from "./isolated-workspace-acceptance"
import { refreshRevisionProposalFromLatest } from "./revision-acceptance"
import { markStaleProjectRevisionsUpdating } from "./revision-staleness"
import { canReuseRevisionAsFollowUpBase } from "./revision-follow-up-policy"

const execFileAsync = promisify(execFile)

async function configureGit(projectPath: string): Promise<void> {
  await execFileAsync("git", ["-C", projectPath, "init", "-b", "main"])
  await execFileAsync("git", ["-C", projectPath, "config", "user.name", "Test"])
  await execFileAsync("git", [
    "-C",
    projectPath,
    "config",
    "user.email",
    "test@example.invalid",
  ])
  await execFileAsync("git", [
    "-C",
    projectPath,
    "config",
    "ripple.revisionManaged",
    "true",
  ])
}

async function createProject(files: Record<string, string>): Promise<{
  projectPath: string
  baseCommit: string
}> {
  const projectPath = await mkdtemp(join(tmpdir(), "ripple-comment-chat-flow-"))
  await configureGit(projectPath)
  for (const [filePath, contents] of Object.entries(files)) {
    await writeFile(join(projectPath, filePath), contents, "utf8")
  }
  await execFileAsync("git", ["-C", projectPath, "add", "-A"])
  await execFileAsync("git", ["-C", projectPath, "commit", "-m", "Base"])
  const baseCommit = (await simpleGit(projectPath).revparse(["HEAD"])).trim()
  return { projectPath, baseCommit }
}

async function addRevisionWorktree(input: {
  projectPath: string
  worktreePath: string
  startPoint: string
  branch?: string
}): Promise<void> {
  const args = input.branch
    ? ["-C", input.projectPath, "worktree", "add", "-b", input.branch, input.worktreePath, input.startPoint]
    : ["-C", input.projectPath, "worktree", "add", input.worktreePath, input.startPoint]
  await execFileAsync("git", args)
}

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

function insertProposedRevision(input: {
  db: ReturnType<typeof createTestDb>["db"]
  id: string
  baseCommit: string
  contextPath: string
}) {
  input.db.insert(revisions)
    .values({
      id: input.id,
      threadId: `thread-${input.id}`,
      projectId: "project-1",
      contextPath: input.contextPath,
      prompt: "Update this comment",
      status: "proposed",
      baseProjectCommit: input.baseCommit,
      createdAt: new Date(1),
      updatedAt: new Date(1),
    })
    .run()
}

describe("comment and chat worktree flows", () => {
  test("accepts multiple comments by replaying stale proposals between accepts", async () => {
    const { projectPath, baseCommit } = await createProject({
      "index.html": "<main>Base title</main>\n",
      "lower.html": "<p>Base lower</p>\n",
    })
    const revisionAPath = await mkdtemp(join(tmpdir(), "ripple-comment-a-"))
    const revisionBPath = await mkdtemp(join(tmpdir(), "ripple-comment-b-"))
    const { sqlite, db } = createTestDb()
    try {
      await addRevisionWorktree({
        projectPath,
        worktreePath: revisionAPath,
        startPoint: baseCommit,
      })
      await addRevisionWorktree({
        projectPath,
        worktreePath: revisionBPath,
        startPoint: baseCommit,
      })
      await writeFile(join(revisionAPath, "index.html"), "<main>Comment A</main>\n", "utf8")
      await writeFile(join(revisionBPath, "lower.html"), "<p>Comment B</p>\n", "utf8")
      insertProposedRevision({
        db,
        id: "revision-a",
        baseCommit,
        contextPath: revisionAPath,
      })
      insertProposedRevision({
        db,
        id: "revision-b",
        baseCommit,
        contextPath: revisionBPath,
      })

      const firstAcceptance = await acceptIsolatedWorkspace({
        strategy: "patch",
        projectPath,
        workspacePath: revisionAPath,
        baseProjectCommit: baseCommit,
        commitMessage: "Accept first comment",
      })
      expect(firstAcceptance.acceptedProjectCommit).toBeTruthy()

      const marked = markStaleProjectRevisionsUpdating({
        db,
        projectId: "project-1",
        currentCommit: firstAcceptance.acceptedProjectCommit!,
        acceptedRevisionId: "revision-a",
      })
      expect(marked).toBe(1)
      expect(db.select().from(revisions).where(eq(revisions.id, "revision-b")).get()?.status)
        .toBe("updating")

      const refresh = await refreshRevisionProposalFromLatest({
        projectPath,
        revisionPath: revisionBPath,
        baseProjectCommit: baseCommit,
      })
      expect(refresh.refreshed).toBe(true)
      expect(refresh.currentCommit).toBe(firstAcceptance.acceptedProjectCommit)
      expect(await readFile(join(revisionBPath, "index.html"), "utf8")).toContain("Comment A")
      expect(await readFile(join(revisionBPath, "lower.html"), "utf8")).toContain("Comment B")

      db.update(revisions)
        .set({
          status: "proposed",
          baseProjectCommit: refresh.currentCommit,
          updatedAt: new Date(),
        })
        .where(eq(revisions.id, "revision-b"))
        .run()

      const secondAcceptance = await acceptIsolatedWorkspace({
        strategy: "patch",
        projectPath,
        workspacePath: revisionBPath,
        baseProjectCommit: refresh.currentCommit,
        commitMessage: "Accept second comment",
      })
      expect(secondAcceptance.acceptedProjectCommit).toBeTruthy()
      expect(await readFile(join(projectPath, "index.html"), "utf8")).toContain("Comment A")
      expect(await readFile(join(projectPath, "lower.html"), "utf8")).toContain("Comment B")
      expect((await simpleGit(projectPath).status()).isClean()).toBe(true)
    } finally {
      sqlite.close()
      await rm(revisionAPath, { recursive: true, force: true })
      await rm(revisionBPath, { recursive: true, force: true })
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("accepting a chat worktree stales and replays non-conflicting comments", async () => {
    const { projectPath, baseCommit } = await createProject({
      "chat.html": "<section>Base chat area</section>\n",
      "comment.html": "<aside>Base comment area</aside>\n",
    })
    const chatPath = await mkdtemp(join(tmpdir(), "ripple-chat-worktree-"))
    const commentPath = await mkdtemp(join(tmpdir(), "ripple-comment-after-chat-"))
    const { sqlite, db } = createTestDb()
    try {
      await addRevisionWorktree({
        projectPath,
        worktreePath: chatPath,
        startPoint: baseCommit,
        branch: "chat-draft",
      })
      await addRevisionWorktree({
        projectPath,
        worktreePath: commentPath,
        startPoint: baseCommit,
      })
      await writeFile(join(chatPath, "chat.html"), "<section>Accepted chat</section>\n", "utf8")
      await writeFile(join(commentPath, "comment.html"), "<aside>Pending comment</aside>\n", "utf8")
      insertProposedRevision({
        db,
        id: "comment-revision",
        baseCommit,
        contextPath: commentPath,
      })

      const chatAcceptance = await acceptIsolatedWorkspace({
        strategy: "merge",
        projectPath,
        workspacePath: chatPath,
        branch: "chat-draft",
        baseBranch: "main",
        commitMessage: "Accept chat draft",
      })
      expect(chatAcceptance.acceptedWorkspaceCommit).toBeTruthy()
      expect(chatAcceptance.acceptedProjectCommit).toBeTruthy()
      expect(await readFile(join(projectPath, "chat.html"), "utf8")).toContain("Accepted chat")

      const marked = markStaleProjectRevisionsUpdating({
        db,
        projectId: "project-1",
        currentCommit: chatAcceptance.acceptedProjectCommit!,
      })
      expect(marked).toBe(1)
      expect(db.select().from(revisions).where(eq(revisions.id, "comment-revision")).get()?.status)
        .toBe("updating")

      const refresh = await refreshRevisionProposalFromLatest({
        projectPath,
        revisionPath: commentPath,
        baseProjectCommit: baseCommit,
      })
      expect(refresh.refreshed).toBe(true)
      expect(await readFile(join(commentPath, "chat.html"), "utf8")).toContain("Accepted chat")
      expect(await readFile(join(commentPath, "comment.html"), "utf8")).toContain(
        "Pending comment",
      )
    } finally {
      sqlite.close()
      await rm(chatPath, { recursive: true, force: true })
      await rm(commentPath, { recursive: true, force: true })
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("conflicting chat and comment edits block accept until the user refreshes", async () => {
    const { projectPath, baseCommit } = await createProject({
      "title.html": "<h1>Base title</h1>\n",
    })
    const chatPath = await mkdtemp(join(tmpdir(), "ripple-conflict-chat-"))
    const commentPath = await mkdtemp(join(tmpdir(), "ripple-conflict-comment-"))
    const { sqlite, db } = createTestDb()
    try {
      await addRevisionWorktree({
        projectPath,
        worktreePath: chatPath,
        startPoint: baseCommit,
        branch: "conflicting-chat",
      })
      await addRevisionWorktree({
        projectPath,
        worktreePath: commentPath,
        startPoint: baseCommit,
      })
      await writeFile(join(chatPath, "title.html"), "<h1>Accepted chat title</h1>\n", "utf8")
      await writeFile(join(commentPath, "title.html"), "<h1>Pending comment title</h1>\n", "utf8")
      insertProposedRevision({
        db,
        id: "conflicting-comment",
        baseCommit,
        contextPath: commentPath,
      })

      const chatAcceptance = await acceptIsolatedWorkspace({
        strategy: "merge",
        projectPath,
        workspacePath: chatPath,
        branch: "conflicting-chat",
        baseBranch: "main",
        commitMessage: "Accept conflicting chat draft",
      })
      expect(chatAcceptance.acceptedProjectCommit).toBeTruthy()

      markStaleProjectRevisionsUpdating({
        db,
        projectId: "project-1",
        currentCommit: chatAcceptance.acceptedProjectCommit!,
      })
      expect(db.select().from(revisions).where(eq(revisions.id, "conflicting-comment")).get()?.status)
        .toBe("updating")

      await expect(acceptIsolatedWorkspace({
        strategy: "patch",
        projectPath,
        workspacePath: commentPath,
        baseProjectCommit: baseCommit,
        commitMessage: "Accept stale comment",
      })).rejects.toThrow("older project version")

      const refresh = await refreshRevisionProposalFromLatest({
        projectPath,
        revisionPath: commentPath,
        baseProjectCommit: baseCommit,
      })
      expect(refresh.refreshed).toBe(false)
      expect(refresh.error).toBeTruthy()
      expect(await readFile(join(commentPath, "title.html"), "utf8")).toContain(
        "Pending comment title",
      )
    } finally {
      sqlite.close()
      await rm(chatPath, { recursive: true, force: true })
      await rm(commentPath, { recursive: true, force: true })
      await rm(projectPath, { recursive: true, force: true })
    }
  })

  test("does not reuse stale replay worktrees as follow-up bases", () => {
    expect(canReuseRevisionAsFollowUpBase("proposed")).toBe(true)
    expect(canReuseRevisionAsFollowUpBase("running")).toBe(true)
    expect(canReuseRevisionAsFollowUpBase("updating")).toBe(false)
    expect(canReuseRevisionAsFollowUpBase("needs_update")).toBe(false)
  })
})
