CREATE TABLE `agent_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text NOT NULL,
	`provider_request_id` text,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`prompt` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`response_json` text,
	`created_at` integer,
	`resolved_at` integer,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_approvals_agent_run_id_idx` ON `agent_approvals` (`agent_run_id`);--> statement-breakpoint
CREATE INDEX `agent_approvals_status_idx` ON `agent_approvals` (`status`);--> statement-breakpoint
CREATE TABLE `agent_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`runtime` text NOT NULL,
	`auth_mode` text,
	`default_model` text,
	`model_selection_mode` text DEFAULT 'provider_default' NOT NULL,
	`capabilities_json` text DEFAULT '{}' NOT NULL,
	`safe_account_status_json` text DEFAULT '{}' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `agent_connections_provider_idx` ON `agent_connections` (`provider`);--> statement-breakpoint
CREATE INDEX `agent_connections_provider_default_idx` ON `agent_connections` (`provider`,`is_default`);--> statement-breakpoint
CREATE TABLE `agent_run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`provider_type` text,
	`provider_id` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_run_events_agent_run_id_idx` ON `agent_run_events` (`agent_run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_run_events_run_sequence_idx` ON `agent_run_events` (`agent_run_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_thread_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`request_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text,
	`mode` text DEFAULT 'agent' NOT NULL,
	`run_kind` text NOT NULL,
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
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sub_chat_id`) REFERENCES `sub_chats`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_runs_agent_thread_id_idx` ON `agent_runs` (`agent_thread_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_workspace_id_idx` ON `agent_runs` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_connection_id_idx` ON `agent_runs` (`connection_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_provider_status_idx` ON `agent_runs` (`provider`,`status`);--> statement-breakpoint
CREATE INDEX `agent_runs_revision_id_idx` ON `agent_runs` (`revision_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_chat_id_idx` ON `agent_runs` (`chat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_thread_request_idx` ON `agent_runs` (`agent_thread_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `agent_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`provider` text NOT NULL,
	`purpose` text NOT NULL,
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
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sub_chat_id`) REFERENCES `sub_chats`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_threads_project_id_idx` ON `agent_threads` (`project_id`);--> statement-breakpoint
CREATE INDEX `agent_threads_workspace_id_idx` ON `agent_threads` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `agent_threads_connection_id_idx` ON `agent_threads` (`connection_id`);--> statement-breakpoint
CREATE INDEX `agent_threads_chat_id_idx` ON `agent_threads` (`chat_id`);--> statement-breakpoint
CREATE INDEX `agent_threads_revision_id_idx` ON `agent_threads` (`revision_id`);--> statement-breakpoint
CREATE TABLE `transcript_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_thread_id` text NOT NULL,
	`agent_run_id` text,
	`chat_id` text,
	`sub_chat_id` text,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`source_event_id` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`agent_thread_id`) REFERENCES `agent_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sub_chat_id`) REFERENCES `sub_chats`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_event_id`) REFERENCES `agent_run_events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transcript_messages_agent_thread_id_idx` ON `transcript_messages` (`agent_thread_id`);--> statement-breakpoint
CREATE INDEX `transcript_messages_agent_run_id_idx` ON `transcript_messages` (`agent_run_id`);--> statement-breakpoint
CREATE INDEX `transcript_messages_sub_chat_id_idx` ON `transcript_messages` (`sub_chat_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`path` text NOT NULL,
	`base_project_commit` text,
	`isolation_state` text DEFAULT 'isolated' NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspaces_project_id_idx` ON `workspaces` (`project_id`);--> statement-breakpoint
CREATE INDEX `workspaces_path_idx` ON `workspaces` (`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_target_idx` ON `workspaces` (`target_type`,`target_id`,`kind`);--> statement-breakpoint
ALTER TABLE `revisions` ADD `agent_provider` text;--> statement-breakpoint
ALTER TABLE `revisions` ADD `agent_model` text;--> statement-breakpoint
ALTER TABLE `revisions` ADD `agent_thread_id` text REFERENCES agent_threads(id);--> statement-breakpoint
ALTER TABLE `revisions` ADD `agent_run_id` text REFERENCES agent_runs(id);--> statement-breakpoint
CREATE INDEX `revisions_agent_thread_id_idx` ON `revisions` (`agent_thread_id`);--> statement-breakpoint
CREATE INDEX `revisions_agent_run_id_idx` ON `revisions` (`agent_run_id`);