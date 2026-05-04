# Mobile view review + fixes

Full app pass for mobile / small viewports.

## Known offenders

- **Bottom-dock chip+trigger row** overflows below ~580px (search alone is 480px). Chip should collapse to icon-only; agent panel should take full screen.
- Detail-view two-column grid
- Top-bar density
- Masthead size
- List row image col

## Approach

Audit each route at 375 / 414 / 580 widths. Decide which need stacked layouts vs. hidden affordances.

Pulled out of [[app-redesign|redesign doc]] phase 5 / Agent UI.
