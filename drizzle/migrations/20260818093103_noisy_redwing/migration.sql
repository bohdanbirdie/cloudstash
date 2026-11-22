-- Better Auth 1.7 keys accounts by issuer + account ID. Existing configured
-- providers are mapped below; NOT NULL and UNIQUE constraints abort and roll
-- back the migration if production contains an unknown or colliding identity.
CREATE TABLE `__new_account` (
	`access_token` text,
	`access_token_expires_at` integer,
	`account_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`id_token` text,
	`issuer` text NOT NULL,
	`password` text,
	`provider_id` text NOT NULL,
	`refresh_token` text,
	`refresh_token_expires_at` integer,
	`scope` text,
	`updated_at` integer NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_account_id_idx` ON `__new_account` (`issuer`,`account_id`);--> statement-breakpoint
INSERT INTO `__new_account`("access_token", "access_token_expires_at", "account_id", "created_at", "id", "id_token", "issuer", "password", "provider_id", "refresh_token", "refresh_token_expires_at", "scope", "updated_at", "user_id") SELECT "access_token", "access_token_expires_at", "account_id", "created_at", "id", "id_token", CASE
	WHEN "provider_id" = 'credential' THEN 'local:credential'
	WHEN "provider_id" = 'google' THEN 'https://accounts.google.com'
	WHEN "provider_id" = 'x' THEN 'local:oauth:x'
END, "password", "provider_id", "refresh_token", "refresh_token_expires_at", "scope", "updated_at", "user_id" FROM `account`;--> statement-breakpoint
DROP TABLE `account`;--> statement-breakpoint
ALTER TABLE `__new_account` RENAME TO `account`;--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);
