CREATE TABLE `senderdeck_login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `senderdeck_login_attempts_expiry_idx` ON `senderdeck_login_attempts` (`expires_at`);--> statement-breakpoint
CREATE TABLE `senderdeck_password_logins` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `senderdeck_password_logins_username_unique` ON `senderdeck_password_logins` (`username`);