# Separate admin grants from Stripe state

Status: accepted

## Context

Cloudstash originally stored one tier plus a `tierSource`. An admin-sourced
tier caused Stripe reconciliation to return early so a complimentary grant
would survive subscription events. That also made `admin + free` a permanent
barrier: Checkout succeeded, but neither the success callback nor webhook could
apply the paid subscription.

## Evidence and Argument

- Stripe and an admin grant answer different questions: the current paid plan
  and the minimum access Cloudstash grants manually.
- Stopping Stripe synchronization leaves subscription status, interval, and
  allowance-cycle fields stale even when the effective tier happens to be
  correct.
- Every paid feature already asks `Billing` for capabilities, so resolving one
  effective tier there avoids source-specific branches in feature code.
- A tier floor cannot downgrade paid access. Selecting Free naturally means
  removing the manual grant rather than overriding payment state.

## Options

| Option                                                                      | Tradeoffs                                                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Keep `tierSource` and special-case `admin + free`                           | Small patch, but payment and admin state still compete and future Stripe fields can remain stale.            |
| Let Stripe overwrite admin tiers                                            | One source, but complimentary grants disappear on the next subscription signal.                              |
| Store Stripe tier and admin grant independently, then resolve their maximum | Adds two explicit columns, but Stripe always remains current and every consumer receives one effective plan. |

## Decision

Persist the Stripe-derived tier and subscription projection on every relevant
Stripe signal. Persist an optional admin tier grant and grant timestamp
separately. `Billing` resolves the effective tier as the higher of the Stripe
tier and the grant before applying sparse capability overrides. Free clears the
grant. Stripe wins an equal-tier tie; the grant supplies the effective paid tier
only when it raises access above Stripe. Its timestamp then anchors monthly
Assistant allowance windows; otherwise the Stripe cycle does.

The legacy `tier_source` column is normalized to `stripe` during migration and
no longer participates in runtime authority. It can be removed in a later
schema cleanup after all environments have crossed the migration.

## Consequences

- Stripe subscription fields stay fresh for every workspace.
- Admin-granted Plus and Pro have the same capability path as paid plans.
- A lower admin grant cannot reduce a higher paid tier.
- Existing paid admin grants retain access and their allowance anchor through
  migration; legacy `admin + free` rows stop blocking reconciliation.
