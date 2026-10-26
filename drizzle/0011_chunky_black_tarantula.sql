CREATE TABLE `social_whatsapp_coexistence` (
	`account_id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`status` text NOT NULL,
	`contacts_state` text NOT NULL,
	`history_state` text NOT NULL,
	`contacts_request_id` text,
	`history_request_id` text,
	`history_progress` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`sync_deadline` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
