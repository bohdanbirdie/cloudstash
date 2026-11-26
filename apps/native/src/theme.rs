//! Cloudstash's colour tokens in OKLCH: pure greys, one blue accent used rarely, red for destructive
//! actions, green and amber for status. Before adding or using a colour, read the rules in
//! `context/01-product/spec.md` § Colour and Depth (why: `.decisions/0002-use-greys-with-one-blue-accent.md` there).
//! `_10` and `_20` are the same colour at 10% and 20% opacity.

use rune::{Color, oklch, oklcha};

/// Some tokens have no consumer yet; they are here so new surfaces take colours from one place.
#[allow(dead_code)]
#[derive(Clone, Copy, Debug)]
pub struct Palette {
    pub background: Color,
    pub card: Color,
    pub card_foreground: Color,
    pub foreground_10: Color,
    /// The one filled main action, and "on" states. White text passes 4.5:1 on it.
    pub primary: Color,
    pub primary_foreground: Color,
    /// Top and bottom of the main button's barely visible gradient.
    pub primary_top: Color,
    pub primary_bottom: Color,
    /// The accent as text or an icon directly on the background.
    pub accent_text: Color,
    pub accent_tint: Color,
    pub muted: Color,
    pub muted_foreground: Color,
    pub hint_foreground: Color,
    /// Destructive text and icons on the background.
    pub destructive: Color,
    pub destructive_10: Color,
    pub destructive_20: Color,
    /// A filled destructive button and its label.
    pub destructive_fill: Color,
    pub destructive_fill_foreground: Color,
    pub success: Color,
    pub warning: Color,
    pub border: Color,
    pub selected: Color,
    pub field: Color,
    /// The outline button's fill: none on light, a faint white on dark.
    pub outline_fill: Color,
}

pub fn palette(dark: bool) -> Palette {
    if dark {
        Palette {
            background: oklch(0.15, 0.0, 0.0),
            card: oklch(0.19, 0.0, 0.0),
            card_foreground: oklch(0.93, 0.0, 0.0),
            foreground_10: oklcha(0.93, 0.0, 0.0, 0.1),
            primary: oklch(0.545, 0.19, 254.0),
            primary_foreground: oklch(0.99, 0.0, 0.0),
            primary_top: oklch(0.56, 0.19, 254.0),
            primary_bottom: oklch(0.53, 0.19, 254.0),
            accent_text: oklch(0.73, 0.14, 254.0),
            accent_tint: oklcha(0.73, 0.14, 254.0, 0.16),
            muted: oklch(0.24, 0.0, 0.0),
            muted_foreground: oklch(0.72, 0.0, 0.0),
            hint_foreground: oklch(0.6, 0.0, 0.0),
            destructive: oklch(0.74, 0.16, 25.0),
            destructive_10: oklcha(0.74, 0.16, 25.0, 0.1),
            destructive_20: oklcha(0.74, 0.16, 25.0, 0.2),
            destructive_fill: oklch(0.62, 0.2, 25.0),
            destructive_fill_foreground: oklch(0.99, 0.0, 0.0),
            success: oklch(0.78, 0.15, 155.0),
            warning: oklch(0.82, 0.14, 80.0),
            border: oklcha(1.0, 0.0, 0.0, 0.08),
            selected: oklcha(1.0, 0.0, 0.0, 0.07),
            field: oklcha(1.0, 0.0, 0.0, 0.05),
            outline_fill: oklcha(1.0, 0.0, 0.0, 0.15 * 0.3),
        }
    } else {
        Palette {
            background: oklch(0.985, 0.0, 0.0),
            card: oklch(1.0, 0.0, 0.0),
            card_foreground: oklch(0.2, 0.0, 0.0),
            foreground_10: oklcha(0.2, 0.0, 0.0, 0.1),
            primary: oklch(0.545, 0.19, 254.0),
            primary_foreground: oklch(0.99, 0.0, 0.0),
            primary_top: oklch(0.56, 0.19, 254.0),
            primary_bottom: oklch(0.53, 0.19, 254.0),
            accent_text: oklch(0.5, 0.19, 254.0),
            accent_tint: oklcha(0.5, 0.19, 254.0, 0.16),
            muted: oklch(0.97, 0.0, 0.0),
            muted_foreground: oklch(0.44, 0.0, 0.0),
            hint_foreground: oklch(0.52, 0.0, 0.0),
            destructive: oklch(0.52, 0.2, 27.0),
            destructive_10: oklcha(0.52, 0.2, 27.0, 0.1),
            destructive_20: oklcha(0.52, 0.2, 27.0, 0.2),
            destructive_fill: oklch(0.53, 0.21, 27.0),
            destructive_fill_foreground: oklch(0.99, 0.0, 0.0),
            success: oklch(0.48, 0.13, 155.0),
            warning: oklch(0.5, 0.11, 70.0),
            border: oklcha(0.0, 0.0, 0.0, 0.08),
            selected: oklcha(0.0, 0.0, 0.0, 0.06),
            field: oklcha(0.0, 0.0, 0.0, 0.045),
            outline_fill: Color::TRANSPARENT,
        }
    }
}

/// A Space's colour from its hue. Every hue gets the same lightness, so no Space is louder than another.
pub fn space(dark: bool, hue: f32) -> Color {
    if dark { oklch(0.74, 0.13, hue) } else { oklch(0.6, 0.15, hue) }
}
