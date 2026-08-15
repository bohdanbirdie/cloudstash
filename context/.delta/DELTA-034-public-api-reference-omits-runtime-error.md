# DELTA-034: Public API reference omits a runtime error

Status: open

## Divergence

The in-app “self-contained” GET-links reference lists every documented error
except the 503 returned when Better Auth API-key verification is unavailable.

## Intent

[CS-R15](../requirements.md) and
[CS.SYS.RET-R05](../02-system/06-retrieval-and-agent/requirements.md) require the
derived API reference to match the authorized runtime boundary.

## Implementation

[`api-spec.ts`](../../src/components/integrations/api-spec.ts) lists GET errors
without 503. [`links/handler.ts`](../../src/cf-worker/links/handler.ts) returns
503 when verification fails before it can distinguish an invalid key.

## Direction

update implementation

## Resolution Signal

Delete this delta when GET reference/UI/copied-agent Markdown includes the 503
contract and a parity test derives or compares documented statuses with handler
boundary tests.
