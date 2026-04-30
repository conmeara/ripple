CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`composition_id` text,
	`comment_thread_id` text,
	`revision_id` text,
	`kind` text DEFAULT 'project' NOT NULL,
	`title` text,
	`summary` text,
	`status` text DEFAULT 'open' NOT NULL,
	`mode` text DEFAULT 'agent' NOT NULL,
	`session_id` text,
	`stream_id` text,
	`worktree_path` text,
	`branch` text,
	`base_branch` text,
	`pr_url` text,
	`pr_number` integer,
	`created_at` integer,
	`updated_at` integer,
	`archived_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`composition_id`) REFERENCES `compositions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `conversations_project_id_idx` ON `conversations` (`project_id`);--> statement-breakpoint
CREATE INDEX `conversations_composition_id_idx` ON `conversations` (`composition_id`);--> statement-breakpoint
CREATE INDEX `conversations_comment_thread_id_idx` ON `conversations` (`comment_thread_id`);--> statement-breakpoint
CREATE INDEX `conversations_revision_id_idx` ON `conversations` (`revision_id`);--> statement-breakpoint
CREATE INDEX `conversations_worktree_path_idx` ON `conversations` (`worktree_path`);--> statement-breakpoint
CREATE INDEX `conversations_project_kind_updated_idx` ON `conversations` (`project_id`,`kind`,`updated_at`);--> statement-breakpoint
CREATE TABLE `conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`agent_run_id` text,
	`source_event_id` text,
	`role` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`parts_json` text DEFAULT '[]' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_event_id`) REFERENCES `agent_run_events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `conversation_messages_conversation_id_idx` ON `conversation_messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `conversation_messages_agent_run_id_idx` ON `conversation_messages` (`agent_run_id`);--> statement-breakpoint
CREATE INDEX `conversation_messages_source_event_id_idx` ON `conversation_messages` (`source_event_id`);--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `conversation_id` text REFERENCES conversations(id);--> statement-breakpoint
CREATE INDEX `agent_runs_conversation_id_idx` ON `agent_runs` (`conversation_id`);--> statement-breakpoint
ALTER TABLE `agent_threads` ADD `conversation_id` text REFERENCES conversations(id);--> statement-breakpoint
CREATE INDEX `agent_threads_conversation_id_idx` ON `agent_threads` (`conversation_id`);--> statement-breakpoint
ALTER TABLE `comment_threads` ADD `conversation_id` text REFERENCES conversations(id);--> statement-breakpoint
CREATE INDEX `comment_threads_conversation_id_idx` ON `comment_threads` (`conversation_id`);--> statement-breakpoint
ALTER TABLE `revisions` ADD `conversation_id` text REFERENCES conversations(id);--> statement-breakpoint
CREATE INDEX `revisions_conversation_id_idx` ON `revisions` (`conversation_id`);--> statement-breakpoint
ALTER TABLE `transcript_messages` ADD `conversation_id` text REFERENCES conversations(id);--> statement-breakpoint
CREATE INDEX `transcript_messages_conversation_id_idx` ON `transcript_messages` (`conversation_id`);
