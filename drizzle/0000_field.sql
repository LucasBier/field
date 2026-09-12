CREATE TABLE `desk_media_chunks` (
	`object_key` text NOT NULL,
	`sequence` integer NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`object_key`, `sequence`),
	FOREIGN KEY (`object_key`) REFERENCES `desk_media_objects`(`key`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `desk_media_objects` (
	`key` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`content_type` text NOT NULL,
	`captured_at` text NOT NULL,
	`chunks` integer NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);

CREATE TABLE `desk_sessions` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`bridge_hash` text,
	`updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX `idx_desk_bridge_hash` ON `desk_sessions` (`bridge_hash`);
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

CREATE INDEX `idx_hosted_turns_day` ON `hosted_turns` (`day`);
CREATE INDEX `idx_hosted_turns_workspace_day` ON `hosted_turns` (`workspace_id`,`day`);
CREATE INDEX `idx_hosted_turns_status_expiry` ON `hosted_turns` (`status`,`expires_at`);
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);

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

CREATE TABLE `x_oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`expires_at` integer NOT NULL
);

CREATE INDEX `idx_x_oauth_expiry` ON `x_oauth_states` (`expires_at`);
CREATE TABLE `zuri_drafts` (
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

CREATE INDEX `idx_zuri_drafts_created` ON `zuri_drafts` (`created_at`);
CREATE INDEX `idx_zuri_drafts_phase` ON `zuri_drafts` (`phase`);