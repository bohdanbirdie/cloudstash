# Telegram Bot Integration

Save links by sending them to a Telegram bot.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SETUP (one-time)                                │
│                                                                              │
│  ┌──────────┐  1. generate key     ┌──────────┐                             │
│  │  Web App │  with metadata:      │    D1    │  apiKey table (Better Auth) │
│  │ Settings │  { orgId }           │          │  stores: key → metadata     │
│  └──────────┘ ────────────────────►│          │                             │
│       │                            └──────────┘                             │
│       │ 2. show key once                                                    │
│       ▼                                                                     │
│  ┌──────────┐  3. /connect key     ┌──────────┐  4. verify   ┌──────────┐  │
│  │ Telegram │ ────────────────────►│ CF Worker│ ────────────►│ Better   │  │
│  │   Bot    │                      │ /api/tg  │◄─────────────│ Auth API │  │
│  └──────────┘                      └──────────┘  valid +     └──────────┘  │
│                                         │        orgId                      │
│                                         │ 5. store in KV                    │
│                                         ▼                                   │
│                                    ┌──────────┐                             │
│                                    │    KV    │  telegram:{chatId} → apiKey │
│                                    └──────────┘                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           LINK SAVING (each time)                            │
│                                                                              │
│  ┌──────────┐  1. send URL         ┌──────────┐                             │
│  │ Telegram │ ────────────────────►│ Telegram │                             │
│  │   User   │                      │ Servers  │                             │
│  └──────────┘                      └──────────┘                             │
│                                         │                                    │
│                                         │ 2. POST /api/telegram              │
│                                         │    X-Telegram-Bot-Api-Secret-Token │
│                                         ▼                                    │
│                                    ┌──────────┐  3. lookup   ┌──────────┐   │
│                                    │ CF Worker│ ────────────►│    KV    │   │
│                                    │          │◄─────────────│          │   │
│                                    └──────────┘  apiKey      └──────────┘   │
│                                         │                                    │
│                                         │ 4. verify apiKey → get orgId       │
│                                         │                                    │
│                                         │ 5. react 🤔                        │
│                                         │                                    │
│                                         │ 6. call DO directly (binding)      │
│                                         ▼                                    │
│                                    ┌─────────────┐                          │
│                                    │ LinkProcessor│  commits linkCreated    │
│                                    │     DO       │  processes link         │
│                                    └─────────────┘                          │
│                                         │                                    │
│                                         │ 7. react 👍                        │
│                                         ▼                                    │
│                                    ┌──────────┐                             │
│                                    │ Telegram │  link appears in web app    │
│                                    │   User   │  with AI summary            │
│                                    └──────────┘                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Authentication Layers

Two separate auth layers protect the system:

```
Telegram servers                    Our worker
      │                                  │
      │  POST /api/telegram              │
      │  X-Telegram-Bot-Api-Secret-Token │  ← Layer 1: proves it's Telegram
      │──────────────────────────────────►│
      │                                  │
      │                                  │  KV.get(chatId) → apiKey
      │                                  │  verifyApiKey(apiKey) → orgId  ← Layer 2: proves which user
      │                                  │
      │                                  │  DO.fetch(storeId, url)  ← direct binding call
      │                                  │─────────► DO
```

**Layer 1: Webhook Secret** - Proves request comes from Telegram, not an attacker.

**Layer 2: User API Key** - Stored in KV after `/connect`, verified to get orgId which determines the store.

**Why direct DO binding?** Calling `/api/ingest` via HTTP from within the worker causes Cloudflare subrequest issues (error 1042). Using the DO binding directly is more efficient and reliable.

---

## Storage

### API Keys (Better Auth)

Better Auth's API Key plugin manages the `apikey` table in D1. Key metadata stores `orgId`.

### Telegram Connections (KV)

Simple `chatId → apiKey` mapping in Cloudflare KV.

```typescript
// Store after /connect
await env.TELEGRAM_KV.put(`telegram:${chatId}`, apiKey)

// Lookup on each link
const apiKey = await env.TELEGRAM_KV.get(`telegram:${chatId}`)

// Remove on /disconnect
await env.TELEGRAM_KV.delete(`telegram:${chatId}`)
```

**Why KV?** Simple lookup, globally distributed, API key revocation works automatically.

---

## Bot Commands

| Command          | Description          |
| ---------------- | -------------------- |
| `/start`         | Show help            |
| `/help`          | Show help            |
| `/connect <key>` | Connect with API key |
| `/disconnect`    | Remove connection    |
| `<url>`          | Save a link          |

To enable autocomplete in Telegram, use @BotFather `/setcommands`:

```
start - Show help
help - Show help
connect - Connect with API key
disconnect - Disconnect account
```

---

## Setup

### 1. Create Bot

1. Message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, choose name and username
3. Save the bot token → `TELEGRAM_BOT_TOKEN`

### 2. Environment Variables

```bash
# .dev.vars (local) or wrangler secrets (prod)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_WEBHOOK_SECRET=random-secret-string
```

### 3. Register Webhook

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-worker.workers.dev/api/telegram",
    "secret_token": "'"$TELEGRAM_WEBHOOK_SECRET"'"
  }'
```

---

## Local Development

Use the dev tunnel script for automatic webhook registration:

```bash
# Terminal 1: Start dev server
bun dev

# Terminal 2: Start tunnel with auto webhook registration
bun run dev:tunnel
```

The `dev:tunnel` script:

1. Starts cloudflared tunnel
2. Captures the tunnel URL
3. Waits for DNS propagation
4. Registers the webhook automatically

Useful commands:

```bash
# Check webhook status
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"

# Remove webhook
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"
```

---

## Implementation

### Files

- `src/cf-worker/telegram/bot.ts` - grammY bot setup
- `src/cf-worker/telegram/handlers.ts` - command handlers
- `src/cf-worker/telegram/errors.ts` - typed errors
- `scripts/telegram-tunnel.ts` - dev tunnel with auto webhook

### Link Ingestion Flow

```typescript
// 1. Get API key from KV
const apiKey = await env.TELEGRAM_KV.get(`telegram:${chatId}`)

// 2. Verify API key and get orgId
const key = await verifyApiKey(auth, apiKey)
const storeId = key.metadata.orgId

// 3. Call DO directly via binding
const doId = env.LINK_PROCESSOR_DO.idFromName(storeId)
const stub = env.LINK_PROCESSOR_DO.get(doId)
await stub.fetch(`https://do/?storeId=${storeId}&ingest=${url}`)
```

---

## Production Deployment

```bash
# 1. Create KV namespace
bunx wrangler kv namespace create TELEGRAM_KV
# Copy the ID to wrangler.toml

# 2. Add secrets
bunx wrangler secret put TELEGRAM_BOT_TOKEN
bunx wrangler secret put TELEGRAM_WEBHOOK_SECRET

# 3. Deploy
bun run deploy

# 4. Register webhook
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://link-bucket.your-subdomain.workers.dev/api/telegram",
    "secret_token": "YOUR_WEBHOOK_SECRET"
  }'
```
