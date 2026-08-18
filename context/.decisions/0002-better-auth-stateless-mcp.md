# Use Better Auth OAuth for a stateless compatibility MCP endpoint

Status: accepted

## Context

Cloudstash needs a Pro MCP endpoint that fits one Worker, reuses current
workspace authorization, and supports both current and deployed legacy clients.

## Evidence and Argument

- Better Auth supplies PKCE, DCR, consent, resource-bound JWTs, and refresh
  tokens in the existing identity system.
- OAuth clients, consent, and tokens are durable authorization state; they do
  not make the MCP request transport sessionful.
- Current approval, membership, and entitlement checks can be reused on every
  exchange without server-side MCP sessions.
- The Agents SDK supports fresh-server, per-request handling for MCP 2026 and
  the 2025 stateless compatibility path.
- Consent must remain bound to the displayed workspace across redirects, and
  local token verification avoids a fragile Worker self-fetch to JWKS.
- CIMD requires fetching a client-controlled URL without Cloudstash's required
  SSRF controls.

## Options

| Option                             | Tradeoff                                              |
| ---------------------------------- | ----------------------------------------------------- |
| Better Auth OAuth with DCR         | Fits current auth and clients; persists untrusted DCR |
| A separate authorization server    | More control; duplicates identity and consent         |
| Strict MCP 2026 with CIMD identity | No DCR; excludes clients and adds an unsafe fetch     |

## Decision

Use Better Auth as the MCP authorization server. Accept rate-limited DCR, bind
consent and five-minute JWTs to a workspace and resource, and recheck approval,
membership, entitlement, and tool scope on every request. Expose only
`search_links` (`links:read`) and `save_link` (`links:write`).

Serve MCP 2026 and the 2025 stateless compatibility path from a fresh server per
exchange. Bind the signed OAuth query and workspace in a short-lived HttpOnly
cookie. Verify JWT and DPoP locally with Better Auth keys and shared replay
storage. Do not enable CIMD until an application-owned SSRF-safe transport
exists.

## Consequences

- DCR creates durable untrusted rows; cross-isolate rate limiting and table
  growth monitoring are required. Registration payloads are bounded, and the
  self-reported client identity and callback target remain visible at consent.
- Existing JWTs cannot be revoked online, so credential revocation is bounded
  by the five-minute TTL; authorization changes still apply next request.
- The dependency's separate account-issuer migration requires an empty
  production preflight before deployment.
- Legacy transport compatibility is temporary and must be removed when client
  adoption permits.
