CREATE TABLE `hosted_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`run_id` text NOT NULL,
	`day` text NOT NULL,
	`status` text NOT NULL,
	`reserved_micros` integer NOT NULL,
	`actual_micros` integer,
	`started_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`failure` text
);
--> statement-breakpoint
CREATE INDEX `idx_hosted_turns_day` ON `hosted_turns` (`day`);--> statement-breakpoint
CREATE INDEX `idx_hosted_turns_workspace_day` ON `hosted_turns` (`workspace_id`,`day`);--> statement-breakpoint
CREATE INDEX `idx_hosted_turns_status_expiry` ON `hosted_turns` (`status`,`expires_at`);