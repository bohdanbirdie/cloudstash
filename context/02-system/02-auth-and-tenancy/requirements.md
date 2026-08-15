# Authentication and Tenancy — Requirements

## Context

Owns user identity, workspace membership, role permissions, sessions, sync
authorization, and integration credentials.

## Assumptions

- **CS.SYS.AUTH-A01 Google primary identity:** Interactive production signup
  continues to use Google OAuth; local tests may enable email/password.
  - Validation: Better Auth configuration in
    [`auth/index.ts`](../../../src/cf-worker/auth/index.ts).
- **CS.SYS.AUTH-A02 Active workspace:** An authenticated session has one active
  organization used as the default workspace.
  - Validation: session hook and D1 schema.

## Constraints

- **CS.SYS.AUTH-C01 Cookie/WebSocket origin:** Browser sync uses the same-origin
  session cookie; extension sync uses an API key and an allowed extension
  origin.
- **CS.SYS.AUTH-C02 OAuth provider behavior:** Google and X callback/token rules
  constrain local and deployed origins.

## Acceptable Tradeoffs

- **CS.SYS.AUTH-T01 Cookie cache:** A five-minute signed session cookie cache is
  accepted to avoid D1 work on every sync request, with up to five minutes of
  revocation lag.
- **CS.SYS.AUTH-T02 Live key revocation lag:** Revoking an extension key takes
  effect on its next authenticated request/reconnect rather than terminating an
  already-open WebSocket.

## Requirements

- **CS.SYS.AUTH-R01 Authenticated workspace:** Every content read/write/sync
  operation must resolve an authenticated identity and authorized workspace.
  `refines: CS-R06, CS-R07`
- **CS.SYS.AUTH-R02 Membership check:** Browser session access to a workspace
  requires active membership and user approval.
- **CS.SYS.AUTH-R03 API key scope:** An integration API key must carry a user
  reference and server-stamped workspace metadata, remain independently
  revocable, and authorize work only while that user retains workspace access.
- **CS.SYS.AUTH-R04 Extension origin:** Extension-key sync must reject origins
  outside the configured extension allowlist.
- **CS.SYS.AUTH-R05 Permission capabilities:** Administrative reads and writes
  must be authorized by server-side permissions, not a binary UI role check.
- **CS.SYS.AUTH-R06 Fail-closed roles:** Missing or unknown application roles
  resolve to ordinary user permissions.
- **CS.SYS.AUTH-R07 Session bounds:** Production sessions expire after fourteen
  days and refresh after seven days of activity; auth loss must stop futile sync
  retries and produce a user-visible reason.
- **CS.SYS.AUTH-R08 Credential confidentiality:** Secrets, OAuth tokens, and raw
  API keys must not be logged or exposed in normal API responses.
- **CS.SYS.AUTH-R09 Integration handoff:** Pairing flows must mint credentials
  only from an authenticated workspace context and avoid manual secret copying
  where a browser handoff is available.
