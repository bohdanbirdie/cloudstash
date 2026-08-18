# Make the configured OAuth resource seed atomic

Status: accepted

## Context

Better Auth 1.7.0 still seeds configured OAuth resources with a
read-then-insert flow. Concurrent Worker isolates can race on the unique
resource identifier.

## Evidence and Argument

- In-memory serialization cannot coordinate Worker isolates.
- The configured resource is application-owned and idempotent.
- Other adapter writes must keep standard Better Auth behavior.

## Options

| Option                        | Tradeoff                                |
| ----------------------------- | --------------------------------------- |
| Serialize in isolate memory   | Does not coordinate isolates            |
| Patch Better Auth error logic | Couples Cloudstash to package internals |
| Atomic insert at our adapter  | Uses D1 as the cross-isolate arbiter    |

## Decision

For only Cloudstash's configured resource identifier, the auth adapter uses
`INSERT ... ON CONFLICT DO NOTHING` and returns the winning row. Keep upstream
packages unpatched and preserve the stock adapter for every other operation.
