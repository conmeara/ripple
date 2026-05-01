CREATE TABLE `export_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`composition_id` text,
	`revision_id` text,
	`source_context_key` text NOT NULL,
	`source_label` text DEFAULT 'Main' NOT NULL,
	`label` text NOT NULL,
	`format` text DEFAULT 'mp4' NOT NULL,
	`fps` integer DEFAULT 30 NOT NULL,
	`quality_preset` text DEFAULT 'standard' NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`output_path` text,
	`destination_path` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`progress_label` text,
	`pid` integer,
	`stdout_tail` text DEFAULT '' NOT NULL,
	`stderr_tail` text DEFAULT '' NOT NULL,
	`error_message` text,
	`output_size_bytes` integer,
	`duration_seconds` integer,
	`width` integer,
	`height` integer,
	`started_at` integer,
	`created_at` integer,
	`updated_at` integer,
	`completed_at` integer,
	`cancelled_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`composition_id`) REFERENCES `compositions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`revision_id`) REFERENCES `revisions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `export_jobs_project_created_idx` ON `export_jobs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `export_jobs_project_status_idx` ON `export_jobs` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `export_jobs_composition_id_idx` ON `export_jobs` (`composition_id`);--> statement-breakpoint
CREATE INDEX `export_jobs_revision_id_idx` ON `export_jobs` (`revision_id`);