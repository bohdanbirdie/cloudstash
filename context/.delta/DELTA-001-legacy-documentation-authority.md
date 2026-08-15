# DELTA-001: Legacy documentation still carries conflicting durable claims

Status: open

## Divergence

Although `SPEC.md` now carries a legacy warning, its body and several files
under `docs/architecture/` and `docs/features/` still contain current-sounding
claims replaced by later implementation. README also presents multi-workspace
support without resolving the personal-versus-shared product contract.

## Intent

[CS-R14 through CS-R16](../requirements.md) and the
[authority rules](../spec.md#authority-and-precedence) make `context/` canonical
and require derived documentation to agree with it.

## Implementation

Examples include old LiveStore versions and future-shipped features in the body
of [`SPEC.md`](../../SPEC.md), the pre-tier feature model in
[`docs/features/ai-summaries.md`](../../docs/features/ai-summaries.md), the
pre-Stripe state in
[`docs/features/billing-plans.md`](../../docs/features/billing-plans.md), and
the unresolved multi-workspace feature claim in [`README.md`](../../README.md).

## Direction

update implementation

## Resolution Signal

Delete this delta when `SPEC.md` has been removed or reduced to an Intent
pointer, every architecture/feature document declares its owning Intent node,
and a review finds no contradictory durable claims in README, agent
instructions, or `docs/architecture|features`.
