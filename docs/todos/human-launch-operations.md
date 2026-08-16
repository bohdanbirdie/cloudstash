# Human launch operations

These actions require maintainer credentials, policy ownership, or legal/release
authority. They are intentionally separate from automated implementation work.

## Queue retention and recovery envelope

- Inspect production plan plus main/DLQ retention and record dated evidence.
- Run the approved recovery drill and resolve CS-DQ5/DELTA-008 only if the
  configured envelope is proven.
- Server-ingest durability code is already merged; do not reopen it as product
  implementation work.

## Stripe and Portal reconciliation

- Verify configured prices, checkout, success callback, webhook, cancellation,
  upgrade/downgrade, and Portal behavior against production Stripe state.
- Record discrepancies for agent implementation; do not treat a client callback
  as subscription truth.

## Legal sign-off

- Approve deletion/retention language, privacy processors/telemetry scope,
  tracking opt-outs, billing intervals/consent, and remaining launch clauses.
- Agent work may make factual copy accurate but cannot provide legal approval.

## Certified release or staging choice

- Choose the release evidence path for behavior not provable locally: a real
  isolated staging environment or a bounded maintainer-run production check.
- Preserve the no-remote-agent rule.

## Alert destination and owner

- Select the human destination, severity thresholds, and recovery owner for
  Queue exhaustion, sync lag, deletion Workflow errors, and other tripwires.
- Only then wire notification delivery; logs without an owner are not an alert.
