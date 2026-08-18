# Default legacy MCP dynamic registration to native clients

Status: accepted

## Context

Cloudstash's MCP endpoint must support MCP JAM's 2025 OAuth flow. MCP JAM sends
an unauthenticated dynamic-client registration with a loopback HTTP redirect but
omits the optional OIDC `application_type` field. OIDC defaults an omitted value
to `web`, for which Better Auth correctly rejects loopback redirects. The result
is a 400 response before the user can authorize Cloudstash.

## Evidence and Argument

- The observed MCP JAM registration uses a public client, authorization-code
  PKCE, and `http://127.0.0.1:<port>/oauth/callback`, but no
  `application_type`.
- OIDC's general omitted-value default is `web`; newer MCP clients are expected
  to identify native applications explicitly. Reinterpreting every OAuth DCR
  request by redirect shape would hide malformed metadata and change general
  authorization-server behavior.
- Cloudstash exposes DCR only for its MCP compatibility surface. Its supported
  legacy clients are installed applications, so an explicit server policy of
  `native` for an omitted value is bounded to that surface.
- Better Auth's native redirect validation still permits only HTTPS or exact
  loopback HTTP hosts. Explicit `web` or `native` metadata remains authoritative
  and receives the normal type-specific validation.

## Options

| Option                                                           | Tradeoffs                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep OIDC's omitted-value default of `web`                       | Standards-default behavior, but the supported MCP JAM client cannot register.                                                                     |
| Infer the type separately for each request from its redirect URI | Makes MCP JAM work, but silently repairs arbitrary client metadata and spreads policy into request parsing.                                       |
| Configure the MCP provider's omitted-value default as `native`   | Makes the legacy installed client work, preserves explicit metadata and strict redirects, but temporarily deviates from the general OIDC default. |
| Require a pre-registered MCP JAM client                          | Avoids DCR compatibility code, but adds per-developer credentials and does not match the intended connection flow.                                |

## Decision

Add a version-specific Better Auth provider option for the default application
type of dynamic registrations and configure Cloudstash's MCP provider to
`native`. The package default remains `web`; explicit client metadata always
wins. Keep behavior tests for omitted native loopback registration, explicit web
registration, and non-loopback HTTP rejection.

Treat this as a temporary legacy MCP JAM compatibility deviation. Remove the
patch and return to unmodified upstream behavior when supported clients send
`application_type` correctly or move to the current MCP client-identification
mechanism.
