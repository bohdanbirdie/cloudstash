ALTER TABLE `organization` RENAME COLUMN `features` TO `feature_overrides`;--> statement-breakpoint
ALTER TABLE `organization` ADD `tier` text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `tier_source` text DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `stripe_customer_id` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `stripe_subscription_id` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `subscription_status` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `current_period_end` integer;--> statement-breakpoint
ALTER TABLE `organization` ADD `cancel_at_period_end` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `organization_stripe_customer_id_unique` ON `organization` (`stripe_customer_id`);
