# Use greys with one blue accent

Status: accepted

## Context

Cloudstash's primary colour was orange, inherited from the web app's first
palette. The maintainer wants a calm, premium look that is mostly grey, and
found orange hard to work with: in the Mac app's sign-out dialog the orange logo
sat next to the red Sign Out button and the two competed. The native app had
also grown three separate colour lists (sign-in, main window, Settings), two of
which already used a blue.

## Evidence and Argument

- Orange sits about 20° of hue from the destructive red, so the brand colour
  and the danger colour read as near relatives. Blue at hue 254 sits about 130°
  away.
- Blue is the platform's own colour for the default action and for "on", so
  switches and focus rings already look native in it.
- White text on `oklch(0.545 0.19 254)` measures 4.6:1 at the lightest point of
  the button, above the 4.5:1 bar. A lighter blue forces a dark label.
- Saved links' pictures and Space colours are the user's content and are
  colourful on their own, so the surrounding app does not need colour to avoid
  looking flat.
- The maintainer compared these options in a clickable mock of the Mac app and
  chose pure greys, this blue, rare use, and a barely visible button gradient.

## Options

| Option                               | Tradeoff                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Keep orange as the primary           | Distinctive, but close to red and amber, so it competes with destructive and warning states.         |
| No accent, greys only                | Calmest, but the main action and destructive action lose their difference from secondary buttons.    |
| Pure greys with one rare blue accent | Common hue, but unambiguous next to status colours, native on the Mac, and readable with white text. |

## Decision

Use pure greys for surfaces, text and lines, and one blue,
`oklch(0.545 0.19 254)`, as the only accent. The accent marks the one main
action in a view and "on" or "you are here" states (switches, checkboxes,
focus, selection). It is never used for titles or decoration. Red is reserved
for destructive actions and errors; green and amber appear only for a real
status, with an icon and words. Space colours belong to the user and share one
lightness. The logo is drawn in the foreground grey, not in the accent. Rings
are 1px and see-through. The native tokens live in
`apps/native/src/theme.rs` and the web tokens in `src/styles.css`. The rules
themselves are kept current in the product spec's Colour and Depth section.
