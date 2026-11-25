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

The logo is a ball of dots, lit from the top left, resting in a round well. The
app icon puts it on a black tile in Apple's Mac icon shape (an 824 tile on a
1024 canvas). Small one-colour uses, such as the menu bar and the sign-in
screen, draw the well as a ring with fewer, bigger dots in the foreground grey.
Black and white only; the blue accent is not used in the logo.

`apps/native/scripts/brand.py` draws every version. The SVGs it writes to
`apps/native/assets/brand/` are the originals; `AppIcon.icns` and
`menu-bar-icon.png` are made from them and never edited by hand. The web app
still shows the knot until it is moved over. The pick is provisional: the
maintainer may still change the mark or the tile colour.
