# Telemetry Dashboard Spec

## Overview

Build a custom telemetry dashboard leveraging LiveStore's built-in OpenTelemetry integration and Effect's logging system. Display real-time and historical metrics about link processing, user activity, and system health.

## LiveStore Telemetry Architecture

LiveStore has built-in OpenTelemetry support via Effect:

```
┌─────────────────────────────────────────────────────────────────┐
│                    LiveStore Telemetry Flow                      │
│                                                                  │
│  ┌──────────────┐     Events      ┌──────────────────┐          │
│  │  User/System │ ───────────────►│    LiveStore     │          │
│  │   Actions    │                 │   Event Log      │          │
│  └──────────────┘                 └────────┬─────────┘          │
│                                            │                     │
│                          ┌─────────────────┼─────────────────┐  │
│                          │                 │                 │  │
│                          ▼                 ▼                 ▼  │
│                   ┌────────────┐   ┌────────────┐   ┌──────────┐│
│                   │  Computed  │   │  Metrics   │   │   OTel   ││
│                   │  Queries   │   │  Snapshots │   │ Exporter ││
│                   └─────┬──────┘   └─────┬──────┘   └────┬─────┘│
│                         │                │               │      │
│                         ▼                ▼               ▼      │
│                   ┌─────────────────────────────────────────┐   │
│                   │          Telemetry Dashboard            │   │
│                   └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Built-in OTel Context

LiveStore maintains OpenTelemetry contexts internally:

```typescript
// StoreOtel type from LiveStore internals
type StoreOtel = {
  tracer: otel.Tracer
  rootSpanContext: otel.Context
  commitsSpanContext: otel.Context  // Event commits
  queriesSpanContext: otel.Context  // Query execution
}

// Accessing via store internals
import { StoreInternalsSymbol } from '@livestore/livestore'
const otelContext = store[StoreInternalsSymbol].otel
```

### Commit Telemetry Options

```typescript
// LiveStore commit options support OTel
type StoreCommitOptions = {
  label?: string              // Span label
  spanLinks?: otel.Link[]     // Link to other spans
  otelContext?: otel.Context  // Custom context
}

// Example: commit with telemetry
store.commit(events.linkCreated({ ... }), {
  label: 'telegram-ingest',
  otelContext: requestContext,
})
```

## Data Sources

### Existing Event Data

Already tracked in LiveStore schema:

| Event | Data Available |
|-------|----------------|
| `linkCreated` | id, url, domain, createdAt |
| `linkProcessingStarted` | linkId, startedAt |
| `linkProcessingCompleted` | linkId, completedAt |
| `linkProcessingFailed` | linkId, error, failedAt |
| `linkMetadataFetched` | title, description, favicon |
| `linkSummarized` | summary text |
| `linkInteracted` | linkId, type (opened), timestamp |
| `linkCompleted` / `linkUncompleted` | status changes |
| `linkDeleted` / `linkRestored` | soft delete tracking |

### Derived Metrics

Calculate from existing events:

```typescript
// Real-time computed metrics
const metrics = {
  // Counts
  totalLinks: links.length,
  completedLinks: links.filter(l => l.completedAt).length,
  deletedLinks: links.filter(l => l.deletedAt).length,

  // Processing
  pendingProcessing: processing.filter(p => p.status === 'pending').length,
  failedProcessing: processing.filter(p => p.status === 'failed').length,
  successRate: (completed / total) * 100,

  // Performance
  avgProcessingTime: calculateAvg(processingTimes),
  p95ProcessingTime: calculatePercentile(processingTimes, 95),

  // Activity
  linksToday: links.filter(l => isToday(l.createdAt)).length,
  linksThisWeek: links.filter(l => isThisWeek(l.createdAt)).length,
  topDomains: groupByDomain(links).slice(0, 10),
}
```

## LiveStore Schema Additions

### Metrics Snapshot Table

```typescript
// src/shared/livestore/tables.ts
export const tables = {
  // ... existing tables

  metricsSnapshots: defineTable('metrics_snapshots', {
    id: { type: 'TEXT', primaryKey: true },
    timestamp: { type: 'INTEGER' }, // Unix timestamp
    totalLinks: { type: 'INTEGER' },
    completedLinks: { type: 'INTEGER' },
    pendingProcessing: { type: 'INTEGER' },
    failedProcessing: { type: 'INTEGER' },
    avgProcessingTimeMs: { type: 'INTEGER' },
    linksCreatedToday: { type: 'INTEGER' },
    interactionsToday: { type: 'INTEGER' },
  }),
}
```

### Metrics Snapshot Event

```typescript
// src/shared/livestore/events.ts
export const events = {
  // ... existing events

  metricsSnapshotRecorded: Events.synced(
    'metricsSnapshotRecorded',
    Schema.Struct({
      id: Schema.String,
      timestamp: Schema.Date,
      totalLinks: Schema.Number,
      completedLinks: Schema.Number,
      pendingProcessing: Schema.Number,
      failedProcessing: Schema.Number,
      avgProcessingTimeMs: Schema.Number,
      linksCreatedToday: Schema.Number,
      interactionsToday: Schema.Number,
    }),
  ),
}
```

### Materializer

```typescript
// src/shared/livestore/materializers.ts
export const materializers = defineMaterializers(events, ({ tables }) => ({
  // ... existing materializers

  metricsSnapshotRecorded: (event) =>
    tables.metricsSnapshots.insert({
      id: event.id,
      timestamp: event.timestamp.getTime(),
      totalLinks: event.totalLinks,
      completedLinks: event.completedLinks,
      pendingProcessing: event.pendingProcessing,
      failedProcessing: event.failedProcessing,
      avgProcessingTimeMs: event.avgProcessingTimeMs,
      linksCreatedToday: event.linksCreatedToday,
      interactionsToday: event.interactionsToday,
    }),
}))
```

## Queries

### Real-time Metrics

```typescript
// src/shared/livestore/queries.ts
export const queries = {
  // Current metrics (computed from live data)
  currentMetrics: () => computed((get) => {
    const links = get(querySQL`SELECT * FROM links WHERE deletedAt IS NULL`)
    const processing = get(querySQL`SELECT * FROM link_processing_status`)
    const interactions = get(querySQL`SELECT * FROM link_interactions`)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayTs = today.getTime()

    return {
      totalLinks: links.length,
      completedLinks: links.filter((l) => l.completedAt).length,
      pendingProcessing: processing.filter((p) => p.status === 'pending').length,
      failedProcessing: processing.filter((p) => p.status === 'failed').length,
      linksToday: links.filter((l) => new Date(l.createdAt).getTime() >= todayTs).length,
      interactionsToday: interactions.filter((i) => new Date(i.timestamp).getTime() >= todayTs).length,
    }
  }),

  // Processing performance
  processingPerformance: () =>
    querySQL`
      SELECT
        AVG(CAST((julianday(completedAt) - julianday(startedAt)) * 86400000 AS INTEGER)) as avgMs,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM link_processing_status
      WHERE startedAt IS NOT NULL
    `,

  // Top domains
  topDomains: (limit = 10) =>
    querySQL`
      SELECT domain, COUNT(*) as count
      FROM links
      WHERE deletedAt IS NULL
      GROUP BY domain
      ORDER BY count DESC
      LIMIT ${limit}
    `,

  // Recent errors
  recentErrors: (limit = 20) =>
    querySQL`
      SELECT lps.*, l.url, l.title
      FROM link_processing_status lps
      JOIN links l ON lps.linkId = l.id
      WHERE lps.status = 'failed'
      ORDER BY lps.failedAt DESC
      LIMIT ${limit}
    `,

  // Historical metrics (last 7 days)
  metricsHistory: (days = 7) =>
    querySQL`
      SELECT *
      FROM metrics_snapshots
      WHERE timestamp > ${Date.now() - days * 24 * 60 * 60 * 1000}
      ORDER BY timestamp ASC
    `,

  // Links by day (for chart)
  linksByDay: (days = 30) =>
    querySQL`
      SELECT
        date(createdAt) as day,
        COUNT(*) as count
      FROM links
      WHERE deletedAt IS NULL
        AND createdAt > datetime('now', '-${days} days')
      GROUP BY date(createdAt)
      ORDER BY day ASC
    `,
}
```

## Dashboard UI

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ TELEMETRY                                              [Admin]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │   1,234   │  │    856    │  │     42    │  │     8     │   │
│  │   Total   │  │ Completed │  │  Pending  │  │  Failed   │   │
│  │   Links   │  │           │  │ Processing│  │           │   │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘   │
│                                                                 │
├────────────────────────────────┬────────────────────────────────┤
│  LINKS OVER TIME               │  TOP DOMAINS                   │
│  ┌────────────────────────────┐│  ┌────────────────────────────┐│
│  │     ╭─╮                    ││  │ github.com          234    ││
│  │   ╭─╯ ╰╮  ╭──╮            ││  │ twitter.com         156    ││
│  │ ╭─╯    ╰──╯  ╰╮           ││  │ stackoverflow.com    89    ││
│  │─╯              ╰──────────││  │ medium.com           67    ││
│  │ M  T  W  T  F  S  S       ││  │ youtube.com          45    ││
│  └────────────────────────────┘│  └────────────────────────────┘│
├────────────────────────────────┴────────────────────────────────┤
│  PROCESSING PERFORMANCE                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Success Rate: 94.2%    Avg Time: 2.3s    P95: 5.1s        │ │
│  └────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  RECENT ERRORS                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 2 hours ago  │ example.com/article │ Timeout fetching...  │ │
│  │ 5 hours ago  │ broken.link/404     │ HTTP 404 Not Found   │ │
│  │ 1 day ago    │ slow.site/page      │ Content extraction...│ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Components

#### Stats Card

```tsx
// src/web/components/telemetry/StatsCard.tsx
interface StatsCardProps {
  title: string
  value: number | string
  change?: number // percentage change
  icon?: LucideIcon
}

export function StatsCard({ title, value, change, icon: Icon }: StatsCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {change !== undefined && (
              <p className={cn('text-sm', change >= 0 ? 'text-green-600' : 'text-red-600')}>
                {change >= 0 ? '+' : ''}{change}% from last week
              </p>
            )}
          </div>
          {Icon && <Icon className="w-8 h-8 text-muted-foreground" />}
        </div>
      </CardContent>
    </Card>
  )
}
```

#### Links Chart

```tsx
// src/web/components/telemetry/LinksChart.tsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export function LinksChart() {
  const store = useLiveStore()
  const data = useQuery(queries.linksByDay(30), { store })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Links Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data}>
            <XAxis dataKey="day" tickFormatter={(d) => format(new Date(d), 'MMM d')} />
            <YAxis />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="count"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary) / 0.2)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
```

#### Top Domains

```tsx
// src/web/components/telemetry/TopDomains.tsx
export function TopDomains() {
  const store = useLiveStore()
  const domains = useQuery(queries.topDomains(10), { store })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Domains</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {domains?.map((d, i) => (
            <div key={d.domain} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-4">{i + 1}.</span>
                <img
                  src={`https://www.google.com/s2/favicons?domain=${d.domain}&sz=16`}
                  className="w-4 h-4"
                  alt=""
                />
                <span className="truncate max-w-[150px]">{d.domain}</span>
              </div>
              <span className="font-mono text-sm">{d.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

#### Recent Errors

```tsx
// src/web/components/telemetry/RecentErrors.tsx
export function RecentErrors() {
  const store = useLiveStore()
  const errors = useQuery(queries.recentErrors(10), { store })

  if (!errors?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Errors</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">No errors</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Errors</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {errors.map((e) => (
              <TableRow key={e.linkId}>
                <TableCell className="text-muted-foreground">
                  {formatDistanceToNow(new Date(e.failedAt), { addSuffix: true })}
                </TableCell>
                <TableCell className="truncate max-w-[200px]">{e.url}</TableCell>
                <TableCell className="text-red-600 truncate max-w-[200px]">
                  {e.error}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
```

#### Processing Performance

```tsx
// src/web/components/telemetry/ProcessingPerformance.tsx
export function ProcessingPerformance() {
  const store = useLiveStore()
  const perf = useQuery(queries.processingPerformance, { store })

  const successRate = perf ? ((perf.completed / perf.total) * 100).toFixed(1) : 0
  const avgTime = perf?.avgMs ? (perf.avgMs / 1000).toFixed(1) : '0'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Processing Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-8">
          <div>
            <p className="text-sm text-muted-foreground">Success Rate</p>
            <p className="text-2xl font-bold">{successRate}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg Time</p>
            <p className="text-2xl font-bold">{avgTime}s</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Processed</p>
            <p className="text-2xl font-bold">{perf?.total || 0}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

### Dashboard Page

```tsx
// src/web/routes/admin/telemetry.tsx
import { Link, LinkIcon, Clock, AlertTriangle } from 'lucide-react'

export function TelemetryDashboard() {
  const store = useLiveStore()
  const metrics = useQuery(queries.currentMetrics, { store })

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Telemetry</h1>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Total Links"
          value={metrics?.totalLinks || 0}
          icon={Link}
        />
        <StatsCard
          title="Completed"
          value={metrics?.completedLinks || 0}
          icon={LinkIcon}
        />
        <StatsCard
          title="Pending Processing"
          value={metrics?.pendingProcessing || 0}
          icon={Clock}
        />
        <StatsCard
          title="Failed"
          value={metrics?.failedProcessing || 0}
          icon={AlertTriangle}
        />
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-4">
        <LinksChart />
        <TopDomains />
      </div>

      {/* Performance */}
      <ProcessingPerformance />

      {/* Errors */}
      <RecentErrors />
    </div>
  )
}
```

## Metrics Collection

### Periodic Snapshots (Optional)

For historical trends, collect snapshots periodically:

```typescript
// src/cf-worker/link-processor/metrics-collector.ts
export async function collectMetricsSnapshot(store: LiveStoreInstance): Promise<void> {
  const links = await store.query(querySQL`SELECT * FROM links WHERE deletedAt IS NULL`)
  const processing = await store.query(querySQL`SELECT * FROM link_processing_status`)
  const interactions = await store.query(querySQL`SELECT * FROM link_interactions`)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  store.commit(
    events.metricsSnapshotRecorded({
      id: nanoid(),
      timestamp: new Date(),
      totalLinks: links.length,
      completedLinks: links.filter((l) => l.completedAt).length,
      pendingProcessing: processing.filter((p) => p.status === 'pending').length,
      failedProcessing: processing.filter((p) => p.status === 'failed').length,
      avgProcessingTimeMs: calculateAvgProcessingTime(processing),
      linksCreatedToday: links.filter((l) => new Date(l.createdAt) >= today).length,
      interactionsToday: interactions.filter((i) => new Date(i.timestamp) >= today).length,
    }),
  )
}

// Run via Cloudflare cron trigger
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    // Every hour, collect metrics for each active org
    if (event.cron === '0 * * * *') {
      await collectMetricsForAllOrgs(env)
    }
  },
}
```

### Wrangler Cron Configuration

```toml
# wrangler.toml
[triggers]
crons = ["0 * * * *"]  # Every hour
```

## Third-Party Alternatives (Reference)

If custom UI is insufficient later:

| Option | Pros | Cons |
|--------|------|------|
| **Cloudflare Analytics Engine** | Native, no setup, free | Limited dimensions, CF-only |
| **Honeycomb** | Developer-friendly, powerful queries | Cost at scale |
| **Grafana Cloud** | Open-source compatible, dashboards | Setup complexity |
| **Datadog** | Full APM, alerting | Expensive |
| **Custom D1 + Dashboard** | Full control, private | DIY everything |

### OpenTelemetry Export (Future)

```typescript
// Optional: Export to external service
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const exporter = new OTLPTraceExporter({
  url: env.OTEL_ENDPOINT,
  headers: { 'api-key': env.OTEL_API_KEY },
})

// Configure in Effect layer
const OtelLive = Layer.merge(
  NodeSdk.layer(() => ({
    resource: { serviceName: 'link-bucket' },
    spanProcessor: new BatchSpanProcessor(exporter),
  })),
)
```

## Implementation Checklist

- [ ] Add metricsSnapshots table to LiveStore schema
- [ ] Add metricsSnapshotRecorded event
- [ ] Create metrics queries (currentMetrics, topDomains, recentErrors, etc.)
- [ ] Build StatsCard component
- [ ] Build LinksChart component (with recharts)
- [ ] Build TopDomains component
- [ ] Build RecentErrors component
- [ ] Build ProcessingPerformance component
- [ ] Create TelemetryDashboard page
- [ ] Add route to admin section
- [ ] Optional: Add cron job for periodic snapshots
- [ ] Optional: Add historical trends chart
- [ ] Optional: Export to Cloudflare Analytics Engine
