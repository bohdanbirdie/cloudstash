# Dynamic Categories Spec

## Overview

Allow users to create custom categories for organizing links, with sensible defaults provided.

## Default Categories

Pre-populate new organizations with these categories:

| Name        | Color  | Icon          |
| ----------- | ------ | ------------- |
| Reading     | blue   | book          |
| Watch Later | red    | video         |
| Reference   | green  | bookmark      |
| Shopping    | orange | shopping-cart |
| Work        | purple | briefcase     |

## LiveStore Schema

### Tables

```typescript
// src/shared/livestore/tables.ts
export const tables = {
  // ... existing tables

  categories: defineTable("categories", {
    id: { type: "TEXT", primaryKey: true },
    name: { type: "TEXT" },
    color: { type: "TEXT" }, // hex or tailwind color name
    icon: { type: "TEXT" }, // lucide icon name
    sortOrder: { type: "INTEGER", default: 0 },
    createdAt: { type: "TEXT" },
    deletedAt: { type: "TEXT", nullable: true },
  }),

  links: defineTable("links", {
    // ... existing fields
    categoryId: { type: "TEXT", nullable: true }, // FK to categories
  }),
};
```

### Events

```typescript
// src/shared/livestore/events.ts
export const events = {
  // ... existing events

  categoryCreated: Events.synced(
    "categoryCreated",
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      color: Schema.String,
      icon: Schema.String,
      sortOrder: Schema.Number,
      createdAt: Schema.Date,
    })
  ),

  categoryUpdated: Events.synced(
    "categoryUpdated",
    Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String),
      color: Schema.optional(Schema.String),
      icon: Schema.optional(Schema.String),
      sortOrder: Schema.optional(Schema.Number),
    })
  ),

  categoryDeleted: Events.synced(
    "categoryDeleted",
    Schema.Struct({
      id: Schema.String,
      deletedAt: Schema.Date,
    })
  ),

  linkCategorySet: Events.synced(
    "linkCategorySet",
    Schema.Struct({
      linkId: Schema.String,
      categoryId: Schema.NullOr(Schema.String),
    })
  ),
};
```

### Materializers

```typescript
// src/shared/livestore/materializers.ts
export const materializers = defineMaterializers(events, ({ tables }) => ({
  // ... existing materializers

  categoryCreated: (event) =>
    tables.categories.insert({
      id: event.id,
      name: event.name,
      color: event.color,
      icon: event.icon,
      sortOrder: event.sortOrder,
      createdAt: event.createdAt.toISOString(),
      deletedAt: null,
    }),

  categoryUpdated: (event) =>
    tables.categories.update({
      where: { id: event.id },
      set: {
        ...(event.name && { name: event.name }),
        ...(event.color && { color: event.color }),
        ...(event.icon && { icon: event.icon }),
        ...(event.sortOrder !== undefined && { sortOrder: event.sortOrder }),
      },
    }),

  categoryDeleted: (event) =>
    tables.categories.update({
      where: { id: event.id },
      set: { deletedAt: event.deletedAt.toISOString() },
    }),

  linkCategorySet: (event) =>
    tables.links.update({
      where: { id: event.linkId },
      set: { categoryId: event.categoryId },
    }),
}));
```

## Queries

```typescript
// src/shared/livestore/queries.ts
export const queries = {
  // Active categories sorted by order
  categories: () =>
    querySQL`SELECT * FROM categories WHERE deletedAt IS NULL ORDER BY sortOrder ASC`,

  // Links by category
  linksByCategory: (categoryId: string | null) =>
    categoryId
      ? querySQL`SELECT * FROM links WHERE categoryId = ${categoryId} AND deletedAt IS NULL ORDER BY createdAt DESC`
      : querySQL`SELECT * FROM links WHERE categoryId IS NULL AND deletedAt IS NULL ORDER BY createdAt DESC`,

  // Links with category info
  linksWithCategories: () =>
    querySQL`
      SELECT l.*, c.name as categoryName, c.color as categoryColor, c.icon as categoryIcon
      FROM links l
      LEFT JOIN categories c ON l.categoryId = c.id
      WHERE l.deletedAt IS NULL
      ORDER BY l.createdAt DESC
    `,
};
```

## UI Components

### Category Badge

```tsx
// src/web/components/CategoryBadge.tsx
import { Badge } from "@/components/ui/badge";
import * as Icons from "lucide-react";

interface CategoryBadgeProps {
  name: string;
  color: string;
  icon: string;
}

export function CategoryBadge({ name, color, icon }: CategoryBadgeProps) {
  const Icon = Icons[icon as keyof typeof Icons] || Icons.Tag;

  return (
    <Badge
      variant="outline"
      className={`bg-${color}-100 text-${color}-700 border-${color}-200`}
    >
      <Icon className="w-3 h-3 mr-1" />
      {name}
    </Badge>
  );
}
```

### Category Selector

```tsx
// src/web/components/CategorySelector.tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CategorySelectorProps {
  value: string | null;
  onChange: (categoryId: string | null) => void;
}

export function CategorySelector({ value, onChange }: CategorySelectorProps) {
  const store = useLiveStore();
  const categories = useQuery(queries.categories, { store });

  return (
    <Select
      value={value || "none"}
      onValueChange={(v) => onChange(v === "none" ? null : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select category" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No category</SelectItem>
        {categories?.map((cat) => (
          <SelectItem key={cat.id} value={cat.id}>
            <CategoryBadge name={cat.name} color={cat.color} icon={cat.icon} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### Category Filter Sidebar

```tsx
// src/web/components/CategoryFilter.tsx
export function CategoryFilter({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const store = useLiveStore();
  const categories = useQuery(queries.categories, { store });

  return (
    <div className="space-y-1">
      <Button
        variant={selected === null ? "secondary" : "ghost"}
        className="w-full justify-start"
        onClick={() => onSelect(null)}
      >
        All Links
      </Button>

      {categories?.map((cat) => {
        const Icon = Icons[cat.icon as keyof typeof Icons] || Icons.Tag;
        return (
          <Button
            key={cat.id}
            variant={selected === cat.id ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => onSelect(cat.id)}
          >
            <Icon className={`w-4 h-4 mr-2 text-${cat.color}-500`} />
            {cat.name}
          </Button>
        );
      })}
    </div>
  );
}
```

### Category Management

```tsx
// src/web/components/CategoryManager.tsx
export function CategoryManager() {
  const store = useLiveStore();
  const categories = useQuery(queries.categories, { store });
  const [editingId, setEditingId] = useState<string | null>(null);

  const createCategory = () => {
    store.commit(
      events.categoryCreated({
        id: nanoid(),
        name: "New Category",
        color: "gray",
        icon: "tag",
        sortOrder: (categories?.length || 0) + 1,
        createdAt: new Date(),
      })
    );
  };

  const updateCategory = (id: string, updates: Partial<Category>) => {
    store.commit(events.categoryUpdated({ id, ...updates }));
  };

  const deleteCategory = (id: string) => {
    store.commit(events.categoryDeleted({ id, deletedAt: new Date() }));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Categories</h3>
        <Button size="sm" onClick={createCategory}>
          <Plus className="w-4 h-4 mr-1" />
          Add Category
        </Button>
      </div>

      <DragDropContext onDragEnd={handleReorder}>
        <Droppable droppableId="categories">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              {categories?.map((cat, index) => (
                <Draggable key={cat.id} draggableId={cat.id} index={index}>
                  {(provided) => (
                    <CategoryRow
                      category={cat}
                      onEdit={() => setEditingId(cat.id)}
                      onDelete={() => deleteCategory(cat.id)}
                      provided={provided}
                    />
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {editingId && (
        <CategoryEditDialog
          category={categories?.find((c) => c.id === editingId)}
          onSave={(updates) => {
            updateCategory(editingId, updates);
            setEditingId(null);
          }}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
```

## Default Categories Seeding

```typescript
// src/shared/livestore/seed.ts
const DEFAULT_CATEGORIES = [
  { name: "Reading", color: "blue", icon: "Book" },
  { name: "Watch Later", color: "red", icon: "Video" },
  { name: "Reference", color: "green", icon: "Bookmark" },
  { name: "Shopping", color: "orange", icon: "ShoppingCart" },
  { name: "Work", color: "purple", icon: "Briefcase" },
];

export const seedDefaultCategories = (store: LiveStoreInstance) => {
  DEFAULT_CATEGORIES.forEach((cat, index) => {
    store.commit(
      events.categoryCreated({
        id: nanoid(),
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        sortOrder: index,
        createdAt: new Date(),
      })
    );
  });
};
```

## Implementation Checklist

- [ ] Add categories table to LiveStore schema
- [ ] Add categoryId to links table
- [ ] Create category events (created, updated, deleted)
- [ ] Create linkCategorySet event
- [ ] Add materializers for all events
- [ ] Create category queries
- [ ] Build CategoryBadge component
- [ ] Build CategorySelector dropdown
- [ ] Build CategoryFilter sidebar
- [ ] Build CategoryManager for CRUD
- [ ] Add drag-and-drop reordering
- [ ] Implement default categories seeding
- [ ] Update link list to show categories
- [ ] Add category filter to main view
