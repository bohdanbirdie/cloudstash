# Bound the native app's decoded pictures by memory

Status: accepted

## Context

The native app (`apps/native`) draws a picture and a site icon on every card. It
downloads each one once, shrinks it to the size it is drawn (800×550 and 28×28
pixels) and saves a small JPEG or PNG copy in the library's folder. Decoded
pictures are kept in memory so the grid does not reload them while scrolling.
That memory cache first held the 120 pictures loaded earliest, whatever their
size or use, so a large window that showed more than that could drop pictures
still on screen. The app also used about 500 MB, which the maintainer wanted
explained and kept down without visible loading on a fast scroll.

## Evidence and Argument

Loading a saved copy back takes about 1 ms. Over the 745 saved pictures of the
maintainer's library, the median was 0.9 to 1.1 ms, the 95th percentile under
2 ms and the slowest 4.2 ms, in debug and release builds alike, because the
crate optimizes dependencies in debug builds. Site icons took about 0.2 ms.
These are single local runs on a warm disk. A card picture is about 1.7 MB
decoded, so memory, not count, is what the cache should bound.

macOS `footprint` and `heap` showed where the memory goes once the app settles,
at about 420 MB: the decoded pictures, Rune's CPU image atlas in 4 MB pages
(about 46 MB), graphics memory for the window and uploaded pictures (about
60 MB), and freed memory that the system allocator keeps (about 160 MB). Rune's
`Pixels` keep their RGBA bytes so the atlas can copy them in again after
recycling a page, and Rune exposes no way to release them, so a picture on
screen is held three times. Graphics memory is a few hundred MB higher for the
first minute or two after launch, then falls back without the app's help.

## Options

| Option                                            | Tradeoffs                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Keep a count of the earliest-loaded pictures      | Simple, but blind to size and use, and can drop pictures on screen                                   |
| Bound decoded pictures by bytes, least recent out | Predictable memory; a picture scrolled back into view reloads from disk in about 1 ms                |
| Release our copy once Rune uploads it             | Would save most of the cache, but Rune keeps its own copy and offers no way to drop it               |
| Store smaller copies                              | Saves memory, but cards draw up to about 950 pixels wide on a Retina screen, so 800 is near the need |

## Decision

Keep at most 80 MB of decoded pictures (`MEMORY` in `apps/native/src/images/mod.rs`),
about 45 card pictures. Past the limit, drop the least recently drawn first,
never one on screen or still downloading, since a download fills the pixels it
finds in the cache. The maintainer tried 150 MB and 80 MB on the real library
and saw no loading on a fast scroll at 80 MB. Keep saved copies at their drawn
size. Revisit if Rune gains a way to release uploaded pixels, or if the
allocator's retained memory becomes worth an allocator change.
