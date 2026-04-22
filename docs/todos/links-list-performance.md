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

Folded into [[app-redesign|App Redesign — Phase 2]]. The perf strategy (lift per-card queries to list-level Maps, `React.memo` with stable callbacks, `content-visibility`, lazy image decode) lands with the new list row component. Virtualization stays in reserve for 2k+ items. See the "Rendering performance at 500+ items" section of the redesign doc for the full plan.
