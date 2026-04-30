import type Database from "better-sqlite3"

type ConversationColumnRepair = {
  name: string
  definition: string
}

const conversationCompatibilityColumns: ConversationColumnRepair[] = [
  { name: "mode", definition: "text DEFAULT 'agent' NOT NULL" },
  { name: "session_id", definition: "text" },
  { name: "stream_id", definition: "text" },
  { name: "worktree_path", definition: "text" },
  { name: "branch", definition: "text" },
  { name: "base_branch", definition: "text" },
  { name: "pr_url", definition: "text" },
  { name: "pr_number", definition: "integer" },
]

/**
 * Repairs dev databases that applied an early Phase 10 conversations migration
 * before the chat compatibility columns were added.
 */
export function repairConversationCompatibilitySchema(
  database: Database.Database,
): void {
  const table = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get("conversations")

  if (!table) return

  const columns = new Set(
    database
      .prepare("PRAGMA table_info(conversations)")
      .all()
      .map((column: any) => String(column.name)),
  )

  for (const column of conversationCompatibilityColumns) {
    if (!columns.has(column.name)) {
      database.exec(
        `ALTER TABLE conversations ADD COLUMN ${column.name} ${column.definition}`,
      )
    }
  }

  database.exec(
    "CREATE INDEX IF NOT EXISTS conversations_worktree_path_idx ON conversations (worktree_path)",
  )
  database.exec(
    "CREATE INDEX IF NOT EXISTS conversations_project_kind_updated_idx ON conversations (project_id, kind, updated_at)",
  )
}
