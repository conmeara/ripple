import type { WorkMode } from "../atoms"

export function resolveChatWorkMode(input: {
  branch?: string | null
  worktreePath?: string | null
}): WorkMode {
  return input.branch && input.worktreePath ? "worktree" : "local"
}
