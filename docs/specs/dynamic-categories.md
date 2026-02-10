# Dynamic Tags Spec

## Overview

Allow users to organize links with flexible tags. A link can have zero or many tags, enabling cross-cutting organization without forcing users into a rigid folder structure.

## Why Tags over Categories?

| Consideration                | Categories                          | Tags                                 |
| ---------------------------- | ----------------------------------- | ------------------------------------ |
| Link about "React perf tips" | Must choose ONE: Work or Reference? | Can be both `#work` and `#reference` |
| Quick save flow              | Forces decision upfront             | Save now, tag later                  |
| Cross-cutting topics         | Awkward                             | Natural fit                          |
| Modern UX patterns           | Feels dated                         | Matches Notion, Raindrop, Pocket     |

**Decision:** Tags are more flexible and better match how people actually organize links.

---

## User Stories

### Core

1. **Quick save** - I save a link without tags; I can add them later
2. **Organize while saving** - I can optionally assign tags when saving a new link
3. **Filter by tag** - I click a tag to see all links with that tag
4. **Combine filters** - I filter by multiple tags (show links with `#work` AND `#reference`)
5. **Manage tags** - I can rename or delete tags
6. **See untagged** - I can filter to show links with no tags (inbox zero approach)

### AI-Powered (Future)

7. **Auto-tag suggestions** - After saving, AI suggests relevant tags based on content
8. **Accept/dismiss** - I review AI suggestions and approve or dismiss them

---

## Data Model

### Option A: Junction Table (Recommended)

Traditional many-to-many with a join table.

```
┌─────────┐       ┌──────────────┐       ┌──────────┐
│  links  │──────<│  link_tags   │>──────│   tags   │
│  (id)   │       │ (linkId, tagId)      │   (id)   │
└─────────┘       └──────────────┘       └──────────┘
```

**Pros:**

- Clean relational model
- Efficient queries with indexes
- Easy to add tag metadata (createdAt, sortOrder)

**Cons:**

- More events/materializers
- Slightly more complex sync

### Option B: JSON Array on Links

Store `tagIds: ["tag1", "tag2"]` directly on the link.

**Pros:**

- Simpler writes (one event to update tags)
- Fewer tables

**Cons:**

- Can't efficiently query "all links with tag X" without full scan
- Harder to rename/delete tags (must update all links)
- Loses referential integrity

**Decision:** Junction table (Option A) - better query performance and cleaner model.

---

## LiveStore Schema

### Tables

```typescript
// Add to src/livestore/schema.ts

tags: State.SQLite.table({
  name: "tags",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    name: State.SQLite.text({ default: "" }),
    sortOrder: State.SQLite.integer({ default: 0 }),
    createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    deletedAt: State.SQLite.integer({ nullable: true, schema: Schema.DateFromNumber }),
  },
}),

linkTags: State.SQLite.table({
  name: "link_tags",
  columns: {
    id: State.SQLite.text({ primaryKey: true }), // nanoid for unique row id
    linkId: State.SQLite.text({ default: "" }),
    tagId: State.SQLite.text({ default: "" }),
    createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
  },
  indexes: [
    { name: "idx_link_tags_link", columns: ["linkId"] },
    { name: "idx_link_tags_tag", columns: ["tagId"] },
    { name: "idx_link_tags_unique", columns: ["linkId", "tagId"], isUnique: true },
  ],
}),
```

### Events

```typescript
// Tag CRUD
tagCreated: Events.synced({
  name: "v1.TagCreated",
  schema: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    sortOrder: Schema.Number,
    createdAt: Schema.Date,
  }),
}),

tagRenamed: Events.synced({
  name: "v1.TagRenamed",
  schema: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),
}),

tagReordered: Events.synced({
  name: "v1.TagReordered",
  schema: Schema.Struct({
    id: Schema.String,
    sortOrder: Schema.Number,
  }),
}),

tagDeleted: Events.synced({
  name: "v1.TagDeleted",
  schema: Schema.Struct({
    id: Schema.String,
    deletedAt: Schema.Date,
  }),
}),

// Link-tag associations
linkTagged: Events.synced({
  name: "v1.LinkTagged",
  schema: Schema.Struct({
    id: Schema.String,      // row id for link_tags table
    linkId: Schema.String,
    tagId: Schema.String,
    createdAt: Schema.Date,
  }),
}),

linkUntagged: Events.synced({
  name: "v1.LinkUntagged",
  schema: Schema.Struct({
    id: Schema.String,      // row id to delete
  }),
}),
```

### Materializers

```typescript
"v1.TagCreated": ({ id, name, sortOrder, createdAt }) =>
  tables.tags.insert({ id, name, sortOrder, createdAt, deletedAt: null }),

"v1.TagRenamed": ({ id, name }) =>
  tables.tags.update({ name }).where({ id }),

"v1.TagReordered": ({ id, sortOrder }) =>
  tables.tags.update({ sortOrder }).where({ id }),

"v1.TagDeleted": ({ id, deletedAt }) =>
  tables.tags.update({ deletedAt }).where({ id }),

"v1.LinkTagged": ({ id, linkId, tagId, createdAt }) =>
  tables.linkTags
    .insert({ id, linkId, tagId, createdAt })
    .onConflict("id", "ignore"),

"v1.LinkUntagged": ({ id }) =>
  tables.linkTags.delete().where({ id }),
```

**Note:** The codebase uses separate events for each update field (e.g., `LinkCompleted`, `LinkUncompleted`) rather than a generic "update" event. This makes the event log more semantic and easier to replay.

---

## Queries

```typescript
import { queryDb, Schema } from "@livestore/livestore";

// Schema for tag query results
const TagSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  sortOrder: Schema.Number,
  createdAt: Schema.Number,
  deletedAt: Schema.NullOr(Schema.Number),
});

const TagCountSchema = Schema.Struct({
  tagId: Schema.String,
  count: Schema.Number,
});

// All active tags sorted by order
export const allTags$ = queryDb(
  () => ({
    query: `
      SELECT * FROM tags
      WHERE deletedAt IS NULL
      ORDER BY sortOrder ASC
    `,
    schema: Schema.Array(TagSchema),
  }),
  { label: "allTags" }
);

// Tags for a specific link
export const tagsForLink$ = (linkId: string) =>
  queryDb(
    {
      bindValues: [linkId],
      query: `
        SELECT t.* FROM tags t
        JOIN link_tags lt ON t.id = lt.tagId
        WHERE lt.linkId = ? AND t.deletedAt IS NULL
        ORDER BY t.sortOrder ASC
      `,
      schema: Schema.Array(TagSchema),
    },
    { label: `tagsForLink:${linkId}` }
  );

// Tag counts (for sidebar)
export const tagCounts$ = queryDb(
  () => ({
    query: `
      SELECT lt.tagId, COUNT(*) as count
      FROM link_tags lt
      JOIN links l ON lt.linkId = l.id
      WHERE l.deletedAt IS NULL
      GROUP BY lt.tagId
    `,
    schema: Schema.Array(TagCountSchema),
  }),
  { label: "tagCounts" }
);

// Untagged link count
export const untaggedCount$ = queryDb(
  () => ({
    query: `
      SELECT COUNT(*) as count FROM links l
      WHERE l.deletedAt IS NULL
        AND NOT EXISTS (SELECT 1 FROM link_tags lt WHERE lt.linkId = l.id)
    `,
    schema: Schema.Struct({ count: Schema.Number }).pipe(
      Schema.Array,
      Schema.headOrElse(() => ({ count: 0 }))
    ),
  }),
  { label: "untaggedCount" }
);
```

### Filtered Link Queries

To filter links by tag, extend the existing `linksWithDetailsSchema` and add WHERE clauses:

```typescript
// Links with a specific tag (reuses linksWithDetailsSchema from queries.ts)
export const linksWithTag$ = (tagId: string) =>
  queryDb(
    {
      bindValues: [tagId],
      query: `
        SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
               s.title, s.description, s.image, s.favicon,
               sum.summary
        FROM links l
        INNER JOIN link_tags lt ON lt.linkId = l.id AND lt.tagId = ?
        LEFT JOIN link_snapshots s ON s.id = (
          SELECT s2.id FROM link_snapshots s2
          WHERE s2.linkId = l.id ORDER BY s2.fetchedAt DESC LIMIT 1
        )
        LEFT JOIN link_summaries sum ON sum.id = (
          SELECT sum2.id FROM link_summaries sum2
          WHERE sum2.linkId = l.id ORDER BY sum2.summarizedAt DESC LIMIT 1
        )
        WHERE l.deletedAt IS NULL
        ORDER BY l.createdAt DESC
      `,
      schema: linksWithDetailsSchema,
    },
    { label: `linksWithTag:${tagId}` }
  );

// Untagged links
export const untaggedLinks$ = queryDb(
  () => ({
    query: `
      SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
             s.title, s.description, s.image, s.favicon,
             sum.summary
      FROM links l
      LEFT JOIN link_snapshots s ON s.id = (
        SELECT s2.id FROM link_snapshots s2
        WHERE s2.linkId = l.id ORDER BY s2.fetchedAt DESC LIMIT 1
      )
      LEFT JOIN link_summaries sum ON sum.id = (
        SELECT sum2.id FROM link_summaries sum2
        WHERE sum2.linkId = l.id ORDER BY sum2.summarizedAt DESC LIMIT 1
      )
      WHERE l.deletedAt IS NULL
        AND NOT EXISTS (SELECT 1 FROM link_tags lt WHERE lt.linkId = l.id)
      ORDER BY l.createdAt DESC
    `,
    schema: linksWithDetailsSchema,
  }),
  { label: "untaggedLinks" }
);

// Links with ALL specified tags (AND filter)
export const linksWithAllTags$ = (tagIds: string[]) => {
  if (tagIds.length === 0) {
    return allLinks$; // fallback to all links
  }
  const placeholders = tagIds.map(() => "?").join(", ");
  return queryDb(
    {
      bindValues: [...tagIds, tagIds.length],
      query: `
        SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
               s.title, s.description, s.image, s.favicon,
               sum.summary
        FROM links l
        LEFT JOIN link_snapshots s ON s.id = (
          SELECT s2.id FROM link_snapshots s2
          WHERE s2.linkId = l.id ORDER BY s2.fetchedAt DESC LIMIT 1
        )
        LEFT JOIN link_summaries sum ON sum.id = (
          SELECT sum2.id FROM link_summaries sum2
          WHERE sum2.linkId = l.id ORDER BY sum2.summarizedAt DESC LIMIT 1
        )
        WHERE l.deletedAt IS NULL
          AND (
            SELECT COUNT(DISTINCT lt.tagId) FROM link_tags lt
            WHERE lt.linkId = l.id AND lt.tagId IN (${placeholders})
          ) = ?
        ORDER BY l.createdAt DESC
      `,
      schema: linksWithDetailsSchema,
    },
    { label: `linksWithAllTags:${tagIds.length}` }
  );
};
```

---

## UI Decisions

### Tag Display

- Tags shown as badges with `#` prefix: `#work`, `#reading`
- **Color from hash**: Tag name hashed to index in 10-color palette (deterministic, no user choice)
- No icons

### Tag Color Palette

```typescript
const TAG_COLORS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "violet",
] as const;

// Pure function: same name always returns same color
function getTagColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[index];
}

// Examples:
// getTagColor("work")      → "teal"
// getTagColor("reading")   → "amber"
// getTagColor("reference") → "blue"
```

This approach:

- No color field in database (computed from name)
- Consistent across devices/sessions
- No color picker UI needed
- Rename tag → color may change (acceptable tradeoff)

### Tag Filtering Location

- **Filter bar above link grid** (not in sidebar)
- Keeps sidebar clean and focused on projections (Inbox/Completed/All/Trash)
- Filter bar appears on all views uniformly

### Filtering Behavior: Intersection

Tags refine the current projection, they don't override it:

| View      | + Tag Filter | Result                           |
| --------- | ------------ | -------------------------------- |
| Inbox     | `#work`      | Unread links with #work          |
| Completed | `#work`      | Completed links with #work       |
| All Links | `#work`      | All non-deleted links with #work |
| Trash     | `#work`      | Deleted links with #work         |

Multiple tags use AND logic: `#work` + `#reference` shows links that have BOTH tags.

---

## UI Mockups

### Tag Filter Bar (Above Link Grid)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Inbox                                                                  │
│  Your unread links                                                      │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Filter by tags: ┌───────┐ ┌───────────┐  ┌──────────────────┐   │   │
│  │                 │#work ×│ │#reference ×│  │ + Add filter   ▾ │   │   │
│  │                 └───────┘ └───────────┘  └──────────────────┘   │   │
│  │                                                                 │   │
│  │ Showing 4 of 12 links                              [Clear all]  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   [card]    │  │   [card]    │  │   [card]    │  │   [card]    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

When no filters applied, bar is minimal:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Filter by tags: ┌──────────────────┐                                   │
│                  │ + Add filter   ▾ │                                   │
│                  └──────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Link Card (Grid View)

```
┌─────────────────────────────────────────┐
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │         [Preview Image]           │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  🌐 example.com                         │
│                                         │
│  Article Title That Might Be Long       │
│  and Wrap to Two Lines Maximum          │
│                                         │
│  Short description of the link that     │
│  shows what this content is about...    │
│                                         │
│  ┌───────┐ ┌───────────┐ ┌───────┐      │
│  │ #work │ │#reference │ │#react │      │
│  └───────┘ └───────────┘ └───────┘      │
│                                         │
│  Jan 15, 2026 · 3:42 PM                 │
└─────────────────────────────────────────┘
```

### Link Card (List View)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ┌──────┐                                                                  │
│  │      │  🌐 example.com                                                  │
│  │ IMG  │  Article Title That Might Be Long                                │
│  │      │  Short description of the link...   ┌─────┐ ┌───────────┐ Jan 15 │
│  └──────┘                                     │#work│ │#reference │        │
│                                               └─────┘ └───────────┘        │
└────────────────────────────────────────────────────────────────────────────┘
```

### Link Detail Dialog

```
┌─────────────────────────────────────────────────────────────────┐
│                                                           ✕     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │                    [Preview Image]                        │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  🌐 example.com                              ┌────────────────┐ │
│                                              │ Open Link  ↗  │ │
│  Article Title Here                          └────────────────┘ │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  TAGS                                                           │
│  ┌───────┐ ┌───────────┐ ┌───────┐ ┌───┐                        │
│  │#work ×│ │#reference×│ │#react×│ │ + │                        │
│  └───────┘ └───────────┘ └───────┘ └───┘                        │
│                                                                 │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│  ╎ ✨ Suggested: ┌──────────┐ ┌────────┐    Accept | Dismiss ╎  │
│  ╎               │#frontend │ │ #tools │                     ╎  │
│  ╎               └──────────┘ └────────┘                     ╎  │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  SUMMARY                                                        │
│  This article explains how to optimize React performance        │
│  using memo, useMemo, and useCallback hooks. It covers          │
│  common pitfalls and provides benchmarks...                     │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Saved Jan 15, 2026 · 3:42 PM                                   │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ ✓ Complete  │  │ 🗑 Delete    │  │ ← Previous    Next →    │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Tag Input (Inline with Popover)

Selected tags shown inline with (+) button:

```
[#work ×] [#reference ×] [+]
```

Clicking (+) opens popover dropdown:

```
┌─────────────────────────────────────┐
│  Search tags...                     │
├─────────────────────────────────────┤
│  #reading                 24 links  │
│  #watch                    5 links  │
├─────────────────────────────────────┤
│  + Create "#typescript"             │
└─────────────────────────────────────┘
```

### Tag Manager (Settings)

Accessed from Integrations or dedicated settings page:

```
┌─────────────────────────────────────────────────────────┐
│  Manage Tags                                            │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐    │
│  │ ≡  #work           12 links    [Edit] [Delete] │    │
│  │ ≡  #reference       8 links    [Edit] [Delete] │    │
│  │ ≡  #reading        24 links    [Edit] [Delete] │    │
│  │ ≡  #watch           5 links    [Edit] [Delete] │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  [+ Create new tag]                                     │
└─────────────────────────────────────────────────────────┘

≡ = drag handle for reordering
```

---

## UI Components

### Tag Badge

Badge with `#` prefix and hash-based color.

```tsx
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { getTagColor } from "@/lib/tag-colors";

interface TagBadgeProps {
  name: string;
  onClick?: () => void;
  onRemove?: () => void; // shows × button when provided
}

function TagBadge({ name, onClick, onRemove }: TagBadgeProps) {
  const color = getTagColor(name);

  return (
    <Badge
      className={cn(
        "gap-1 cursor-pointer",
        `bg-${color}-100 text-${color}-700 hover:bg-${color}-200`
      )}
      onClick={onClick}
    >
      #{name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:bg-${color}-300 rounded-full"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}
```

**Note:** Tailwind needs these classes in safelist or use inline styles for dynamic colors.

### Tag Input (Multi-select)

Combobox for selecting multiple tags with create-on-type.

#### UX Research (Linear, Notion, Todoist patterns)

Based on research of modern productivity apps:

**1. Type-First Experience**

- Input should be the hero - users just start typing immediately
- No clicking a trigger button first
- As they type, tags filter in real-time

**2. Keyboard Interactions**
| Key | Action |
|-----|--------|
| `ArrowUp/Down` | Navigate dropdown options |
| `Enter` | Select highlighted tag or create new |
| `Backspace` (empty input) | Focus/remove last selected tag |
| `Escape` | Close dropdown |
| `Tab` | Move focus between input and tags |

**3. Dropdown Behavior**

- Show ~6-8 options max, scroll if more
- "Create new" option always visible at bottom when typing non-existent tag
- Recently used or popular tags appear first when dropdown opens with empty input
- Clear visual distinction between existing and "create new" options

**4. Visual Design**

- Selected tags as chips/pills with X button for removal
- Color-coded based on tag name hash
- Clear separation between selected tags area and input
- Non-interactive elements should NOT look like buttons

#### Layout Options

**Option A: Stacked Layout (Notion-style)**

```
┌─────────────────────────────────┐
│ [#Reading ×] [#Work ×]          │  ← Selected tags row
├─────────────────────────────────┤
│ Type to search...    │          │  ← Fixed-width input
└──────────────────────┘
```

**Option B: Inline with Clear Separation (Linear-style) - CHOSEN**

```
┌─────────────────────────────────────────────┐
│ [#Reading ×] [#Work ×] Add tag...          │
└─────────────────────────────────────────────┘
```

**Decision:** Option B (Linear-style) - inline layout with tags and input in same container. Square corners on tags to match app design.

#### Implementation

Uses base-ui `Popover` with search input (`src/components/tags/tag-combobox.tsx`):

```tsx
interface TagComboboxProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  allowCreate?: boolean;
  placeholder?: string;
}

// Key features:
// - Inline layout: TagBadge pills + (+) button trigger
// - Popover dropdown with search input
// - Keyboard navigation (ArrowUp/Down, Enter)
// - "Create #tagname" option when typing non-existent tag
// - Color-coded badges using getTagColor(name)
```

#### Accessibility (WAI-ARIA)

- `role="combobox"` on input
- `aria-expanded` for dropdown state
- `aria-multiselectable="true"` on listbox
- Full keyboard navigation
- Screen reader tested

### Tag Filter Sidebar

Sidebar showing all tags with counts. Click to filter, shift-click to add to filter.

```tsx
function TagFilterSidebar({
  selectedTagIds,
  onSelect,
}: {
  selectedTagIds: string[];
  onSelect: (tagIds: string[]) => void;
}) {
  const allTags = useQuery(allTags$);
  const tagCounts = useQuery(tagCounts$);

  return (
    <div className="space-y-1">
      <Button variant="ghost" onClick={() => onSelect([])}>
        All Links
      </Button>
      <Button variant="ghost" onClick={() => onSelect(["__untagged__"])}>
        Untagged
      </Button>
      <Separator />
      {allTags.map((tag) => (
        <Button
          key={tag.id}
          variant={selectedTagIds.includes(tag.id) ? "secondary" : "ghost"}
          onClick={(e) => {
            if (e.shiftKey) {
              // Add to selection (AND filter)
              onSelect([...selectedTagIds, tag.id]);
            } else {
              // Replace selection
              onSelect([tag.id]);
            }
          }}
        >
          <TagBadge tag={tag} />
          <span className="ml-auto text-muted-foreground">
            {tagCounts.find((tc) => tc.tagId === tag.id)?.count ?? 0}
          </span>
        </Button>
      ))}
    </div>
  );
}
```

### Tag Manager (Settings)

Full CRUD for tags with drag-and-drop reordering.

- List all tags with edit/delete buttons
- Inline editing for name (color auto-updates based on new name hash)
- Drag handle for reordering
- "Merge into..." option when deleting (reassign links to another tag)
- Create new tag button

---

## Integration Points

### Link Card

Show tags below title/description:

```tsx
function LinkCard({ link }: { link: LinkWithDetails }) {
  const tags = useQuery(tagsForLink$(link.id));

  return (
    <Card>
      {/* existing content */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {tags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} />
          ))}
        </div>
      )}
    </Card>
  );
}
```

### Link Detail Dialog

Add tag section with editable TagInput.

### Add Link Dialog

Optional "Tags" field with TagInput.

---

## Migration Path

Since there are no categories/tags currently:

1. Add tables and events to schema
2. Run migration
3. No data migration needed

---

## Implementation Checklist

### Phase 1: Core Schema ✅

- [x] Add `tags` table to LiveStore schema
- [x] Add `link_tags` junction table
- [x] Create tag events (Created, Renamed, Deleted, Reordered)
- [x] Create link-tag events (Tagged, Untagged)
- [x] Add materializers for all events (with onConflict for idempotency)
- [x] Create queries (allTags$, tagsForLink$, tagCounts$, allTagsWithCounts$, linksWithTag$, filteredLinks$, etc.)

**Implementation notes:**

- Tag `id` is a URL-safe slug (e.g., "my-work") generated via `slugify` library
- Tag `name` is the display name (e.g., "My Work")
- URLs use slugs for human-readable filtering: `?tags=my-work,reading`
- `v1.TagDeleted` materializer cascades deletion to `link_tags` table

### Phase 2: Basic UI ✅

- [x] Build TagBadge component (`src/components/tags/tag-badge.tsx`)
- [x] Build TagInput multi-select component (`src/components/tags/tag-input.tsx`)
- [x] Build TagCombobox component (`src/components/tags/tag-combobox.tsx`) - improved UX with base-ui Combobox
- [x] Add tags display to LinkCard
- [x] Add TagCombobox to LinkDetailDialog
- [x] Add TagCombobox to AddLinkDialog (optional field)

**Implementation notes:**

- Colors are hash-based from tag name (deterministic, no DB field needed)
- TagInput supports create-on-type with slug generation
- TagCombobox uses base-ui Combobox with chips for better keyboard UX
- Both dialogs now support adding tags when creating/viewing links

**UX improvements (Phase 2.5) - COMPLETED:**

TagCombobox now uses inline layout (Linear-style):

- [x] Inline layout - tags and (+) button in same container
- [x] Square corners on tags (no rounding) to match app design
- [x] Uses TagBadge component for consistent styling
- [x] X buttons on tags for easy removal
- [x] Click (+) to open Popover dropdown with search
- [x] Light theme popover (not inverted)
- [x] Subtle hover/active states on dropdown items
- [x] No default tag seeding - users create their own tags

**Known issue discovered:** Hotkeys from parent dialog (e.g., `cmd+backspace` to delete link) fire when typing in TagCombobox input. This is a cross-cutting concern affecting all hotkey usage - see `docs/specs/hotkey-scoping.md` for the fix.

### Phase 3: Filtering ✅

- [x] Build TagFilterBar component (above link grid, not sidebar)
- [x] Implement tag filtering logic via `filteredLinks$` query
- [x] Support multi-tag AND filtering
- [x] Add "Untagged" filter option
- [x] URL state management via `nuqs` library (`src/hooks/use-tag-filter.ts`)

**Implementation notes:**

- Filter bar appears above link grid on all views
- Filtering is native to projections via `LinkProjection.filteredQuery()`
- URLs are clean: `?tags=work,reading&untagged=false`

### Phase 4: Management ✅

- [x] Build TagManagerDialog (accessible from sidebar)
- [x] Combined search/create input (type to filter or create)
- [x] Implement tag renaming via inline edit (color updates based on new name)
- [x] Implement tag deletion (soft delete)
- [x] Show link counts per tag via `allTagsWithCounts$` query
- [x] Alphabetical sorting (handled in SQL query)

**Implementation notes:**

- TagManagerDialog in `src/components/tags/tag-manager-dialog.tsx`
- TagRow extracted to `src/components/tags/tag-row.tsx`
- Single input for search + create (matches TagCombobox pattern)
- Uses `allTagsWithCounts$` query that JOINs tags with counts and sorts alphabetically
- Inline editing: click tag badge to edit, Enter/blur to save, Escape to cancel
- Renaming only changes display name, not the slug (ID is primary key used in link_tags FK)
- Tag deletion cascades to link_tags via materializer (soft-deletes tag, hard-deletes associations)

### Phase 5: AI Tag Suggestions ✅

Extends the existing AI summary feature to also suggest 1-2 relevant tags per link.

- [x] Add `tag_suggestions` table and events to schema
- [x] Modify summary generation to include tag suggestions in single LLM call
- [x] Add fuzzy matching to prefer existing tags over creating duplicates
- [x] Build TagSuggestions UI component for link detail dialog
- [x] Integrate suggestions into link detail dialog

**Feature flag:** Uses existing `org.features.aiSummary` (no separate toggle)

**Known Issues:**

- [ ] **Sync resilience:** When LinkProcessorDO emits events but sync fails (e.g., `ServerAheadError`), the UI remains stuck in loading state showing "Generating summary..." even though processing completed successfully on the worker. Need to investigate retry/recovery mechanism for failed pushes from Durable Objects.

---

## Phase 5: AI Tag Suggestions (Detailed Spec)

### Overview

When a link is processed and AI summary is enabled, the LLM also suggests 1-2 tags based on page content. Suggestions are stored separately and shown in the link detail dialog for user approval.

### Architecture

```
LinkProcessorDO detects pending link
    ↓
1. Fetch page content + metadata (existing flow)
2. Query existing tags for this org
3. Call LLM with content + existing tag names
    ↓
LLM returns:
{
  "summary": "Article about React performance optimization...",
  "suggestedTags": ["react", "performance"]
}
    ↓
4. For each suggestion:
   - Fuzzy match against existing tags
   - If match found → store with tagId reference
   - If no match → store as new tag suggestion
    ↓
5. Emit tagSuggested events
    ↓
UI shows pending suggestions in link detail dialog
    ↓
User accepts/dismisses each suggestion
```

### Schema

**Table: `tag_suggestions`**

```typescript
tagSuggestions: State.SQLite.table({
  name: "tag_suggestions",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    linkId: State.SQLite.text({ default: "" }),
    tagId: State.SQLite.text({ nullable: true }),  // null if suggesting new tag
    suggestedName: State.SQLite.text({ default: "" }),  // always present
    status: State.SQLite.text({ default: "pending" }),  // pending | accepted | dismissed
    model: State.SQLite.text({ default: "" }),
    suggestedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
  },
  indexes: [
    { name: "idx_tag_suggestions_link", columns: ["linkId"] },
  ],
}),
```

**Events:**

```typescript
// LLM suggests a tag during link processing
tagSuggested: Events.synced({
  name: "v1.TagSuggested",
  schema: Schema.Struct({
    id: Schema.String,
    linkId: Schema.String,
    tagId: Schema.NullOr(Schema.String),  // null if new tag
    suggestedName: Schema.String,
    model: Schema.String,
    suggestedAt: Schema.Date,
  }),
}),

// User accepts a suggestion
tagSuggestionAccepted: Events.synced({
  name: "v1.TagSuggestionAccepted",
  schema: Schema.Struct({
    id: Schema.String,
  }),
}),

// User dismisses a suggestion
tagSuggestionDismissed: Events.synced({
  name: "v1.TagSuggestionDismissed",
  schema: Schema.Struct({
    id: Schema.String,
  }),
}),
```

**Materializers:**

```typescript
"v1.TagSuggested": ({ id, linkId, tagId, suggestedName, model, suggestedAt }) =>
  tables.tagSuggestions.insert({ id, linkId, tagId, suggestedName, status: "pending", model, suggestedAt }),

"v1.TagSuggestionAccepted": ({ id }) =>
  tables.tagSuggestions.update({ status: "accepted" }).where({ id }),

"v1.TagSuggestionDismissed": ({ id }) =>
  tables.tagSuggestions.update({ status: "dismissed" }).where({ id }),
```

### Fuzzy Matching

Simple O(n) matching against existing tags (n typically <100):

```typescript
function findMatchingTag(suggestion: string, existingTags: Tag[]): Tag | null {
  const normalized = suggestion.toLowerCase().trim();

  // 1. Exact match (case-insensitive)
  const exact = existingTags.find((t) => t.name.toLowerCase() === normalized);
  if (exact) return exact;

  // 2. Substring match (e.g., "agent" ↔ "llm-agents")
  const partial = existingTags.find((t) => {
    const existing = t.name.toLowerCase();
    return existing.includes(normalized) || normalized.includes(existing);
  });
  if (partial) return partial;

  return null; // New tag suggestion
}
```

### LLM Prompt Changes

Modify `generate-summary.ts` system prompt:

```typescript
const SYSTEM_PROMPT = `You are a web page summarization tool. Your ONLY function is to:
1. Produce a 2-3 sentence summary of the page content
2. Suggest 1-2 relevant tags for categorization

Output JSON only: {"summary": "...", "suggestedTags": ["tag1", "tag2"]}

Tag guidelines:
- STRONGLY prefer tags from the user's existing list when they fit
- Only suggest new tags if nothing existing applies
- Use lowercase, hyphenated names (e.g., "react-hooks", "machine-learning")
- Maximum 2 tags per link
`;

// User message includes existing tags
const userMessage = `
<existing-tags>${existingTags.map((t) => t.name).join(", ")}</existing-tags>

<content>${sanitizedContent}</content>
`;
```

### Queries

```typescript
// Pending suggestions for a specific link
export const pendingSuggestionsForLink$ = (linkId: string) =>
  queryDb(
    {
      query: `
      SELECT ts.*, t.name as existingTagName
      FROM tag_suggestions ts
      LEFT JOIN tags t ON ts.tagId = t.id
      WHERE ts.linkId = ? AND ts.status = 'pending'
      ORDER BY ts.suggestedAt ASC
    `,
      bindValues: [linkId],
      schema: Schema.Array(TagSuggestionSchema),
    },
    { label: `pendingSuggestions:${linkId}` }
  );

// Count of pending suggestions (for badge/indicator)
export const pendingSuggestionsCount$ = queryDb(
  {
    query: `SELECT COUNT(*) as count FROM tag_suggestions WHERE status = 'pending'`,
    schema: Schema.Struct({ count: Schema.Number }),
  },
  { label: "pendingSuggestionsCount" }
);
```

### UI Component

**File:** `src/components/tags/tag-suggestions.tsx`

```
┌─────────────────────────────────────────────────────────────────┐
│ ✨ Suggested tags                                               │
│                                                                 │
│ ┌─────────────────────┐  ┌─────────────────────┐                │
│ │ #react        ✓  ✕  │  │ #new-tag      ✓  ✕  │                │
│ │ (existing)          │  │ (create new)        │                │
│ └─────────────────────┘  └─────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

- Shows pending suggestions with Accept (✓) / Dismiss (✕) buttons
- Visual distinction between existing tags and new tag suggestions
- **Accept existing tag:** emit `linkTagged` + `tagSuggestionAccepted`
- **Accept new tag:** emit `tagCreated` + `linkTagged` + `tagSuggestionAccepted`
- **Dismiss:** emit `tagSuggestionDismissed`

### Files to Create/Modify

| File                                               | Action                           |
| -------------------------------------------------- | -------------------------------- |
| `src/livestore/schema.ts`                          | Add table, events, materializers |
| `src/livestore/queries/tags.ts`                    | Add suggestion queries           |
| `src/cf-worker/link-processor/generate-summary.ts` | Update prompt, parse suggestions |
| `src/cf-worker/link-processor/fuzzy-match.ts`      | New: simple fuzzy matcher        |
| `src/components/tags/tag-suggestions.tsx`          | New: UI component                |
| `src/components/link-detail-dialog/dialog.tsx`     | Integrate suggestions            |

### Design Decisions

| Decision        | Choice                     | Rationale                                                    |
| --------------- | -------------------------- | ------------------------------------------------------------ |
| Single LLM call | Yes                        | No extra latency/cost, full page context available           |
| Feature flag    | Reuse `aiSummary`          | Logically coupled, simplifies settings                       |
| Fuzzy matching  | Simple substring           | Fast, handles common duplicates like "agent" vs "llm-agents" |
| Max suggestions | 2 per link                 | Avoid overwhelming user, focus on quality                    |
| Status tracking | pending/accepted/dismissed | Enables future analytics on suggestion quality               |

---

## Decisions Made

- **Tag display**: `#` prefix, hash-based color from 10-color palette, no icons
- **Tag colors**: Computed from name hash (no color field in DB, no picker UI)
- **Tag ID**: Slug generated from name via `slugify` library (e.g., "My Work" → "my-work")
- **Tag limits**: No limit on tags per link
- **Filtering location**: Filter bar above link grid (not in sidebar)
- **Filter behavior**: Intersection with projection (tags refine, don't override)
- **URL state**: Uses `nuqs` library for type-safe URL query management
- **URL format**: Human-readable slugs in URLs (e.g., `?tags=my-work,reading`)
- **Tag input component**: Uses base-ui Popover with search input and keyboard navigation
- **Default tags**: None - users create their own tags as needed

## UX Research Sources

Tag input UX patterns researched from:

- [Linear Labels Documentation](https://linear.app/docs/labels) - Label groups, syntax shortcuts
- [Linear App Case Study](https://www.eleken.co/blog-posts/linear-app-case-study) - UI patterns
- [Smart Interface Design Patterns](https://smart-interface-design-patterns.com/articles/badges-chips-tags-pills/) - Badges vs chips vs tags
- [WAI-ARIA Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) - Accessibility
- [WAI-ARIA Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) - Multi-select
- [Ariakit Combobox Multiple](https://ariakit.org/examples/combobox-multiple) - Implementation reference

## Resolved Questions

1. **Auto-tag timing** - During processing (same LLM call as summary generation)
2. **AI tag creation** - AI can suggest new tags, but user must approve before creation
3. **Duplicate prevention** - Fuzzy matching prefers existing tags over creating similar ones
