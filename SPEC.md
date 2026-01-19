# Link Bucket - Project Specification

## Overview

A personal link management app for saving, organizing, and tracking links from various sources (articles, tweets, videos, etc.). Built with React and LiveStore for offline-first sync across devices via Cloudflare.

## Core Features

### 1. Link Storage
- Save URLs with automatic metadata extraction (OG tags)
- Store: URL, title, description, image, favicon, domain
- AI-generated summaries via background processing
- Timestamps: createdAt, completedAt, deletedAt
- Manual title/description override if needed

### 2. Link Status
- **Unread** (default) - saved for later
- **Completed** - manually marked as read/done
- Soft delete (deletedAt timestamp, not shown in UI)

### 3. Link Preview
- Display OG image, title, description
- Show favicon + domain for quick recognition
- AI summary when available
- Fallback UI for links without OG data

### 4. Easy Link Addition
Multiple input methods:
- **Paste URL** - main input field, commits link immediately
- **Bulk paste** - paste multiple URLs, all processed in background
- **Bookmarklet** - one-click save from any browser (future)
- **Browser extension** - (future idea)
- **Keyboard shortcut** - global shortcut to open quick-add modal (Cmd/Ctrl+K style)

### 5. Data Layer
- **LiveStore** (v0.4.0-dev.22) as reactive data layer
- **Cloudflare sync** for cross-device persistence
- Offline-first - works without connection, syncs when available
- Event sourcing model - all changes are events, state derived via materializers

### 6. Background Processing
- **Async processing** - metadata and summaries fetched after link is saved
- **Queue-based** - reliable processing with automatic retries
- **Works offline** - close browser, processing continues on server
- **Sync on return** - open app later, all enrichments are already there

## Data Model

See **LiveStore Schema Design** section below for the actual implementation.

Summary of fields per link:
- `id` - unique identifier
- `url` - the saved URL
- `title`, `description`, `image`, `favicon` - OG metadata (fetched)
- `domain` - extracted from URL
- `status` - 'unread' | 'completed'
- `createdAt`, `completedAt`, `deletedAt` - timestamps (unix ms)

## Suggested Additional Features

### High Value
- **Tags/folders** - organize links by topic or project
- **Search** - full-text search across title, description, notes, URL
- **Duplicate detection** - warn when saving an already-saved link
- **Bulk actions** - select multiple, mark complete, delete, tag

### Medium Value
- **Quick filters** - by domain (all Twitter links), by tag, by date range
- **Sort options** - newest, oldest, recently updated, alphabetical
- **Reading queue order** - drag to reorder priority
- **Import/export** - JSON export, browser bookmarks import

### Nice to Have
- **Reading time estimate** - for articles (based on word count from metadata)
- **Stale link reminder** - surface old unread links periodically
- **Broken link detection** - periodic check if links still work
- **Dark mode** - essential for a reading-focused app

## Technical Stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 (SPA) |
| Routing | TanStack Router |
| Data | LiveStore v0.4.0-dev.22 |
| Sync | Cloudflare Workers + Durable Objects (via @livestore/sync-cf) |
| Background Jobs | LinkProcessorDO (subscription-based, not queues) |
| AI/LLM | Cloudflare Workers AI (`@cf/meta/llama-3-8b-instruct`) |
| Styling | shadcn/ui (Lyra style, zinc+orange, JetBrains Mono) |
| Metadata fetch | Cloudflare Worker + HTMLRewriter (native) |
| Build | Vite 7 + @cloudflare/vite-plugin |
| Runtime | Bun 1.2+ |

### Key Packages
```bash
# LiveStore
@livestore/livestore@0.4.0-dev.22
@livestore/adapter-web@0.4.0-dev.22
@livestore/adapter-cloudflare@0.4.0-dev.22  # For server-side LiveStore client
@livestore/react@0.4.0-dev.22
@livestore/sync-cf@0.4.0-dev.22
@livestore/wa-sqlite@0.4.0-dev.22
@livestore/peer-deps@0.4.0-dev.22
@livestore/devtools-vite@0.4.0-dev.22

# Routing
@tanstack/react-router
@tanstack/router-plugin

# Build
@cloudflare/vite-plugin
wrangler
```

## UI Concepts

### Main View
```
┌─────────────────────────────────────────────────┐
│  [+ Add Link]  [Search...]  [Filters ▼]         │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 🖼 [OG Image]                            │   │
│  │ Title of the Article                    │   │
│  │ domain.com · 2 days ago                 │   │
│  │ Short description text...               │   │
│  │ [tag1] [tag2]           [✓] [archive]   │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ ...next link...                         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Quick Add Modal
```
┌─────────────────────────────────────┐
│  Add Link                      [×]  │
├─────────────────────────────────────┤
│  [Paste or type URL here...]        │
│                                     │
│  ┌─ Preview ─────────────────────┐  │
│  │ (shows after URL is pasted)   │  │
│  │ Title, image, description     │  │
│  └───────────────────────────────┘  │
│                                     │
│  Tags: [+add]                       │
│  Notes: [optional...]               │
│                                     │
│           [Cancel]  [Save]          │
└─────────────────────────────────────┘
```

## Background Processing Architecture

### Overview

**The `LinkProcessorDO` is just another LiveStore client** - like a headless browser user that runs on the server. It's a "bot" peer that watches for new links and enriches them with metadata and AI summaries.

```
┌───────────────────┐
│  Browser Client A │──────┐
└───────────────────┘      │
                           │
┌───────────────────┐      │      ┌─────────────────┐
│  Browser Client B │──────┼─────►│  SyncBackendDO  │ (central event store)
└───────────────────┘      │      └─────────────────┘
                           │               ▲
┌───────────────────┐      │               │
│  LinkProcessorDO  │──────┘               │
│  (server "bot")   │◄─────────────────────┘
└───────────────────┘
        │
        │ watches for new links
        │ fetches content + AI summary
        │ commits enrichment events
        │
        └──► events sync to all clients
```

**Simple flow:**
1. Endpoint call or `onPush` hook wakes up the DO
2. DO connects to `SyncBackendDO` (same as browsers do)
3. Syncs events it doesn't have yet (just like a browser reconnecting)
4. Subscribes to `links` table
5. When it sees new unprocessed links → processes them → commits new events
6. Those events sync back to all browser clients

### Components

1. **SyncBackendDO** - Receives events from clients, detects `LinkCreated`, wakes up processor
2. **LinkProcessorDO** - Server-side LiveStore client that:
   - Implements `ClientDoWithRpcCallback` interface for receiving live sync updates
   - Creates a store connection to `SyncBackendDO`
   - Subscribes to the `links` table
   - Tracks processing status via `linkProcessingStatus` table (idempotency)
   - Processes new links and commits events back
3. **Workers AI** - Generates summaries using `@cf/meta/llama-3-8b-instruct`

### How it determines which links to process

Simple **state diff** - no special event tracking:

```
all links − already processed = links to process
```

```typescript
// 1. Subscribe to links table → callback fires with current state
store.subscribe(tables.links.where({}), (links) => {
  // 2. Query what we've already processed
  const processed = store.query(tables.linkProcessingStatus.where({}))
  const processedIds = new Set(processed.map(p => p.linkId))

  // 3. Diff: find unprocessed links
  const newLinks = links.filter(link => !processedIds.has(link.id))

  // 4. Process each
  for (const link of newLinks) { ... }
})
```

The `linkProcessingStatus` table is the source of truth for what's been handled. Idempotent by design.

### AI Model Details

| Setting | Value |
|---------|-------|
| Model | `@cf/meta/llama-3-8b-instruct` (Llama 3 8B) |
| Max tokens | 200 |
| Input | Extracted markdown content (up to 4000 chars) |

### Content Extraction Pipeline

The processor extracts actual page content using a three-stage pipeline:

```
HTML → linkedom (DOM parser) → @mozilla/readability (article extraction) → turndown (markdown)
```

| Library | Purpose |
|---------|---------|
| `linkedom` | Lightweight DOM parser that works in Cloudflare Workers |
| `@mozilla/readability` | Firefox Reader Mode algorithm - extracts main article content |
| `turndown` | Converts HTML to clean markdown for LLM consumption |

**Extraction flow:**
1. Fetch the page HTML
2. Parse with linkedom to create a DOM
3. Run Readability to extract the main article (strips nav, ads, footers, etc.)
4. Convert to markdown with Turndown (reduces tokens vs raw HTML)
5. Truncate to 4000 chars for LLM context window
6. Pass to Workers AI for summarization

**Fallback:** If content extraction fails, falls back to OG metadata (title + description).

### DO Lifecycle and State

#### When it wakes up

| Trigger | What happens |
|---------|--------------|
| `onPush` detects `LinkCreated` | Wakes up DO, calls `fetch()` |
| Manual `/api/link-processor?storeId=...` call | Wakes up DO, calls `fetch()` |

#### When it shuts down

After **~10-30 seconds of inactivity** (no incoming requests, no pending work). This is standard Cloudflare DO behavior - cannot be controlled.

#### What's in memory (lost on shutdown)

```
store: LinkStore           // LiveStore instance
storeId: string            // Current store ID
isInitialized: boolean     // Init flag
+ Active subscriptions to links table
+ Any in-flight processing
```

#### What's persisted (survives shutdown)

| Data | Storage | Purpose |
|------|---------|---------|
| `sessionId` | `ctx.storage` (KV) | Stable client identity for sync |
| LiveStore events | DO SQLite | Local cache of synced events |
| `linkProcessingStatus` | LiveStore (via events) | Which links were processed |

#### Restart flow

```
DO wakes up
    │
    ▼
initialize(storeId) called
    │
    ▼
Load sessionId from ctx.storage (or create new)
    │
    ▼
createStoreDoPromise() → loads events from local SQLite
    │
    ▼
Syncs only NEW events from SyncBackendDO
    │
    ▼
Re-subscribes to links table
    │
    ▼
Checks linkProcessingStatus → skips already-processed links
    │
    ▼
Processes any new unprocessed links
```

#### Mid-processing shutdown

If DO shuts down **mid-processing** (link started but not finished), it will **retry on next wake-up** because `linkProcessingCompleted` was never committed.

#### Known limitations

1. If there are unprocessed links but no new `LinkCreated` events, the processor won't wake up automatically
2. No periodic alarm to check for missed links (could be added for robustness)

### Critical Implementation Details

#### DO Trigger Mechanism

The LinkProcessorDO is **event-driven, not always running**:

```
LinkCreated event arrives at SyncBackendDO
    │
    ▼
onPush hook fires
    │
    ▼
triggerLinkProcessor() calls fetch() to wake up DO
    │
    ▼
DO initializes, processes first link
    │
    ▼
Subsequent events arrive via syncUpdateRpc (RPC, no fetch)
    │
    ▼
~10-30 sec inactivity → DO hibernates
    │
    ▼
Next LinkCreated → cycle repeats
```

#### Live Sync via RPC Callback

The DO must implement `ClientDoWithRpcCallback` and properly handle incoming sync updates:

```typescript
import { handleSyncUpdateRpc } from '@livestore/sync-cf/client'
import { type ClientDoWithRpcCallback } from '@livestore/adapter-cloudflare'

export class LinkProcessorDO extends DurableObject<Env> implements ClientDoWithRpcCallback {
  __DURABLE_OBJECT_BRAND = 'link-processor-do' as never

  async syncUpdateRpc(payload: unknown): Promise<void> {
    // Ensure store is initialized (may need to load storeId from storage after hibernation)
    if (!this.isInitialized) {
      const storeId = await this.ctx.storage.get<string>('storeId')
      if (storeId) await this.initialize(storeId)
    }
    // CRITICAL: Actually process the payload - without this, live updates are ignored!
    await handleSyncUpdateRpc(payload)
  }
}
```

**Why this matters:** Without calling `handleSyncUpdateRpc()`, the DO receives push notifications but ignores them. The subscription never fires for new links after the first one.

#### Avoiding Race Conditions with Batched Commits

When the client commits multiple events separately, they may be pushed in separate batches:

```typescript
// BAD: Two separate commits → two separate pushes → race condition
store.commit(events.linkCreated({ ... }))
store.commit(events.linkMetadataFetched({ ... }))  // May arrive after processor starts!
```

The race condition:
1. `LinkCreated` pushed → `onPush` fires → processor wakes up
2. Processor does initial sync (only sees `LinkCreated`)
3. `LinkMetadataFetched` pushed (but processor already syncing)
4. Processor commits its events
5. `ServerAheadError` - server has events processor hasn't seen

**Fix:** Batch related events in a single commit:

```typescript
// GOOD: Single commit → single push → no race
store.commit(
  events.linkCreated({ ... }),
  events.linkMetadataFetched({ ... })
)
```

#### SyncBackendDO Trigger Setup

The `onPush` hook runs in a static context without access to `this.env`. Solution: set instance reference in constructor:

```typescript
let currentSyncBackend: { triggerLinkProcessor: (storeId: string) => void } | null = null

export class SyncBackendDO extends SyncBackend.makeDurableObject({
  onPush: async (message, context) => {
    const hasLinkCreated = message.batch.some((e) => e.name === 'v1.LinkCreated')
    if (hasLinkCreated && currentSyncBackend) {
      currentSyncBackend.triggerLinkProcessor(context.storeId)
    }
  },
}) {
  constructor(ctx, env) {
    super(ctx, env)
    this._env = env
    currentSyncBackend = this  // Set reference for onPush to use
  }

  triggerLinkProcessor(storeId: string) {
    const processor = this._env.LINK_PROCESSOR_DO.get(
      this._env.LINK_PROCESSOR_DO.idFromName(storeId)
    )
    processor.fetch(`https://link-processor/?storeId=${storeId}`)
  }
}
```

### Flow

1. User pastes URL in app
2. Client calls `/api/metadata` → shows immediate preview
3. User saves → client commits `LinkCreated` + `LinkMetadataFetched` **in single batch** (critical for avoiding race conditions)
4. Events sync to `SyncBackendDO` in one push
5. `onPush` hook detects `LinkCreated` → wakes up `LinkProcessorDO` via fetch
6. User can close browser at any point
7. `LinkProcessorDO` processes each new link:
   - Commits `LinkProcessingStarted`
   - Fetches URL with HTMLRewriter for OG tags
   - Commits `LinkMetadataFetched` (second snapshot, potentially fresher)
   - Calls Workers AI for summary
   - Commits `LinkSummarized`
   - Commits `LinkProcessingCompleted`
8. Events pushed back to `SyncBackendDO`
9. `SyncBackendDO` broadcasts to browser clients via WebSocket
10. UI updates reactively

**For subsequent links while DO is alive:** Events arrive via `syncUpdateRpc` RPC callback (no fetch needed), subscription fires, processing continues.

### Metadata API (optional direct fetch)

For immediate preview in the Add Link dialog, a direct API is also available:

`GET /api/metadata?url=<encoded-url>`
- Returns: `{ title, description, image, favicon }`
- Uses HTMLRewriter (native to Workers, no dependencies)
- Optional - background processing will also fetch this

## LiveStore Events

All events are synced across devices via Cloudflare Durable Objects.

### Client Events (user actions)

| Event | Data | Description |
|-------|------|-------------|
| `v1.LinkCreated` | id, url, domain, createdAt | New link saved |
| `v1.LinkCompleted` | id, completedAt | Link marked as read |
| `v1.LinkUncompleted` | id | Link marked as unread |
| `v1.LinkDeleted` | id, deletedAt | Link soft-deleted |

### Server Events (background processing)

| Event | Data | Description |
|-------|------|-------------|
| `v1.LinkMetadataFetched` | id, linkId, title, description, image, favicon, fetchedAt | OG metadata from page |
| `v1.LinkSummarized` | id, linkId, summary, model, summarizedAt | AI-generated summary |
| `v1.LinkProcessingStarted` | linkId, updatedAt | Processing begun (for idempotency) |
| `v1.LinkProcessingCompleted` | linkId, updatedAt | Processing finished successfully |
| `v1.LinkProcessingFailed` | linkId, error, updatedAt | Processing error (for debugging) |

## MVP Scope

### Phase 1: Basic Link Management
1. Add link with URL paste
2. Immediate metadata preview via `/api/metadata`
3. On save: commit `LinkCreated` + `LinkMetadataFetched` (first snapshot)
4. List view with previews
5. Mark as complete/unread toggle
6. Soft delete
7. LiveStore + Cloudflare sync

### Phase 2: Background Processing
1. `LinkProcessorDO` - server-side LiveStore client DO
2. `onPush` hook to detect `LinkCreated` → wake up processor
3. Subscription to `links` table for reactive processing
4. Background metadata fetching → `LinkMetadataFetched` events
5. Workers AI integration → `LinkSummarized` events
6. Processing status tracking for idempotency

### Phase 3: Polish
- Search
- Tags
- Bookmarklet / browser extension
- Processing status indicators in UI
