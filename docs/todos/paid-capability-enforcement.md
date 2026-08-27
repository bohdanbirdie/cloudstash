# Enforce paid capabilities and budgets at operation time

## Problem and outcome

Paid HTTP, integration, alarm, digest, chat, summary, and enrichment paths must
derive access from current workspace state rather than treating connection or
setup as a permanent entitlement lease. Most operation boundaries are now
enforced; established chat connections still lack a supported connection-aware
reauthorization hook.

## Agreed scope and non-goals

- Inventory all paid HTTP, alarm, queue, WebSocket, integration, digest, chat,
  summary, and enrichment operations.
- Recheck current membership/approval at authenticated request boundaries and
  current capability at paid-operation boundaries. Do not poll identity tables
  from high-frequency background alarms.
- Design revocation for established paid chat connections without coupling to
  Agents SDK internals.
- Reserve cost-bearing period budgets atomically before provider execution and
  reconcile actual use where applicable.
- No broad billing redesign or Stripe call on normal request paths.
- Browser and extension LiveStore sync is Free and its established-connection
  access lifecycle remains tracked separately in DELTA-011.

## Agreed constraints

- A successful connection is not a permanent entitlement lease.
- Expensive-feature limits must hold under concurrency.

## Acceptance criteria

- A matrix names every paid operation, its authoritative gate, denial protocol,
  and reauthorization cadence.
- Downgrade and override removal stop the next paid operation and suspend
  established integrations safely.
- Concurrent reservations cannot exceed configured budgets.
- Backend unavailability remains distinct from terminal denial.
- Adversarial tests cover HTTP, alarms/queues, and established connections.

## Operation matrix

| Paid operation            | Authoritative gate                                                                          | Denial/stop behavior                                                                      | Recheck cadence                                             |
| ------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Public link API           | API-key identity, current approval/membership, `publicApi`                                  | structured HTTP auth/402 response; no LinkProcessor RPC                                   | every request                                               |
| Legacy direct API ingest  | API-key identity, current approval/membership, `publicApi`                                  | structured auth/402 response; no Queue send                                               | every capture                                               |
| Raycast pair/capture      | session or server-stamped Raycast key identity, current approval/membership, `integrations` | pair/capture denial; no Queue send                                                        | pair and every capture                                      |
| MCP exchange              | OAuth identity, current approval/membership, `mcpServer`                                    | protocol-compatible auth/plan error before dispatch                                       | every HTTP exchange                                         |
| Telegram pair/capture     | session or retained key identity, current approval/membership, `integrations`               | user-facing denial; retained mapping is suspended; no Queue send                          | pair and every capture                                      |
| X connect/resume/poll     | authenticated connect/resume identity; current `xBookmarkSync` for the bound workspace      | suspend and cancel alarm before provider I/O; retain watermark/account                    | identity at requests; capability at every alarm             |
| AI summary                | LinkProcessor-owned current `aiSummary` capability                                          | skip provider work; link still completes                                                  | every processed link                                        |
| X enrichment              | current `xContentEnrichment` plus atomic monthly reservation in LinkProcessorDO storage     | ordinary summary fallback; no enrichment provider call                                    | every eligible link                                         |
| Weekly digest             | current `weeklyDigest`                                                                      | manual unavailable result; cancel/omit alarm; no generation                               | manual request, every alarm, and entitlement reconciliation |
| Chat model/tool turn      | current `chatAgent` plus atomic monthly token reservation in ChatAgentDO storage            | blocked assistant response; no provider/tool work                                         | every turn/continuation                                     |
| Established chat identity | initial session checks current approval/membership                                          | current gap: a revoked member's open WebSocket is not connection-aware at `onChatMessage` | tracked in DELTA-042                                        |

## Dependencies and risks

Tracks DELTA-042. DELTA-015, DELTA-024, DELTA-036, and DELTA-037 are resolved by
this work. DELTA-011 concerns Free LiveStore sync rather than a paid capability.
Chat WebSocket revocation needs an Agents-SDK-supported connection identity at
the turn boundary; wrapping installed protocol internals is intentionally out of
scope.

## Size and uncertainty

Medium remaining uncertainty. Direct gates and atomic budgets are implemented;
the remaining established-chat identity boundary depends on a clean public SDK
seam or a deliberate connection-scoped credential design.
