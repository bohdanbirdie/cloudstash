# Link Bucket - Project Specification

## Overview

A personal link management app for saving, organizing, and tracking links from various sources (articles, tweets, videos, etc.). Built with React and LiveStore for offline-first sync across devices via Cloudflare.

## Core Features

### 1. Link Storage
- Save URLs with automatic metadata extraction (OG tags)
- Store: URL, title, description, image, favicon, domain
- Timestamps: createdAt, completedAt, deletedAt
- Manual title/description override if needed

### 2. Link Status
- **Unread** (default) - saved for later
- **Completed** - manually marked as read/done
- Soft delete (deletedAt timestamp, not shown in UI)

### 3. Link Preview
- Display OG image, title, description
- Show favicon + domain for quick recognition
- Fallback UI for links without OG data

### 4. Easy Link Addition
Multiple input methods:
- **Paste URL** - main input field, auto-fetches metadata on paste
- **Bookmarklet** - one-click save from any browser (future)
- **Browser extension** - (future idea)
- **Keyboard shortcut** - global shortcut to open quick-add modal (Cmd/Ctrl+K style)

### 5. Data Layer
- **LiveStore** (v0.4.0-dev.22) as reactive data layer
- **Cloudflare sync** for cross-device persistence
- Offline-first - works without connection, syncs when available
- Event sourcing model - all changes are events, state derived via materializers

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
| Styling | shadcn/ui (Lyra style, zinc+orange, JetBrains Mono) |
| Metadata fetch | Cloudflare Worker + open-graph-scraper |
| Build | Vite 7 + @cloudflare/vite-plugin |
| Runtime | Bun 1.2+ |

### Key Packages
```bash
# LiveStore
@livestore/livestore@0.4.0-dev.22
@livestore/adapter-web@0.4.0-dev.22
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

## Metadata Fetching Strategy

**Problem**: Client-side JS can't fetch arbitrary URLs due to CORS.

**Solution**: Cloudflare Worker endpoint that fetches and parses OG metadata.

**Decision**: Use Cloudflare Worker at `/api/metadata?url=<encoded-url>`
- Returns: `{ title, description, image, favicon }`
- Store result as LiveStore event (`v1.LinkMetadataFetched`)
- Show preview in Add Link dialog before saving

### Flow
1. User pastes URL in app
2. App calls Worker: `GET /api/metadata?url=<encoded-url>`
3. Worker uses open-graph-scraper to fetch OG tags
4. Response saved as LiveStore event
5. UI updates reactively

## LiveStore Events

All events are synced across devices via Cloudflare Durable Objects.

| Event | Data | Description |
|-------|------|-------------|
| `v1.LinkCreated` | id, url, domain, createdAt | New link saved |
| `v1.LinkMetadataFetched` | id, linkId, title, description, image, favicon, fetchedAt | OG metadata snapshot |
| `v1.LinkCompleted` | id, completedAt | Link marked as read |
| `v1.LinkUncompleted` | id | Link marked as unread |
| `v1.LinkDeleted` | id, deletedAt | Link soft-deleted |

## MVP Scope

1. Add link with URL paste
2. Metadata fetching via Worker
3. List view with previews
4. Mark as complete/unread toggle
5. Soft delete
6. LiveStore + Cloudflare sync

### Deferred
- Search
- Tags
- Bookmarklet / browser extension
