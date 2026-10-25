CREATE TABLE `social_whatsapp_messages` (
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`peer` text NOT NULL,
	`sent_at` integer NOT NULL,
	`encrypted` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_whatsapp_message_unique` ON `social_whatsapp_messages` (`account_id`,`provider_id`);--> statement-breakpoint
CREATE INDEX `social_whatsapp_thread_idx` ON `social_whatsapp_messages` (`account_id`,`peer`,`sent_at`);