import { index, sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { createId } from "../utils"

// ============ PROJECTS ============
export const projects = sqliteTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  slug: text("slug"),
  localPath: text("local_path").unique(),
  path: text("path").notNull().unique(),
  aspectRatioPreset: text("aspect_ratio_preset"),
  activeCompositionId: text("active_composition_id"),
  templateId: text("template_id"),
  setupStatus: text("setup_status")
    .$type<"unknown" | "checking" | "ready" | "needs_environment" | "error">()
    .notNull()
    .default("unknown"),
  setupError: text("setup_error"),
  lastSetupCheckAt: integer("last_setup_check_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
  // Git remote info (extracted from local .git)
  gitRemoteUrl: text("git_remote_url"),
  gitProvider: text("git_provider"), // "github" | "gitlab" | "bitbucket" | null
  gitOwner: text("git_owner"),
  gitRepo: text("git_repo"),
  // Custom project icon (absolute path to local image file)
  iconPath: text("icon_path"),
})

export const projectsRelations = relations(projects, ({ many }) => ({
  chats: many(chats),
  compositions: many(compositions),
  commentThreads: many(commentThreads),
  revisions: many(revisions),
}))

// ============ COMPOSITIONS ============
export const compositions = sqliteTable("compositions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  filePath: text("file_path").notNull(),
  dataCompositionId: text("data_composition_id").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  parentCompositionId: text("parent_composition_id"),
  kind: text("kind").notNull().default("root"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
}, (table) => [
  index("compositions_project_id_idx").on(table.projectId),
  index("compositions_project_file_idx").on(table.projectId, table.filePath),
])

export const compositionsRelations = relations(compositions, ({ one }) => ({
  project: one(projects, {
    fields: [compositions.projectId],
    references: [projects.id],
  }),
}))

// ============ CHATS ============
export const chats = sqliteTable("chats", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name"),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
  isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
  // Worktree fields (for git isolation per chat)
  worktreePath: text("worktree_path"),
  branch: text("branch"),
  baseBranch: text("base_branch"),
  // PR tracking fields
  prUrl: text("pr_url"),
  prNumber: integer("pr_number"),
}, (table) => [
  index("chats_worktree_path_idx").on(table.worktreePath),
])

export const chatsRelations = relations(chats, ({ one, many }) => ({
  project: one(projects, {
    fields: [chats.projectId],
    references: [projects.id],
  }),
  subChats: many(subChats),
  revisions: many(revisions),
}))

// ============ SUB-CHATS ============
export const subChats = sqliteTable("sub_chats", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name"),
  chatId: text("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  sessionId: text("session_id"), // Claude SDK session ID for resume
  streamId: text("stream_id"), // Track in-progress streams
  mode: text("mode").notNull().default("agent"), // "plan" | "agent"
  messages: text("messages").notNull().default("[]"), // JSON array
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

export const subChatsRelations = relations(subChats, ({ one }) => ({
  chat: one(chats, {
    fields: [subChats.chatId],
    references: [chats.id],
  }),
}))

// ============ RIPPLE COMMENT THREADS ============
export const commentThreads = sqliteTable("comment_threads", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  compositionId: text("composition_id").references(() => compositions.id, {
    onDelete: "set null",
  }),
  anchorType: text("anchor_type")
    .$type<"frame" | "range" | "element">()
    .notNull()
    .default("frame"),
  startTime: integer("start_time_ms").notNull().default(0),
  endTime: integer("end_time_ms"),
  startFrame: integer("start_frame").notNull().default(0),
  endFrame: integer("end_frame"),
  elementSelector: text("element_selector"),
  clipKey: text("clip_key"),
  sourceFile: text("source_file"),
  screenshotPath: text("screenshot_path"),
  clientRequestId: text("client_request_id"),
  status: text("status")
    .$type<"open" | "resolved" | "archived">()
    .notNull()
    .default("open"),
  latestRevisionId: text("latest_revision_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
}, (table) => [
  index("comment_threads_project_id_idx").on(table.projectId),
  index("comment_threads_composition_id_idx").on(table.compositionId),
  index("comment_threads_project_deleted_idx").on(table.projectId, table.deletedAt),
  index("comment_threads_latest_revision_idx").on(table.latestRevisionId),
  uniqueIndex("comment_threads_project_client_request_idx").on(
    table.projectId,
    table.clientRequestId,
  ),
])

export const revisions = sqliteTable("revisions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  threadId: text("thread_id")
    .notNull()
    .references(() => commentThreads.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  compositionId: text("composition_id").references(() => compositions.id, {
    onDelete: "set null",
  }),
  chatId: text("chat_id").references(() => chats.id, { onDelete: "set null" }),
  subChatId: text("sub_chat_id").references(() => subChats.id, {
    onDelete: "set null",
  }),
  baseRevisionId: text("base_revision_id"),
  baseProjectCommit: text("base_project_commit"),
  baseProjectHash: text("base_project_hash"),
  contextPath: text("context_path"),
  branch: text("branch"),
  prompt: text("prompt").notNull(),
  status: text("status")
    .$type<
      | "queued"
      | "preparing"
      | "running"
      | "updating"
      | "proposed"
      | "accepted"
      | "rejected"
      | "superseded"
      | "failed"
    >()
    .notNull()
    .default("queued"),
  previewContextKey: text("preview_context_key"),
  diffSummary: text("diff_summary"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
}, (table) => [
  index("revisions_thread_id_idx").on(table.threadId),
  index("revisions_project_id_idx").on(table.projectId),
  index("revisions_chat_id_idx").on(table.chatId),
  index("revisions_status_idx").on(table.status),
])

export const commentMessages = sqliteTable("comment_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  threadId: text("thread_id")
    .notNull()
    .references(() => commentThreads.id, { onDelete: "cascade" }),
  revisionId: text("revision_id").references(() => revisions.id, {
    onDelete: "set null",
  }),
  role: text("role")
    .$type<"user" | "assistant" | "system">()
    .notNull()
    .default("user"),
  body: text("body").notNull(),
  metadataJson: text("metadata_json"),
  clientRequestId: text("client_request_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
}, (table) => [
  index("comment_messages_thread_id_idx").on(table.threadId),
  index("comment_messages_revision_id_idx").on(table.revisionId),
  uniqueIndex("comment_messages_thread_client_request_idx").on(
    table.threadId,
    table.clientRequestId,
  ),
])

export const commentThreadsRelations = relations(commentThreads, ({ one, many }) => ({
  project: one(projects, {
    fields: [commentThreads.projectId],
    references: [projects.id],
  }),
  composition: one(compositions, {
    fields: [commentThreads.compositionId],
    references: [compositions.id],
  }),
  messages: many(commentMessages),
  revisions: many(revisions),
}))

export const commentMessagesRelations = relations(commentMessages, ({ one }) => ({
  thread: one(commentThreads, {
    fields: [commentMessages.threadId],
    references: [commentThreads.id],
  }),
  revision: one(revisions, {
    fields: [commentMessages.revisionId],
    references: [revisions.id],
  }),
}))

export const revisionsRelations = relations(revisions, ({ one, many }) => ({
  thread: one(commentThreads, {
    fields: [revisions.threadId],
    references: [commentThreads.id],
  }),
  project: one(projects, {
    fields: [revisions.projectId],
    references: [projects.id],
  }),
  composition: one(compositions, {
    fields: [revisions.compositionId],
    references: [compositions.id],
  }),
  chat: one(chats, {
    fields: [revisions.chatId],
    references: [chats.id],
  }),
  subChat: one(subChats, {
    fields: [revisions.subChatId],
    references: [subChats.id],
  }),
  messages: many(commentMessages),
}))

// ============ CLAUDE CODE CREDENTIALS ============
// Stores encrypted OAuth token for Claude Code integration
// DEPRECATED: Use anthropicAccounts for multi-account support
export const claudeCodeCredentials = sqliteTable("claude_code_credentials", {
  id: text("id").primaryKey().default("default"), // Single row, always "default"
  oauthToken: text("oauth_token").notNull(), // Encrypted with safeStorage
  connectedAt: integer("connected_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  userId: text("user_id"), // Desktop auth user ID (for reference)
})

// ============ ANTHROPIC ACCOUNTS (Multi-account support) ============
// Stores multiple Anthropic OAuth accounts for quick switching
export const anthropicAccounts = sqliteTable("anthropic_accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  email: text("email"), // User's email from OAuth (if available)
  displayName: text("display_name"), // User-editable label
  oauthToken: text("oauth_token").notNull(), // Encrypted with safeStorage
  connectedAt: integer("connected_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  desktopUserId: text("desktop_user_id"), // Reference to 21st.dev user
})

// Tracks which Anthropic account is currently active
export const anthropicSettings = sqliteTable("anthropic_settings", {
  id: text("id").primaryKey().default("singleton"), // Single row
  activeAccountId: text("active_account_id"), // References anthropicAccounts.id
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
})

// ============ TYPE EXPORTS ============
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Composition = typeof compositions.$inferSelect
export type NewComposition = typeof compositions.$inferInsert
export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert
export type SubChat = typeof subChats.$inferSelect
export type NewSubChat = typeof subChats.$inferInsert
export type CommentThread = typeof commentThreads.$inferSelect
export type NewCommentThread = typeof commentThreads.$inferInsert
export type CommentMessage = typeof commentMessages.$inferSelect
export type NewCommentMessage = typeof commentMessages.$inferInsert
export type Revision = typeof revisions.$inferSelect
export type NewRevision = typeof revisions.$inferInsert
export type ClaudeCodeCredential = typeof claudeCodeCredentials.$inferSelect
export type NewClaudeCodeCredential = typeof claudeCodeCredentials.$inferInsert
export type AnthropicAccount = typeof anthropicAccounts.$inferSelect
export type NewAnthropicAccount = typeof anthropicAccounts.$inferInsert
export type AnthropicSettings = typeof anthropicSettings.$inferSelect
