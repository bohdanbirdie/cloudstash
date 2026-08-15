# Authentication and Tenancy — Spec

This document specifies authentication and workspace authorization. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Identity Flow

```text
Google OAuth → Better Auth user → approval → personal organization/workspace
             → session cookie with activeOrganizationId
```

Better Auth persists users, OAuth accounts, sessions, organizations, members,
and API keys in D1. On session creation, the hook resolves an existing active
organization or creates a personal organization and sets it on the session.
Unapproved users stop before mounting the LiveStore application.

Production sessions last fourteen days and update after seven days. A signed
cookie cache has a five-minute TTL. Visibility/focus refresh checks the session;
sync disconnect handling probes `/api/sync/auth`, shuts down a rejected store,
and distinguishes expired, denied, unapproved, and unknown failures.

## Workspace Authorization

Browser LiveStore connections send a payload containing `storeId` and the
same-origin cookie. The preflight endpoint validates session approval and active
workspace, but the authoritative `/sync` payload validator currently checks only
session existence and active-workspace equality; neither path performs a fresh
membership lookup; see
[DELTA-011](../../.delta/DELTA-011-primary-sync-authorization-is-weaker-than-preflight.md).

Chrome extension clients authenticate with a paired Better Auth API key and an
allowed `chrome-extension://` origin. The shared payload validator resolves the
key's workspace metadata and fails closed for missing reference, invalid key, or
disallowed extension ID.

Public API, Telegram, and Raycast credentials are Better Auth API keys carrying
workspace metadata. The generic Better Auth create/update routes currently allow
client-provided metadata, while public reads/ingest trust its `orgId` without a
fresh owner-membership check; see
[DELTA-010](../../.delta/DELTA-010-api-key-metadata-can-cross-workspace-boundaries.md). Better Auth's per-key request rate limit is disabled because
sync reconnects are network-driven; a Cloudflare per-IP rate limiter protects
selected auth/sync paths.

## Roles and Permissions

[`src/lib/permissions.ts`](../../../src/lib/permissions.ts) defines:

| Role   | Dashboard view | Billing manage | Members manage | System manage |
| ------ | -------------- | -------------- | -------------- | ------------- |
| user   | no             | no             | no             | no            |
| viewer | yes            | no             | no             | no            |
| admin  | yes            | yes            | yes            | yes           |

Hono middleware enforces permissions on authoritative routes. Client checks only
hide or reveal controls. Better Auth's admin plugin grants built-in role/user
operations only to `admin`, not `viewer`.

## Pairing Flows

- **Raycast:** a signed-in browser creates a short-lived verification value;
  the separate extension exchanges it for a device-labelled API key.
- **Chrome:** an externally-connectable handoff route mints a paired key and
  sends it to the installed extension; the key is stored locally and can be
  remotely revoked.
- **Telegram:** a connection code associates chat identity with a user/workspace
  API key stored through KV mappings.
- **X:** an authenticated account-linking OAuth flow stores encrypted provider
  tokens; X does not expose email, so the linked synthetic identity is allowed
  only from an already-authenticated session.
