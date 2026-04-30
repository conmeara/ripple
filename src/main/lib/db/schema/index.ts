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
  conversations: many(conversations),
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
  revisions: many(revisions),
}))

// ============ CONVERSATIONS ============
export const conversations = sqliteTable("conversations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  compositionId: text("composition_id").references(() => compositions.id, {
    onDelete: "set null",
  }),
  commentThreadId: text("comment_thread_id"),
  revisionId: text("revision_id"),
  kind: text("kind")
    .$type<"project" | "comment" | "revision" | "export" | "support">()
    .notNull()
    .default("project"),
  title: text("title"),
  summary: text("summary"),
  status: text("status")
    .$type<"open" | "resolved" | "archived" | "deleted">()
    .notNull()
    .default("open"),
  mode: text("mode").$type<"plan" | "agent">().notNull().default("agent"),
  sessionId: text("session_id"),
  streamId: text("stream_id"),
  worktreePath: text("worktree_path"),
  branch: text("branch"),
  baseBranch: text("base_branch"),
  prUrl: text("pr_url"),
  prNumber: integer("pr_number"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
}, (table) => [
  index("conversations_project_id_idx").on(table.projectId),
  index("conversations_composition_id_idx").on(table.compositionId),
  index("conversations_comment_thread_id_idx").on(table.commentThreadId),
  index("conversations_revision_id_idx").on(table.revisionId),
  index("conversations_worktree_path_idx").on(table.worktreePath),
  index("conversations_project_kind_updated_idx").on(
    table.projectId,
    table.kind,
    table.updatedAt,
  ),
])

// ============ AGENT RUNTIME ============
export const agentConnections = sqliteTable("agent_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  provider: text("provider").$type<"codex" | "claude" | "fake">().notNull(),
  runtime: text("runtime")
    .$type<"codex_app_server" | "claude_agent_sdk" | "fake">()
    .notNull(),
  authMode: text("auth_mode"),
  defaultModel: text("default_model"),
  modelSelectionMode: text("model_selection_mode")
    .$type<"manual" | "provider_default">()
    .notNull()
    .default("provider_default"),
  capabilitiesJson: text("capabilities_json").notNull().default("{}"),
  safeAccountStatusJson: text("safe_account_status_json").notNull().default("{}"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
}, (table) => [
  index("agent_connections_provider_idx").on(table.provider),
  index("agent_connections_provider_default_idx").on(table.provider, table.isDefault),
])

export const workspaces = sqliteTable("workspaces", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind")
    .$type<"main" | "chat_worktree" | "generated_change">()
    .notNull(),
  targetType: text("target_type")
    .$type<"project" | "conversation" | "chat" | "revision">()
    .notNull(),
  targetId: text("target_id").notNull(),
  path: text("path").notNull(),
  baseProjectCommit: text("base_project_commit"),
  isolationState: text("isolation_state")
    .$type<"main" | "isolated" | "missing" | "invalid">()
    .notNull()
    .default("isolated"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
}, (table) => [
  index("workspaces_project_id_idx").on(table.projectId),
  index("workspaces_path_idx").on(table.path),
  uniqueIndex("workspaces_target_idx").on(table.targetType, table.targetId, table.kind),
])

export const agentThreads = sqliteTable("agent_threads", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  connectionId: text("connection_id")
    .notNull()
    .references(() => agentConnections.id, { onDelete: "restrict" }),
  provider: text("provider").$type<"codex" | "claude" | "fake">().notNull(),
  purpose: text("purpose").$type<"chat" | "generated_change">().notNull(),
  conversationId: text("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  chatId: text("chat_id").references(() => chats.id, { onDelete: "set null" }),
  subChatId: text("sub_chat_id"),
  revisionId: text("revision_id"),
  providerThreadId: text("provider_thread_id"),
  providerSessionId: text("provider_session_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
}, (table) => [
  index("agent_threads_project_id_idx").on(table.projectId),
  index("agent_threads_workspace_id_idx").on(table.workspaceId),
  index("agent_threads_connection_id_idx").on(table.connectionId),
  index("agent_threads_conversation_id_idx").on(table.conversationId),
  index("agent_threads_chat_id_idx").on(table.chatId),
  index("agent_threads_revision_id_idx").on(table.revisionId),
])

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  agentThreadId: text("agent_thread_id")
    .notNull()
    .references(() => agentThreads.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  connectionId: text("connection_id")
    .notNull()
    .references(() => agentConnections.id, { onDelete: "restrict" }),
  requestId: text("request_id").notNull(),
  provider: text("provider").$type<"codex" | "claude" | "fake">().notNull(),
  model: text("model"),
  mode: text("mode").$type<"plan" | "agent">().notNull().default("agent"),
  runKind: text("run_kind").$type<"chat" | "generated_change">().notNull(),
  conversationId: text("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  revisionId: text("revision_id"),
  threadId: text("comment_thread_id"),
  chatId: text("chat_id").references(() => chats.id, { onDelete: "set null" }),
  subChatId: text("sub_chat_id"),
  providerTurnId: text("provider_turn_id"),
  providerSessionId: text("provider_session_id"),
  providerItemId: text("provider_item_id"),
  status: text("status")
    .$type<
      | "queued"
      | "preparing"
      | "running"
      | "awaiting_approval"
      | "cancelling"
      | "cancelled"
      | "completed"
      | "failed"
      | "recoverable"
    >()
    .notNull()
    .default("queued"),
  prompt: text("prompt").notNull(),
  errorMessage: text("error_message"),
  cancelRequestedAt: integer("cancel_requested_at", { mode: "timestamp" }),
  heartbeatAt: integer("heartbeat_at", { mode: "timestamp" }),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
}, (table) => [
  index("agent_runs_agent_thread_id_idx").on(table.agentThreadId),
  index("agent_runs_workspace_id_idx").on(table.workspaceId),
  index("agent_runs_connection_id_idx").on(table.connectionId),
  index("agent_runs_provider_status_idx").on(table.provider, table.status),
  index("agent_runs_conversation_id_idx").on(table.conversationId),
  index("agent_runs_revision_id_idx").on(table.revisionId),
  index("agent_runs_chat_id_idx").on(table.chatId),
  uniqueIndex("agent_runs_thread_request_idx").on(table.agentThreadId, table.requestId),
])

export const agentRunEvents = sqliteTable("agent_run_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  agentRunId: text("agent_run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  type: text("type")
    .$type<
      | "status"
      | "assistant_text_delta"
      | "assistant_message"
      | "reasoning"
      | "tool_start"
      | "tool_update"
      | "tool_end"
      | "file_change"
      | "approval_request"
      | "usage"
      | "error"
    >()
    .notNull(),
  providerType: text("provider_type"),
  providerId: text("provider_id"),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
}, (table) => [
  index("agent_run_events_agent_run_id_idx").on(table.agentRunId),
  uniqueIndex("agent_run_events_run_sequence_idx").on(table.agentRunId, table.sequence),
])

export const agentApprovals = sqliteTable("agent_approvals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  agentRunId: text("agent_run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  providerRequestId: text("provider_request_id"),
  kind: text("kind")
    .$type<"command" | "file_change" | "network" | "tool" | "question">()
    .notNull(),
  status: text("status")
    .$type<"pending" | "approved" | "denied" | "cancelled">()
    .notNull()
    .default("pending"),
  prompt: text("prompt").notNull(),
  detailsJson: text("details_json").notNull().default("{}"),
  responseJson: text("response_json"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
}, (table) => [
  index("agent_approvals_agent_run_id_idx").on(table.agentRunId),
  index("agent_approvals_status_idx").on(table.status),
])

export const transcriptMessages = sqliteTable("transcript_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  agentThreadId: text("agent_thread_id")
    .notNull()
    .references(() => agentThreads.id, { onDelete: "cascade" }),
  agentRunId: text("agent_run_id").references(() => agentRuns.id, {
    onDelete: "set null",
  }),
  conversationId: text("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  chatId: text("chat_id").references(() => chats.id, { onDelete: "set null" }),
  subChatId: text("sub_chat_id"),
  role: text("role").$type<"user" | "assistant" | "system">().notNull(),
  body: text("body").notNull(),
  sourceEventId: text("source_event_id").references(() => agentRunEvents.id, {
    onDelete: "set null",
  }),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
}, (table) => [
  index("transcript_messages_agent_thread_id_idx").on(table.agentThreadId),
  index("transcript_messages_agent_run_id_idx").on(table.agentRunId),
  index("transcript_messages_conversation_id_idx").on(table.conversationId),
  index("transcript_messages_sub_chat_id_idx").on(table.subChatId),
])

export const conversationMessages = sqliteTable("conversation_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  agentRunId: text("agent_run_id").references(() => agentRuns.id, {
    onDelete: "set null",
  }),
  sourceEventId: text("source_event_id").references(() => agentRunEvents.id, {
    onDelete: "set null",
  }),
  role: text("role")
    .$type<"user" | "assistant" | "system" | "tool">()
    .notNull(),
  body: text("body").notNull().default(""),
  partsJson: text("parts_json").notNull().default("[]"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
}, (table) => [
  index("conversation_messages_conversation_id_idx").on(table.conversationId),
  index("conversation_messages_agent_run_id_idx").on(table.agentRunId),
  index("conversation_messages_source_event_id_idx").on(table.sourceEventId),
])

export const agentConnectionsRelations = relations(agentConnections, ({ many }) => ({
  threads: many(agentThreads),
  runs: many(agentRuns),
}))

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  project: one(projects, {
    fields: [workspaces.projectId],
    references: [projects.id],
  }),
  threads: many(agentThreads),
  runs: many(agentRuns),
}))

export const agentThreadsRelations = relations(agentThreads, ({ one, many }) => ({
  project: one(projects, {
    fields: [agentThreads.projectId],
    references: [projects.id],
  }),
  workspace: one(workspaces, {
    fields: [agentThreads.workspaceId],
    references: [workspaces.id],
  }),
  connection: one(agentConnections, {
    fields: [agentThreads.connectionId],
    references: [agentConnections.id],
  }),
  conversation: one(conversations, {
    fields: [agentThreads.conversationId],
    references: [conversations.id],
  }),
  chat: one(chats, {
    fields: [agentThreads.chatId],
    references: [chats.id],
  }),
  runs: many(agentRuns),
  messages: many(transcriptMessages),
}))

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  thread: one(agentThreads, {
    fields: [agentRuns.agentThreadId],
    references: [agentThreads.id],
  }),
  workspace: one(workspaces, {
    fields: [agentRuns.workspaceId],
    references: [workspaces.id],
  }),
  connection: one(agentConnections, {
    fields: [agentRuns.connectionId],
    references: [agentConnections.id],
  }),
  conversation: one(conversations, {
    fields: [agentRuns.conversationId],
    references: [conversations.id],
  }),
  events: many(agentRunEvents),
  approvals: many(agentApprovals),
  messages: many(transcriptMessages),
  conversationMessages: many(conversationMessages),
}))

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  project: one(projects, {
    fields: [conversations.projectId],
    references: [projects.id],
  }),
  composition: one(compositions, {
    fields: [conversations.compositionId],
    references: [compositions.id],
  }),
  messages: many(conversationMessages),
  runs: many(agentRuns),
  threads: many(agentThreads),
}))

export const conversationMessagesRelations = relations(conversationMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMessages.conversationId],
    references: [conversations.id],
  }),
  agentRun: one(agentRuns, {
    fields: [conversationMessages.agentRunId],
    references: [agentRuns.id],
  }),
  sourceEvent: one(agentRunEvents, {
    fields: [conversationMessages.sourceEventId],
    references: [agentRunEvents.id],
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
  conversationId: text("conversation_id").references(() => conversations.id, {
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
  index("comment_threads_conversation_id_idx").on(table.conversationId),
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
  conversationId: text("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  chatId: text("chat_id").references(() => chats.id, { onDelete: "set null" }),
  subChatId: text("sub_chat_id"),
  agentProvider: text("agent_provider").$type<"codex" | "claude" | "fake">(),
  agentModel: text("agent_model"),
  agentThreadId: text("agent_thread_id").references(() => agentThreads.id, {
    onDelete: "set null",
  }),
  agentRunId: text("agent_run_id").references(() => agentRuns.id, {
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
  index("revisions_conversation_id_idx").on(table.conversationId),
  index("revisions_chat_id_idx").on(table.chatId),
  index("revisions_status_idx").on(table.status),
  index("revisions_agent_thread_id_idx").on(table.agentThreadId),
  index("revisions_agent_run_id_idx").on(table.agentRunId),
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
  conversation: one(conversations, {
    fields: [commentThreads.conversationId],
    references: [conversations.id],
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
  conversation: one(conversations, {
    fields: [revisions.conversationId],
    references: [conversations.id],
  }),
  chat: one(chats, {
    fields: [revisions.chatId],
    references: [chats.id],
  }),
  agentThread: one(agentThreads, {
    fields: [revisions.agentThreadId],
    references: [agentThreads.id],
  }),
  agentRun: one(agentRuns, {
    fields: [revisions.agentRunId],
    references: [agentRuns.id],
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
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type ConversationMessage = typeof conversationMessages.$inferSelect
export type NewConversationMessage = typeof conversationMessages.$inferInsert
export type AgentConnection = typeof agentConnections.$inferSelect
export type NewAgentConnection = typeof agentConnections.$inferInsert
export type Workspace = typeof workspaces.$inferSelect
export type NewWorkspace = typeof workspaces.$inferInsert
export type AgentThread = typeof agentThreads.$inferSelect
export type NewAgentThread = typeof agentThreads.$inferInsert
export type AgentRun = typeof agentRuns.$inferSelect
export type NewAgentRun = typeof agentRuns.$inferInsert
export type AgentRunEvent = typeof agentRunEvents.$inferSelect
export type NewAgentRunEvent = typeof agentRunEvents.$inferInsert
export type AgentApproval = typeof agentApprovals.$inferSelect
export type NewAgentApproval = typeof agentApprovals.$inferInsert
export type TranscriptMessage = typeof transcriptMessages.$inferSelect
export type NewTranscriptMessage = typeof transcriptMessages.$inferInsert
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
