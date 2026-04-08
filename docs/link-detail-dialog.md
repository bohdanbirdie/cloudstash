# Link Detail Dialog

Global dialog for viewing and managing individual links with context-aware navigation.

## Features

- **Navigation** — `[` and `]` keys move between links within the current view
- **Context-aware actions** — post-action behavior depends on the projection:
  - **Inbox**: completing moves to next link (link leaves the view)
  - **All Links**: completing stays on same link (link remains visible)
- **Isolated mode** — open from search, mentions, or add-link without navigation

## Architecture

Single `<LinkDetailDialogProvider>` at app root (`_authed.tsx`). Receives `linkId` and optional `projection` via context, queries its own data from LiveStore.

## Projections

A `LinkProjection` defines a view's navigation behavior:

```typescript
interface LinkProjection {
  query: typeof inboxLinks$;
  status: LinkStatus;
  filteredQuery: (options) => typeof filteredLinks$;
  willActionRemoveLink: (action: LinkAction) => boolean;
}
```

| Projection | Actions that remove link |
|---|---|
| `inboxProjection` | All (complete, delete) |
| `allLinksProjection` | Only delete |
| `completedProjection` | Uncomplete, delete |
| `trashProjection` | All (restore, delete) |

## Data Flow

```
open({ linkId, projection? })
  → Dialog queries linkById$(linkId) + projection.query
  → User performs action
  → willRemove = projection?.willActionRemoveLink(action) ?? true
  → If willRemove and hasNext: navigate to next
  → Else if willRemove: close dialog
  → Else: stay on current link
```

No projection = isolated mode (closes after any action).
