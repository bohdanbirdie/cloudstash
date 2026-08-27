# Data — Spec

This document specifies Cloudstash data ownership and workspace state. It builds
on [requirements.md](./requirements.md).

## Status

Active.

## Storage Ownership

| Store                            | Durable owner           | Data                                                                                                                  | Partition/lifecycle                                                                                                                                                                                |
| -------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1                               | Worker control plane    | users, OAuth accounts, sessions, organizations, members, API keys, invites, app settings, billing, aggregate activity | user deletion cascades identity-owned rows but nulls invite-creator references; organization deletion is limited to members, invitations, and activity while active-session references become null |
| SyncBackendDO SQLite             | `SyncBackendDO`         | canonical LiveStore eventlog                                                                                          | one DO per workspace                                                                                                                                                                               |
| Browser OPFS / extension storage | platform adapter        | local eventlog/state replica                                                                                          | one local client replica; cleared at identity transition as required                                                                                                                               |
| Client DO SQLite                 | LinkProcessor/ChatAgent | local LiveStore replica plus DO-owned state                                                                           | one DO per workspace; independently purged                                                                                                                                                         |
| X sync DO storage                | `XBookmarkSyncDO`       | X identity, watermark, status, alarm state                                                                            | one DO per user                                                                                                                                                                                    |
| Telegram KV                      | integration mapping     | chat↔user/workspace/key references and reverse deletion index                                                         | explicit disconnect/deletion lifecycle                                                                                                                                                             |
| Enrichment KV                    | link processor          | monthly X enrichment usage counter                                                                                    | workspace+period key with TTL                                                                                                                                                                      |
| Cloudflare Queue                 | ingestion               | transient link intake messages                                                                                        | main retry then DLQ re-drive/retention                                                                                                                                                             |
| ChatAgentDO storage              | Agents SDK + app        | message history and monthly token usage                                                                               | one workspace agent                                                                                                                                                                                |
| Analytics Engine                 | Cloudflare platform     | usage event with stable user/workspace indexes                                                                        | provider retention; no selective deletion path documented                                                                                                                                          |
| Workflow storage                 | Cloudflare Workflows    | deletion payload/status/step history with user/workspace IDs                                                          | retained one day after success and three days after error                                                                                                                                          |
| D1 verification rows             | Better Auth/app         | short-lived OAuth/pairing values, including Raycast credentials                                                       | TTL field but no general expiry/deletion sweep                                                                                                                                                     |
| Stripe                           | external billing owner  | customer, subscription, invoice/payment records                                                                       | deletion cancels renewable service; provider/legal record retention remains external                                                                                                               |
| Cloudflare logs/traces           | Cloudflare platform     | operational events, currently including some raw URLs/IDs                                                             | provider retention; [minimization drift](../../.delta/DELTA-016-telemetry-emits-raw-content-and-identifiers.md)                                                                                    |

The control/content split is accepted in
[decision 0001](./.decisions/0001-separate-control-and-content-planes.md).

## Workspace Schema

[`src/livestore/schema.ts`](../../../src/livestore/schema.ts) defines the
executable schema. Materialized tables currently cover:

- `links` — URL, domain, source, source metadata, reading/archival timestamps;
- `link_snapshots` — timestamped metadata observations;
- `link_summaries` — timestamped AI summaries and model identity;
- `link_processing_status` — current processing and notification state;
- `tags`, `link_tags`, `tag_suggestions` — explicit and suggested organization;
- `link_interactions` — tracked opens/interactions;
- `weekly_digests` — generated digest content by period.

Link URL strings are unique in materialized state. `LinkCreated` insert
materializers ignore exact URL conflicts, but web and external capture do not
apply one canonical URL normalization function; semantically equivalent spellings
can therefore create parallel rows; see
[DELTA-022](../../.delta/DELTA-022-url-deduplication-is-not-canonical-across-capture-paths.md).

## Event Evolution

Event names include a version (`v1.LinkCreated`, `v2.LinkCreated`). A deployed
event definition is append-only at the wire-contract level:

- do not remove or rename fields;
- do not add required fields to an existing event;
- do not change field types or event names;
- add optional fields only when old payloads remain valid;
- otherwise introduce a new version and retain both materializers.

Golden wire-format fixtures protect compatibility across Effect/LiveStore
changes. Insert materializers use `.onConflict(..., "ignore")` where the same
event may be re-applied during rebase. See
[PR #55](https://github.com/bohdanbirdie/cloudstash/pull/55).

## Query Projection

Latest snapshot/summary queries select the newest timestamped child record.
Reading and archival-state filters are materialized SQL predicates. Pending tag
suggestions are unioned with explicit tags for selected retrieval surfaces but
remain separate records and can be accepted or dismissed.

Fetched full-page markdown is held only for the processing call, truncated for
the model input, and not committed as an event or table row.
