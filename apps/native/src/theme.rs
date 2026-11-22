//! The web app's colour tokens from `src/styles.css` (`:root` and `.dark`), in their original OKLCH.
//! `_10`, `_20` and `_50` are Tailwind opacity modifiers (`bg-muted/50`, `ring-foreground/10`).

use rune::{Color, oklch, oklcha};

#[derive(Clone, Copy, Debug)]
pub struct Palette {
    pub card: Color,
    pub card_foreground: Color,
    pub foreground_10: Color,
    pub primary: Color,
    pub primary_foreground: Color,
    pub muted: Color,
    pub muted_50: Color,
    pub muted_foreground: Color,
    pub destructive: Color,
    pub destructive_10: Color,
    pub destructive_20: Color,
    pub border: Color,
    /// The outline button's fill: none on light, `dark:bg-input/30` on dark.
    pub outline_fill: Color,
}

pub fn palette(dark: bool) -> Palette {
    if dark {
        Palette {
            card: oklch(0.21, 0.006, 285.885),
            card_foreground: oklch(0.985, 0.0, 0.0),
            foreground_10: oklcha(0.985, 0.0, 0.0, 0.1),
            primary: oklch(0.55, 0.18, 38.0),
            primary_foreground: oklch(0.98, 0.016, 73.684),
            muted: oklch(0.274, 0.006, 286.033),
            muted_50: oklcha(0.274, 0.006, 286.033, 0.5),
            muted_foreground: oklch(0.705, 0.015, 286.067),
            destructive: oklch(0.704, 0.191, 22.216),
            destructive_10: oklcha(0.704, 0.191, 22.216, 0.1),
            destructive_20: oklcha(0.704, 0.191, 22.216, 0.2),
            border: oklcha(1.0, 0.0, 0.0, 0.1),
            outline_fill: oklcha(1.0, 0.0, 0.0, 0.15 * 0.3),
        }
    } else {
        Palette {
            card: oklch(1.0, 0.0, 0.0),
            card_foreground: oklch(0.141, 0.005, 285.823),
            foreground_10: oklcha(0.141, 0.005, 285.823, 0.1),
            primary: oklch(0.61, 0.22, 39.0),
            primary_foreground: oklch(0.98, 0.016, 73.684),
            muted: oklch(0.967, 0.001, 286.375),
            muted_50: oklcha(0.967, 0.001, 286.375, 0.5),
            muted_foreground: oklch(0.552, 0.016, 285.938),
            destructive: oklch(0.577, 0.245, 27.325),
            destructive_10: oklcha(0.577, 0.245, 27.325, 0.1),
            destructive_20: oklcha(0.577, 0.245, 27.325, 0.2),
            border: oklch(0.92, 0.004, 286.32),
            outline_fill: Color::TRANSPARENT,
        }
    }
}
