//! The logo, drawn by the app: a ball of dots lit from the top left. [`live`] is the ball alone,
//! turning slowly, leaning toward a pointer that comes near, and turned by hand with a drag; [`tile`] is the app icon, the ball at
//! rest in a round well on a black tile. scripts/brand.py draws the same shapes for the icon files.

use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use rune::{Color, Cursor, Drag, El, FrameEncoded, Live, LoopSpec, Phase, Shadow, Tx, el, oklch, oklcha};

const DOTS: usize = 150;
/// The golden angle, which spreads the dots evenly.
const TURN: f32 = 2.399_96;
const TILT: f32 = 0.5;
const LIGHT: [f32; 3] = [-0.42, -0.62, 0.66];
/// Radians a second: at rest, and while something is under way.
const IDLE: f32 = 0.45;
const BUSY: f32 = 1.3;
/// It never turns slower than this on its own: a crawl makes the dots shimmer.
const SLOWEST: f32 = 0.3;

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
    /// How far a drag has tipped the ball; it rights itself afterwards.
    pitch: f32,
    /// The pointer's travel at the last step of a drag, while one is on.
    drag: Option<[f32; 2]>,
    /// The turn at the last frame, to measure a drag's speed.
    turned: f32,
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
            pitch: 0.0,
            drag: None,
            turned: 0.0,
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
        for (i, dot) in dots().iter().enumerate() {
            let at = place(i, self.yaw - self.look[0], TILT - self.look[1] - self.pitch);
            let (light, near) = lit(at);
            let (x, y) = (radius * at[0], radius * at[1]);
            let r = base * near;
            // Dots fade in as they come round the edge instead of popping.
            let front = ((at[2] - 0.02) / 0.23).clamp(0.0, 1.0);
            dot.rect.set([half + x - r, half + y - r, 2.0 * r, 2.0 * r]);
            dot.alpha.set(front * front * (3.0 - 2.0 * front) * light);
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
    if m.drag.is_some() {
        // The hand turns it; remember how fast, so it keeps going when let go.
        if dt > 0.0 {
            m.speed += ((m.yaw - m.turned) / dt - m.speed) * 0.35;
        }
        m.look = [m.look[0] * (1.0 - ease(7.0)), m.look[1] * (1.0 - ease(7.0))];
    } else {
        // It leans toward a pointer within about two and a half of its radii, less the farther off.
        let radius = m.size * 56.0 / 120.0;
        let want = m.pointer.map_or([0.0; 2], |[px, py]| {
            let (x, y) = (px - m.rect[0] - m.rect[2] / 2.0, py - m.rect[1] - m.rect[3] / 2.0);
            let far = ((x.hypot(y) / radius - 1.25) / 1.5).clamp(0.0, 1.0);
            let pull = 1.0 - far * far * (3.0 - 2.0 * far);
            [x / (2.75 * radius) * 0.8 * pull, y / (2.75 * radius) * 0.5 * pull]
        });
        let speed = if m.busy { BUSY } else { IDLE };
        m.speed += (speed - m.speed) * ease(1.4);
        // Let go while turning backwards, it slows, then picks up forwards without crawling through a stop.
        if m.speed.abs() < SLOWEST {
            m.speed = SLOWEST;
        }
        m.yaw += m.speed * dt;
        m.pitch *= 1.0 - ease(1.2);
        m.look = [m.look[0] + (want[0] - m.look[0]) * ease(7.0), m.look[1] + (want[1] - m.look[1]) * ease(7.0)];
        // The last of an ease is a crawl too: land once it is within a hair.
        if (want[0] - m.look[0]).hypot(want[1] - m.look[1]) < 0.004 {
            m.look = want;
        }
        if m.pitch.abs() < 0.004 {
            m.pitch = 0.0;
        }
    }
    m.turned = m.yaw;
    m.paint();
}

/// Where the pointer is in the window, or `None` once it has left.
pub fn pointer(at: Option<[f32; 2]>) {
    motion().lock().expect("the logo's motion").pointer = at;
}

/// A drag on the ball turns it: sideways about its axis, up and down by tipping it.
fn drag(d: &Drag) {
    let mut m = motion().lock().expect("the logo's motion");
    let radius = m.size * 56.0 / 120.0;
    match (d.phase, m.drag) {
        (Phase::Down, _) => m.drag = Some([0.0; 2]),
        (Phase::Move, Some([x, y])) => {
            m.yaw -= (d.dx - x) / radius;
            m.pitch = (m.pitch + (d.dy - y) / radius).clamp(-1.2, 1.2);
            m.drag = Some([d.dx, d.dy]);
            m.paint();
        }
        _ => m.drag = None,
    }
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
    // The dots glide between pixels; snapped to whole ones they shimmer at slow speeds.
    let ball = ball.pixel_snap(false);
    // The looping speck keeps frames coming, as a spinner would.
    ball.child(el().size(1.0, 1.0).looping(LoopSpec::rotation(1.0)))
        .cursor(Cursor::Grab)
        .on_drag_any(|d, tx| {
            drag(d);
            tx.live_only();
        })
        .on_layout_tx(|_: &mut S, rect, tx: &mut Tx| {
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
