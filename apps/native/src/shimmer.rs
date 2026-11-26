//! A line of text a soft light sweeps across: it says something is under way without a spinner,
//! a bar or a number. The text sits in `dim`; a brighter copy shows through a narrow window that
//! slides left to right over it. Each sweep travels twice the text box's width, so the light rests
//! off the text half the time. Reduce Motion holds a sweep at its midpoint, which is just past the
//! text, so there the line stays plain and still.

use rune::{Color, Easing, El, LoopSpec, TextStyle, el, row, text};

/// Points the light is wide, and points a second it travels.
const BAND: f32 = 56.0;
const SPEED: f32 = 110.0;

/// `label` in a box `width` points wide: centred, or against its right edge when `end`.
pub fn shimmer(key: &'static str, label: &'static str, style: TextStyle, width: f32, end: bool, dim: Color, lit: Color) -> El {
    let line = |color: Color| {
        let line = row().w(width).child(text(label).font(style).color(color));
        if end { line.justify_end() } else { line.justify_center() }
    };
    let (from, to) = (-BAND, 2.0 * width + BAND);
    let sweep = |a: f32, b: f32| LoopSpec::slide(f64::from((to - from) / SPEED), [a, 0.0], [b, 0.0]).easing(Easing::LINEAR);
    // The window slides one way and the copy inside it the other, so the copy stays on the text.
    let copy = el().absolute(0.0, 0.0).w(BAND).h_full().looping(sweep(-from / BAND, -to / BAND)).child(line(lit).absolute(0.0, 0.0));
    let light = el()
        .absolute(0.0, 0.0)
        .w(BAND)
        .h_full()
        .clip_fade(BAND / 2.0, 0.0, BAND / 2.0, 0.0)
        .looping(sweep(from / BAND, to / BAND))
        .a11y_hidden()
        .child(copy);
    row().key(key).child(line(dim)).child(light)
}
