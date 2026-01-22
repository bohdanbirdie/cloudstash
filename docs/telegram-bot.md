# Telegram Bot Integration

Save links by sending them to a Telegram bot.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SETUP (one-time)                                │
│                                                                              │
│  ┌──────────┐  1. generate key     ┌──────────┐                             │
│  │  Web App │  with metadata:      │    D1    │  apiKey table (Better Auth) │
│  │ Settings │  { storeId }         │          │  stores: key → userId,      │
│  └──────────┘ ────────────────────►│          │          metadata.storeId   │
│       │                            └──────────┘                             │
│       │ 2. show key once                                                    │
│       ▼                                                                     │
│  ┌──────────┐  3. /connect key     ┌──────────┐  4. verify   ┌──────────┐  │
│  │ Telegram │ ────────────────────►│ CF Worker│ ────────────►│ Better   │  │
│  │   Bot    │                      │ /api/tg  │◄─────────────│ Auth API │  │
│  └──────────┘                      └──────────┘  userId +    └──────────┘  │
│                                         │        storeId                    │
│                                         │ 5. store mapping                  │
│                                         ▼                                   │
│                                    ┌──────────┐                             │
│                                    │    D1    │  telegram_connections:      │
│                                    │          │  chatId → userId, storeId   │
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
│                                         │ 2. POST webhook                    │
│                                         │    X-Telegram-Bot-Api-Secret-Token │
│                                         ▼                                    │
│                                    ┌──────────┐  3. lookup   ┌──────────┐   │
│                                    │ CF Worker│ ────────────►│    D1    │   │
│                                    │ /api/tg  │◄─────────────│          │   │
│                                    └──────────┘  storeId     └──────────┘   │
│                                         │                                    │
│                                         │ 4. react 🤔 (processing)           │
│                                         │                                    │
│                                         │ 5. call DO with ingest param       │
│                                         ▼                                    │
│                                    ┌─────────────┐                          │
│                                    │ LinkService │  commits linkCreated     │
│                                    │     DO      │  event to store          │
│                                    └─────────────┘                          │
│                                         │                                    │
│                                         │ 6. subscription fires              │
│                                         │    (same DO, processes link)       │
│                                         ▼                                    │
│                                    ┌─────────────┐                          │
│                                    │ LinkService │  fetches metadata,       │
│                                    │     DO      │  generates AI summary    │
│                                    └─────────────┘                          │
│                                         │                                    │
│                                         │ 7. react 👍 (done)                 │
│                                         ▼                                    │
│                                    ┌──────────┐                             │
│                                    │ Telegram │  user sees link in web app  │
│                                    │   User   │  with summary               │
│                                    └──────────┘                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Authentication Flow

### 1. User Generates API Key (Web App)

```
User → Settings → "Integrations" → "Connect Telegram" → Generate API Key
```

Key includes metadata with `storeId` (current org). Key shown once: `lb_tg_abc123...`

**Key properties:**
- Indefinite by default (no expiry)
- Contains `storeId` in metadata
- User can revoke anytime

### 2. User Connects Bot (Telegram)

```
User → @LinkBucketBot → /connect lb_tg_abc123...
Worker → Verifies key via Better Auth → gets userId + storeId from metadata
Worker → Stores chatId → (userId, storeId) in telegram_connections
Bot → "Connected! Send me any link to save it."
```

### 3. User Sends Link (Telegram)

```
User → sends "https://example.com/article"
Worker → Looks up (userId, storeId) from chatId
Worker → Reacts 🤔 to message
Worker → Commits linkCreated event to storeId
Worker → Reacts 👍 to message (replaces 🤔)
User → Sees link in web app with AI summary
```

---

## Storage

### API Keys (Better Auth managed)

Better Auth's API Key plugin auto-creates an `apiKey` table in D1.

Key metadata stores `storeId` to know which store to commit links to.

### Telegram Connections (new table)

```sql
CREATE TABLE telegram_connections (
  chatId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  storeId TEXT NOT NULL,
  connectedAt INTEGER NOT NULL
);
```

```typescript
// src/cf-worker/db/schema.ts
export const telegramConnections = sqliteTable('telegram_connections', {
  chatId: text('chatId').primaryKey(),
  userId: text('userId').notNull(),
  storeId: text('storeId').notNull(),
  connectedAt: integer('connectedAt', { mode: 'timestamp' }).notNull(),
})
```

---

## Better Auth API Key Plugin

### Server Configuration

```typescript
// src/cf-worker/auth.ts
import { betterAuth } from 'better-auth'
import { jwt, apiKey } from 'better-auth/plugins'

export const createAuth = (env: Env, db: Database) =>
  betterAuth({
    // ... existing config
    plugins: [
      jwt({ /* existing config */ }),
      apiKey({
        defaultPrefix: 'lb_tg',
        enableMetadata: true,  // Required for storeId
      }),
    ],
  })
```

### Client Configuration

```typescript
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/client'
import { jwtClient, apiKeyClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [jwtClient(), apiKeyClient()],
})
```

### API Key Lifetime

- **Default: Indefinite** (`expiresAt: null`)
- Can set custom expiry with `expiresIn` (seconds)
- Users can revoke via `delete()` or soft-disable via `update({ enabled: false })`
- Multiple keys per user supported

---

## Telegram Bot Setup

### 1. Create Bot

1. Message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, choose name and username
3. Save the bot token

### 2. Register Webhook

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://link-bucket.workers.dev/api/telegram",
    "allowed_updates": ["message"],
    "secret_token": "'"$TELEGRAM_WEBHOOK_SECRET"'"
  }'
```

### 3. Environment Variables

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_WEBHOOK_SECRET=random-secret-1-to-256-chars
```

---

## Telegram Bot API Features

### Webhook Security

Telegram sends `X-Telegram-Bot-Api-Secret-Token` header with every request. Always verify it.

### Message Reactions

Bots can add emoji reactions to show status:

```typescript
await fetch(`https://api.telegram.org/bot${TOKEN}/setMessageReaction`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    message_id: messageId,
    reaction: [{ type: 'emoji', emoji: '🤔' }]  // or 👍, 👎, ❤️, 🔥, etc.
  })
})
```

**Note:** Limited emoji set. Use `🤔` for "processing", `👍` for "done".

### Edit Bot Messages

For detailed status updates:

```typescript
// Send initial message
const msg = await sendMessage(chatId, '⏳ Processing...')

// Later update it
await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    message_id: msg.message_id,
    text: '✅ Saved! Title: Example Page'
  })
})
```

### URL Extraction

URLs are provided in `message.entities`:

```typescript
function extractUrls(message: TelegramMessage): string[] {
  if (!message?.text || !message?.entities) return []
  return message.entities
    .filter(e => e.type === 'url' || e.type === 'text_link')
    .map(e => e.type === 'text_link' && e.url
      ? e.url
      : message.text!.slice(e.offset, e.offset + e.length))
}
```

---

## Implementation

### Types

```typescript
// src/cf-worker/telegram/types.ts

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

interface TelegramMessage {
  message_id: number
  chat: { id: number; type: string }
  from: { id: number; first_name: string; username?: string }
  date: number
  text?: string
  entities?: TelegramEntity[]
}

interface TelegramEntity {
  type: 'url' | 'text_link' | 'bot_command' | string
  offset: number
  length: number
  url?: string  // Only for text_link
}
```

### Webhook Handler

```typescript
// src/cf-worker/telegram/handler.ts

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  // 1. Verify webhook secret
  const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
  if (secretToken !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const update: TelegramUpdate = await request.json()
  const message = update.message
  if (!message?.text) return new Response('OK')

  const chatId = message.chat.id
  const text = message.text.trim()

  // 2. Handle commands
  if (text.startsWith('/connect ')) {
    return handleConnect(chatId, text.slice(9).trim(), env)
  }
  if (text === '/disconnect') {
    return handleDisconnect(chatId, env)
  }
  if (text === '/start' || text === '/help') {
    return sendMessage(chatId, 'Send me a link to save it.\n\nCommands:\n/connect <api-key> - Connect your account\n/disconnect - Disconnect', env)
  }

  // 3. Handle URLs
  const urls = extractUrls(message)
  if (urls.length > 0) {
    return handleLinks(chatId, message.message_id, urls, env)
  }

  return sendMessage(chatId, 'Send me a link to save it, or /connect <api-key> to connect.', env)
}
```

### Connect Handler

```typescript
async function handleConnect(chatId: number, apiKey: string, env: Env): Promise<Response> {
  const db = createDb(env.DB)
  const auth = createAuth(env, db)

  // Verify API key - returns userId + metadata
  const { valid, key } = await auth.api.verifyApiKey({ body: { key: apiKey } })

  if (!valid || !key) {
    return sendMessage(chatId, '❌ Invalid or expired API key.', env)
  }

  const storeId = key.metadata?.storeId
  if (!storeId) {
    return sendMessage(chatId, '❌ API key missing storeId. Please generate a new key.', env)
  }

  // Store chatId → (userId, storeId) mapping
  await db
    .insert(telegramConnections)
    .values({
      chatId: chatId.toString(),
      userId: key.userId,
      storeId,
      connectedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: telegramConnections.chatId,
      set: { userId: key.userId, storeId, connectedAt: new Date() },
    })

  return sendMessage(chatId, '✅ Connected! Send me any link to save it.', env)
}
```

### Links Handler

```typescript
async function handleLinks(
  chatId: number,
  messageId: number,
  urls: string[],
  env: Env
): Promise<Response> {
  const db = createDb(env.DB)

  // 1. Lookup connection
  const connection = await db
    .select()
    .from(telegramConnections)
    .where(eq(telegramConnections.chatId, chatId.toString()))
    .get()

  if (!connection) {
    return sendMessage(chatId, 'Please connect first: /connect <api-key>', env)
  }

  // 2. React with "processing" emoji
  await setReaction(chatId, messageId, '🤔', env)

  // 3. Commit linkCreated event(s) to the store
  // TODO: Implement event commit mechanism
  // Options:
  // A) Create LiveStore client in worker
  // B) RPC to SyncBackendDO
  // C) RPC to LinkProcessorDO

  for (const url of urls) {
    // await commitLinkCreated(connection.storeId, url, env)
  }

  // 4. React with "done" emoji
  await setReaction(chatId, messageId, '👍', env)

  return new Response('OK')
}
```

### Helper Functions

```typescript
function extractUrls(message: TelegramMessage): string[] {
  if (!message?.text || !message?.entities) return []
  return message.entities
    .filter(e => e.type === 'url' || e.type === 'text_link')
    .map(e => e.type === 'text_link' && e.url
      ? e.url
      : message.text!.slice(e.offset, e.offset + e.length))
}

async function sendMessage(chatId: number, text: string, env: Env): Promise<Response> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  return new Response('OK')
}

async function setReaction(chatId: number, messageId: number, emoji: string, env: Env): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMessageReaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji }],
    }),
  })
}
```

### Route Registration

```typescript
// src/cf-worker/index.ts
app.post('/api/telegram', (c) => handleTelegramWebhook(c.req.raw, c.env))
```

---

## Web App: Settings UI

```typescript
// Settings page component
const generateKey = async () => {
  const { data } = await authClient.apiKey.create({
    name: 'Telegram Bot',
    metadata: {
      storeId: currentOrg.id,  // Current organization/workspace
    },
  })
  // Show data.key ONCE, user copies it
  setApiKey(data.key)
  setShowKeyModal(true)
}

const revokeKey = async (keyId: string) => {
  await authClient.apiKey.delete({ keyId })
  // Refresh key list
}
```

---

## Commands

| Command          | Description              |
| ---------------- | ------------------------ |
| `/start`         | Show help                |
| `/help`          | Show help                |
| `/connect <key>` | Connect with API key     |
| `/disconnect`    | Remove connection        |
| `<url>`          | Save a link              |

---

## Link Ingestion Design

### Decision: Repurpose LinkProcessorDO → LinkServiceDO

The existing `LinkProcessorDO` already has:
- Store creation/caching with `livePull: true`
- Sync with SyncBackendDO
- Reactive subscription for processing

We add an **ingest capability** to the same DO:

```
┌─────────────────────────────────────────────────────────────────┐
│                      LinkServiceDO                               │
│                   (renamed from LinkProcessorDO)                 │
│                                                                  │
│   Entry points:                                                  │
│                                                                  │
│   1. fetch(?storeId=xxx)                                        │
│      → wake up, ensure subscribed (existing behavior)           │
│      → called by onPush trigger                                 │
│                                                                  │
│   2. fetch(?storeId=xxx&ingest=<url>)                           │
│      → commit linkCreated event (NEW)                           │
│      → called by /api/ingest endpoint                           │
│      → subscription auto-fires → processes the link             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Flow

```
Any source (Telegram, curl, etc.)
        ↓
  POST /api/ingest { storeId, url }
        ↓
  Worker validates request (auth TBD)
        ↓
  Worker calls LinkServiceDO.fetch(?storeId=xxx&ingest=url)
        ↓
  DO commits linkCreated event
        ↓
  Subscription fires → processes link (metadata, AI summary)
        ↓
  Link appears in web app
```

---

## PoC: Public Ingest Endpoint (No Auth)

First milestone: a public endpoint to test the ingestion flow without Telegram/auth complexity.

### Endpoint

```
POST /api/ingest
Content-Type: application/json

{
  "storeId": "org_xxx",
  "url": "https://example.com/article"
}
```

### Response

```json
{ "linkId": "abc123", "status": "ingested" }
```

### Test with curl

```bash
# Local dev
curl -X POST "http://localhost:8787/api/ingest" \
  -H "Content-Type: application/json" \
  -d '{"storeId": "YOUR_ORG_ID", "url": "https://example.com"}'

# Check logs for:
# [LinkServiceDO] Ingesting link { storeId, url }
# [LinkServiceDO] Subscription fired { pendingCount: 1 }
# [LinkServiceDO] Processing { linkId, url }
```

### Implementation

**1. Rename DO** (optional, can keep LinkProcessorDO for now)

**2. Add ingest handling to DO:**

```typescript
// src/cf-worker/link-processor/durable-object.ts

async fetch(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const storeId = url.searchParams.get('storeId')
  const ingestUrl = url.searchParams.get('ingest')

  if (!storeId) return new Response('Missing storeId', { status: 400 })

  this.storeId = storeId
  await this.ctx.storage.put('storeId', storeId)

  // NEW: Handle ingest request
  if (ingestUrl) {
    return this.handleIngest(ingestUrl)
  }

  // Existing: Wake up and subscribe (for onPush trigger)
  await this.ensureSubscribed()
  return new Response('OK')
}

private async handleIngest(url: string): Promise<Response> {
  const store = await this.getStore()
  await this.ensureSubscribed()  // Ensure processing subscription is active

  const linkId = nanoid()
  const domain = new URL(url).hostname.replace(/^www\./, '')

  console.log('[LinkServiceDO] Ingesting link', { storeId: this.storeId, url, linkId })

  store.commit(events.linkCreated({
    id: linkId,
    url,
    domain,
    createdAt: new Date(),
  }))

  return new Response(
    JSON.stringify({ linkId, status: 'ingested' }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
```

**3. Add worker endpoint:**

```typescript
// src/cf-worker/index.ts

app.post('/api/ingest', async (c) => {
  const body = await c.req.json<{ storeId: string; url: string }>()

  if (!body.storeId || !body.url) {
    return c.json({ error: 'Missing storeId or url' }, 400)
  }

  // Validate URL
  try {
    new URL(body.url)
  } catch {
    return c.json({ error: 'Invalid URL' }, 400)
  }

  // Call DO
  const doId = c.env.LINK_PROCESSOR_DO.idFromName(body.storeId)
  const stub = c.env.LINK_PROCESSOR_DO.get(doId)

  const doUrl = new URL('https://do/')
  doUrl.searchParams.set('storeId', body.storeId)
  doUrl.searchParams.set('ingest', body.url)

  const response = await stub.fetch(doUrl.toString())
  const result = await response.json()

  return c.json(result)
})
```

---

## TODO

### Phase 1: PoC (No Auth)
- [ ] Add ingest handling to LinkProcessorDO
- [ ] Add POST /api/ingest endpoint
- [ ] Test with curl

### Phase 2: Auth Layer
- [ ] Add Better Auth API Key plugin (with `enableMetadata: true`)
- [ ] Add apiKeyClient to auth-client.ts
- [ ] Protect /api/ingest with API key auth
- [ ] Add settings UI for generating/revoking API keys

### Phase 3: Telegram Integration
- [ ] Create D1 migration for telegram_connections
- [ ] Create telegram webhook handler
- [ ] Add /api/telegram route
- [ ] Create Telegram bot via BotFather
- [ ] Register webhook
