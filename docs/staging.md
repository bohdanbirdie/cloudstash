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

The `staging` branch is Cloudstash's default integration branch. Feature and fix
PRs target `staging`; merging one updates the shared staging Worker through
Cloudflare Builds. Multiple PRs may be open, but their changes reach the shared
environment only after merge, in `staging` history order.

`main` is the production branch. Do not target it directly for ordinary work.
Changes reach `main` through the rolling `staging` to `main` production
promotion PR after the current staging revision has completed its intended soak
and smoke verification.

## Promotion to production

Cloudflare cannot promote a deployment from `cloudstash-staging` to
`cloudstash`: named Wrangler environments are separate Workers, and their
stateful bindings are intentionally separate. Cloudflare's dashboard promotion
features operate on versions of one Worker (or, separately, Enterprise Zone
Version Management); they do not transfer a Worker version and its bindings
between these two Workers.

Promotion is therefore source-based: merge ordinary PRs into `staging`, verify
the resulting deployed revision, then merge the rolling `staging` to `main` PR.
The production Worker's existing GitHub integration builds and deploys `main`.
This preserves environment isolation but is not a byte-for-byte artifact
promotion. If exact artifact promotion becomes necessary, add an external CI
artifact handoff rather than weakening the staging boundary.

The `Open production promotion PR` workflow runs daily at 05:17 UTC and can also
be dispatched manually. When staging contains unpromoted commits, it creates the
promotion PR if one is not already open. The existing PR automatically follows
new staging commits, so every staging update restarts the human soak decision;
the workflow does not close and recreate it.

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

1. Create the Queue resources that Wrangler requires before its first deploy:
   `bunx wrangler queues create cloudstash-staging-link-dlq`, then
   `bunx wrangler queues create cloudstash-staging-link-queue`.
2. Run `bun run build:staging`, then `bunx wrangler deploy --env staging` once.
   Wrangler automatically provisions and links the staging D1 and KV
   namespaces; the deploy also creates the environment Worker, Workflow,
   Durable Object namespaces, Queue bindings, and remaining bindings.
3. Run `bunx wrangler d1 migrations apply DB --remote --env staging`, then
   `bunx wrangler deploy --env staging` again so the first public rehearsal sees
   the complete schema.
4. Confirm the declarative `staging.cloudstash.dev` custom domain was created in
   the `cloudstash.dev` zone by the deploy.
5. Add the staging-only secrets listed below.
6. Register the staging callback URL with Google and X OAuth providers and use
   Stripe test-mode webhook/Price configuration.
7. Create the `staging` Git branch from the current `main`, make it the GitHub
   repository's default branch, and apply the ordinary required CI checks to
   PRs targeting it. Keep `main` protected as the production branch.
8. In GitHub **Settings > Actions > General > Workflow permissions**, enable
   **Allow GitHub Actions to create and approve pull requests**. The promotion
   workflow grants its token only `contents: read` and `pull-requests: write`;
   it creates PRs but never approves them.
9. Connect the staging Worker to GitHub and enter the Workers Builds settings
   above.
10. Open ordinary PRs against `staging`. After merge and deployment, verify
    login, one browser save and cross-client sync, one Queue ingest, MCP
    OAuth/tool use, and any changed critical path before merging the production
    promotion PR.

Automatic provisioning is intentional for resources supported by Wrangler.
Queues are created explicitly before the first deploy; generated D1 and KV
resource IDs are visible in the dashboard but are not written back to Git, and
the Worker retains the resource links for later deploys.

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

## Required staging variables

Set `AI_METER_LIMIT` as a plain Worker variable in the Cloudflare dashboard.
Its value is intentionally environment-owned rather than committed. Deployment
scripts use Wrangler's `--keep-vars` option so dashboard-managed variables are
not removed by later deployments.
