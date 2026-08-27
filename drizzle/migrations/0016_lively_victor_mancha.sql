DELETE FROM `activity_events`
WHERE NOT EXISTS (
	SELECT 1 FROM `organization`
	WHERE `organization`.`id` = `activity_events`.`organization_id`
);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`source` text,
	`ref_id` text,
	`meta` text,
	`occurred_at` integer NOT NULL,
	`dedupe_key` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_activity_events`("id", "organization_id", "user_id", "type", "source", "ref_id", "meta", "occurred_at", "dedupe_key") SELECT "id", "organization_id", "user_id", "type", "source", "ref_id", "meta", "occurred_at", "dedupe_key" FROM `activity_events`;--> statement-breakpoint
DROP TABLE `activity_events`;--> statement-breakpoint
ALTER TABLE `__new_activity_events` RENAME TO `activity_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `activity_org_time_idx` ON `activity_events` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_type_time_idx` ON `activity_events` (`type`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `activity_dedupe_idx` ON `activity_events` (`dedupe_key`);
