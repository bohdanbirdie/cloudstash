# Cloudstash

Save and organize links with AI-powered summaries. Full-stack TypeScript on Cloudflare Workers.

## Features

- **Link saving** with automatic metadata extraction (title, description, favicon)
- **AI summaries** powered by OpenRouter (Gemini 2.5 Flash)
- **Real-time sync** across devices via LiveStore + WebSocket
- **Telegram bot** for saving links on the go
- **Chrome extension** for one-click saving from the browser toolbar
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

| Variable                  | Description                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `GOOGLE_BASE_URL`         | Google OAuth base URL (default: `https://accounts.google.com`). Set to emulator URL for local dev |
| `OPENROUTER_API_KEY`      | [OpenRouter](https://openrouter.ai/keys) API key for AI chat and summaries                        |
| `RESEND_API_KEY`          | [Resend](https://resend.com) API key for email notifications                                      |
| `EMAIL_FROM`              | Custom sender address (default: `CloudStash <noreply@cloudstash.dev>`)                            |
| `TELEGRAM_BOT_TOKEN`      | Telegram bot token from [@BotFather](https://t.me/BotFather)                                      |
| `TELEGRAM_WEBHOOK_SECRET` | Random string for Telegram webhook validation                                                     |
| `CF_ACCOUNT_ID`           | Cloudflare account ID (for observability scripts)                                                 |
| `CF_ANALYTICS_TOKEN`      | Cloudflare analytics token (for DO metrics)                                                       |

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
   - Local: `http://localhost:3000/api/auth/oauth2/callback/google`
   - Production: `https://your-worker.workers.dev/api/auth/oauth2/callback/google`

## Local Auth with Emulator (Optional)

For local development without real Google credentials, use [emulate.dev](https://emulate.dev/) to run a local Google OAuth emulator:

```bash
# Terminal 1: Start the Google OAuth emulator
bun run dev:emulate

# Terminal 2: Start the dev server
bun dev
```

Set `GOOGLE_BASE_URL=http://localhost:4000` in `.dev.vars` to point auth at the emulator. Remove it to use real Google OAuth.

After signing in as `admin@cloudstash.test`, promote to admin:

```bash
bun run dev:make-admin
```

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

## Browser Extension

A Chrome extension for one-click saving lives in `apps/extension` (built with [WXT](https://wxt.dev)). It's published on the [Chrome Web Store](https://chromewebstore.google.com/detail/cloudstash/bdommhffamndfanbpnikgmpjncpcobia) and authenticates with a paired API key — no separate login.

Publishing is automated: bump the version in `apps/extension/package.json`, then run the **Publish Extension** GitHub Action (manual dispatch). It builds, zips, and submits to the Web Store for review. Requires the `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, and `CHROME_REFRESH_TOKEN` repository secrets — full setup in [`docs/todos/chrome-extension-publishing.md`](docs/todos/chrome-extension-publishing.md).

Track review status and manage the listing in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).

## Commands

```bash
bun dev              # Vite+ dev server (port 3000)
bun run dev:infra    # Auth emulator, tunnel, dashboard, raycast (separate terminal)
bun run build        # Production build
bun test             # Run all tests
bun run test:unit    # Unit tests only
bun run test:e2e     # E2E tests
bun run typecheck    # Type checking
bun run check        # Lint + format (Vite+) + Effect diagnostics
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

## Diagrams

Architecture diagrams are in `docs/diagrams/` as `.excalidraw` files. Open them with the [Excalidraw Obsidian plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin) or at [excalidraw.com](https://excalidraw.com).

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

Uses `bun` (not npm) and `oxlint`/`oxfmt` via Vite+ (not eslint).

## License

Source available under the [PolyForm Noncommercial 1.0.0](LICENSE) license.

You may clone, modify, and self-host Cloudstash for any non-commercial purpose — personal use, hobby projects, study, contributions back to this repository, etc. Commercial use (including running it as a paid service, monetizing it, or building a paid product on top of it) requires a separate license.
