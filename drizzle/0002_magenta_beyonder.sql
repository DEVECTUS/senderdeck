CREATE TABLE `senderdeck_identities` (
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `senderdeck_identities_provider_account_uidx` ON `senderdeck_identities` (`provider`,`provider_account_id`);--> statement-breakpoint
CREATE INDEX `senderdeck_identities_user_idx` ON `senderdeck_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `senderdeck_login_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`code_verifier` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`return_to` text NOT NULL,
	`linking_user_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `senderdeck_login_states_expiry_idx` ON `senderdeck_login_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `senderdeck_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `senderdeck_sessions_user_idx` ON `senderdeck_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `senderdeck_sessions_expiry_idx` ON `senderdeck_sessions` (`expires_at`);