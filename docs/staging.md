# Staging environment

Staging is the `staging` stage of the Alchemy stack (`alchemy.run.ts`), served
on `https://staging.cloudstash.dev`. It reuses the resources of the former
Wrangler staging environment, listed under `staging` in `DEPLOYED_STAGES`
(`worker.config.ts`): the `cloudstash-staging` Worker, D1 database, KV
namespaces, queues, Workflow, Analytics Engine dataset, and rate-limit
namespaces. Do not delete them.

## Flow

1. Feature pull requests target the `staging` branch (the default branch).
2. Each merge into `staging` runs **Deploy staging**, which deploys the stage
   with secrets from the GitHub `staging` environment.
3. A `staging` → `main` pull request releases to production. Merge it with a
   merge commit, never a squash, so the two branches keep a shared history.
4. A fix merged straight into `main` must be merged back into `staging`.

**Deploy staging** can also be started by hand from any branch, with `plan` or
`deploy`. Staging resources are not protected, so a plan may replace or delete
them.

## Differences from production

- Separate data: its own D1 database, KV namespaces, queues, and Durable Object
  namespaces.
- Its own `BETTER_AUTH_SECRET` and Telegram bot. One Telegram bot can serve
  only one webhook, so staging must not use the production bot.
- Stripe runs in test mode.
