export interface LocalChatReuseProject {
  path: string
  localPath?: string | null
}

export interface LocalChatReuseCandidate {
  archivedAt?: Date | string | null
  worktreePath?: string | null
  branch?: string | null
  baseBranch?: string | null
}

export function getLocalChatReusePaths(project: LocalChatReuseProject): string[] {
  return Array.from(
    new Set(
      [project.localPath, project.path].filter(
        (candidate): candidate is string => !!candidate,
      ),
    ),
  )
}

export function isReusableLocalProjectChat(
  project: LocalChatReuseProject,
  chat: LocalChatReuseCandidate,
): boolean {
  if (chat.archivedAt) return false
  if (chat.branch || chat.baseBranch) return false
  if (!chat.worktreePath) return false
  return getLocalChatReusePaths(project).includes(chat.worktreePath)
}
