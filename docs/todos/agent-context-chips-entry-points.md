# Agent context chips + entry points

Two coupled features for the agent panel.

## Context chips

Auto-attached pills at the top of the agent panel:

- Current route / filter (`Inbox`, `#design`)
- Active detail link
- Multi-selection (`5 selected`)

Each pill has `×` to dismiss. The agent's prompt sees only what's in the chip set.

## Entry points

New triggers that pre-populate the chip set:

- "Ask about this" in the detail-view header — auto-attaches the active link
- "Ask about these" in the bulk-select header — auto-attaches the selection
- Soft handoff at the bottom of the search empty / no-match state (`→ Ask agent about "<query>"`)

## Validate value before building

Chips might be overengineering vs. letting the user paste / type, and the entry points might be low-traffic. Spend a session in the live UI thinking about whether you'd actually use these before investing.

Pulled out of [[app-redesign|redesign doc]] Agent UI as non-blocking.
