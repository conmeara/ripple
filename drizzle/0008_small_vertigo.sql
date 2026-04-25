CREATE TABLE `compositions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`file_path` text NOT NULL,
	`data_composition_id` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`parent_composition_id` text,
	`kind` text DEFAULT 'root' NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `compositions_project_id_idx` ON `compositions` (`project_id`);--> statement-breakpoint
CREATE INDEX `compositions_project_file_idx` ON `compositions` (`project_id`,`file_path`);--> statement-breakpoint
ALTER TABLE `projects` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `local_path` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `aspect_ratio_preset` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `active_composition_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `template_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `setup_status` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `setup_error` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `last_setup_check_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_local_path_unique` ON `projects` (`local_path`);