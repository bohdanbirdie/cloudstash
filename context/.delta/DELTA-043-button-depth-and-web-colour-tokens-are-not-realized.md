# DELTA-043: Button depth and web colour tokens are not realized

Status: open

## Divergence

The product spec says a colour-filled button carries a barely visible gradient
and that rings are 1px and see-through. No button draws the gradient: the Mac
app has the two gradient tokens but nothing uses them, and the web app has no
gradient token at all. The web app's light theme draws borders as a solid grey
line, not a see-through ring. The web app also has no tokens for status green
and amber or for Space colours, and its grey steps differ from the Mac app's.

## Intent

[The Colour and Depth section of the product spec](../01-product/spec.md) and
[decision 0002](../01-product/.decisions/0002-use-greys-with-one-blue-accent.md).

## Implementation

[`apps/native/src/theme.rs`](../../apps/native/src/theme.rs) defines
`primary_top` and `primary_bottom` with no consumer.
[`src/styles.css`](../../src/styles.css) defines `--primary` as a flat colour,
`--border` as `oklch(0.92 0 0)` in the light theme, and no status or Space
tokens.

## Direction

update implementation

## Resolution Signal

Delete this delta when the main button in both apps draws the gradient from
named tokens, the web light theme's ring is see-through, and the web app has
status and Space colour tokens that match the Mac app's.
