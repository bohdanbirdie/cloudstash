-- Custom SQL migration file, put your code below! --
UPDATE `organization`
SET
	`admin_tier_grant` = `tier`,
	`admin_tier_granted_at` = coalesce(`usage_cycle_anchor`, `created_at`)
WHERE `tier_source` = 'admin' AND `tier` != 'free';--> statement-breakpoint
UPDATE `organization`
SET `tier` = 'free', `tier_source` = 'stripe'
WHERE `tier_source` = 'admin';
