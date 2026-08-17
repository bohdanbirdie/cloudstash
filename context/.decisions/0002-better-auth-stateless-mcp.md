# Use Better Auth OAuth for a stateless compatibility MCP endpoint

Status: accepted

## Context

Cloudstash advertises a Pro MCP capability but had no endpoint. The v1 server
must fit one Cloudflare Worker, preserve current workspace and entitlement
checks, and interoperate with deployed MCP clients while the MCP 2026 protocol
and OAuth client identification are still transitioning.

## Evidence and Argument

- The installed Better Auth `1.7.0-rc.4` MCP/OAuth declarations expose the
  required PKCE, dynamic-registration, resource, consent-reference, custom JWT
  claim, and access-token TTL controls in one aligned package family.
- The generated migration adds only the provider's OAuth client, resource,
  consent, token, and assertion tables plus nullable signing-key metadata. Its
  foreign-key cascade behavior is verified with linked access and refresh
  tokens before account deletion.
- Cloudstash already owns current user approval, workspace membership, and plan
  capability checks. Reusing those authorities on every request preserves
  operation-time revocation without introducing MCP session state.
- The pinned Agents SDK supports a fresh MCP server per stateless exchange and
  the deployed legacy-stateless compatibility path, so compatibility does not
  require a second stateful transport.
- Independent review identified consent/workspace binding, per-tool scope
  enforcement, bounded request parsing, outer tool-boundary failures, CORS, and
  OAuth-row cleanup as the material risks. The accepted design addresses each
  at its owning boundary.
- CIMD would fetch a client-controlled URL. The available transport does not
  provide the DNS pinning, special-use address rejection, redirect rejection,
  and response bounds required for Cloudstash's Worker-side SSRF boundary.

## Options

| Option                                                                                                                  | Tradeoffs                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use Better Auth OAuth/MCP with DCR, short-lived workspace JWTs, stateless compatibility, and request-time authorization | Reuses the existing auth database and authorities and fits deployed clients; accepts durable untrusted DCR rows, a five-minute credential-revocation window, and temporary legacy-protocol support.  |
| Build a custom authorization server or deploy a separate OAuth provider                                                 | Could tailor every policy and lifecycle, but duplicates account/consent/token ownership, expands the security and operations surface, and risks drift from Cloudstash's current workspace authority. |
| Require strict MCP 2026 with CIMD-only client identity                                                                  | Avoids DCR persistence and legacy transport, but excludes deployed clients and introduces an attacker-selected metadata fetch before the required Worker-safe SSRF transport exists.                 |

The Better Auth stateless compatibility option won because it is the only
reviewed option that preserves current workspace authorization, supports the
target clients, and avoids introducing either a second identity authority or an
unsafe metadata-fetch boundary.

## Decision

Use the Better Auth 1.7 MCP/OAuth provider and JWT plugins as the sole MCP
authorization server. Accept dynamic client registration, bind consent and
access-token claims to the active workspace, issue five-minute resource-bound
JWT access tokens, and recheck current workspace access and `mcpServer` on every
request. Serve MCP 2026 per-request envelopes and the 2025 stateless compatibility
path from a fresh server instance per exchange. Expose only `search_links` and
`save_link`, with `links:read` and `links:write` enforced per call.

Do not enable Client ID Metadata Documents. Its metadata URI is controlled by
the client, and the available generic fetch transport does not establish the
Cloudflare-specific SSRF boundary needed here. Reconsider CIMD only with an
application-owned transport that pins DNS resolution, rejects special-use
addresses and redirects, and bounds response size and time.

## Consequences

- Dynamic registration remains compatible but creates durable untrusted client
  rows. The cross-isolate Cloudflare limit remains authoritative; Better Auth's
  production in-memory endpoint limit is supplemental. D1 table-growth
  monitoring is required.
- Consent/client/token revocation cannot invalidate an already issued JWT
  online; the bounded exposure is its five-minute TTL. Approval, membership,
  and entitlement changes are still enforced on the next request.
- Strict rejection of all pre-2026 traffic is deferred until actual client
  adoption supports removing the compatibility path.
- A dedicated current MCP verification lane is not added before evidence
  exists. CI E2E and named real-client acceptance remain planned release gates
  in DELTA-002 and the implementation todo.
