CREATE TABLE `auth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`login` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`password_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_login_unique` ON `auth_accounts` (`login`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_user_id_unique` ON `auth_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `auth_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
