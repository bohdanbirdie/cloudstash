# DELTA-002: Landing and plan surfaces advertise an unshipped MCP server

Status: open

## Divergence

The landing integrations grid and Pro plan present an MCP server as available.
An implementation and additive migration exist in the active change, but
bounded verification, Worker E2E, and real-client interoperability have not yet
provided release evidence, so the advertised capability is not shipped truth.

## Intent

[CS.PROD-R10](../01-product/requirements.md) requires availability claims to
match deployed capability.

## Implementation

- [`plan.ts`](../../src/lib/plan.ts) lists MCP in Pro marketing features and sets
  `mcpServer: true`.
- The active implementation introduces Better Auth OAuth/DCR and a stateless
  `/mcp` route with scoped search/save tools, but verification and CI evidence
  remain pending.

## Direction

update implementation

## Resolution Signal

Delete this delta only after the exact dependency family, additive D1 migration,
OAuth discovery/consent/token flow, both MCP protocol eras, scoped tools, current
workspace/entitlement denial, and a real MCP client connection pass in CI and
the release is deployed.
