# DELTA-002: Landing and plan surfaces advertise an unshipped MCP server

Status: open

## Divergence

The landing integrations grid and Pro plan present an MCP server as available,
but no MCP server, route, binding, or tool implementation exists.

## Intent

[CS.PROD-R10](../01-product/requirements.md) requires availability claims to
match deployed capability, and [roadmap.md](../roadmap.md) keeps MCP as future
direction until implemented.

## Implementation

- [`integrations-tiles.tsx`](../../src/components/landing/integrations-tiles.tsx)
  renders an “MCP server” tile without a maturity qualifier.
- [`plan.ts`](../../src/lib/plan.ts) lists MCP in Pro marketing features and sets
  `mcpServer: true`.
- [The implementation plan](../../docs/todos/develop-mcp-server.md) is still a
  todo and the Worker exports no MCP route.

## Direction

update implementation

## Resolution Signal

Delete this delta when all deployed product, SEO, plan, paywall, and settings
surfaces remove or clearly mark MCP unavailable. A future implementation remains
independent roadmap work and may reintroduce the claim only after end-to-end
verification.
