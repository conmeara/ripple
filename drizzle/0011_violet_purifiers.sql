ALTER TABLE `comment_messages` ADD `client_request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `comment_messages_thread_client_request_idx` ON `comment_messages` (`thread_id`,`client_request_id`);--> statement-breakpoint
ALTER TABLE `comment_threads` ADD `client_request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `comment_threads_project_client_request_idx` ON `comment_threads` (`project_id`,`client_request_id`);