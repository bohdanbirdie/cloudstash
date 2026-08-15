# DELTA-010: User-mutable API-key metadata can cross workspace boundaries

Status: open

## Divergence

A signed-in paid user can create or update a Better Auth API key with
client-supplied `metadata.orgId`. Public read and ingest handlers trust that
workspace ID without verifying that the key's referenced user belongs to it.
This violates workspace isolation when another paid workspace ID is known.

## Intent

[CS-R06](../requirements.md) and
[CS.SYS.AUTH-R03](../02-system/02-auth-and-tenancy/requirements.md) require
server-stamped key scope and current authorized membership.

## Implementation

[`api-key-gate.ts`](../../src/cf-worker/auth/api-key-gate.ts) gates creation by
the caller's active workspace but does not sanitize request metadata;
[`auth/index.ts`](../../src/cf-worker/auth/index.ts) enables Better Auth metadata.
[`links/handler.ts`](../../src/cf-worker/links/handler.ts) and
[`ingest/service.ts`](../../src/cf-worker/ingest/service.ts) authorize the
metadata-selected workspace without checking `referenceId` membership.

## Direction

update implementation

## Resolution Signal

Delete this delta when Cloudstash-owned mint/update paths stamp immutable
workspace scope, generic metadata mutation is unavailable, every key use checks
current referenced-user membership/approval, and cross-workspace tests cover
create, update, read, ingest, and sync.
