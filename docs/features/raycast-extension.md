# Raycast Extension

Save links to Cloudstash directly from Raycast. Separate repo: [bohdanbirdie/cloudstash-raycast](https://github.com/bohdanbirdie/cloudstash-raycast), cloned to `local/raycast-extension/`.

## User Experience

1. `Cmd+Space` → open Raycast
2. `Cmd+V` → paste URL
3. "Save to Cloudstash" → `Enter`
4. Toast: "Link saved!"

## Architecture

**Setup (one-time):** Web app generates a connect code → user enters it in Raycast → extension exchanges code for API key via `/api/connect/raycast/exchange`. Key stored in macOS Keychain (Raycast manages this).

**Link saving:** Extension → `POST /api/ingest` with `Authorization: Bearer <api-key>` → Worker verifies key via Better Auth → enqueues to LinkProcessorDO → returns `{ status: "ingested" | "duplicate", linkId }`.

Server-side connect endpoints live in `src/cf-worker/connect/raycast.ts`. Extension code lives in `local/raycast-extension/src/`. The only connection is the HTTP API contract (no shared imports).

## API

```
POST /api/ingest
Authorization: Bearer <api-key>
Content-Type: application/json
{ "url": "https://example.com/article" }

→ 200: { "status": "ingested", "linkId": "..." }
→ 401: Invalid API key
→ 400: Invalid URL
→ 429: Rate limited
```

## vs Telegram Bot

| Aspect     | Telegram Bot             | Raycast Extension          |
| ---------- | ------------------------ | -------------------------- |
| Auth setup | `/connect <key>` in chat | Connect code exchange      |
| Save link  | Send message with URL    | Paste URL → select command |
| Feedback   | Text reply with summary  | Toast notification         |
| Platform   | Any (Telegram client)    | macOS only                 |
