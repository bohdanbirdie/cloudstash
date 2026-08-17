# Ship stateless remote MCP for Pro

## Problem and outcome

MCP is advertised and enabled in the Pro capability matrix, but no server is
deployed. Ship a small Better Auth-protected remote MCP surface that lets Pro
clients search and save links in one authorized workspace.

## Agreed scope and non-goals

- Stateless HTTP transport on Cloudflare Workers.
- Authenticate with Cloudstash's Better Auth OAuth provider, workspace-bound
  five-minute JWTs, PKCE, and dynamic client registration.
- Recheck current workspace access and `mcpServer` on every request, then enforce
  `links:read`/`links:write` on each tool call.
- Initial tools: `search_links` and `save_link`, reusing current bounded search
  and Queue-send domain primitives.
- Search requires a trimmed query of at most 200 characters and returns a fixed
  relevance-ranked top 20, without a cursor, total, or stable tie-order promise.
- No list/get/tag/archive tools, conversation state, broad agent, CIMD fetch,
  Settings connection card, availability-copy change, or iOS claim.

## Agreed constraints

- Keep the initial Pro surface remote and stateless; support the 2026 protocol
  plus deployed 2025 stateless clients.
- Align availability and policy copy with the behavior verified at release.

## Acceptance criteria

- A real MCP client authenticates and can search/save only in its workspace.
- Invalid/revoked credentials and withdrawn membership fail closed; downgrade
  or override removal blocks the next operation.
- Tool inputs, result size, and errors are bounded and documented.
- Free/Plus denial and Pro success have unit and Worker boundary coverage.
- Landing, plan, settings, SEO, integration, and paywall copy remain unchanged;
  the existing availability delta stays open until release evidence exists.

## Follow-up after release evidence

Add minimal Settings connection instructions only after CI E2E and one named
real MCP client complete authorization plus a `search_links`/`save_link` round
trip. Reconcile availability copy only with deployed evidence.

## Dependencies and risks

Reuse `WorkspaceAccess`, `Billing`, the current `searchLinks$` query through one
narrow read-only RPC, and Queue intake. Watch DCR row growth, the five-minute JWT
revocation window, and Worker bundle size; isolate the route only if
measurements justify a separate Worker.

## Size and uncertainty

Medium. Domain reuse is known; OAuth/MCP client interoperability and packaging
are the main uncertainty.
