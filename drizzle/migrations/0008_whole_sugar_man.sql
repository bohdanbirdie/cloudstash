PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_apikey` (
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`enabled` integer DEFAULT true,
	`expires_at` integer,
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`last_refill_at` integer,
	`last_request` integer,
	`metadata` text,
	`name` text,
	`permissions` text,
	`prefix` text,
	`rate_limit_enabled` integer DEFAULT true,
	`rate_limit_max` integer,
	`rate_limit_time_window` integer,
	`refill_amount` integer,
	`refill_interval` integer,
	`remaining` integer,
	`request_count` integer DEFAULT 0,
	`start` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`reference_id` text NOT NULL,
	`config_id` text DEFAULT 'default' NOT NULL,
	FOREIGN KEY (`reference_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_apikey`("created_at", "enabled", "expires_at", "id", "key", "last_refill_at", "last_request", "metadata", "name", "permissions", "prefix", "rate_limit_enabled", "rate_limit_max", "rate_limit_time_window", "refill_amount", "refill_interval", "remaining", "request_count", "start", "updated_at", "reference_id", "config_id") SELECT "created_at", "enabled", "expires_at", "id", "key", "last_refill_at", "last_request", "metadata", "name", "permissions", "prefix", "rate_limit_enabled", "rate_limit_max", "rate_limit_time_window", "refill_amount", "refill_interval", "remaining", "request_count", "start", "updated_at", "user_id", 'default' FROM `apikey`;--> statement-breakpoint
DROP TABLE `apikey`;--> statement-breakpoint
ALTER TABLE `__new_apikey` RENAME TO `apikey`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `apikey_key_idx` ON `apikey` (`key`);--> statement-breakpoint
CREATE INDEX `apikey_referenceId_idx` ON `apikey` (`reference_id`);