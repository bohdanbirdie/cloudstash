# Consolidated paywall / upgrade system

**Status:** shipped. Acquisition is no longer active implementation work.

The app now has the dedicated upgrade/paywall path, login intent threading, and
shared plan presentation required to carry high-intent users into checkout.
Settings remains the management surface. Billing/Stripe reconciliation remains
separate operational verification.

Residual product work is deliberately split out:

- [[free-ai-summary-allowance]] owns the Free allowance and minimal
  allowance-exhausted/upgrade-started evidence.
- [[admin-purchase-attribution]] owns last-mile funnel visibility.
- [[human-launch-operations]] owns Stripe/Portal reconciliation.

Do not return this card to In Progress for new feature-specific upsell copy;
those changes belong to the owning capability task.
