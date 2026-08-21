# Staging environment

Cloudstash uses one persistent, isolated Cloudflare staging environment. It is
deployed from the long-lived `staging` branch and does not share stateful
bindings with production.

Cloudflare's ordinary branch preview URLs are not available for Workers that
implement Durable Objects. A named Wrangler environment therefore provides the
smallest deployed test surface that exercises Cloudstash's actual D1, Queue,
Workflow, Durable Object, WebSocket, and static-asset boundaries.

## Shape

| Git branch | Worker               | Public origin                    |
| ---------- | -------------------- | -------------------------------- |
| `main`     | `cloudstash`         | `https://cloudstash.dev`         |
| `staging`  | `cloudstash-staging` | `https://staging.cloudstash.dev` |

The `env.staging` block in `wrangler.jsonc` repeats every non-inherited binding.
Its D1, KV, Queue, Workflow, Durable Object, rate-limit, and Analytics Engine
resources are distinct from production. Workers AI is account-backed but is
bound independently to the staging Worker.

Normal `vp dev` remains on the top-level local environment. The staging config
is selected only by `CLOUDFLARE_ENV=staging` during a Vite build or `--env
staging` on a Wrangler command.

## Branch policy

The `staging` branch is a deployment pointer, not an integration branch. Promote
the exact PR head that needs deployed verification to `staging`. Ordinarily only
one PR occupies staging at a time. If multiple PRs exist, serialize them or
deliberately test a combined commit; do not let every non-production branch
overwrite the same stateful Worker.

After a PR merges, move `staging` back to the selected `main` commit before the
next rehearsal. Use `--force-with-lease`, never an unconditional force push,
when moving this pointer.

## Promotion to production

Cloudflare cannot promote a deployment from `cloudstash-staging` to
`cloudstash`: named Wrangler environments are separate Workers, and their
stateful bindings are intentionally separate. Cloudflare's dashboard promotion
features operate on versions of one Worker (or, separately, Enterprise Zone
Version Management); they do not transfer a Worker version and its bindings
between these two Workers.

Promotion is therefore source-based: verify the selected PR revision on the
`staging` branch, then merge that reviewed change to `main`. The production
Worker's existing GitHub integration builds and deploys `main`. This preserves
environment isolation but is not a byte-for-byte artifact promotion. If exact
artifact promotion becomes necessary, add an external CI artifact handoff
rather than weakening the staging boundary.

## Cloudflare Builds settings

Connect the same GitHub repository to the `cloudstash-staging` Worker and use:

- Root directory: `/`
- Production branch: `staging`
- Build command: `bun run build:staging`
- Deploy command: `bun run deploy:staging:artifact`
- Builds for non-production branches: disabled
- Build variable: `BUN_VERSION=1.3.14`

The build command creates and certifies the exact Vite Worker artifact before
the deploy command applies staging D1 migrations. The deploy command refuses a
production-shaped artifact before making remote changes.

## One-time bootstrap

Remote setup remains maintainer-controlled. From this branch or after merge:

1. Run `bun run build:staging`, then `bunx wrangler deploy --env staging` once.
   Wrangler automatically provisions and links the staging D1, KV, and Queues;
   the deploy also creates the environment Worker, Workflow, Durable Object
   namespaces, and remaining bindings.
2. Run `bunx wrangler d1 migrations apply DB --remote --env staging`, then
   `bunx wrangler deploy --env staging` again so the first public rehearsal sees
   the complete schema.
3. Confirm the declarative `staging.cloudstash.dev` custom domain was created in
   the `cloudstash.dev` zone by the deploy.
4. Add the staging-only secrets listed below.
5. Register the staging callback URL with Google and X OAuth providers and use
   Stripe test-mode webhook/Price configuration.
6. Create the `staging` Git branch, connect the Worker to GitHub, and enter the
   Workers Builds settings above.
7. Promote a PR head, then verify login, one browser save and cross-client sync,
   one Queue ingest, MCP OAuth/tool use, and any changed critical path.

Automatic provisioning is intentional for resources supported by Wrangler.
When provisioning happens through Cloudflare Builds, generated resource IDs are
visible in the dashboard but are not written back to Git; the Worker retains the
resource links for later deploys.

## Required staging secrets

Set these on `cloudstash-staging`, never in Git:

- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS`,
  `STRIPE_PRICE_PLUS_YEARLY`, `STRIPE_PRICE_PRO`, and
  `STRIPE_PRICE_PRO_YEARLY` using Stripe test mode
- `OPENROUTER_API_KEY`
- `RESEND_API_KEY`
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` for a separate staging bot
- `X_CLIENT_ID` and `X_CLIENT_SECRET`
- `CF_ACCOUNT_ID` and `CF_ANALYTICS_TOKEN` if the admin usage view is exercised

Staging credentials may reuse a provider project only when that provider
supports an additional callback cleanly. Signing keys, Stripe mode, Telegram
webhook ownership, state stores, and Queues must remain isolated.
