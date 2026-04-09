# Telegram Concurrent Link Processing

Status: **in progress** — core mechanics working, draft streaming needs refinement.

## How it works

See [[architecture/link-processor]] for the full concurrency model, processing pipeline, and queue consumer. This doc covers the Telegram-specific draft streaming behavior.

![[diagrams/telegram-draft-flow.excalidraw]]

### Stateless draft streaming

Uses `sendMessageDraft` (Bot API 9.3+) — a floating draft bubble tied to the user's original message. The draft is **stateless**: `getProgressDraftText` queries the store and renders current state. No in-memory tracking — can be called from any code path.

```text
Processing link: a.com
Saving link: b.com
```

Stage derived from `linkProcessingStatus`: no row → "Saving", `pending` → "Processing", terminal → excluded.

### Draft/confirmation interaction

`sendMessage` with `reply_parameters` referencing the same message **clears the draft bubble**. Since confirmations reply to the user's original message, they kill the active draft. After each confirmation, `sendProgressDraft` is re-called — if links remain active, the draft reappears; if all done, no stale draft is sent.

This is the key non-obvious behavior: the draft is idempotent and always reflects truth, so it can be re-sent freely after any event.

## Open items

1. **Draft message stability** — multiple rapid `sendProgressDraft` calls may arrive at Telegram out of order. Needs debounce or sequencing.
2. **ManagedRuntime** — tracked in [[todos/managed-effect-runtime-do]].
3. **SQLite ProgressTracker review** — tracked in [[todos/progress-tracker-sqlite-review]].
