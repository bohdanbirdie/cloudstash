# Use Better Auth OAuth for a stateless compatibility MCP endpoint

Status: accepted

## Context

Cloudstash needs a Pro MCP endpoint that fits one Worker, reuses current
workspace authorization, and supports both current and deployed legacy clients.

## Evidence and Argument

- Better Auth already supplies the OAuth flow and durable authorization state.
- A fresh Agents SDK server can handle each exchange while existing access and
  entitlement checks keep workspace authorization current.
- Consent must stay bound to its displayed workspace. Local JWT verification
  avoids Worker self-fetch; CIMD is deferred because it requires an untrusted
  fetch.

## Options

| Option                        | Tradeoff                                      |
| ----------------------------- | --------------------------------------------- |
| Better Auth OAuth with DCR    | Reuses current auth; persists untrusted DCR   |
| Separate authorization server | More control; duplicates identity and consent |
| MCP 2026 with CIMD only       | Excludes clients and adds an untrusted fetch  |

## Decision

Use Better Auth OAuth with rate-limited DCR. Bind consent and five-minute JWTs
to one workspace/resource; recheck access, entitlement, and tool scope on every
request. A fresh server per exchange exposes bounded list, search, get, save,
and state/tag update tools for MCP 2026 and the 2025 stateless compatibility
path. Verify JWT/DPoP locally. Do not enable CIMD without an SSRF-safe transport.

## Consequences

- DCR persists untrusted clients; registration is bounded and consent exposes
  the unverified name and callback target.
- Existing JWTs cannot be revoked online, so credential revocation is bounded
  by the five-minute TTL; authorization changes still apply next request.
- Legacy transport compatibility is temporary and must be removed when client
  adoption permits.
