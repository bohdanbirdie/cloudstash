# Account Lifecycle — Requirements

## Context

Owns signup, approval, personal workspace creation, login/logout local-state
transitions, and irreversible account/workspace deletion.

## Assumptions

- **CS.SYS.LIFE-A01 Solo deletion owner:** Current deletion treats deleting a
  user as deleting the user's personal workspace and all data tied to it.
  - Validation: account-deletion implementation and docs; shared-workspace
    semantics remain [CS-DQ1](../../open-questions.md).

## Constraints

- **CS.SYS.LIFE-C01 Multi-store deletion:** User data spans D1, several Durable
  Objects, Workflow payload/history, Telegram and enrichment KV, Queue/DLQ
  messages, Analytics Engine, Stripe, X state, D1 verification/activity rows,
  and browser/extension local storage; no single atomic delete covers all.
- **CS.SYS.LIFE-C02 Workflow retries:** Deletion steps are asynchronous and may
  retry after the user's auth records are already removed.

## Acceptable Tradeoffs

- **CS.SYS.LIFE-T01 Logged-out but resumable:** External/content state is purged
  before the final organization row so a mid-workflow failure leaves durable
  work resumable rather than orphaning blobs with no owner.
- **CS.SYS.LIFE-T02 Type-to-confirm:** A fresh session and explicit type-DELETE
  UI are accepted instead of a separate email verification flow.
- **CS.SYS.LIFE-T03 Legacy Telegram residue:** Pre-reverse-index Telegram KV
  entries may remain physically but become unusable after API-key/user cascade.

## Requirements

- **CS.SYS.LIFE-R01 Personal workspace:** First authenticated use must resolve,
  create, or repair one owner membership and active workspace.
- **CS.SYS.LIFE-R02 Signup gate:** When the signup gate is open, users are
  auto-approved; when enabled, unapproved users cannot mount workspace content.
- **CS.SYS.LIFE-R03 Safe identity transition:** Login/logout/account deletion
  must not expose a prior workspace's browser OPFS replica to another identity.
- **CS.SYS.LIFE-R04 Fail-loud preparation:** Account deletion must resolve the
  user/workspace and ensure durable workflow orchestration before Better Auth
  removes the user; missing/inconsistent ownership must stop deletion or enter a
  separately durable recovery path. `refines: CS-R08`
- **CS.SYS.LIFE-R05 Idempotent workflow:** Deletion uses workspace identity as
  its workflow key; active and complete retained runs are reused, errored or
  terminated retained runs restart, and unknown state fails closed.
- **CS.SYS.LIFE-R06 Complete storage inventory:** Deletion semantics must name
  every content/control/telemetry/local surface and, for each, specify immediate
  purge, access revocation, bounded TTL/provider retention, or technical
  non-deletability. `refines: CS.SYS-R11`
- **CS.SYS.LIFE-R07 Terminal owners:** A purged deterministic owner Durable
  Object must remain terminal without domain callers maintaining deletion
  gates. Delayed Queue/DLQ deliveries must resolve as successful no-ops, while
  source-backed actors must reconcile missing authority into empty local state.
- **CS.SYS.LIFE-R08 Source-first purge ordering:** A surviving authoritative
  source must not be able to rehydrate a client store after that client is
  purged; retire the canonical eventlog before downstream replicas.
- **CS.SYS.LIFE-R09 Step retry evidence:** Each purge step must be independently
  named, bounded, idempotent, and fail when its target operation fails so the
  Workflow retains attempt and retry evidence.
- **CS.SYS.LIFE-R10 Final control-plane cleanup:** Deletion fails closed for a
  personal organization with another member. Better Auth removes user-owned
  identity rows while preserving invitations and invite codes through nullable
  creator references; the later organization delete may cascade only its
  members, invitations, and activity rows and may null active-session references
  after external/content stores are fenced and purged.
- **CS.SYS.LIFE-R11 Telemetry cleanup:** D1 activity/verification rows and known
  workspace-keyed usage counters must be explicitly removed; non-selectively
  deletable analytics/logs/Workflow history require documented retention and
  access limits.
- **CS.SYS.LIFE-R12 Billing termination:** Deletion must cancel or otherwise
  terminate renewable Stripe service before local customer/subscription
  identifiers are removed, while preserving only legally required billing
  records under a declared retention rule.
