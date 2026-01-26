# Cloudstash

Save and organize links with AI-powered summaries.

## Development

```bash
bun install
bun run db:migrate:local
bun dev
```

## Environments

| Environment    | Database             | Worker URL                       | Deploy                   |
| -------------- | -------------------- | -------------------------------- | ------------------------ |
| **Local**      | `cloudstash` (local) | `localhost:3000`                 | `bun dev`                |
| **Staging**    | `cloudstash-staging` | `cloudstash-staging.workers.dev` | `bun run deploy:staging` |
| **Production** | `cloudstash`         | `cloudstash.dev`                 | `bun run deploy` or git push |

## Database Migrations

```bash
# Local
bun run db:migrate:local

# Staging (remote)
bun run db:migrate:staging

# Production (remote)
bun run db:migrate:remote
```

## Deployment

### Production

Manually deploy:

```bash
bun run deploy
```

Or connect via Cloudflare git integration:

**Dashboard → Workers & Pages → cloudstash → Settings → Builds & deployments:**

| Setting        | Command                                                                           |
| -------------- | --------------------------------------------------------------------------------- |
| Build command  | `bun run build`                                                                   |
| Deploy command | `bunx wrangler d1 migrations apply cloudstash --remote && bunx wrangler deploy`   |

### Staging

Staging auto-deploys on PRs via GitHub Actions (requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets in GitHub).

Manual deploy:

```bash
bun run deploy:staging
```

## First Admin Setup

The first user needs manual database setup to bootstrap admin access:

```bash
# Local
wrangler d1 execute cloudstash-local --local --command \
  "UPDATE user SET approved = 1, role = 'admin' WHERE email = 'your@email.com'"

# Production
wrangler d1 execute cloudstash --env production --remote --command \
  "UPDATE user SET approved = 1, role = 'admin' WHERE email = 'your@email.com'"
```

After this, the admin can approve other users through the UI.

## Telegram Bot Setup

### 1. Create bot

Message [@BotFather](https://t.me/BotFather), send `/newbot`, save the token.

### 2. Configure environment

Add to `.dev.vars`:

```
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_WEBHOOK_SECRET=dev-secret
```

### 3. Start tunnel

```bash
cloudflared tunnel --url http://localhost:3000
```

### 4. Register webhook

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://YOUR_TUNNEL_URL/api/telegram", "secret_token": "dev-secret"}'
```

### 5. Set commands (optional)

Send to @BotFather:

```
/setcommands
start - Show help
help - Show help
connect - Connect with API key
disconnect - Disconnect account
```

Re-register webhook when tunnel URL changes.
