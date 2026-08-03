CREATE TABLE `mcp_authorization_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`scope` text NOT NULL,
	`resource` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mcp_authorization_codes_expiry_idx` ON `mcp_authorization_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `mcp_authorization_requests` (
	`request_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`scope` text NOT NULL,
	`state` text,
	`resource` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mcp_authorization_requests_expiry_idx` ON `mcp_authorization_requests` (`expires_at`);--> statement-breakpoint
CREATE TABLE `mcp_oauth_clients` (
	`client_id` text PRIMARY KEY NOT NULL,
	`redirect_uris` text NOT NULL,
	`client_name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_oauth_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`token_type` text NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`scope` text NOT NULL,
	`resource` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mcp_oauth_tokens_expiry_idx` ON `mcp_oauth_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `mcp_oauth_tokens_user_idx` ON `mcp_oauth_tokens` (`user_id`);