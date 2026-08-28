# Cloudstash — Ontology

Canonical product and system language for Cloudstash.

## Language

- **Library** — The user-visible collection of saved links and derived context.
  It includes unread, completed, active, and archived links.
- **Workspace** — The internal tenant boundary that owns one library,
  subscription, capability set, and synchronized event history. Customer copy
  uses library or account while the product exposes only one workspace.
- **Organization** — The Better Auth and D1 representation of a workspace.
  Source identifiers and schema fields may say `orgId`; neither organization
  nor workspace is needed in ordinary customer copy.
- **Workspace ID** — The organization identifier reused as the LiveStore
  `storeId` and as the name of workspace-scoped Durable Objects.
- **Link** — A saved URL plus lifecycle fields such as source, status, and
  timestamps. Metadata and summaries are separate derived records.
- **Link status** — The reading lifecycle: `unread` or `completed`, independent
  of archival and processing.
- **Archival state** — Whether `deletedAt` is set. **Archive** is the reversible
  link action and **restore** is its inverse; neither means account deletion.
- **Processing status** — The enrichment lifecycle: pending, reprocess
  requested, completed, failed, or cancelled.
- **Snapshot** — A timestamped metadata observation for a link: title,
  description, image, and favicon. The newest snapshot is displayed.
- **Summary** — AI-generated concise text stored as a timestamped derived record
  for a link.
- **Tag suggestion** — An AI-proposed existing or new tag. A pending suggestion
  participates in retrieval before explicit acceptance.
- **Source** — The capture channel recorded on a link, such as app, API,
  Telegram, Raycast, X bookmark, extension, or chat.
- **Source metadata** — Opaque source-specific information required for a
  response or notification; it is not general link content.
- **Ingest** — Accept a URL from an external source and create or deduplicate the
  corresponding link in a workspace.
- **Enrichment** — Metadata extraction, content extraction, summary generation,
  and tag suggestion after capture.
- **Event** — An immutable workspace fact synchronized by LiveStore.
- **Materializer** — A deterministic transformation from an event and current
  derived state to SQLite changes.
- **Workspace history** — The ordered eventlog that is the source of truth for
  workspace content.
- **Store** — A LiveStore client exposing commit, local query, reactivity, and
  synchronization for one workspace.
- **Sync backend** — The workspace-scoped Durable Object that orders and
  distributes synced events.
- **Server-side client** — A Durable Object that hosts its own LiveStore replica,
  such as the link processor or chat agent.
- **Control plane** — D1-backed identity, tenancy, billing, invite, settings,
  and aggregate activity data.
- **Content plane** — Workspace event history and its materialized link data.
- **Capability** — A server-enforced operation or feature entitlement derived
  from a workspace tier plus overrides.
- **Tier** — The Free, Plus, or Pro commercial bundle used to derive default
  capabilities.
- **Override** — An administrator-set per-workspace capability exception or
  manual tier grant.
- **Integration** — An authorized external capture or retrieval surface that
  acts for a workspace.
- **Paired API key** — A revocable key minted through an authenticated handoff
  and carrying workspace identity for an integration.
- **Accepted intake** — A request whose message has been durably accepted by the
  Cloudflare Queue. It does not mean enrichment has completed.
- **Processing durability barrier** — A bounded wait used by a server-side
  LiveStore client to let its local events reach the leader before its Durable
  Object invocation can end.

## Structure

```text
Workspace
  ├─ control plane: members · sessions · tier · capabilities · integrations
  └─ content plane: workspace history
       └─ events → materializers → links · snapshots · summaries · tags

Capture source → ingest/save → workspace history → library state → retrieval
                                      └──────────→ enrichment → more events
```

**Library** always names the complete user-visible collection; **Inbox** is its
active triage view, not a separate collection. **Workspace** remains an internal
ownership and isolation boundary until multiple workspaces become a product
concept.
“Delete” is reserved for irreversible account/workspace deletion or internal
soft-delete fields. User-facing link removal is **archive**; its inverse is
**restore**.
