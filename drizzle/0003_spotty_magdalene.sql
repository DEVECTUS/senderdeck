CREATE TABLE `social_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`provider` text NOT NULL,
	`asset_id` text NOT NULL,
	`parent_id` text,
	`provider_user_id` text,
	`name` text NOT NULL,
	`token` text,
	`user_token` text,
	`expires_at` integer,
	`permissions` text NOT NULL,
	`status` text NOT NULL,
	`validation` text NOT NULL,
	`validated_at` integer,
	`monitoring` text NOT NULL,
	`last_reconciled_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `social_brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_asset_unique` ON `social_accounts` (`provider`,`asset_id`);--> statement-breakpoint
CREATE INDEX `social_account_brand` ON `social_accounts` (`brand_id`);--> statement-breakpoint
CREATE TABLE `social_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`object_id` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `social_brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `social_brands` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`name` text NOT NULL,
	`profile` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `social_customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `social_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `social_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`brand_revision` integer NOT NULL,
	`revision` text NOT NULL,
	`encrypted` text NOT NULL,
	`state` text NOT NULL,
	`created_by` text NOT NULL,
	`approval_hash` text,
	`approver` text,
	`approval_expires_at` integer,
	`expires_at` integer NOT NULL,
	`provider_result` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `social_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `social_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`user_id` text NOT NULL,
	`encrypted` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `social_brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `social_identity_links` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`encrypted` text NOT NULL,
	`confirmed_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `social_brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `social_members` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `social_customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_member_unique` ON `social_members` (`customer_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `social_member_user` ON `social_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `social_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`reason` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_notice_fingerprint` ON `social_notices` (`account_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `social_oauth` (
	`hash` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`user_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `social_brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `social_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`encrypted` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`claimed_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `social_queue_state` ON `social_queue` (`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `social_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`user_id` text NOT NULL,
	`digest` text NOT NULL,
	`encrypted` text NOT NULL,
	`complete` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `social_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `social_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`source_url` text,
	`status` text NOT NULL,
	`assigned_to` text,
	`next_action` text NOT NULL,
	`last_inbound_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_thread_unique` ON `social_threads` (`account_id`,`kind`,`provider_id`);