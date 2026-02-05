# Link Detail Dialog

A global dialog for viewing and managing individual links with context-aware navigation.

## Features

- **Navigation** - Move between links within the current view using `[` and `]` keys
- **Context-aware actions** - Post-action behavior depends on the view:
  - **Inbox**: completing moves to next link (link leaves the view)
  - **All Links**: completing stays on same link (link remains visible)
- **Isolated mode** - Open from search, mentions, or add-link without navigation

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ App Root (_authed.tsx)                                               │
│                                                                      │
│  <LinkDetailDialogProvider>                                          │
│    {children}                                                        │
│    <LinkDetailDialogContent />  ← Single instance, queries own data  │
│  </LinkDetailDialogProvider>                                         │
└──────────────────────────────────────────────────────────────────────┘
```

The dialog:
1. Receives `linkId` and optional `projection` via context
2. Queries its own data from LiveStore (`linkById$`, `projection.query`)
3. Handles actions internally, navigates or closes based on projection

## Projections

A **projection** defines a view of links with its navigation behavior:

```tsx
interface LinkProjection {
  query: typeof inboxLinks$;                      // LiveStore query for the list
  willActionRemoveLink: (action: LinkAction) => boolean;  // Does action remove link from view?
}
```

### Predefined Projections

| Projection | Query | Actions that remove link |
|------------|-------|-------------------------|
| `inboxProjection` | `inboxLinks$` | All (complete, delete) |
| `allLinksProjection` | `allLinks$` | Only delete |
| `completedProjection` | `completedLinks$` | Uncomplete, delete |
| `trashProjection` | `trashLinks$` | All (restore, delete) |

## Usage

### From pages (with navigation)

```tsx
import { useLinkDetailDialog } from "@/components/link-detail-dialog";
import { inboxProjection } from "@/lib/link-projections";

function InboxPage() {
  const { open } = useLinkDetailDialog();

  const handleLinkClick = (link: LinkWithDetails) => {
    open({ linkId: link.id, projection: inboxProjection });
  };
}
```

### From isolated contexts (no navigation)

```tsx
const { open } = useLinkDetailDialog();

// No projection = isolated mode (closes after any action)
open({ linkId: link.id });
```

## Data Flow

```
open({ linkId, projection? })
  → Context stores { linkId, projection }
  → Dialog queries LiveStore:
      - linkById$(linkId) → current link
      - projection?.query → list for navigation
  → User performs action (complete/delete/etc.)
  → Compute: willRemove = projection?.willActionRemoveLink(action) ?? true
  → If willRemove and hasNextLink: navigate to next
  → Else if willRemove: close dialog
  → Else: stay on current link
```

## Files

| File | Purpose |
|------|---------|
| `src/components/link-detail-dialog/provider.tsx` | Context provider, state management |
| `src/components/link-detail-dialog/dialog.tsx` | Dialog UI, action handlers |
| `src/lib/link-projections.ts` | Projection definitions |

## Adding a New Projection

```tsx
// src/lib/link-projections.ts

export const myCustomProjection: LinkProjection = {
  query: myCustomLinks$,
  willActionRemoveLink: (action) => action === "delete",
};
```

Then use it:

```tsx
open({ linkId: link.id, projection: myCustomProjection });
```
