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

Part of the broader [[todos/app-redesign|app redesign]] effort — rendering architecture should align with the new design direction.
