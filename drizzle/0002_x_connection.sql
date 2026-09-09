CREATE TABLE `x_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`tokens` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revision` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `x_oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_x_oauth_expiry` ON `x_oauth_states` (`expires_at`);