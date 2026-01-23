# Opt-in AI Summaries Spec

## Overview

Make AI summary generation opt-in per organization to reduce Workers AI costs for users who don't need summaries.

## Database Schema

Add org-level setting for AI summaries:

```sql
-- migrations/0005_add_ai_settings.sql
ALTER TABLE organization ADD COLUMN ai_summary_enabled INTEGER DEFAULT 0;
```

## LiveStore Events & Schema

### Events

```typescript
// src/shared/livestore/events.ts
export const events = {
  // ... existing events

  orgSettingsUpdated: Events.synced(
    'orgSettingsUpdated',
    Schema.Struct({
      aiSummaryEnabled: Schema.Boolean,
    }),
  ),
}
```

### Materializer

```typescript
// src/shared/livestore/materializers.ts
export const materializers = defineMaterializers(events, ({ tables }) => ({
  // ... existing materializers

  orgSettingsUpdated: () =>
    tables.orgSettings.upsert({
      id: 'settings',
      aiSummaryEnabled: event.aiSummaryEnabled,
    }),
}))
```

### Table

```typescript
// src/shared/livestore/tables.ts
export const tables = {
  // ... existing tables

  orgSettings: defineTable('org_settings', {
    id: { type: 'TEXT', primaryKey: true },
    aiSummaryEnabled: { type: 'INTEGER', default: 0 },
  }),
}
```

## Worker Implementation

### Check Setting Before Processing

```typescript
// src/cf-worker/link-processor/process-link.ts
export const processLink = (link: Link, store: LiveStoreInstance, env: Env) =>
  Effect.gen(function* () {
    // Check if AI summaries are enabled
    const settings = yield* Effect.tryPromise(() =>
      store.query(querySQL`SELECT ai_summary_enabled FROM org_settings WHERE id = 'settings'`),
    )
    const aiEnabled = settings[0]?.ai_summary_enabled === 1

    // Fetch content
    const content = yield* fetchContent(link.url)

    // Extract metadata (always do this - it's just parsing)
    const metadata = yield* extractMetadata(content)

    // Conditionally generate AI summary
    const summary = aiEnabled ? yield* generateSummary(content, env) : null

    // Commit update
    yield* Effect.sync(() =>
      store.commit(
        events.linkProcessed({
          id: link.id,
          title: metadata.title,
          description: metadata.description,
          favicon: metadata.favicon,
          summary,
          processedAt: new Date(),
        }),
      ),
    )
  })
```

### Update linkProcessed Event

```typescript
// src/shared/livestore/events.ts
export const events = {
  linkProcessed: Events.synced(
    'linkProcessed',
    Schema.Struct({
      id: Schema.String,
      title: Schema.NullOr(Schema.String),
      description: Schema.NullOr(Schema.String),
      favicon: Schema.NullOr(Schema.String),
      summary: Schema.NullOr(Schema.String), // Now nullable
      processedAt: Schema.Date,
    }),
  ),
}
```

## Frontend Settings UI

### Settings Page

```tsx
// src/web/routes/settings.tsx
export function SettingsPage() {
  const store = useLiveStore()
  const settings = useQuery(() => querySQL`SELECT * FROM org_settings WHERE id = 'settings'`, {
    store,
  })

  const [aiEnabled, setAiEnabled] = useState(settings?.[0]?.ai_summary_enabled === 1)

  const handleToggle = (enabled: boolean) => {
    setAiEnabled(enabled)
    store.commit(events.orgSettingsUpdated({ aiSummaryEnabled: enabled }))
  }

  return (
    <div className='container mx-auto p-6 max-w-2xl'>
      <h1 className='text-2xl font-bold mb-6'>Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>AI Features</CardTitle>
          <CardDescription>Configure AI-powered features for your organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-between'>
            <div>
              <Label htmlFor='ai-summaries'>AI Summaries</Label>
              <p className='text-sm text-muted-foreground'>
                Automatically generate summaries for saved links using AI.
              </p>
            </div>
            <Switch id='ai-summaries' checked={aiEnabled} onCheckedChange={handleToggle} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

### Link Card Summary Display

```tsx
// src/web/components/LinkCard.tsx
export function LinkCard({ link }: { link: Link }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{link.title || link.url}</CardTitle>
        {link.description && <CardDescription>{link.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {link.summary ? (
          <div className='bg-muted p-3 rounded-md'>
            <p className='text-sm'>{link.summary}</p>
          </div>
        ) : link.processedAt && !link.summary ? (
          <p className='text-sm text-muted-foreground italic'>AI summary not available</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
```

## Migration Path

For existing organizations:

```sql
-- Set default settings row for existing orgs
INSERT INTO org_settings (id, ai_summary_enabled)
SELECT 'settings', 0
WHERE NOT EXISTS (SELECT 1 FROM org_settings WHERE id = 'settings');
```

## Cost Considerations

- Workers AI charges per token processed
- Disabling summaries eliminates AI costs entirely
- Could add usage tracking for future billing:

```typescript
// Optional: Track AI usage
yield *
  Effect.sync(() =>
    store.commit(
      events.aiUsageRecorded({
        linkId: link.id,
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
        timestamp: new Date(),
      }),
    ),
  )
```

## Implementation Checklist

- [ ] Add migration for organization ai_summary_enabled column
- [ ] Add orgSettings table to LiveStore schema
- [ ] Add orgSettingsUpdated event
- [ ] Update process-link.ts to check setting
- [ ] Make summary field nullable in linkProcessed event
- [ ] Create settings page with toggle
- [ ] Update LinkCard to handle missing summary
- [ ] Add migration for existing orgs
