export interface ProjectChatSelectionProject {
  id: string
  path: string
  localPath?: string | null
}

export interface ProjectChatSelectionChat {
  id: string
  projectId: string | null
  worktreePath: string | null
  branch: string | null
  baseBranch: string | null
  archivedAt: Date | string | null
  createdAt: Date | string | null
  updatedAt: Date | string | null
}

function timestamp(value: Date | string | null): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function findReusableProjectChat<TChat extends ProjectChatSelectionChat>(
  project: ProjectChatSelectionProject,
  chats: readonly TChat[] | undefined,
): TChat | null {
  const projectPaths = new Set(
    [project.localPath, project.path].filter((path): path is string => !!path),
  )

  const candidates = (chats ?? []).filter((chat) => {
    if (chat.projectId !== project.id) return false
    if (chat.archivedAt) return false
    if (chat.branch || chat.baseBranch) return false
    if (!chat.worktreePath) return false
    return projectPaths.has(chat.worktreePath)
  })

  candidates.sort((a, b) => {
    const aTime = timestamp(a.updatedAt) || timestamp(a.createdAt)
    const bTime = timestamp(b.updatedAt) || timestamp(b.createdAt)
    return bTime - aTime
  })

  return candidates[0] ?? null
}
