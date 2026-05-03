# Fix links list rendering performance at 150+ links

UI becomes laggy when rendering 150+ links simultaneously. Likely needs virtualized list rendering.

## Symptoms

- Noticeable lag/jank when scrolling or interacting with the links list
- Performance degrades as link count increases past ~150

## Possible approaches

- Virtualized list (e.g. TanStack Virtual, react-window)
- Pagination or infinite scroll
- Reduce per-item render cost (memoization, simpler DOM)

## Related

Folded into [[app-redesign|App Redesign — Phase 2]]. The perf strategy (lift per-card queries to list-level Maps, `React.memo` with stable callbacks, `content-visibility`, lazy image decode) lands with the new list row component.

## Status (post keyboard-nav perf session)

- ✅ Per-row memo with stable click handler (handlers no longer take `activeLinkId` as a useCallback dep — they read it via ref).
- ✅ Per-row queries lifted to list-level Maps (`tagsByLink`, `statusByLink`, `formattedDates`).
- ✅ `useDeferredValue` + memo on `DetailViewInner` so the right pane doesn't fire fresh queries on every keystroke during held-arrow nav.
- ✅ Sibling subscription isolation (`Masthead` split, `TagStrip` memo'd) so subscription churn doesn't cascade.
- ⏸️ **Virtualization** — still in reserve. Trigger condition in [[../kanban|kanban]]: p95 list length > 500 OR prod-build trace flags `LinkList`. The held-key perf fix covers most users; virtualization is the next step if the list grows to thousands of items.
