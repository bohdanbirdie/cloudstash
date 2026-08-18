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
  availability-copy change, or iOS claim.

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
- The Integrations panel lists MCP with verified connection instructions.
- Landing, plan, SEO, and paywall copy remain unchanged; the existing
  availability delta stays open until release evidence exists.

## PR readiness checklist

### 1. Make OAuth work with a real MCP client

- [x] Choose and document the client-registration strategy for the clients this
      release supports: DCR, pre-registered clients, or CIMD. Record why the other
      options are rejected.
- [x] Make MCP JAM complete registration with its HTTP loopback callback. Do not
      silently classify omitted `application_type` as native without an upstream or
      protocol-backed reason.
- [x] Complete login, workspace consent, authorization-code exchange, and an
      authenticated MCP request in MCP JAM.
- [ ] Complete a refresh-token grant in MCP JAM using the documented
      `offline_access` scope override.
- [ ] Make the MCP JAM Desktop server remain visibly connected after its OAuth
      callback, then manually invoke both `search_links` and `save_link`. The
      2026 trace currently reaches Flow Complete and an authenticated
      `tools/list`, but the Desktop UI reloads without retaining the active
      connection. Retest with the documented `offline_access` scope override so
      the five-minute access token has a refresh path.
- [x] Record the exact automated local connection settings: server URL, auth type,
      protocol version, and any callback requirements.

### 2. Remove auth and dependency hazards

- [x] Remove Google discovery from unrelated request initialization. Prove that
      Cloudstash APIs and MCP authentication still initialize when Google discovery
      is unavailable.
- [x] Upgrade the aligned Better Auth family to stable 1.7.0 and remove the
      release-candidate dependency pins.
- [x] Remove the OAuth provider patch. Make the application-owned resource seed
      atomic at the D1 adapter boundary and prove concurrent initialization.
- [x] Resolve the Agents SDK/Workers tracing mismatch through compatible versions
      or a supported adapter. Replace the source-text assertion with a runtime test.
- [x] Do not merge the uncommitted loopback/DCR experiment as the fix; implement
      the selected strategy with focused interoperability and security tests.

### 3. Make migrations safe for existing data

- [x] Confirm why the Better Auth `account.issuer` migration belongs in this PR
      rather than separating it from MCP delivery.
- [ ] Inventory every `account.provider_id` present in production and define a
      correct issuer backfill for every supported value.
- [x] Add a preflight for unknown providers and duplicate `(issuer, account_id)`
      identities before replacing the account table, with an actionable failure
      message and a documented recovery path.
- [x] Restore direct migration tests starting from the pre-`0015` schema. Cover
      password, Google, X, unknown providers, duplicate identities, indexes, and
      foreign-key behavior.
- [ ] Dry-run `0014` and `0015` on a production-shaped database snapshot before
      applying them remotely.
- [x] Correct the Intent decision: `0014` adds OAuth tables, while `0015` performs
      a separate application-wide account identity migration.

### 4. Add release-level MCP coverage

- [x] Add a Worker-boundary test covering OAuth metadata discovery, client
      registration, authorization, consent, token exchange, authenticated MCP
      initialization, `tools/list`, and `tools/call`.
- [x] Prove `search_links` and `save_link` operate only in the consented workspace.
- [x] Prove Free/Plus denial and Pro success at the Worker boundary.
- [x] Prove invalid or expired tokens, revoked refresh tokens, withdrawn
      membership, workspace switching, and plan downgrade fail closed. Consent
      deletion forces re-consent but does not revoke Better Auth refresh/access
      tokens; that bounded five-minute JWT behavior is documented explicitly.
- [x] Keep CI hermetic: the suite must not depend on live Google discovery or any
      other external service.
- [ ] Run one named real-client round trip with MCP JAM using the same build and
      configuration intended for release.

### 5. Finish the user-facing integration

- [x] Add MCP to the Integrations panel with a Pro gate and loading state.
- [x] Show the production URL and OAuth instructions, plus concise local
      development instructions where appropriate.
- [x] Keep availability and marketing copy unchanged until deployed behavior has
      matching release evidence.

### 6. Merge gates

- [x] Ship without Better Auth dependency patches.
- [x] Run `bun run check`, `bun run test:unit`, `bun run test:e2e`, and
      `bun run build` on the final branch.
- [x] Run `bun run check:intent` after reconciling the decision and current Intent
      contracts.
- [x] Review the final diff again after the auth approach and migrations settle;
      do not treat the current green checks as MCP release evidence.

## Dependencies and risks

Reuse `WorkspaceAccess`, `Billing`, the current `searchLinks$` query through one
narrow read-only RPC, and Queue intake. Watch DCR row growth, the five-minute JWT
revocation window, and Worker bundle size; isolate the route only if
measurements justify a separate Worker.

## Size and uncertainty

Medium. Domain reuse is known; OAuth/MCP client interoperability and packaging
are the main uncertainty.
