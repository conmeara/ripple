import { resolve } from "node:path"
import type { WorkspaceKind } from "./types"

export function resolveChatWorkspaceKind(input: {
  projectPath: string
  worktreePath?: string | null
  branch?: string | null
}): { cwd: string; kind: Extract<WorkspaceKind, "main" | "chat_worktree"> } {
  const projectPath = resolve(input.projectPath)
  const cwd = resolve(input.worktreePath || projectPath)
  const hasSeparateWorktree = Boolean(input.branch && cwd !== projectPath)

  return {
    cwd,
    kind: hasSeparateWorktree ? "chat_worktree" : "main",
  }
}
