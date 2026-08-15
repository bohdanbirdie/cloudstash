# DELTA-016: Telemetry emits raw Vault content and identifiers

Status: open

## Divergence

Normal Worker logs and Effect span attributes include full saved URLs and stable
user/workspace identifiers despite the telemetry-minimization contract.

## Intent

[CS-R19](../requirements.md) and
[CS.OPS-R05](../03-operations/requirements.md) require allowlisted structured
telemetry without raw personal/Vault data unless explicitly reviewed.

## Implementation

Examples include URL annotations in
[`ingest/service.ts`](../../src/cf-worker/ingest/service.ts), queue/DLQ records in
[`queue-handler.ts`](../../src/cf-worker/queue-handler.ts), metadata/process
spans under `src/cf-worker/metadata` and `link-processor`, and raw deletion IDs
in [`account-deletion/workflow.ts`](../../src/cf-worker/account-deletion/workflow.ts).
Full Cloudflare head sampling is enabled.

## Direction

update implementation

## Resolution Signal

Delete this delta when a shared telemetry allowlist/redaction layer removes full
URLs, raw IPs, secrets, and stable identifiers from normal logs/spans; retained
coarse or hashed fields have a documented purpose/retention; and tests scan
representative failure paths for prohibited fields.
