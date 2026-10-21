CREATE TABLE `social_platform_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`keys` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `social_platform_secrets` (
	`key` text PRIMARY KEY NOT NULL,
	`encrypted` text NOT NULL,
	`updated_at` integer NOT NULL
);
