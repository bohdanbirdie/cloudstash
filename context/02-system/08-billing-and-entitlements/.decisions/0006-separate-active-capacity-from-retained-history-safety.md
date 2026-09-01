# Separate active capacity from retained-history safety

Status: accepted

## Context

Cloudstash advertises active saved-link capacity, and archiving intentionally
returns that capacity. Counting only active links nevertheless leaves a
workspace able to retain unbounded archived history. Counting archived links
against the public allowance would instead make archive semantics misleading
and punish ordinary long-term use.

## Evidence and Argument

- Browser and extension writes are local-first, so the local materialization is
  the right place for immediate product-limit feedback but not an authoritative
  abuse boundary.
- LiveStore's SyncBackend `onPush` hook runs before canonical event persistence,
  allowing extreme retained growth to fail closed without routing every normal
  save through a new service.
- Link creation is append-only in the canonical event history; counting those
  events gives a conservative retained-history measure without another counter
  or reconciliation lifecycle.
- The retained ceiling is operational policy, not another customer-facing plan
  allowance.

## Options

| Option                                                                   | Tradeoffs                                                                                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Count active and archived links against one public limit                 | Simple, but archiving no longer restores the capacity promised by the product.                                       |
| Keep only the active limit                                               | Preserves local-first UX, but archived history can grow without bound.                                               |
| Keep the active limit and add a generous retained-history safety ceiling | Preserves archive semantics and local-first operation while bounding extreme storage abuse at canonical persistence. |

## Decision

Keep the published limit on active links. Apply a much higher private ceiling
to retained active plus archived history: a multiple of finite active capacity
and a fixed high ceiling for product-unlimited workspaces. Give immediate local
feedback when entitlement state is known, and reject over-ceiling link-create
batches in SyncBackendDO before they enter canonical history. Do not present the
retained ceiling as normal plan capacity.
