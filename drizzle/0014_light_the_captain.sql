PRAGMA foreign_keys=OFF;--> statement-breakpoint
INSERT OR IGNORE INTO `conversations` (
	`id`,
	`project_id`,
	`composition_id`,
	`comment_thread_id`,
	`revision_id`,
	`kind`,
	`title`,
	`summary`,
	`status`,
	`mode`,
	`session_id`,
	`stream_id`,
	`worktree_path`,
	`branch`,
	`base_branch`,
	`pr_url`,
	`pr_number`,
	`created_at`,
	`updated_at`,
	`archived_at`,
	`deleted_at`
)
SELECT
	`sub_chats`.`id`,
	`chats`.`project_id`,
	NULL,
	(
		SELECT `revisions`.`thread_id`
		FROM `revisions`
		WHERE `revisions`.`sub_chat_id` = `sub_chats`.`id`
		ORDER BY `revisions`.`updated_at` DESC, `revisions`.`created_at` DESC
		LIMIT 1
	),
	(
		SELECT `revisions`.`id`
		FROM `revisions`
		WHERE `revisions`.`sub_chat_id` = `sub_chats`.`id`
		ORDER BY `revisions`.`updated_at` DESC, `revisions`.`created_at` DESC
		LIMIT 1
	),
	CASE
		WHEN `chats`.`is_hidden` = 1 OR EXISTS (
			SELECT 1 FROM `revisions`
			WHERE `revisions`.`sub_chat_id` = `sub_chats`.`id`
		) THEN 'comment'
		ELSE 'project'
	END,
	COALESCE(`sub_chats`.`name`, `chats`.`name`, 'New Chat'),
	NULL,
	CASE WHEN `chats`.`archived_at` IS NULL THEN 'open' ELSE 'archived' END,
	`sub_chats`.`mode`,
	`sub_chats`.`session_id`,
	`sub_chats`.`stream_id`,
	`chats`.`worktree_path`,
	`chats`.`branch`,
	`chats`.`base_branch`,
	`chats`.`pr_url`,
	`chats`.`pr_number`,
	COALESCE(`sub_chats`.`created_at`, `chats`.`created_at`),
	COALESCE(`sub_chats`.`updated_at`, `chats`.`updated_at`),
	`chats`.`archived_at`,
	NULL
FROM `sub_chats`
INNER JOIN `chats` ON `chats`.`id` = `sub_chats`.`chat_id`;--> statement-breakpoint
INSERT OR IGNORE INTO `conversation_messages` (
	`id`,
	`conversation_id`,
	`agent_run_id`,
	`source_event_id`,
	`role`,
	`body`,
	`parts_json`,
	`metadata_json`,
	`created_at`
)
SELECT
	'legacy-' || `sub_chats`.`id` || '-' || `message`.`key`,
	`sub_chats`.`id`,
	NULL,
	NULL,
	CASE json_extract(`message`.`value`, '$.role')
		WHEN 'assistant' THEN 'assistant'
		WHEN 'system' THEN 'system'
		WHEN 'tool' THEN 'tool'
		ELSE 'user'
	END,
	COALESCE(
		NULLIF((
			SELECT group_concat(json_extract(`part`.`value`, '$.text'), char(10))
			FROM json_each(
				COALESCE(json_extract(`message`.`value`, '$.parts'), '[]')
			) AS `part`
			WHERE json_extract(`part`.`value`, '$.type') = 'text'
				AND json_type(`part`.`value`, '$.text') = 'text'
		), ''),
		json_extract(`message`.`value`, '$.content'),
		''
	),
	COALESCE(
		json_extract(`message`.`value`, '$.parts'),
		CASE
			WHEN json_extract(`message`.`value`, '$.content') IS NULL THEN '[]'
			ELSE json_array(json_object(
				'type',
				'text',
				'text',
				json_extract(`message`.`value`, '$.content')
			))
		END
	),
	COALESCE(json_extract(`message`.`value`, '$.metadata'), '{}'),
	COALESCE(
		json_extract(`message`.`value`, '$.createdAt'),
		json_extract(`message`.`value`, '$.created_at'),
		`sub_chats`.`updated_at`,
		`sub_chats`.`created_at`
	)
FROM `sub_chats`
INNER JOIN json_each(
	CASE
		WHEN json_valid(`sub_chats`.`messages`) THEN `sub_chats`.`messages`
		ELSE '[]'
	END
) AS `message`
WHERE json_type(`message`.`value`) = 'object';--> statement-breakpoint
UPDATE `agent_runs`
SET `conversation_id` = `sub_chat_id`
WHERE `conversation_id` IS NULL
	AND `sub_chat_id` IN (SELECT `id` FROM `conversations`);--> statement-breakpoint
UPDATE `agent_threads`
SET `conversation_id` = `sub_chat_id`
WHERE `conversation_id` IS NULL
	AND `sub_chat_id` IN (SELECT `id` FROM `conversations`);--> statement-breakpoint
UPDATE `revisions`
SET `conversation_id` = `sub_chat_id`
WHERE `conversation_id` IS NULL
	AND `sub_chat_id` IN (SELECT `id` FROM `conversations`);--> statement-breakpoint
UPDATE `transcript_messages`
SET `conversation_id` = `sub_chat_id`
WHERE `conversation_id` IS NULL
	AND `sub_chat_id` IN (SELECT `id` FROM `conversations`);--> statement-breakpoint
UPDATE `comment_threads`
SET `conversation_id` = (
	SELECT `revisions`.`conversation_id`
	FROM `revisions`
	WHERE `revisions`.`thread_id` = `comment_threads`.`id`
		AND `revisions`.`conversation_id` IS NOT NULL
	ORDER BY `revisions`.`updated_at` DESC, `revisions`.`created_at` DESC
	LIMIT 1
)
WHERE `conversation_id` IS NULL
	AND EXISTS (
		SELECT 1
		FROM `revisions`
		WHERE `revisions`.`thread_id` = `comment_threads`.`id`
			AND `revisions`.`conversation_id` IS NOT NULL
	);--> statement-breakpoint
DROP TABLE `sub_chats`;--> statement-breakpoint
CREATE TABLE `__new_agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_thread_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`request_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text,
	`mode` text DEFAULT 'agent' NOT NULL,
	`run_kind` text NOT NULL,
	`conversation_id` text,
	`revision_id` text,
	`comment_thread_id` text,
	`chat_id` text,
	`sub_chat_id` text,
	`provider_turn_id` text,
	`provider_session_id` text,
	`provider_item_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`prompt` text NOT NULL,
	`error_message` text,
	`cancel_requested_at` integer,
	`heartbeat_at` integer,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`agent_thread_id`) REFERENCES `agent_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `agent_connections`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_agent_runs`("id", "agent_thread_id", "workspace_id", "connection_id", "request_id", "provider", "model", "mode", "run_kind", "conversation_id", "revision_id", "comment_thread_id", "chat_id", "sub_chat_id", "provider_turn_id", "provider_session_id", "provider_item_id", "status", "prompt", "error_message", "cancel_requested_at", "heartbeat_at", "started_at", "completed_at", "created_at", "updated_at") SELECT "id", "agent_thread_id", "workspace_id", "connection_id", "request_id", "provider", "model", "mode", "run_kind", "conversation_id", "revision_id", "comment_thread_id", "chat_id", "sub_chat_id", "provider_turn_id", "provider_session_id", "provider_item_id", "status", "prompt", "error_message", "cancel_requested_at", "heartbeat_at", "started_at", "completed_at", "created_at", "updated_at" FROM `agent_runs`;--> statement-breakpoint
DROP TABLE `agent_runs`;--> statement-breakpoint
ALTER TABLE `__new_agent_runs` RENAME TO `agent_runs`;--> statement-breakpoint
CREATE INDEX `agent_runs_agent_thread_id_idx` ON `agent_runs` (`agent_thread_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_workspace_id_idx` ON `agent_runs` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_connection_id_idx` ON `agent_runs` (`connection_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_provider_status_idx` ON `agent_runs` (`provider`,`status`);--> statement-breakpoint
CREATE INDEX `agent_runs_conversation_id_idx` ON `agent_runs` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_revision_id_idx` ON `agent_runs` (`revision_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_chat_id_idx` ON `agent_runs` (`chat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_thread_request_idx` ON `agent_runs` (`agent_thread_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `__new_agent_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`provider` text NOT NULL,
	`purpose` text NOT NULL,
	`conversation_id` text,
	`chat_id` text,
	`sub_chat_id` text,
	`revision_id` text,
	`provider_thread_id` text,
	`provider_session_id` text,
	`created_at` integer,
	`updated_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `agent_connections`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_agent_threads`("id", "project_id", "workspace_id", "connection_id", "provider", "purpose", "conversation_id", "chat_id", "sub_chat_id", "revision_id", "provider_thread_id", "provider_session_id", "created_at", "updated_at", "archived_at") SELECT "id", "project_id", "workspace_id", "connection_id", "provider", "purpose", "conversation_id", "chat_id", "sub_chat_id", "revision_id", "provider_thread_id", "provider_session_id", "created_at", "updated_at", "archived_at" FROM `agent_threads`;--> statement-breakpoint
DROP TABLE `agent_threads`;--> statement-breakpoint
ALTER TABLE `__new_agent_threads` RENAME TO `agent_threads`;--> statement-breakpoint
CREATE INDEX `agent_threads_project_id_idx` ON `agent_threads` (`project_id`);--> statement-breakpoint
CREATE INDEX `agent_threads_workspace_id_idx` ON `agent_threads` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `agent_threads_connection_id_idx` ON `agent_threads` (`connection_id`);--> statement-breakpoint
CREATE INDEX `agent_threads_conversation_id_idx` ON `agent_threads` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `agent_threads_chat_id_idx` ON `agent_threads` (`chat_id`);--> statement-breakpoint
CREATE INDEX `agent_threads_revision_id_idx` ON `agent_threads` (`revision_id`);--> statement-breakpoint
CREATE TABLE `__new_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`project_id` text NOT NULL,
	`composition_id` text,
	`conversation_id` text,
	`chat_id` text,
	`sub_chat_id` text,
	`agent_provider` text,
	`agent_model` text,
	`agent_thread_id` text,
	`agent_run_id` text,
	`base_revision_id` text,
	`base_project_commit` text,
	`base_project_hash` text,
	`context_path` text,
	`branch` text,
	`prompt` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`preview_context_key` text,
	`diff_summary` text,
	`error_message` text,
	`created_at` integer,
	`updated_at` integer,
	`resolved_at` integer,
	FOREIGN KEY (`thread_id`) REFERENCES `comment_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`composition_id`) REFERENCES `compositions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`agent_thread_id`) REFERENCES `agent_threads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_revisions`("id", "thread_id", "project_id", "composition_id", "conversation_id", "chat_id", "sub_chat_id", "agent_provider", "agent_model", "agent_thread_id", "agent_run_id", "base_revision_id", "base_project_commit", "base_project_hash", "context_path", "branch", "prompt", "status", "preview_context_key", "diff_summary", "error_message", "created_at", "updated_at", "resolved_at") SELECT "id", "thread_id", "project_id", "composition_id", "conversation_id", "chat_id", "sub_chat_id", "agent_provider", "agent_model", "agent_thread_id", "agent_run_id", "base_revision_id", "base_project_commit", "base_project_hash", "context_path", "branch", "prompt", "status", "preview_context_key", "diff_summary", "error_message", "created_at", "updated_at", "resolved_at" FROM `revisions`;--> statement-breakpoint
DROP TABLE `revisions`;--> statement-breakpoint
ALTER TABLE `__new_revisions` RENAME TO `revisions`;--> statement-breakpoint
CREATE INDEX `revisions_thread_id_idx` ON `revisions` (`thread_id`);--> statement-breakpoint
CREATE INDEX `revisions_project_id_idx` ON `revisions` (`project_id`);--> statement-breakpoint
CREATE INDEX `revisions_conversation_id_idx` ON `revisions` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `revisions_chat_id_idx` ON `revisions` (`chat_id`);--> statement-breakpoint
CREATE INDEX `revisions_status_idx` ON `revisions` (`status`);--> statement-breakpoint
CREATE INDEX `revisions_agent_thread_id_idx` ON `revisions` (`agent_thread_id`);--> statement-breakpoint
CREATE INDEX `revisions_agent_run_id_idx` ON `revisions` (`agent_run_id`);--> statement-breakpoint
CREATE TABLE `__new_transcript_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_thread_id` text NOT NULL,
	`agent_run_id` text,
	`conversation_id` text,
	`chat_id` text,
	`sub_chat_id` text,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`source_event_id` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`agent_thread_id`) REFERENCES `agent_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_event_id`) REFERENCES `agent_run_events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_transcript_messages`("id", "agent_thread_id", "agent_run_id", "conversation_id", "chat_id", "sub_chat_id", "role", "body", "source_event_id", "metadata_json", "created_at") SELECT "id", "agent_thread_id", "agent_run_id", "conversation_id", "chat_id", "sub_chat_id", "role", "body", "source_event_id", "metadata_json", "created_at" FROM `transcript_messages`;--> statement-breakpoint
DROP TABLE `transcript_messages`;--> statement-breakpoint
ALTER TABLE `__new_transcript_messages` RENAME TO `transcript_messages`;--> statement-breakpoint
CREATE INDEX `transcript_messages_agent_thread_id_idx` ON `transcript_messages` (`agent_thread_id`);--> statement-breakpoint
CREATE INDEX `transcript_messages_agent_run_id_idx` ON `transcript_messages` (`agent_run_id`);--> statement-breakpoint
CREATE INDEX `transcript_messages_conversation_id_idx` ON `transcript_messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `transcript_messages_sub_chat_id_idx` ON `transcript_messages` (`sub_chat_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
