# Default legacy MCP dynamic registration to native clients

Status: accepted

## Context

Legacy MCP JAM registers a public PKCE client with a loopback HTTP callback but
omits OIDC `application_type`. OIDC defaults it to `web`, so Better Auth rejects
the callback before authorization.

## Evidence and Argument

- The observed request is an installed-client shape: public PKCE with an exact
  loopback callback.
- DCR exists only on Cloudstash's MCP compatibility surface, so an MCP-specific
  default does not change Better Auth's general OIDC default.
- Explicit client metadata still wins and retains Better Auth's redirect checks.

## Options

| Option                                            | Tradeoff                                                |
| ------------------------------------------------- | ------------------------------------------------------- |
| Keep the default `web`                            | Standards default, but MCP JAM cannot register.         |
| Infer type from each callback                     | Works, but silently repairs arbitrary metadata.         |
| Default omitted type to `native` for MCP DCR only | Bounded compatibility deviation with strict validation. |

## Decision

Patch the pinned provider with an MCP-only `native` default. Preserve explicit
metadata and strict redirect validation. Remove the patch when supported clients
identify themselves correctly or adopt current MCP client identification.
