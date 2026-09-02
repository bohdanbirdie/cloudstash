# Adopt the Fan as the brand mark

Status: accepted

## Context

Cloudstash launched with a torus-knot mark rendered over dithered backgrounds.
The knot was visually dense, read poorly at small sizes, carried no product
meaning, and its dither treatment fought the app's minimal design language.
The maintainer explored candidate marks in an iterative design loop and
selected the Fan: nine hairline rays spreading from a low pivot.

## Evidence and Argument

- The Fan depicts the product loop: many sources fanning into one place.
- Hairline strokes match the app's existing thin-line, low-chrome aesthetic.
- The geometry is nine line segments, so the mark animates naturally
  (Unfold, Trace, Fan-to-Drop morph) and renders from one small spec module.
- A prior-art search found no significant collision; similar fans (Mandarin
  Oriental, stock sunray marks) differ in construction and weight.
- Small-size legibility is handled by a stroke rule instead of a separate
  small cut; the maintainer rejected variable ray counts as inconsistent.

## Options

| Option                                  | Tradeoff                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Keep the torus knot                     | No migration cost, but weak small-size rendering and no product meaning.  |
| Bundle/Drop candidates from exploration | Related metaphors, but weaker as static marks and harder to animate.      |
| Adopt the Fan with one fixed ray count  | Requires a full asset migration, but yields one legible, animatable mark. |

## Decision

Adopt the Fan everywhere: app, landing, login, extension, and all generated
assets. One flat color (black on light, white on inverse, never the accent),
always nine rays, stroke from a single size rule, centroid-based optical
centering in tiles. Retire the torus knot and the dither treatment entirely.
The spec is code (`src/lib/brand/fan.ts`); raster assets regenerate via
`bun run brand:export`.
