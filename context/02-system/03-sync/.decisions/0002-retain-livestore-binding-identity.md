# Retain LiveStore's legacy LibraryDO binding identity

Status: accepted

## Context

The link processor was renamed to `LibraryDO` so its name reflects its role as
the workspace library owner. Cloudflare can move the existing Durable Object
namespace from `LinkProcessorDO` to `LibraryDO`, but LiveStore also persists a
Worker binding name in SyncBackendDO reverse-RPC subscriber records.

## Evidence and Argument

- The first staging deployment moved application callers and the LiveStore
  adapter to `LIBRARY_DO` while the Cloudflare class remained an export alias.
- Existing libraries stopped receiving processing updates. SyncBackendDO logged
  `Client DO namespace not found: LINK_PROCESSOR_DO` for newly saved links.
- Restoring the old binding identity does not create a second namespace when
  both Wrangler bindings target the same `LibraryDO` class.
- LiveStore exposes no supported migration or unsubscribe operation for
  rewriting the persisted subscriber records. Editing its private storage would
  couple Cloudstash to upstream internals and risk stranding existing libraries.
- Cloudflare's `renamed_classes` migration preserves the Durable Object
  namespace and storage while changing the exported class name.

## Options

| Option                                               | Tradeoffs                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Rewrite LiveStore's private subscriber records       | Completes every cosmetic rename, but depends on unsupported storage internals and adds a risky data migration.    |
| Remove the old binding and let clients re-register   | Simple configuration, but persisted callbacks fail before re-registration and existing libraries stop processing. |
| Keep `LINK_PROCESSOR_DO` as a compatibility identity | Leaves one legacy protocol name, but preserves callbacks without a second namespace or custom migration.          |

## Decision

Rename the TypeScript class and Cloudflare namespace to `LibraryDO` through the
standard `renamed_classes` migration. Use `LIBRARY_DO` for ordinary application
calls. Permanently retain `LINK_PROCESSOR_DO` as a Wrangler alias to that same
class and as LibraryDO's LiveStore adapter `bindingName`. Treat those two
references as protocol compatibility points: do not rename or remove them
without a supported LiveStore subscriber migration and deployed evidence that
no persisted record still depends on the old identity.
