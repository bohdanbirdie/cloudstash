# Cloudstash

Save and organize links with AI-powered summaries. Full-stack TypeScript on Cloudflare Workers.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bohdanbirdie/cloudstash)

## Features

- **Link saving** with automatic metadata extraction (title, description, favicon)
- **AI summaries** powered by OpenRouter (Gemini 2.5 Flash)
- **Real-time sync** across devices via LiveStore + WebSocket
- **Telegram bot** for saving links on the go
- **AI chat** for asking questions about your saved links
- **Multi-workspace** support with invite system
- **Admin panel** with usage analytics

## Stack

- **Frontend:** React 19, Vite, TailwindCSS 4, TanStack Router
- **Backend:** Cloudflare Workers, Hono.js, D1 (SQLite), Drizzle ORM
- **Real-time:** LiveStore with Durable Objects
- **AI:** Vercel AI SDK + OpenRouter
- **Auth:** Better Auth + Google OAuth

## Quick Start

### One-Click Deploy

Click the **Deploy to Cloudflare** button above. It will:

1. Fork the repo to your GitHub account
2. Provision all Cloudflare resources (D1, KV, Durable Objects)
3. Prompt you for required secrets
4. Deploy and set up CI/CD

After deploying, you'll need to:

- Set `BETTER_AUTH_URL` to your Worker URL (e.g. `https://cloudstash.your-subdomain.workers.dev`)
- Configure Google OAuth redirect URI (see [Google OAuth Setup](#google-oauth-setup))
- Bootstrap the first admin (see [First Admin Setup](#first-admin-setup))

### Local Development

```bash
# Install dependencies
bun install

# Set up environment
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your values (see Configuration below)

# Run database migrations
bun run db:migrate:local

# Start dev server
bun dev
```

The app runs at `http://localhost:3000`.

## Configuration

### Required

| Variable               | Description                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Google OAuth Client ID ([Cloud Console](https://console.cloud.google.com/apis/credentials)) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret                                                                  |
| `BETTER_AUTH_SECRET`   | Random string (32+ chars). Generate with: `openssl rand -hex 32`                            |
| `BETTER_AUTH_URL`      | Base URL (`http://localhost:3000` for local, your Worker URL for production)                |

### Optional

| Variable                  | Description                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`      | [OpenRouter](https://openrouter.ai/keys) API key for AI chat and summaries |
| `RESEND_API_KEY`          | [Resend](https://resend.com) API key for email notifications               |
| `EMAIL_FROM`              | Custom sender address (default: `CloudStash <noreply@cloudstash.dev>`)     |
| `TELEGRAM_BOT_TOKEN`      | Telegram bot token from [@BotFather](https://t.me/BotFather)               |
| `TELEGRAM_WEBHOOK_SECRET` | Random string for Telegram webhook validation                              |
| `CF_ACCOUNT_ID`           | Cloudflare account ID (for observability scripts)                          |
| `CF_ANALYTICS_TOKEN`      | Cloudflare analytics token (for DO metrics)                                |

**Local:** Set in `.dev.vars` (copy from `.dev.vars.example`).
**Production:** Set via `bunx wrangler secret put VARIABLE_NAME`.

## First Admin Setup

After the first user signs up, bootstrap admin access:

```sql
-- Via Cloudflare Dashboard > D1 > Console, or:
-- Local
wrangler d1 execute DB --local --command \
  "UPDATE user SET approved = 1, role = 'admin' WHERE email = 'your@email.com'"

-- Production
wrangler d1 execute DB --remote --command \
  "UPDATE user SET approved = 1, role = 'admin' WHERE email = 'your@email.com'"
```

After this, the admin can approve other users through the UI.

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select existing)
3. Go to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth client ID**
5. Select **Web application**
6. Add authorized redirect URIs:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://your-worker.workers.dev/api/auth/callback/google`

## Telegram Bot Setup (Optional)

1. Message [@BotFather](https://t.me/BotFather), send `/newbot`, save the token
2. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in your env
3. Register the webhook:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://YOUR_WORKER_URL/api/telegram", "secret_token": "YOUR_WEBHOOK_SECRET"}'
```

4. Optionally set bot commands via @BotFather:

```
/setcommands
start - Show help
help - Show help
connect - Connect with API key
disconnect - Disconnect account
```

## Commands

```bash
bun dev              # Start dev server (port 3000)
bun run build        # Production build
bun test             # Run all tests
bun run test:unit    # Unit tests only
bun run test:e2e     # E2E tests
bun run typecheck    # Type checking
bun run check        # Lint (oxlint + oxfmt via Ultracite)
bun run fix          # Auto-fix lint issues
```

### Database

```bash
bun run db:generate      # Generate new migration
bun run db:migrate:local # Apply migrations locally
```

### Deployment

```bash
bun run deploy           # Production deploy (migrations + worker)
bun run deploy:staging   # Staging deploy
```

## Architecture

```
src/
  cf-worker/           # Cloudflare Worker backend
    admin/             # Admin API endpoints
    auth/              # Better Auth + Google OAuth
    chat-agent/        # AI chat Durable Object
    db/                # Drizzle ORM schema + migrations
    email/             # React Email templates + Resend
    ingest/            # Link ingestion + metadata extraction
    invites/           # Workspace invite system
    link-processor/    # Link processing Durable Object
    org/               # Organization/workspace API
    sync/              # LiveStore sync Durable Object
    telegram/          # Telegram bot integration
  livestore/           # LiveStore schema, events, queries
  routes/              # TanStack Router pages
    _authed/           # Authenticated routes
  components/          # React components
  hooks/               # React hooks
  stores/              # Zustand stores
```

### Cloudflare Resources

| Resource             | Purpose                                  |
| -------------------- | ---------------------------------------- |
| **D1 Database**      | Users, sessions, organizations, invites  |
| **SyncBackendDO**    | LiveStore real-time sync per workspace   |
| **LinkProcessorDO**  | Async link processing + AI summaries     |
| **ChatAgentDO**      | AI chat agent per workspace              |
| **KV Namespace**     | Telegram user connections                |
| **Workers AI**       | Fallback AI for link processing          |
| **Rate Limiting**    | 30 req/min per IP on sync/auth endpoints |
| **Analytics Engine** | Per-user usage tracking                  |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run checks: `bun run check && bun run typecheck && bun test`
5. Submit a pull request

Uses `bun` (not npm) and `oxlint`/`oxfmt` via Ultracite (not eslint).

## License

MIT
