# Smart Search Spec

**Status:** Implemented

## Overview

SQLite-powered search using LIKE queries with relevance scoring and match highlighting.

## Implementation

| File                                     | Purpose                       |
| ---------------------------------------- | ----------------------------- |
| `src/livestore/queries.ts`               | `searchLinks$` query          |
| `src/lib/highlight.ts`                   | `getHighlightParts()` utility |
| `src/components/ui/highlighted-text.tsx` | `HighlightedText` component   |
| `src/components/search-command.tsx`      | Updated search UI             |
| `src/lib/__tests__/highlight.test.ts`    | Unit tests                    |

## Technical Decisions

### Why LIKE Instead of FTS5

LiveStore's wa-sqlite build doesn't include FTS5 by default. Enabling it requires patching `@livestore/sqlite-wasm`. LIKE queries work without configuration changes.

### Scoring Weights

| Field       | Weight |
| ----------- | ------ |
| title       | 100    |
| domain      | 50     |
| description | 30     |
| summary     | 20     |
| url         | 10     |

### Behavior

- Empty query: Shows Pages + Recently Opened
- With query: SQLite search with results ranked by score
- Highlighting: Yellow background on matching text (client-side)
