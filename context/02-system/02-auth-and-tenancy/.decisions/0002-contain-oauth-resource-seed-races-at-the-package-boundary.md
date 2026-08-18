# Contain OAuth resource seed races at the package boundary

Status: accepted

## Context

Better Auth constructs an OAuth provider context for each auth instance and
seeds the configured MCP resource with a read-then-insert sequence. Concurrent
Worker requests and test isolates can construct auth against the same D1
database, so more than one initializer can observe a missing row before one
insert wins the unique `oauth_resource.identifier` constraint.

The provider already treats duplicate inserts as successful concurrent
initialization, but the D1 Drizzle adapter wraps the constraint message in an
error `cause`. Checking only the outer message turns the expected losing insert
into a rejected auth initialization.

## Evidence and Argument

- D1 is the shared correctness boundary across Worker isolates; JavaScript
  module state and binding-object identity are not.
- The database unique constraint selects exactly one resource row even when
  initializers race.
- The provider seed catch is the narrow boundary that already defines a
  duplicate insert as a successful no-op.
- Other adapter or initialization failures must remain visible and fail auth
  construction.

## Options

| Option                                                        | Tradeoffs                                                                                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Cache one auth instance by Worker environment object          | Avoids some repeated work inside one isolate, but depends on unspecified binding identity and cannot coordinate across isolates. |
| Serialize auth construction in application memory             | Narrows races only within one process and duplicates package initialization policy in Cloudstash.                                |
| Recognize wrapped duplicate causes in the provider seed catch | Uses the existing D1 uniqueness boundary across isolates and changes only the error classification the provider already intends. |

## Decision

Do not cache or serialize auth construction in application memory. Keep the D1
unique constraint as the cross-isolate arbiter and patch the provider's resource
seed duplicate catch to follow wrapped `cause` links. Suppress only an error
whose cause chain contains the provider's existing unique-or-duplicate marker;
rethrow every unrelated error. The package patch is version-specific and must
be revalidated when the OAuth provider dependency changes.
