CREATE TABLE `social_moderations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`brand_revision` integer NOT NULL,
	`revision` text NOT NULL,
	`encrypted` text NOT NULL,
	`approval_hash` text NOT NULL,
	`state` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `social_moderation_expiry` ON `social_moderations` (`expires_at`);