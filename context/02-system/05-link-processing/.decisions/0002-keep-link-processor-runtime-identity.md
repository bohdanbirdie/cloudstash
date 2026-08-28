# Keep the LinkProcessorDO runtime identity

Status: accepted

## Context

`LinkProcessorDO` already owns the Cloudflare-side materialized library used by
processing, retrieval, ingestion, and digests. AI-03 will also route chat tools
through that existing owner. A cosmetic rename to `LibraryDO` was started in
staging while preparing that work.

## Evidence and Argument

- The chat boundary only requires a canonical library RPC owner; it does not
  require a new Durable Object class or binding name.
- Staging preserved the namespace and stored replica through the class rename,
  but the rollout added migration ordering, compatibility binding, and runtime
  identity work unrelated to removing the chat replica.
- Production has not received the rename and continues to run the established
  `LinkProcessorDO` class and `LINK_PROCESSOR_DO` binding.

### Staging experiment on 2026-08-28

PR #116 introduced an alias-first source rename and moved application callers
to `LIBRARY_DO` while the Cloudflare class remained `LinkProcessorDO`. PR #117
then added the `LinkProcessorDO` to `LibraryDO` class migration and retained
`LINK_PROCESSOR_DO` as a compatibility binding for LiveStore's persisted
reverse-RPC subscriptions. Its branch build first applied the migration to the
isolated staging Worker; PR #117 was subsequently merged into `staging`. Neither
change reached production.

The migration itself preserved data. Cloudflare reported both bindings against
the same namespace, the renamed object booted with a 409,600-byte database and
only 90 boot-time row writes, seven pending links resumed, and new links
completed metadata and AI-summary processing. The experiment therefore did not
show namespace recreation or full LiveStore rematerialization.

The rollout still failed its simplicity goal:

- Persisted LiveStore callbacks initially referenced the old binding and failed
  until the compatibility binding and updated Durable Object incarnation were
  active.
- LiveStore reconstructs callback stubs with `idFromString()`. Cloudflare does
  not populate `ctx.id.name` on that access path, even when the ID originally
  came from `idFromName()`. The renamed object consequently rejected its direct
  wake path as a store-ID mismatch and failed digest scheduling with
  `LibraryDO requires a named instance`.
- Making every operation recover, persist, and validate a separate canonical
  store ID could remove that assumption, but it would broaden AI-03 with new
  identity machinery and maintenance gates solely to support a cosmetic rename.

The relevant platform behavior is documented in Cloudflare's
[Durable Object ID reference](https://developers.cloudflare.com/durable-objects/api/id/):
`ctx.id.name` is undefined when an object is accessed through `idFromString()`.
The safe class-rename rollout itself also requires migration-aware deployment
ordering, as described in Cloudflare's
[Durable Object class migration reference](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/).

## Options

| Option                                                | Tradeoffs                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Complete the `LibraryDO` rename                       | Improves terminology, but keeps migration and compatibility work on AI-03's critical path.                                |
| Keep `LinkProcessorDO` as the stable runtime identity | Retains a narrower name, but removes unrelated stateful rollout risk and lets chat reuse the existing RPC owner directly. |

## Decision

Keep `LinkProcessorDO` and `LINK_PROCESSOR_DO` as the canonical class and binding
identities. Reverse the already-applied rename only in staging. Keep production's
migration history at `v4`, so production never applies either direction of the
rename. AI-03 changes chat ownership and RPC delegation without renaming the
library owner.
