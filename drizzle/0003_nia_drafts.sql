CREATE TABLE `nia_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`brief` text NOT NULL,
	`candidate` text,
	`phase` text NOT NULL,
	`revision` integer NOT NULL,
	`fingerprint` text,
	`post_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_nia_drafts_created` ON `nia_drafts` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_nia_drafts_phase` ON `nia_drafts` (`phase`);