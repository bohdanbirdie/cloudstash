# Make the chat token budget the primary usage guardrail

- Code: `AI-11`
- Priority: high

## Goal

Treat model-token spend as the economic limit for chat. Users may spend their
included chat budget on whichever read or write tools help them, without
artificial per-tool restrictions whose only purpose is cost control.

## Current baseline

The single-session chat already resolves a plan budget, atomically reserves an
estimated token amount before each model turn or continuation, and reconciles
the reservation against actual usage afterward. Destructive link archival
still requires explicit AI SDK approval because that is a safety boundary, not
a billing boundary.

## Work

- Verify that every initial turn, tool continuation, and approved-tool
  continuation passes through the same atomic token reservation.
- Reconcile actual provider usage without allowing concurrent turns to exceed
  the period budget.
- Review chat-only tool limits and keep only bounded-response, platform-safety,
  and destructive-action controls; do not use per-tool quotas as a substitute
  for the token budget.
- Present exhaustion and reset timing in calm user-facing language.
- Preserve the same library-wide budget when `AI-09` introduces multiple chat
  sessions.

The final ownership move ships with `AI-09`: its chat registry becomes the one
library-level accounting boundary, and `/clear` is removed in favor of creating
or deleting explicit conversations.

## Verification

- Concurrent turns cannot reserve beyond the configured period budget.
- Approved tool continuations are metered exactly like ordinary turns.
- Rejected destructive tools consume no tool-side work.
- Read and non-destructive write tools remain available until the shared token
  budget is exhausted.
