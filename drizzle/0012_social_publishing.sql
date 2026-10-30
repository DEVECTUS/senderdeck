CREATE TABLE `social_publish_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`channel` text NOT NULL,
	`fingerprint` text NOT NULL,
	`evidence` text NOT NULL,
	`checked_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_publish_check_unique` ON `social_publish_checks` (`account_id`,`channel`);--> statement-breakpoint
CREATE TABLE `social_publish_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`account_id` text,
	`channel` text NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	`stage` text NOT NULL,
	`provider_id` text,
	`receipt_key` text,
	`prepared_id` text,
	`receipt` text,
	`error` text,
	`started_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `social_publish_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_publish_destination_unique` ON `social_publish_deliveries` (`item_id`,`channel`);--> statement-breakpoint
CREATE INDEX `social_publish_delivery_account_idx` ON `social_publish_deliveries` (`account_id`,`channel`);--> statement-breakpoint
CREATE UNIQUE INDEX `social_publish_provider_receipt_unique` ON `social_publish_deliveries` (`account_id`,`channel`,`receipt_key`);--> statement-breakpoint
CREATE TABLE `social_publish_items` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`content_key` text NOT NULL,
	`topic_date` text NOT NULL,
	`revision` integer NOT NULL,
	`digest` text NOT NULL,
	`write_token` text,
	`encrypted` text NOT NULL,
	`disposition` text NOT NULL,
	`policy_revision` integer NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `social_brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_publish_daily_topic_unique` ON `social_publish_items` (`brand_id`,`topic_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `social_publish_content_key_unique` ON `social_publish_items` (`brand_id`,`content_key`);--> statement-breakpoint
CREATE INDEX `social_publish_item_expiry_idx` ON `social_publish_items` (`expires_at`);--> statement-breakpoint
CREATE TABLE `social_publish_media` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`user_id` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`source_sha256` text,
	`width` integer,
	`height` integer,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `social_brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `social_publish_media_expiry_idx` ON `social_publish_media` (`expires_at`);--> statement-breakpoint
CREATE TABLE `social_publish_media_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`encrypted` text NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `social_publish_media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_publish_chunk_unique` ON `social_publish_media_chunks` (`media_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `social_publish_policies` (
	`brand_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`enabled` integer NOT NULL,
	`encrypted` text NOT NULL,
	`actor` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `social_brands`(`id`) ON UPDATE no action ON DELETE cascade
);
