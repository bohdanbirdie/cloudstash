# Stabilize `DotsMenu` handler refs

Profiler showed 4 Tooltips + 8 Buttons inside `DotsMenu` re-render with 100% prop changes per nav (228–456 renders each, ~3.78ms child time per nav commit).

## What to do

- Wrap inline `() => setTagManagerOpen(true)`-style callbacks in `useCallback`
- Hoist tooltip strings
- Memoize `DropdownMenuContent` items

## Gating

**Only do this** if a production-build trace (`bun run build && bun run preview`) still flags `DotsMenu` as hot — half of the dev-mode trace was profiler / `jsxDEV` overhead and may not survive the prod build.

~1 hour if it's still real.
