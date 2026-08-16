# Ship stateless remote MCP for Pro

## Problem and outcome

MCP is advertised and enabled in the Pro capability matrix, but no server is
deployed. Ship a small authenticated remote MCP surface that lets Pro clients
search, list, and read one authorized workspace.

## Agreed scope and non-goals

- Stateless HTTP transport on Cloudflare Workers.
- Authenticate through the existing workspace-access boundary and recheck the
  `mcpServer` capability on every tool call.
- Initial tools: `search_links`, `list_links`, and `get_link`, reusing current
  bounded retrieval/RPC primitives.
- Add the minimal connection instructions and truthful availability copy.
- No save/tag/archive tools, conversation state, broad agent, or iOS claim.

## Agreed constraints

- Keep the initial Pro surface remote, stateless, and limited to read access.
- Align availability and policy copy with the behavior verified at release.

## Acceptance criteria

- A real MCP client authenticates and can search, list, and read only its
  workspace.
- Invalid/revoked credentials and withdrawn membership fail closed; downgrade
  or override removal blocks the next operation.
- Tool limits, result size, cursors, and errors are bounded and documented.
- Free/Plus denial and Pro success have unit and Worker boundary coverage.
- Landing, plan, settings, SEO, integration, and policy copy match the shipped
  scope and do not present unimplemented clients as available.

## Dependencies and risks

Reuse `WorkspaceAccess`, `Billing`, and current link-read RPCs. Confirm chosen
MCP client authentication interoperability without expanding to OAuth unless
required. Watch Worker bundle size and isolate the route only if measurements
justify a separate Worker.

## Size and uncertainty

Medium. Retrieval reuse is known; client auth interoperability and packaging are
the main uncertainty.
