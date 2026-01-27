# AI Summaries

Per-workspace feature flag for AI-generated link summaries. Disabled by default.

## How It Works

1. Admin enables AI summaries for a workspace via Admin → Workspaces tab
2. `LinkProcessorDO` checks `organization.features.aiSummary` before processing
3. If enabled, `processLink()` calls `generateSummary()` after fetching metadata

## Data Model

```typescript
// src/cf-worker/db/schema.ts
type OrgFeatures = { aiSummary?: boolean };

features: text("features", { mode: "json" }).$type<OrgFeatures>().default({});
```

Drizzle handles JSON serialization automatically.

## API Endpoints

All require global admin role (enforced via `requireAdmin` middleware).

| Method | Endpoint                | Description                       |
| ------ | ----------------------- | --------------------------------- |
| GET    | `/api/admin/workspaces` | List all workspaces with features |
| GET    | `/api/org/:id/settings` | Get workspace features            |
| PUT    | `/api/org/:id/settings` | Update workspace features         |

## Key Files

| File                                             | Purpose                          |
| ------------------------------------------------ | -------------------------------- |
| `src/cf-worker/middleware/require-admin.ts`      | Admin auth middleware            |
| `src/cf-worker/admin/workspaces.ts`              | Admin API handlers               |
| `src/cf-worker/link-processor/durable-object.ts` | Feature check in `getFeatures()` |
| `src/cf-worker/link-processor/process-link.ts`   | Conditional summary generation   |
| `src/components/admin/workspaces-tab.tsx`        | Admin UI for toggles             |
