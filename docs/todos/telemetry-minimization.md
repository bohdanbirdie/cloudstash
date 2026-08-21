# Minimize telemetry and reconcile collection documentation

## Problem and outcome

Repository evidence shows that normal telemetry includes raw Vault URLs and
stable identifiers. Reduce collection to a purpose-bound allowlist and reconcile
privacy copy with actual collection.

## Agreed scope and non-goals

- Inventory Worker logs, spans, Analytics Engine/D1 activity, Meta Pixel,
  OneDollarStats, deletion Workflow evidence, and provider diagnostics.
- Remove evidenced raw URLs/content and unnecessary stable identifiers. Prohibit
  raw IPs and secrets; use coarse/hashed context only with a reviewed purpose.
- Minimize aggregate activity fields and retention to what operations and the
  approved purchase funnel require.
- Align route scope and promised opt-outs with implementation.
- No new user/content analytics feed and no claim beyond approved legal wording.

## Agreed constraints

- Collect only fields with a reviewed operational or aggregate product purpose.
- Legal sign-off remains a human action after factual implementation/copy
  reconciliation.

## Acceptance criteria

- A shared allowlist/redaction policy covers representative success and failure
  paths and tests reject prohibited fields.
- Admin/product aggregates exclude content and unnecessary per-user history.
- Tracking route scope and GPC/consent behavior match published copy.
- Deletion inventory includes retained telemetry with bounded language.
- DELTA-013 and DELTA-016 resolution signals are either met or narrowed with
  explicit remaining evidence.

## Dependencies and risks

Must retain enough coarse operational context to debug Queue, sync, entitlement,
and deletion failures. Final privacy/terms language requires human legal review.

## Size and uncertainty

Medium-large. Code removal is tractable; retention and legal wording need owner
decisions.

Tracking scope and GPC behavior were reconciled on 2026-08-21; this task still
owns server-side telemetry and retained activity data.
