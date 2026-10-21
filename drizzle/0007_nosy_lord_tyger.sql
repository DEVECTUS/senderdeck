CREATE TABLE `social_monitor_evidence` (
	`account_id` text PRIMARY KEY NOT NULL,
	`messages_at` integer,
	`comments_at` integer,
	`poll_at` integer,
	`poll_errors` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
