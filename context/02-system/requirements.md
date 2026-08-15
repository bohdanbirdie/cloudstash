# System — Requirements

## Context

Defines the technical system that realizes the Cloudstash product. Child nodes
own each major mechanism.

## Assumptions

- **CS.SYS-A01 Cloudflare execution:** The web/API Worker, Durable Objects,
  Queues, Workflows, D1, KV, Analytics Engine, and Workers AI remain available
  platform primitives.
  - Validation: [`wrangler.jsonc`](../../wrangler.jsonc) and deployed incident
    evidence.
- **CS.SYS-A02 LiveStore foundation:** Workspace content uses a LiveStore
  eventlog and derived SQLite state across browser and server-side clients.
  - Validation: [`src/livestore`](../../src/livestore/) and the vendored
    upstream source.

## Constraints

- **CS.SYS-C01 Isolate lifecycle:** Worker and Durable Object memory may be
  evicted between requests; correctness cannot depend on an isolate staying
  alive.
- **CS.SYS-C02 Resource envelopes:** Worker bundle, CPU, memory, subrequest,
  Durable Object write, queue, and AI budgets constrain implementation.
- **CS.SYS-C03 Browser storage:** Local persisted workspace state uses browser
  storage and must handle logout/login identity transitions safely.

## Acceptable Tradeoffs

- **CS.SYS-T01 Two data planes:** Control-plane and content-plane data use
  different stores and consistency mechanisms rather than one database.
- **CS.SYS-T02 Per-workspace stateful objects:** Workspace-scoped Durable
  Objects trade object count for isolation and simple serialization.
- **CS.SYS-T03 Effect substrate:** Backend orchestration uses Effect services,
  typed errors, layers, spans, and explicit defects at the cost of a steeper
  implementation model.

## Requirements

- **CS.SYS-R01 Plane ownership:** Every durable datum must have one declared
  storage owner and lifecycle. `refines: CS-R05, CS-R08`
- **CS.SYS-R02 Common workspace identity:** Content-plane components must use
  the authorized workspace identity consistently. `refines: CS-R06`
- **CS.SYS-R03 Event compatibility:** Event definitions and materializers must
  preserve replay of deployed histories under `CS-C03`.
- **CS.SYS-R04 Reactive local reads:** UI reads derive from local SQLite and
  update from materialized events. `refines: CS-R02`
- **CS.SYS-R05 Resumable background work:** Queue, Workflow, alarm, and
  server-side client work must recover across isolate loss.
- **CS.SYS-R06 Typed boundaries:** Untrusted HTTP, queue, OAuth, RPC, and
  provider data must be decoded or validated at the boundary.
- **CS.SYS-R07 Idempotent replay:** Retried messages, event rebases, provider
  callbacks, and workflow steps must not duplicate user-visible outcomes.
- **CS.SYS-R08 Server-side gates:** Workspace membership, role permission, and
  capability checks must fail closed at authoritative server boundaries.
- **CS.SYS-R09 Bounded effects:** Network, provider, and AI calls must expose
  timeout/retry behavior and typed failure mapping.
- **CS.SYS-R10 Traceable operations:** Named operations must emit structured,
  non-PII evidence; full URLs are prohibited and stable workspace/link/user
  identifiers must be masked, omitted, or deliberately approved with retention.
- **CS.SYS-R11 Deletion coverage:** Account deletion must cover every declared
  durable storage owner.
- **CS.SYS-R12 Realistic verification:** Tests must exercise real
  materialization and local Worker/DO behavior where mocks would hide the
  target failure class.
