CREATE TABLE `email_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`email` text NOT NULL,
	`label` text NOT NULL,
	`encrypted_access_token` text NOT NULL,
	`encrypted_refresh_token` text,
	`token_expires_at` integer,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_accounts_user_provider_account_uidx` ON `email_accounts` (`user_id`,`provider`,`provider_account_id`);--> statement-breakpoint
CREATE INDEX `email_accounts_user_idx` ON `email_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`code_verifier` text NOT NULL,
	`label` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_states_expiry_idx` ON `oauth_states` (`expires_at`);