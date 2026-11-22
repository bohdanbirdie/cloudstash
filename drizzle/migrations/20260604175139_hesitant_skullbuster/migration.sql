CREATE TABLE `activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`source` text,
	`ref_id` text,
	`meta` text,
	`occurred_at` integer NOT NULL,
	`dedupe_key` text
);
--> statement-breakpoint
CREATE INDEX `activity_org_time_idx` ON `activity_events` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_type_time_idx` ON `activity_events` (`type`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `activity_dedupe_idx` ON `activity_events` (`dedupe_key`);