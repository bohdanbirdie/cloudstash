//! The web app's colour tokens from `src/styles.css` (`:root` and `.dark`), in their original OKLCH.

use rune::{Color, oklch, oklcha};

#[derive(Clone, Copy, Debug)]
pub struct Palette {
    pub background: Color,
    pub foreground: Color,
    pub card: Color,
    pub card_foreground: Color,
    pub card_ring: Color,
    pub primary: Color,
    pub primary_foreground: Color,
    pub muted_foreground: Color,
    pub destructive: Color,
    pub border: Color,
    pub outline_fill: Color,
}

pub fn palette(dark: bool) -> Palette {
    if dark {
        Palette {
            background: oklch(0.141, 0.005, 285.823),
            foreground: oklch(0.985, 0.0, 0.0),
            card: oklch(0.21, 0.006, 285.885),
            card_foreground: oklch(0.985, 0.0, 0.0),
            card_ring: oklcha(0.985, 0.0, 0.0, 0.1),
            primary: oklch(0.55, 0.18, 38.0),
            primary_foreground: oklch(0.98, 0.016, 73.684),
            muted_foreground: oklch(0.705, 0.015, 286.067),
            destructive: oklch(0.704, 0.191, 22.216),
            border: oklcha(1.0, 0.0, 0.0, 0.1),
            outline_fill: oklcha(1.0, 0.0, 0.0, 0.15 * 0.3),
        }
    } else {
        Palette {
            background: oklch(1.0, 0.0, 0.0),
            foreground: oklch(0.141, 0.005, 285.823),
            card: oklch(1.0, 0.0, 0.0),
            card_foreground: oklch(0.141, 0.005, 285.823),
            card_ring: oklcha(0.141, 0.005, 285.823, 0.1),
            primary: oklch(0.61, 0.22, 39.0),
            primary_foreground: oklch(0.98, 0.016, 73.684),
            muted_foreground: oklch(0.552, 0.016, 285.938),
            destructive: oklch(0.577, 0.245, 27.325),
            border: oklch(0.92, 0.004, 286.32),
            outline_fill: Color::TRANSPARENT,
        }
    }
}
