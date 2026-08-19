# Ship stateless remote MCP for Pro

## Outcome

Expose `search_links` and `save_link` through stateless HTTP for Pro workspaces.
Better Auth owns OAuth discovery, DCR, PKCE, consent, refresh tokens, and
five-minute resource JWTs. Every request rechecks approval, membership,
workspace access, entitlement, and tool scope.

## Done

- [x] Support MCP 2026 and the 2025 stateless compatibility path.
- [x] Upgrade to Better Auth 1.7.0 without dependency patches.
- [x] Complete MCP JAM DCR, consent, token exchange, and authenticated
      `tools/list` locally.
- [x] Add the Pro-gated Integrations card and local connection guidance.
- [x] Cover discovery, OAuth, workspace isolation, tools, refresh/revocation,
      membership changes, Free/Plus denial, and Pro success at the Worker
      boundary.
- [x] Keep tests hermetic and recheck access on every operation.
- [x] Bound registration bodies, MCP messages, tool inputs, and result size.

## Before merge

- [ ] Run `0014` and `0015` against a production-shaped database copy.
- [ ] Repeat the MCP JAM round trip on the final build and invoke both tools.
- [x] Run `bun run check`, `bun run test:unit`, `bun run test:e2e`,
      `bun run build`, and `bun run check:intent`.

## Non-goals

No conversational state, broad agent, additional tools, CIMD fetch, or
availability-copy change. Legacy transport support can be removed after client
adoption permits it.
