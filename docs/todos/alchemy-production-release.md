# Alchemy production release checklist

One-time steps to move production from Wrangler to Alchemy. Everything runs
against production, so the maintainer does each step by hand, in this order.

## 1. Cloudflare

- Disable Workers Builds (Git integration) for the `cloudstash` Worker, so
  nothing deploys with Wrangler again.
- Create an API token for CI with the permissions Alchemy needs for this stack:
  Workers Scripts, Workers KV Storage, D1, Queues, Workers Routes and Custom
  Domains (zone `cloudstash.dev`), Analytics Engine, Workflows, and Secrets
  Store Write (Alchemy keeps its state in the Cloudflare account).

## 2. GitHub

Create the `production` environment and add `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`.

Add every app secret listed in `.github/workflows/deploy.yml` to the same
environment. `CF_ACCOUNT_ID` is not one of them: the stack passes the deploy
account to the Worker. The deploy fails if one is missing or empty. Values come from
1Password.

`BETTER_AUTH_SECRET` is new: the old value was lost, and Cloudflare never shows
saved values. Generate it with `openssl rand -hex 32` and save it in 1Password.

## 3. Alchemy state store

Run once on your machine with the token from step 1:
`CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… bunx alchemy state bootstrap`.

## 4. Migration history

Alchemy takes over Wrangler's `d1_migrations` history by name, and the
migrations now live in Drizzle v1 folders. Right before the first deploy, run
this once in the D1 console for `cloudstash`. It only renames rows; no schema
or data changes.

```sql
UPDATE d1_migrations SET name = '20260119214115_thankful_mother_askani' WHERE name = '0000_thankful_mother_askani.sql';
UPDATE d1_migrations SET name = '20260120212505_aspiring_hitman' WHERE name = '0001_aspiring_hitman.sql';
UPDATE d1_migrations SET name = '20260121120506_abnormal_captain_cross' WHERE name = '0002_abnormal_captain_cross.sql';
UPDATE d1_migrations SET name = '20260122200333_marvelous_boomerang' WHERE name = '0003_marvelous_boomerang.sql';
UPDATE d1_migrations SET name = '20260124135229_brave_inhumans' WHERE name = '0004_brave_inhumans.sql';
UPDATE d1_migrations SET name = '20260124145359_foamy_blindfold' WHERE name = '0005_foamy_blindfold.sql';
UPDATE d1_migrations SET name = '20260125143727_cooing_iron_lad' WHERE name = '0006_cooing_iron_lad.sql';
UPDATE d1_migrations SET name = '20260127101717_flaky_hemingway' WHERE name = '0007_flaky_hemingway.sql';
UPDATE d1_migrations SET name = '20260321230624_whole_sugar_man' WHERE name = '0008_whole_sugar_man.sql';
UPDATE d1_migrations SET name = '20260510181418_empty_unus' WHERE name = '0009_empty_unus.sql';
UPDATE d1_migrations SET name = '20260516211628_billing_tier' WHERE name = '0010_billing_tier.sql';
UPDATE d1_migrations SET name = '20260522124244_absurd_blink' WHERE name = '0011_absurd_blink.sql';
UPDATE d1_migrations SET name = '20260604175139_hesitant_skullbuster' WHERE name = '0012_hesitant_skullbuster.sql';
UPDATE d1_migrations SET name = '20260608134245_lonely_giant_girl' WHERE name = '0013_lonely_giant_girl.sql';
UPDATE d1_migrations SET name = '20260817165722_sparkling_thor_girl' WHERE name = '0014_sparkling_thor_girl.sql';
UPDATE d1_migrations SET name = '20260818093103_noisy_redwing' WHERE name = '0015_noisy_redwing.sql';
UPDATE d1_migrations SET name = '20260826195054_lively_victor_mancha' WHERE name = '0016_lively_victor_mancha.sql';
UPDATE d1_migrations SET name = '20260827100730_bored_thor' WHERE name = '0017_bored_thor.sql';
UPDATE d1_migrations SET name = '20260829212521_ordinary_the_spike' WHERE name = '0018_ordinary_the_spike.sql';
UPDATE d1_migrations SET name = '20260830123258_secret_stature' WHERE name = '0019_secret_stature.sql';
UPDATE d1_migrations SET name = '20260830123837_backfill_admin_tier_grants' WHERE name = '0020_backfill_admin_tier_grants.sql';
```

Check afterwards: `SELECT name FROM d1_migrations ORDER BY id;` shows 21 folder
names.

## 5. Merge and first deploy

1. Merge the PR. The automatic deploy on `main` stops at the plan step,
   because existing resources need adoption. Nothing changes.
2. Run the "Deploy production" workflow by hand with `action: plan` and
   `adopt: true`. Review that every resource is adopted or updated, and that
   nothing is replaced or deleted.
3. Run it again with `action: deploy` and `adopt: true`.
4. Delete the JWT signing keys, which the old `BETTER_AUTH_SECRET` encrypted:
   `DELETE FROM jwks;` in the D1 console. Better Auth makes a new key on first
   use. Without this, every new MCP token fails with "Failed to decrypt
   private key".
5. Sign in again (sessions are signed with the old secret).
6. In settings, disconnect X and connect it again. The stored X tokens are
   encrypted with the old secret and cannot be read.
7. Check `https://cloudstash.dev`, sync, one saved link, and one MCP call.
   Telegram, Raycast, the Chrome extension and the API use hashed API keys and
   keep working.

Later pushes to `main` deploy automatically without `--adopt`.
