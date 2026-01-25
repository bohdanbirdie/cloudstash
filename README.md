# Link Bucket

Save and organize links with AI-powered summaries.

## Development

```bash
bun install
bun dev
```

## First Admin Setup

The first user needs manual database setup to bootstrap admin access:

```bash
npx wrangler d1 execute link-bucket-auth --remote --command \
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
