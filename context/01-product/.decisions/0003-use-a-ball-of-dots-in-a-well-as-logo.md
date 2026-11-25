# Use a ball of dots in a well as the logo

Status: accepted

## Context

The logo was a knot drawn as one line, shared with the web app. With the move
to greys and one blue accent (decision 0002) the maintainer wanted a new mark:
abstract, calm and premium, not a letter, not a cloud, and nothing borrowed.
It should stand for a vault of saved links. He compared about a hundred marks
over several rounds of mocks and picked this one "for now", on the black tile.

## Evidence and Argument

- A ball of evenly spread dots reads as many saved things held as one body, and
  the round well it rests in reads as a place that keeps them.
- Drawn pressed-in and lit from above on the Mac icon shape, it looked premium
  to the maintainer where the same ideas as flat dots did not.
- A word search for look-alikes found nothing matching a dot ball inside a
  recess. A dot ball alone is common stock art, and plain concentric rings sit
  close to camera and target icons, so the two together matter. No picture
  search has been done yet.
- The same ball can grow into the loading screen, where its dots become the
  saved links' pictures; a mock of that exists.
- Below about 24 points the many small dots blur, so small sizes need a
  simpler cut.

## Options

| Option                     | Tradeoff                                                               |
| -------------------------- | ---------------------------------------------------------------------- |
| Keep the knot              | Already everywhere, but it was not chosen for the new look.            |
| Dot ball alone on the tile | Simplest, but close to stock art.                                      |
| Dot ball in a round well   | More its own and says "kept", but needs a simpler cut for small sizes. |

## Decision

The logo is a ball of dots, lit from the top left. On the Mac app icon it rests
in a round well on a black tile in Apple's Mac icon shape (an 824 tile on a
1024 canvas); the tile and the well belong to the icon, not to the logo.
Everywhere else the ball stands alone in the foreground grey, with no ring or
frame around it. The menu bar draws it with fewer, bigger dots so it survives
18 points. Black and white only; the blue accent is not used in the logo.

There are two versions and nothing in between: the ball alone, and the Mac
app icon. The tile never appears without its well, and the icon is never
redrawn with a bigger ball for small sizes. The ball alone is used inside
Cloudstash's own pages and windows. The app icon is used where Cloudstash sits
among other apps or on someone else's surface: the Dock, a browser tab, a phone
home screen, a consent page. At a browser tab's size the icon blurs; the
maintainer accepted that over a third version.

`apps/native/scripts/brand.py` draws every file. The SVGs it writes to
`apps/native/assets/brand/` are the originals; `AppIcon.icns`,
`menu-bar-icon.png` and the web icons in `public/` (`--web`) are made
from the same drawing and never edited by hand. The web app draws the ball
from the same numbers in `src/lib/brand/sphere.ts`. Its share image and the
landing pages still show the old knot and orange. The pick is provisional: the
maintainer may still change the mark or the tile colour.
