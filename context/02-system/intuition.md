# System — Intuition

_For: engineers changing data flow or Cloudflare stateful components · Assumes:
event sourcing and edge-runtime basics · Covers: system boundaries_

Cloudstash has two different kinds of truth.

The **control plane** answers “who may do what?” It is ordinary relational state
in D1: users, organizations, membership, sessions, API keys, plans, Stripe IDs,
invites, settings, and aggregate activity.

The **content plane** answers “what happened in this library?” It is a LiveStore
event history per workspace. Browser tabs, the Chrome extension, link processor,
and chat agent are peers with local replicas. They commit facts and derive the
same link tables through deterministic materializers.

The queue is not another library. It is durable intake for sources that cannot
stay connected. The LinkProcessorDO converts each accepted message into a
workspace event, then watches derived pending state and emits metadata, summary,
tag, status, and notification events. The SyncBackendDO is the common ordering
point that lets every peer observe those facts.

Durable Objects are state owners, not reliable processes. Their memory can
vanish at any time. Persistent IDs, SQLite/KV state, alarms, queues, Workflows,
`waitUntil`, single-flight boot, and explicit durability barriers exist to make
that lifecycle unsurprising.
