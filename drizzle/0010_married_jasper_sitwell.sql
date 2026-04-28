CREATE TABLE `comment_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`revision_id` text,
	`role` text DEFAULT 'user' NOT NULL,
	`body` text NOT NULL,
	`metadata_json` text,
	`created_at` integer,
	FOREIGN KEY (`thread_id`) REFERENCES `comment_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `revisions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `comment_messages_thread_id_idx` ON `comment_messages` (`thread_id`);--> statement-breakpoint
CREATE INDEX `comment_messages_revision_id_idx` ON `comment_messages` (`revision_id`);--> statement-breakpoint
CREATE TABLE `comment_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`composition_id` text,
	`anchor_type` text DEFAULT 'frame' NOT NULL,
	`start_time_ms` integer DEFAULT 0 NOT NULL,
	`end_time_ms` integer,
	`start_frame` integer DEFAULT 0 NOT NULL,
	`end_frame` integer,
	`element_selector` text,
	`clip_key` text,
	`source_file` text,
	`screenshot_path` text,
	`status` text DEFAULT 'open' NOT NULL,
	`latest_revision_id` text,
	`created_at` integer,
	`updated_at` integer,
	`resolved_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`composition_id`) REFERENCES `compositions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `comment_threads_project_id_idx` ON `comment_threads` (`project_id`);--> statement-breakpoint
CREATE INDEX `comment_threads_composition_id_idx` ON `comment_threads` (`composition_id`);--> statement-breakpoint
CREATE INDEX `comment_threads_project_deleted_idx` ON `comment_threads` (`project_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `comment_threads_latest_revision_idx` ON `comment_threads` (`latest_revision_id`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`project_id` text NOT NULL,
	`composition_id` text,
	`chat_id` text,
	`sub_chat_id` text,
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
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sub_chat_id`) REFERENCES `sub_chats`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `revisions_thread_id_idx` ON `revisions` (`thread_id`);--> statement-breakpoint
CREATE INDEX `revisions_project_id_idx` ON `revisions` (`project_id`);--> statement-breakpoint
CREATE INDEX `revisions_chat_id_idx` ON `revisions` (`chat_id`);--> statement-breakpoint
CREATE INDEX `revisions_status_idx` ON `revisions` (`status`);--> statement-breakpoint
ALTER TABLE `chats` ADD `is_hidden` integer DEFAULT false NOT NULL;