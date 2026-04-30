import { existsSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import { eq } from "drizzle-orm"
import {
  chats,
  conversations,
  getDatabase,
  projects,
  revisions,
  workspaces,
  type Project,
  type Workspace,
} from "../db"
import { assertRegisteredWorktree } from "../git/security/path-validation"
import { isPathInsideDirectory } from "../ripple-projects/paths"
import { resolveRevisionProjectPath } from "../revisions/revision-acceptance"
import { resolveChatWorkspaceKind } from "./workspace-kind"
import type { AgentWorkspaceTarget, WorkspaceKind } from "./types"

type Db = ReturnType<typeof getDatabase>

export interface ResolvedWorkspaceContext {
  workspace: Workspace
  project: Project
  cwd: string
  projectPath: string
  writableRoot: string
  kind: WorkspaceKind
  targetType: "project" | "conversation" | "chat" | "revision"
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

function resolveExistingDirectory(path: string, label: string): string {
  assertExistingDirectory(path, label)
  return realpathSync(path)
}

function assertSafeChatWorkspace(input: {
  db: Db
  projectId: string
  projectPath: string
  cwd: string
  kind: Extract<WorkspaceKind, "main" | "chat_worktree">
  targetType: "conversation" | "chat"
  targetId: string
}): void {
  const projectRealPath = resolveExistingDirectory(input.projectPath, "The project folder")
  const cwdRealPath = resolveExistingDirectory(input.cwd, "The chat workspace")

  if (input.kind === "main") {
    if (cwdRealPath !== projectRealPath) {
      throw new Error("Ripple could not validate this Main workspace.")
    }
    return
  }

  if (cwdRealPath === projectRealPath || isPathInsideDirectory(projectRealPath, cwdRealPath)) {
    throw new Error(
      "Ripple could not safely isolate this chat workspace. Try creating it again.",
    )
  }

  const registeredWorkspace = input.db
    .select()
    .from(workspaces)
    .where(eq(workspaces.path, input.cwd))
    .all()
    .find((workspace) =>
      workspace.projectId === input.projectId &&
      workspace.targetType === input.targetType &&
      workspace.targetId === input.targetId &&
      workspace.kind === "chat_worktree" &&
      !workspace.archivedAt
    )
  if (registeredWorkspace) return

  assertRegisteredWorktree(input.cwd)
}

function upsertWorkspace(
  db: Db,
  input: {
    projectId: string
    kind: WorkspaceKind
    targetType: "project" | "conversation" | "chat" | "revision"
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

  if (target.type === "chat" || target.type === "conversation") {
    const targetId =
      target.type === "conversation" ? target.conversationId : target.chatId
    const chat = target.type === "chat"
      ? db.select().from(chats).where(eq(chats.id, target.chatId)).get()
      : null
    const conversation = chat
      ? null
      : db
          .select()
          .from(conversations)
          .where(eq(conversations.id, targetId))
          .get()
    if (!chat && !conversation) throw new Error("Chat not found.")
    const project = requireProject(db, (chat ?? conversation)!.projectId)
    const projectPath = resolve(resolveRevisionProjectPath(project))
    const { cwd, kind } = resolveChatWorkspaceKind({
      projectPath,
      worktreePath: (chat ?? conversation)!.worktreePath,
      branch: (chat ?? conversation)!.branch,
    })
    const targetType = conversation ? "conversation" : "chat"
    assertSafeChatWorkspace({
      db,
      projectId: project.id,
      projectPath,
      cwd,
      kind,
      targetType,
      targetId: (chat ?? conversation)!.id,
    })
    const workspace = upsertWorkspace(db, {
      projectId: project.id,
      kind,
      targetType,
      targetId: (chat ?? conversation)!.id,
      path: cwd,
      baseProjectCommit: (chat ?? conversation)!.baseBranch ?? null,
      isolationState: kind === "main" ? "main" : "isolated",
    })
    return {
      workspace,
      project,
      cwd,
      projectPath,
      writableRoot: cwd,
      kind,
      targetType,
      targetId: (chat ?? conversation)!.id,
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
