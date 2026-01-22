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
│                                         │ 4. react 🤔                        │
│                                         │                                    │
│                                         │ 5. POST /api/ingest                │
│                                         │    Authorization: Bearer <apiKey>  │
│                                         ▼                                    │
│                                    ┌─────────────┐                          │
│                                    │ LinkProcessor│  commits linkCreated    │
│                                    │     DO       │  processes link         │
│                                    └─────────────┘                          │
│                                         │                                    │
│                                         │ 6. react 👍                        │
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
      │                                  │
      │                                  │  POST /api/ingest
      │                                  │  Authorization: Bearer <apiKey>  ← Layer 2: proves which user
      │                                  │─────────► DO
```

**Layer 1: Webhook Secret** - Proves request comes from Telegram, not an attacker.

**Layer 2: User API Key** - Stored in KV after `/connect`, determines which org the link is saved to.

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

Use cloudflared to expose localhost for webhook testing:

```bash
# 1. Install cloudflared
brew install cloudflared

# 2. Start dev server
bun dev

# 3. Create tunnel (in another terminal)
cloudflared tunnel --url http://localhost:3000
# Output: https://random-name.trycloudflare.com

# 4. Add to vite.config.ts server.allowedHosts: ['.trycloudflare.com']

# 5. Register webhook with tunnel URL
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://random-name.trycloudflare.com/api/telegram",
    "secret_token": "dev-secret"
  }'
```

**Note:** Tunnel URL changes on restart. Re-register webhook when it changes.

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
- `src/cf-worker/telegram/index.ts` - exports

### Route (src/cf-worker/index.ts)

```typescript
app.post('/api/telegram', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token')
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Forbidden', 403)
  }

  const handler = createWebhookHandler(c.env)
  return handler(c.req.raw)
})
```

### Env Types (src/cf-worker/shared.ts)

```typescript
export type Env = {
  // ... existing
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_WEBHOOK_SECRET: string
  TELEGRAM_KV: KVNamespace
}
```

### wrangler.toml

```toml
[[kv_namespaces]]
binding = "TELEGRAM_KV"
id = "your-kv-namespace-id"
```

---

## TODO

### Phase 1: PoC (No Auth) - COMPLETE ✓

- [x] Add ingest handling to LinkProcessorDO
- [x] Add POST /api/ingest endpoint
- [x] Test with curl

### Phase 2: Auth Layer - COMPLETE ✓

- [x] Add API Key plugin to Better Auth
- [x] Protect /api/ingest endpoint
- [x] Settings UI for API key management

### Phase 3: Telegram Integration - COMPLETE ✓

- [x] Add grammy dependency
- [x] Add TELEGRAM_KV binding to wrangler.toml
- [x] Add env types
- [x] Create bot.ts and handlers.ts
- [x] Add /api/telegram route
- [x] Test locally with cloudflared tunnel

### Phase 4: Production Deploy

- [ ] Create KV namespace in Cloudflare dashboard
- [ ] Update wrangler.toml with real KV namespace ID
- [ ] Add secrets: `wrangler secret put TELEGRAM_BOT_TOKEN`, `wrangler secret put TELEGRAM_WEBHOOK_SECRET`
- [ ] Deploy worker
- [ ] Register production webhook URL
