# Sidebar details

The native shell's sidebar (`src/shell.rs`, on the rune-kit fork in `src/shell_kit/`). What it does, down to the small things.

## Resizing

- Drag the edge to resize it, between 200 and 320 pt. It opens at 248 pt, and double-clicking the edge resets it to that.
- The grip is 12 pt wide and straddles the gap between the sidebar and the content card, so it's easy to hit.
- The edge sits in the middle of the 8 pt gap, not on the content card's border.
- Rest the pointer on the edge for 700 ms and a subtle neutral line appears there. The resize cursor shows straight away.
- While you drag, a blue line marks the edge and the neutral line goes at once, so the two never overlap.
- Both lines run the window's full height and stop 1 pt short of the window's border.
- At 320 pt the cursor is macOS's own left-only resize cursor, taken from AppKit.
- Past 320 pt the sidebar stretches like a rubber band, with growing resistance and at most 36 pt. Its contents widen with it, so no gap opens on the left. On release it eases back over 0.4 s on an ease-in-out curve.

## Pull to collapse

- Past 200 pt the sidebar gives way by up to 24 pt, and its contents fade to 55%.
- Halfway past the minimum it collapses. The collapse uses the toggle's spring and starts from the faded state, so it reads as one motion.
- Dragging back out in the same drag reopens it on the same spring. After a collapse, the edge follows the pointer on a spring for the rest of that drag.
- The blue line travels with the edge as it collapses, and fades out with the sidebar.
- On a Force Touch trackpad, taps come faster the harder you pull: at the minimum, then at 30, 52, 68, 80, 88, 94 and 98% of the way. A firmer tap comes on collapse. A Bluetooth Magic Trackpad doesn't seem to play them.
- A new press on the edge starts clean, with no leftover pull, so the sidebar doesn't jump.

## Toggle

- The toggle button sits right after the traffic lights and stays there whether the sidebar is open or closed.
- ⌘B toggles the sidebar, as do rune-kit's ⇧⌘B and ⌃⌘S.
- Toggling in the middle of a drag ends the drag first, and the rest of that mouse movement does nothing.

## Peek

- With the sidebar collapsed, rest the pointer at the window's left edge, or on the toggle, and the sidebar slides in over the content.
- It peeks as a full-height card with the content card's corner radius and border, inset 8 pt from the window and with 6 pt of padding inside. Its shadow is the kit's floating elevation.
- The traffic lights and the toggle sit over the top of the card, and the list stays at the height it has when docked.
- A light backdrop dims the window behind it, Linear-style: 6% black in light mode and 30% in dark. It fades in over 0.2 s.
- The card is drawn only during a peek, so a normal collapse doesn't flash grey.
- After you close the sidebar with the toggle, hovering the toggle doesn't peek it until the pointer has left the toggle once.

## Header and layout

- The traffic lights sit at (21, 21), the same distance from the top and the left edge. The header row is 40 pt high, so the toggle, the page title and the controls on the right share the lights' centre line.
- There's no workspace header or logo in the sidebar. Search is the first row.
- The footer's name and email truncate instead of spilling out of the sidebar.
- In light and dark mode the sidebar uses the prototype's colours: window, panel and border.

## Left as is

- Window corners: rounder macOS 26 corners would need an empty native toolbar, which rune can't attach yet.
- Haptics on a Bluetooth trackpad.
