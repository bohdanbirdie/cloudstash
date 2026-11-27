# Mac app keyboard navigation follows the WAI-ARIA patterns

Status: accepted

## Context

Tab did nothing in the Mac app. Rune follows AppKit: with the macOS "Keyboard
navigation" setting off, which is the system default, Tab visits only text
fields and lists, so every button and card was skipped. The maintainer wants
the whole app usable from the keyboard by default, the way a web page is in a
browser, without curating each view.

## Evidence and Argument

- Rune's `focus_key` filters the Tab order unless Full Keyboard Access is on
  or the app sets `tab_visits_controls(true)`; Rune's own test asserts that
  "keyboard navigation off skips buttons".
- Rune already has roving focus groups, modal focus traps that return focus,
  and a keyboard-only focus ring, so the WAI-ARIA Authoring Practices patterns
  map onto it without changing Rune.
- One Tab stop per item made the sidebar and the grid long Tab walks; the
  maintainer asked for one stop per group with arrows inside.
- Arrows that chose as they moved (the radio pattern) switched the grid on every
  press in the Display layouts, which the maintainer found annoying.
- The accent measures at least 3.3:1 against every surface the ring sits on, in
  both themes, above WCAG 1.4.11's 3:1.

## Options

| Option                                            | Tradeoff                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Follow macOS: Tab only with the system setting on | Native, but the app is unusable by keyboard for most people.                    |
| Tab reaches every control, one stop per control   | Simple, but the sidebar and the grid take dozens of presses to cross.           |
| Tab between components, arrows inside (WAI-ARIA)  | Familiar from browsers and macOS lists; each multi-item component needs a role. |

## Decision

Both windows set `tab_visits_controls(true)`. Components follow the WAI-ARIA
Authoring Practices: one Tab stop per component with arrows inside (Rune's
`focus_group`), the Grid pattern for the link grid, lists for the sidebar
groups, a Toolbar for the Display layouts, a Menu for the account menu, Dialog
for overlays and Combobox for the palette. Arrows move focus without choosing;
Enter or Space chooses. Tab order follows reading order (sidebar, content,
toolbar) without positive tab indices: the toolbar comes after the content in
the tree and is pinned over its top. The focus ring is the accent, because the
accent means "you are here". The rules are kept current in the product spec's
Keyboard Navigation section.
