import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { eq } from "drizzle-orm"
import {
  chats,
  getDatabase,
  projects,
  revisions,
  workspaces,
  type Project,
  type Workspace,
} from "../db"
import { isPathInsideDirectory } from "../ripple-projects/paths"
import { resolveRevisionProjectPath } from "../revisions/revision-acceptance"
import type { AgentWorkspaceTarget, WorkspaceKind } from "./types"

type Db = ReturnType<typeof getDatabase>

export interface ResolvedWorkspaceContext {
  workspace: Workspace
  project: Project
  cwd: string
  projectPath: string
  writableRoot: string
  kind: WorkspaceKind
  targetType: "project" | "chat" | "revision"
  targetId: string
}

function requireProject(db: Db, projectId: string): Project {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) throw new Error("Project not found.")
  if (project.archivedAt) {
    throw new Error("Restore this project before asking the agent to edit it.")
  }
  return project
}

function assertExistingDirectory(path: string, label: string): void {
  if (!existsSync(path)) {
    throw new Error(`${label} is not available.`)
  }
}

function upsertWorkspace(
  db: Db,
  input: {
    projectId: string
    kind: WorkspaceKind
    targetType: "project" | "chat" | "revision"
    targetId: string
    path: string
    baseProjectCommit?: string | null
    isolationState: Workspace["isolationState"]
  },
): Workspace {
  const existing = db
    .select()
    .from(workspaces)
    .where(eq(workspaces.targetId, input.targetId))
    .all()
    .find((workspace) =>
      workspace.kind === input.kind &&
      workspace.targetType === input.targetType,
    )

  const now = new Date()
  if (existing) {
    return db
      .update(workspaces)
      .set({
        path: input.path,
        baseProjectCommit: input.baseProjectCommit ?? null,
        isolationState: input.isolationState,
        archivedAt: null,
        updatedAt: now,
      })
      .where(eq(workspaces.id, existing.id))
      .returning()
      .get()
  }

  return db
    .insert(workspaces)
    .values({
      projectId: input.projectId,
      kind: input.kind,
      targetType: input.targetType,
      targetId: input.targetId,
      path: input.path,
      baseProjectCommit: input.baseProjectCommit ?? null,
      isolationState: input.isolationState,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()
}

export function resolveAgentWorkspaceContext(
  target: AgentWorkspaceTarget,
  db: Db = getDatabase(),
): ResolvedWorkspaceContext {
  if (target.type === "project") {
    const project = requireProject(db, target.projectId)
    const projectPath = resolve(resolveRevisionProjectPath(project))
    assertExistingDirectory(projectPath, "The project folder")
    const workspace = upsertWorkspace(db, {
      projectId: project.id,
      kind: "main",
      targetType: "project",
      targetId: project.id,
      path: projectPath,
      baseProjectCommit: null,
      isolationState: "main",
    })
    return {
      workspace,
      project,
      cwd: projectPath,
      projectPath,
      writableRoot: projectPath,
      kind: "main",
      targetType: "project",
      targetId: project.id,
    }
  }

  if (target.type === "chat") {
    const chat = db.select().from(chats).where(eq(chats.id, target.chatId)).get()
    if (!chat) throw new Error("Chat not found.")
    const project = requireProject(db, chat.projectId)
    const projectPath = resolve(resolveRevisionProjectPath(project))
    const cwd = resolve(chat.worktreePath || projectPath)
    assertExistingDirectory(cwd, "The chat workspace")
    const kind: WorkspaceKind = chat.worktreePath ? "chat_worktree" : "main"
    const workspace = upsertWorkspace(db, {
      projectId: project.id,
      kind,
      targetType: "chat",
      targetId: chat.id,
      path: cwd,
      baseProjectCommit: chat.baseBranch ?? null,
      isolationState: kind === "main" ? "main" : "isolated",
    })
    return {
      workspace,
      project,
      cwd,
      projectPath,
      writableRoot: cwd,
      kind,
      targetType: "chat",
      targetId: chat.id,
    }
  }

  const revision = db
    .select()
    .from(revisions)
    .where(eq(revisions.id, target.revisionId))
    .get()
  if (!revision) throw new Error("Generated change not found.")
  const project = requireProject(db, revision.projectId)
  const projectPath = resolve(resolveRevisionProjectPath(project))
  if (!revision.contextPath) {
    throw new Error("The generated change workspace is not available.")
  }

  const revisionPath = resolve(revision.contextPath)
  assertExistingDirectory(projectPath, "The project folder")
  assertExistingDirectory(revisionPath, "The generated change workspace")
  if (revisionPath === projectPath || isPathInsideDirectory(projectPath, revisionPath)) {
    throw new Error(
      "Ripple could not safely isolate this generated change. Try creating it again.",
    )
  }

  const workspace = upsertWorkspace(db, {
    projectId: project.id,
    kind: "generated_change",
    targetType: "revision",
    targetId: revision.id,
    path: revisionPath,
    baseProjectCommit: revision.baseProjectCommit,
    isolationState: "isolated",
  })

  return {
    workspace,
    project,
    cwd: revisionPath,
    projectPath,
    writableRoot: revisionPath,
    kind: "generated_change",
    targetType: "revision",
    targetId: revision.id,
  }
}

