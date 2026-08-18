-- Read-only preflight for 0015_noisy_redwing.sql.
-- An empty result means the account issuer backfill can run as written.
-- Run against production before applying migration 0015, for example:
--   wrangler d1 execute DB --remote --file drizzle/preflight/0015_account_issuer.sql
WITH `resolved_account` AS (
	SELECT
		`provider_id`,
		`account_id`,
		CASE
			WHEN `provider_id` = 'credential' THEN 'local:credential'
			WHEN `provider_id` = 'google' THEN 'https://accounts.google.com'
			WHEN `provider_id` = 'x' THEN 'local:oauth:x'
		END AS `issuer`
	FROM `account`
)
SELECT
	'unsupported_provider' AS `issue`,
	`provider_id`,
	NULL AS `issuer`,
	NULL AS `account_id`,
	COUNT(*) AS `affected_rows`
FROM `resolved_account`
WHERE `issuer` IS NULL
GROUP BY `provider_id`
UNION ALL
SELECT
	'identity_collision' AS `issue`,
	GROUP_CONCAT(DISTINCT `provider_id`) AS `provider_id`,
	`issuer`,
	`account_id`,
	COUNT(*) AS `affected_rows`
FROM `resolved_account`
WHERE `issuer` IS NOT NULL
GROUP BY `issuer`, `account_id`
HAVING COUNT(*) > 1
ORDER BY `issue`, `provider_id`, `account_id`;
