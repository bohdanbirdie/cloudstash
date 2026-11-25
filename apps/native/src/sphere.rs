//! The logo, drawn by the app: a ball of dots lit from the top left. [`live`] is the ball alone,
//! turning slowly, following the pointer and swelling under it; [`tile`] is the app icon, the ball at
//! rest in a round well on a black tile. scripts/brand.py draws the same shapes for the icon files.

use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use rune::{Color, El, FrameEncoded, Live, LoopSpec, Shadow, Tx, el, oklch, oklcha};

const DOTS: usize = 150;
/// The golden angle, which spreads the dots evenly.
const TURN: f32 = 2.399_96;
const TILT: f32 = 0.5;
const LIGHT: [f32; 3] = [-0.42, -0.62, 0.66];
/// Radians a second: at rest, and while something is under way.
const IDLE: f32 = 0.22;
const BUSY: f32 = 1.3;

/// Dot `i`'s place on a ball of radius 1 turned by `yaw` and tipped by `tilt`: x right, y down, z toward the viewer.
fn place(i: usize, yaw: f32, tilt: f32) -> [f32; 3] {
    let y0 = 1.0 - 2.0 * (i as f32 + 0.5) / DOTS as f32;
    let ring = (1.0 - y0 * y0).sqrt();
    let angle = i as f32 * TURN + yaw;
    let (x, z0) = (ring * angle.cos(), ring * angle.sin());
    [x, y0 * tilt.cos() - z0 * tilt.sin(), y0 * tilt.sin() + z0 * tilt.cos()]
}

/// How bright the light leaves a dot, and how big it looks from the front.
fn lit([x, y, z]: [f32; 3]) -> (f32, f32) {
    let light = (x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]).max(0.0);
    (0.1 + 0.9 * light.powf(1.15), 0.3 + 0.7 * z.max(0.0))
}

struct Dot {
    rect: Live<[f32; 4]>,
    alpha: Live<f32>,
}

fn dots() -> &'static [Dot] {
    static DOTS_LIVE: OnceLock<Vec<Dot>> = OnceLock::new();
    DOTS_LIVE.get_or_init(|| (0..DOTS).map(|_| Dot { rect: Live::new([0.0; 4]), alpha: Live::new(0.0) }).collect())
}

struct Motion {
    last: Option<Instant>,
    yaw: f32,
    speed: f32,
    /// How far the ball has turned toward the pointer, sideways and up or down.
    look: [f32; 2],
    /// 1 while the pointer is over the ball.
    hover: f32,
    size: f32,
    busy: bool,
    shown: bool,
    /// The ball's box and the pointer, in window points.
    rect: [f32; 4],
    pointer: Option<[f32; 2]>,
}

fn motion() -> &'static Mutex<Motion> {
    static MOTION: OnceLock<Mutex<Motion>> = OnceLock::new();
    MOTION.get_or_init(|| {
        Mutex::new(Motion {
            last: None,
            yaw: 0.0,
            speed: IDLE,
            look: [0.0; 2],
            hover: 0.0,
            size: 64.0,
            busy: false,
            shown: false,
            rect: [0.0; 4],
            pointer: None,
        })
    })
}

impl Motion {
    fn paint(&self) {
        let (half, radius, base) = (self.size / 2.0, self.size * 56.0 / 120.0, self.size * 5.83 / 120.0);
        // The pointer from the ball's centre, in the ball's own points.
        let pointer = self.pointer.map(|[x, y]| [x - self.rect[0] - self.rect[2] / 2.0, y - self.rect[1] - self.rect[3] / 2.0]);
        for (i, dot) in dots().iter().enumerate() {
            let at = place(i, self.yaw - self.look[0], TILT - self.look[1]);
            let (light, near) = lit(at);
            let (x, y) = (radius * at[0], radius * at[1]);
            let swell = pointer.map_or(0.0, |[px, py]| self.hover * (-((x - px).powi(2) + (y - py).powi(2)) / (0.4 * radius).powi(2)).exp());
            let r = base * near * (1.0 + 0.5 * swell);
            // Dots fade in as they come round the edge instead of popping.
            let front = ((at[2] - 0.02) / 0.23).clamp(0.0, 1.0);
            dot.rect.set([half + x - r, half + y - r, 2.0 * r, 2.0 * r]);
            dot.alpha.set(front * front * (3.0 - 2.0 * front) * (light + 0.6 * swell).min(1.0));
        }
    }
}

/// Moves the ball on; call it for every frame (`AppSpec::on_frame_encoded`).
pub fn frame(f: &FrameEncoded) {
    let mut m = motion().lock().expect("the logo's motion");
    if !m.shown {
        m.last = None;
        return;
    }
    let dt = m.last.map_or(0.0, |last| f.at().duration_since(last).as_secs_f32()).min(0.05);
    m.last = Some(f.at());
    let ease = |rate: f32| (rate * dt).min(1.0);
    let centre = [m.rect[0] + m.rect[2] / 2.0, m.rect[1] + m.rect[3] / 2.0];
    let away = m.pointer.map(|[x, y]| [x - centre[0], y - centre[1]]);
    let over = away.is_some_and(|[x, y]| x.hypot(y) < m.size * 0.6);
    let want = away.map_or([0.0; 2], |[x, y]| [(x / 260.0).clamp(-1.0, 1.0) * 0.9, (y / 260.0).clamp(-1.0, 1.0) * 0.55]);
    let speed = if m.busy { BUSY } else { IDLE };
    m.speed += (speed - m.speed) * ease(2.5);
    m.yaw = (m.yaw + m.speed * dt) % std::f32::consts::TAU;
    m.look = [m.look[0] + (want[0] - m.look[0]) * ease(7.0), m.look[1] + (want[1] - m.look[1]) * ease(7.0)];
    m.hover += (f32::from(u8::from(over)) - m.hover) * ease(9.0);
    m.paint();
}

/// Where the pointer is in the window, or `None` once it has left.
pub fn pointer(at: Option<[f32; 2]>) {
    motion().lock().expect("the logo's motion").pointer = at;
}

/// Call before building a view, so the ball rests while no screen shows it.
pub fn hide() {
    motion().lock().expect("the logo's motion").shown = false;
}

/// The logo, `size` points across in `ink`. It turns faster while `busy`.
pub fn live<S: 'static>(size: f32, ink: Color, busy: bool) -> El {
    {
        let mut m = motion().lock().expect("the logo's motion");
        (m.size, m.busy, m.shown) = (size, busy, true);
        m.paint();
    }
    let ball = dots().iter().fold(el().key("logo").role("img").label("Cloudstash").size(size, size), |ball, dot| {
        ball.child(
            el().pin(Some(0.0), Some(0.0), None, None)
                .size(size / 8.0, size / 8.0)
                .radius(size)
                .fill(ink)
                .live_rect(&dot.rect)
                .live_opacity(&dot.alpha),
        )
    });
    // The looping speck keeps frames coming, as a spinner would.
    ball.child(el().size(1.0, 1.0).looping(LoopSpec::rotation(1.0))).on_layout_tx(|_: &mut S, rect, tx: &mut Tx| {
        motion().lock().expect("the logo's motion").rect = rect;
        tx.live_only();
    })
}

/// The app icon, `size` points across: the ball at rest in its well, on the black tile.
pub fn tile(size: f32) -> El {
    let unit = size / 108.0;
    let grey = |l: f32| oklch(l, 0.004, 286.0);
    let well = |r: f32, top: f32, bottom: f32| {
        let (d, inset) = (2.0 * r * unit, size / 2.0 - r * unit);
        el().pin(Some(inset), Some(inset), None, None)
            .size(d, d)
            .radius(d / 2.0)
            .gradient(grey(top), grey(bottom))
            .box_shadow(Shadow { y: 1.1 * unit, color: oklcha(1.0, 0.0, 0.0, 0.13), ..Shadow::default() })
            .box_shadow(Shadow { y: -0.7 * unit, color: oklcha(0.0, 0.0, 0.0, 0.5), ..Shadow::default() })
    };
    let (radius, base) = (24.0 * unit, 2.5 * unit);
    let tile = el()
        .key("app-icon")
        .role("img")
        .label("Cloudstash")
        .size(size, size)
        .radius(size * 0.225)
        .continuous_corners()
        .gradient(grey(0.295), grey(0.15))
        .box_shadow(Shadow { y: size / 82.4, blur: size / 82.4, color: oklcha(0.0, 0.0, 0.0, 0.3), ..Shadow::default() })
        .child(well(43.0, 0.12, 0.215))
        .child(well(33.0, 0.1, 0.18));
    (0..DOTS).map(|i| place(i, 0.0, TILT)).filter(|at| at[2] >= 0.04).fold(tile, |tile, at| {
        let (light, near) = lit(at);
        let r = base * near;
        tile.child(
            el().pin(Some(size / 2.0 + radius * at[0] - r), Some(size / 2.0 + radius * at[1] - r), None, None)
                .size(2.0 * r, 2.0 * r)
                .radius(r)
                .fill(oklcha(1.0, 0.0, 0.0, light)),
        )
    })
}
