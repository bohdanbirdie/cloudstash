# Telegram Bot Integration

Save links by sending them to a Telegram bot.

## Architecture

```
┌──────────┐     ┌─────────────┐     ┌─────────────────┐     ┌───────────────┐
│ Telegram │────►│  CF Worker  │────►│ LinkProcessorDO │────►│ SyncBackendDO │
│   User   │     │  (webhook)  │     │  (ingestLink)   │     │  (user store) │
└──────────┘     └─────────────┘     └─────────────────┘     └───────────────┘
                        │
                        ▼
                 ┌─────────────┐
                 │     D1      │
                 │ (connections│
                 │  + apiKey)  │
                 └─────────────┘
```

## Authentication Flow

### 1. User Generates API Key (Web App)

```
User → Settings → "Connect Telegram" → Generate API Key → Copy key
```

Better Auth stores the key in its `apiKey` table (D1). Key shown once: `lb_tg_abc123...`

### 2. User Connects Bot (Telegram)

```
User → @LinkBucketBot → /connect lb_tg_abc123...
Worker → Verifies key via Better Auth API → gets userId
Worker → Stores chatId → userId in telegram_connections table
Bot → "Connected! Send me any link to save it."
```

### 3. User Sends Link (Telegram)

```
User → sends "https://example.com/article"
Worker → Looks up userId from chatId (telegram_connections)
Worker → Calls processorDO.ingestLink(storeId, url)
Bot → "Saved!"
```

---

## Storage

### API Keys (Better Auth managed)

Better Auth's API Key plugin auto-creates an `apiKey` table in D1. No manual management needed.

### Telegram Connections (new table)

```sql
CREATE TABLE telegram_connections (
  chatId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  connectedAt INTEGER NOT NULL
);
```

```typescript
// src/cf-worker/db/schema.ts
export const telegramConnections = sqliteTable('telegram_connections', {
  chatId: text('chatId').primaryKey(),
  userId: text('userId').notNull(),
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

---

## Telegram Bot Setup

### 1. Create Bot

1. Message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, choose name and username
3. Save the bot token

### 2. Register Webhook

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://link-bucket.workers.dev/api/telegram" \
  -d "allowed_updates=[\"message\"]" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

### 3. Environment Variables

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_WEBHOOK_SECRET=random-32-char-string
```

---

## Implementation

### Webhook Handler

```typescript
// src/cf-worker/telegram/handler.ts

interface TelegramUpdate {
  message?: {
    chat: { id: number }
    text?: string
    entities?: Array<{ type: string; offset: number; length: number }>
  }
}

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  // Verify webhook secret
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const update: TelegramUpdate = await request.json()
  const message = update.message
  if (!message?.text) return new Response('OK')

  const chatId = message.chat.id.toString()
  const text = message.text.trim()

  // Handle /connect command
  if (text.startsWith('/connect ')) {
    return handleConnect(chatId, text.slice(9).trim(), env)
  }

  // Handle /disconnect command
  if (text === '/disconnect') {
    return handleDisconnect(chatId, env)
  }

  // Handle link messages
  const urls = extractUrls(message)
  if (urls.length > 0) {
    return handleLinks(chatId, urls, env)
  }

  return sendMessage(chatId, 'Send me a link to save it, or /connect <api-key> to connect.', env)
}

async function handleConnect(chatId: string, apiKey: string, env: Env): Promise<Response> {
  const db = createDb(env.DB)
  const auth = createAuth(env, db)

  // Verify API key via Better Auth
  const result = await auth.api.verifyApiKey({ body: { key: apiKey } })
  if (!result.valid) {
    return sendMessage(chatId, 'Invalid or expired API key.', env)
  }

  // Store chatId → userId mapping
  await db
    .insert(telegramConnections)
    .values({ chatId, userId: result.key.userId, connectedAt: new Date() })
    .onConflictDoUpdate({
      target: telegramConnections.chatId,
      set: { userId: result.key.userId, connectedAt: new Date() },
    })

  return sendMessage(chatId, 'Connected! Send me any link to save it.', env)
}

async function handleDisconnect(chatId: string, env: Env): Promise<Response> {
  const db = createDb(env.DB)
  await db.delete(telegramConnections).where(eq(telegramConnections.chatId, chatId))
  return sendMessage(chatId, 'Disconnected.', env)
}

async function handleLinks(chatId: string, urls: string[], env: Env): Promise<Response> {
  const db = createDb(env.DB)

  // Lookup userId from chatId
  const connection = await db
    .select()
    .from(telegramConnections)
    .where(eq(telegramConnections.chatId, chatId))
    .get()

  if (!connection) {
    return sendMessage(chatId, 'Please connect first: /connect <api-key>', env)
  }

  // Ingest via LinkProcessorDO
  const storeId = `user-${connection.userId}`
  const processorId = env.LINK_PROCESSOR_DO.idFromName(storeId)
  const processorDO = env.LINK_PROCESSOR_DO.get(processorId)

  for (const url of urls) {
    await processorDO.ingestLink(storeId, url)
  }

  return sendMessage(chatId, urls.length === 1 ? 'Saved!' : `Saved ${urls.length} links!`, env)
}

function extractUrls(message: TelegramUpdate['message']): string[] {
  if (!message?.text || !message.entities) return []
  return message.entities
    .filter((e) => e.type === 'url')
    .map((e) => message.text!.slice(e.offset, e.offset + e.length))
}

async function sendMessage(chatId: string, text: string, env: Env): Promise<Response> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  return new Response('OK')
}
```

### Route Registration

```typescript
// src/cf-worker/index.ts
if (url.pathname === '/api/telegram') {
  return handleTelegramWebhook(request, env)
}
```

### LinkProcessorDO Extension

Add `ingestLink` method to existing LinkProcessorDO:

```typescript
// src/cf-worker/link-processor/durable-object.ts

async ingestLink(storeId: string, url: string): Promise<{ linkId: string }> {
  const sessionId = await this.getOrCreateSessionId()

  const store = await createStoreDoPromise({
    schema,
    storeId,
    clientId: 'link-processor-do',
    sessionId,
    durableObject: {
      ctx: this.ctx,
      env: this.env,
      bindingName: 'LINK_PROCESSOR_DO',
    } as never,
    syncBackendStub: this.env.SYNC_BACKEND_DO.get(
      this.env.SYNC_BACKEND_DO.idFromName(storeId),
    ) as never,
    livePull: false,
  })

  try {
    const linkId = nanoid()
    const domain = new URL(url).hostname.replace(/^www\./, '')

    store.commit(
      events.linkCreated({
        id: linkId,
        url,
        domain,
        createdAt: new Date(),
      }),
    )

    await new Promise((r) => setTimeout(r, 100))
    return { linkId }
  } finally {
    await store.shutdownPromise()
  }
}
```

---

## Web App: Settings UI

```typescript
// Settings page component
const generateKey = async () => {
  const { data } = await authClient.apiKey.create({
    name: 'Telegram Bot',
    prefix: 'lb_tg',
  })
  // Show data.key once, user copies it
}
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/connect <key>` | Connect with API key |
| `/disconnect` | Remove connection |
| `<url>` | Save a link |

---

## TODO

- [ ] Add Better Auth API Key plugin to auth.ts
- [ ] Add apiKeyClient to auth-client.ts
- [ ] Create D1 migration for telegram_connections
- [ ] Add ingestLink method to LinkProcessorDO
- [ ] Create telegram webhook handler
- [ ] Add /api/telegram route
- [ ] Create Telegram bot via BotFather
- [ ] Register webhook
- [ ] Add settings UI for generating API keys
