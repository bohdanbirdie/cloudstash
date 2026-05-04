# Virtualize the link list

TanStack Virtual or react-window. Per the keyboard-nav profiler session, `LinkList`'s parent body is ~5ms self per commit (rendering JSX for 240 rows + reconciler walking each fiber), inherent and not memo-fixable.

## Trigger conditions (don't take on without one)

- p95 list length > 500 items, OR
- a production-build trace shows nav/scroll lag attributable to `LinkList`

## Interactions to handle

- **Roving tabindex** — only the row with `tabIndex=0` should be the first row in the visible window when no active row, so the first-row fallback in `tabbableId` needs to follow the window
- **Hover-anchor** — `onMouseOver` event delegation via `containerRef.current.contains` already handles unmounted rows correctly
- **Cursor `.focus()` in `moveByKey`** — must scroll the row into view if it's outside the rendered window

Don't take on without a measured trigger — meaningful refactor cost.
