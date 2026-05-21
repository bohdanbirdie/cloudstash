# Develop MCP server (pro-only capability)

The `mcpServer` capability already exists in the tier matrix
([[../../src/lib/plan.ts|src/lib/plan.ts]], pro-only) and is surfaced in the admin
override grid, but there is no MCP server in the codebase. This task is to build
it and gate it behind the existing capability check.

Context: the `maxLinks` cap was dropped from the config (not worth enforcing), so
`mcpServer` is the only remaining declared-but-unbuilt capability.

## Goal

Expose Cloudstash to MCP clients (Claude Desktop, Cursor, etc.) as a remote MCP
server running on Cloudflare Workers, so a pro user can query and manage their
archive from any MCP-aware LLM client.

## Likely tools to expose

- `search_links` — full-text/tag search over the user's links
- `get_link` — fetch a single link (metadata, summary, tags)
- `save_link` — ingest a URL (reuse the existing ingestion/queue path →
  `LinkProcessorDO`)
- `list_tags` / `add_tag` / `remove_tag`
- (maybe) `get_summary` / trigger reprocess

Reuse existing domain logic — do not duplicate ingestion or query code. Links and
tags are livestore-backed; reads should go through the same query layer the app
uses, writes through the same event/ingestion path.

## Open questions to resolve first

1. **Auth model.** Cloudflare's MCP guidance defaults to OAuth, but Cloudstash
   already has API-key infra (`publicApi` cap + `auth/api-key-gate.ts`). Decide:
   reuse API keys (simplest, consistent with Raycast/Telegram connect) vs. add an
   OAuth provider for MCP. Whatever the choice, resolve the request to an
   `orgId`/`userId` the same way the other connect paths do.
2. **Capability gate.** Enforce `requireCapability(orgId, "mcpServer")` on
   connect/tool-call, returning the standard `CapabilityDisabledError` → 402 so
   the client gets a clear "upgrade to Pro" signal (matches every other gate).
3. **Transport / hosting.** Standalone Worker vs. a route on the existing Worker.
   Mind the Worker-size budget (see the "Shrink Worker output" kanban item) — a
   separate Worker joined by a service binding may be cleaner and sidesteps the
   3 MiB cap.
4. **Connect UX.** How does a pro user obtain their MCP endpoint + credentials?
   Likely a new card in the integrations modal alongside Raycast/Telegram/X,
   reusing the `UpgradeCta` pattern for non-pro users.

## References

- `building-mcp-server-on-cloudflare` skill (OAuth, tools, deploy)
- Existing gated connect paths for the auth + capability pattern:
  `connect/raycast.ts`, `connect/x.ts`, `auth/api-key-gate.ts`
- `agents` SDK is already a dependency (chat-agent DO) — check whether its MCP
  support fits before adding a new framework

## Done means

- [ ] Auth + capability gate decided and implemented (`requireCapability(orgId,
"mcpServer")`, 402 for non-pro).
- [ ] Core tools (search/get/save links, list/add/remove tags) wired to existing
      query + ingestion logic, no duplication.
- [ ] A real MCP client (Claude Desktop or Cursor) can connect, authenticate, and
      round-trip at least search + save.
- [ ] Integrations UI card for obtaining the endpoint/credentials, with upgrade
      CTA for non-pro orgs.
- [ ] Unit/e2e coverage for the gate (pro allowed, free/plus → 402) and tool
      handlers.
