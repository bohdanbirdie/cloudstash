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
- Better Auth preserves OIDC's `web` default when dynamic-registration metadata
  omits `application_type`, while MCP JAM omits the field and supplies a native
  loopback callback. Cloudstash's MCP-only provider therefore carries a narrow,
  explicit native-default compatibility option; explicit client metadata and
  strict type-specific redirect validation remain authoritative.
- The MCP/OAuth migration adds the provider's OAuth client, resource, consent,
  token, and assertion tables plus nullable signing-key metadata. Those durable
  records belong to OAuth authorization; they do not make the MCP transport
  sessionful. Its foreign-key cascade behavior is verified with linked access
  and refresh tokens before account deletion.
- Adopting the same Better Auth release candidate separately changes the
  application-wide account identity key from provider plus account ID to issuer
  plus account ID. That requires its own legacy-account rebuild and is not an
  MCP transport requirement. The rebuild maps only Cloudstash's evidenced
  credential, Google, and X issuers, preflights unknown providers and identity
  collisions before changing the table, and preserves the legacy table when a
  preflight fails.
- Cloudstash already owns current user approval, workspace membership, and plan
  capability checks. Reusing those authorities on every request preserves
  operation-time revocation without introducing MCP session state.
- Better Auth's browser client forwards the provider-signed `oauth_query` from
  the consent URL back to the consent endpoint. Binding the active workspace to
  that exact signed value at the authorization redirect makes the later consent
  submission reject safely if another tab changes the active workspace. A
  single short-lived, MAC-authenticated HttpOnly cookie carries the binding
  across Worker isolates without process-local state or an untrusted body field.
- The MCP helper's default JWKS verification fetches the authorization server's
  public JWKS URL. Because Cloudstash's authorization and resource servers are
  the same Worker, that creates a deployment-fragile outbound self-request.
  Better Auth core exposes the same local JWT and DPoP primitives plus a
  database-backed replay store, while the JWT plugin exposes current public keys
  through the in-process auth API.
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

At every Better Auth redirect to consent, including a login callback that sets a
new session cookie, bind the server-generated signed OAuth query and the session's
active workspace in one ten-minute signed HttpOnly cookie. Response session
cookies override older request cookies when resolving that workspace.
Before accepting consent, require the same query and active workspace; clear the
cookie after a completed consent submission or rejection. Verify MCP tokens
against signing keys loaded through Better Auth's in-process API, and use Better
Auth core's issuer, audience, expiry, Bearer/DPoP, and shared replay-protection
primitives instead of fetching the Worker's own JWKS route.

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
- The OAuth tables and the account issuer migration share a dependency upgrade
  but have different purposes. Deployment requires an empty account-issuer
  preflight result; unknown historical providers require an explicit,
  evidence-backed issuer decision rather than a guessed backfill.
- Consent/client/token revocation cannot invalidate an already issued JWT
  online; the bounded exposure is its five-minute TTL. Approval, membership,
  and entitlement changes are still enforced on the next request.
- Concurrent authorization screens share the one bounded consent-binding
  cookie. Starting a newer flow can make an older screen reject and require a
  fresh authorization, but it cannot silently retarget that older grant to a
  different workspace.
- Strict rejection of all pre-2026 traffic is deferred until actual client
  adoption supports removing the compatibility path.
- The native DCR default is a version-specific legacy-client patch, not the
  authorization server's general standards default. Remove it when supported
  clients identify native applications explicitly or use the current MCP
  client-identification mechanism.
- A dedicated current MCP verification lane is not added before evidence
  exists. CI E2E and named real-client acceptance remain planned release gates
  in DELTA-002 and the implementation todo.
