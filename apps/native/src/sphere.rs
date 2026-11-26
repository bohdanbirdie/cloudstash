//! The logo, drawn by the app: a ball of dots lit from the top left. [`live`] is the ball alone,
//! turning slowly, leaning toward a pointer that comes near, and turned by hand with a drag; [`opening`] is the ball growing while the library opens and then opening into the grid; [`tile`] is the app icon, the ball at
//! rest in a round well on a black tile. scripts/brand.py draws the same shapes for the icon files.

use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use rune::{Color, Cursor, Drag, El, FrameEncoded, Live, LoopSpec, Phase, Shadow, Tx, el, oklch, oklcha, row};

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
    intro: Option<Intro>,
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
            intro: None,
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

/// Moves the ball on; call it for every frame (`AppSpec::on_frame_encoded`). A headless run draws frames as
/// fast as it can, so it passes the `step` each one stands for instead of the clock's.
pub fn frame(f: &FrameEncoded, step: Option<f32>) {
    let mut m = motion().lock().expect("the logo's motion");
    if !m.shown {
        m.last = None;
        return;
    }
    let dt = step.unwrap_or_else(|| m.last.map_or(0.0, |last| f.at().duration_since(last).as_secs_f32()).min(0.05));
    m.last = Some(f.at());
    if m.intro.is_some() {
        let done = m.open(dt);
        m.turned = m.yaw;
        drop(m);
        if done && let Some(opened) = OPENED.get() {
            opened();
        }
        return;
    }
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

/// How many cards' pictures the opening can carry.
const SLOTS: usize = 60;
/// Seconds: how slowly the ball grows, the least it turns before opening, how long pictures ride it, and
/// the pull of each picture toward its card with how long that pull takes to come on.
const GROW: f32 = 4.0;
const LEAST: f32 = 0.6;
const RIDE: f32 = 1.4;
const PULL: f32 = 5.5;
const RAMP: f32 = 0.45;
/// While the library takes its time, a line under the ball says what's happening: it waits this many
/// seconds, so a quick download shows nothing extra, then fades in over `CAPTION_IN`.
const CAPTION_AFTER: f32 = 0.8;
const CAPTION_IN: f32 = 0.3;
const CAPTION_OUT: f32 = 0.2;
/// Points from the bottom of the ball, grown as big as it gets, to the line.
const CAPTION_GAP: f32 = 28.0;

/// How visible the line under the ball is `t` seconds into the opening, the links having arrived at
/// `loaded`: hidden at first, faded in once the wait drags on, faded out as soon as they're here.
fn caption_alpha(t: f32, loaded: Option<f32>) -> f32 {
    let until = loaded.unwrap_or(t).min(t);
    smooth(CAPTION_AFTER, CAPTION_AFTER + CAPTION_IN, until) * (1.0 - smooth(until, until + CAPTION_OUT, t))
}

fn smooth(from: f32, to: f32, x: f32) -> f32 {
    let x = ((x - from) / (to - from)).clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

fn mix(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

/// What the opening draws besides the dots: the cover over the window, a picture per card, and how
/// visible the grid's own pictures are (hidden while their copies fly).
struct Stage {
    cover: Live<f32>,
    reveal: Live<f32>,
    slots: Vec<Dot>,
    /// The line under the ball: how far down it sits, and how visible it is.
    caption_at: Live<[f32; 2]>,
    caption_alpha: Live<f32>,
}

fn stage() -> &'static Stage {
    static STAGE: OnceLock<Stage> = OnceLock::new();
    STAGE.get_or_init(|| Stage {
        cover: Live::new(0.0),
        reveal: Live::new(1.0),
        slots: (0..SLOTS).map(|_| Dot { rect: Live::new([0.0; 4]), alpha: Live::new(0.0) }).collect(),
        caption_at: Live::new([0.0; 2]),
        caption_alpha: Live::new(0.0),
    })
}

/// A card's picture on its way from a dot to its card.
struct Flying {
    slot: usize,
    home: [f32; 4],
    /// When it appears among the others, 0 first to 1 last.
    order: f32,
    at: [f32; 2],
    speed: [f32; 2],
    size: [f32; 2],
    alpha: f32,
    /// Its width, height and opacity when the ball let go, and how far it then was from its card.
    let_go: [f32; 4],
}

/// The ball opening into the grid: from `at` seconds the pictures ride it, then fly home.
struct Unwrap {
    at: f32,
    turn: f32,
    centre_from: [f32; 2],
    centre: [f32; 2],
    /// A picture's width on the ball, in radii.
    width: f32,
    cards: Vec<Flying>,
    /// Which card rides each dot.
    rider: Vec<Option<usize>>,
    let_go: bool,
}

/// The ball growing while the library opens, then opening into it.
struct Intro {
    t: f32,
    /// Where the ball was and its radius when this began.
    from: Option<[f32; 3]>,
    window: [f32; 2],
    /// The cards that have a picture slot, and where the grid drew each.
    ids: Vec<String>,
    homes: Vec<Option<[f32; 4]>>,
    /// When the library's links arrived.
    loaded: Option<f32>,
    unwrap: Option<Unwrap>,
    /// How far the grid is scrolled, once it has said.
    scroll: Option<f32>,
    /// When the person began to scroll: from then the opening hurries to its end.
    hurry: Option<f32>,
}

impl Intro {
    /// Gives each card on screen the dot that will be nearest it when the ball lets go, `RIDE` seconds on.
    fn unwrap(&self, yaw: f32, turn: f32, centre: [f32; 2]) -> Unwrap {
        let [w, h] = self.window;
        let seen: Vec<(usize, [f32; 4])> =
            self.homes.iter().enumerate().filter_map(|(i, r)| r.map(|r| (i, r))).filter(|(_, r)| r[1] < h && r[1] + r[3] > 0.0 && r[0] < w).collect();
        let mut unwrap =
            Unwrap { at: self.t, turn, centre_from: centre, centre, width: 0.2, cards: Vec::new(), rider: vec![None; DOTS], let_go: false };
        if seen.is_empty() {
            return unwrap;
        }
        let edge = |pick: fn(f32, f32) -> f32, of: fn(&[f32; 4]) -> f32, start: f32| seen.iter().fold(start, |a, (_, r)| pick(a, of(r)));
        let (x0, x1) = (edge(f32::min, |r| r[0], f32::MAX), edge(f32::max, |r| r[0] + r[2], f32::MIN));
        let (y0, y1) = (edge(f32::min, |r| r[1], f32::MAX), edge(f32::max, |r| r[1] + r[3], f32::MIN));
        let count = |of: fn(&[f32; 4]) -> f32| {
            let mut all: Vec<i32> = seen.iter().map(|(_, r)| of(r).round() as i32).collect();
            all.sort_unstable();
            all.dedup();
            all.len() as f32
        };
        // It stays in the middle of the window, not of the grid beside the sidebar.
        unwrap.centre = [w / 2.0, h / 2.0];
        unwrap.width = (1.55 / count(|r| r[0]).max(count(|r| r[1]) * 1.25)).min(0.34);
        // Each card's place on the face of the ball, the grid squeezed into a disc.
        let mut wants: Vec<(usize, [f32; 4], [f32; 2])> = seen
            .into_iter()
            .map(|(slot, r)| {
                let u = (r[0] + r[2] / 2.0 - (x0 + x1) / 2.0) / ((x1 - x0) / 2.0).max(1.0);
                let v = (r[1] + r[3] / 2.0 - (y0 + y1) / 2.0) / ((y1 - y0) / 2.0).max(1.0);
                (slot, r, [0.84 * u * (1.0 - v * v / 2.0).sqrt(), 0.84 * v * (1.0 - u * u / 2.0).sqrt()])
            })
            .collect();
        wants.sort_by(|a, b| a.2[0].hypot(a.2[1]).total_cmp(&b.2[0].hypot(b.2[1])));
        let mut free: Vec<(usize, [f32; 3])> = (0..DOTS).map(|i| (i, place(i, yaw + turn * RIDE, TILT))).filter(|(_, at)| at[2] > 0.12).collect();
        for (slot, home, want) in wants {
            let near = |at: &[f32; 3]| (at[0] - want[0]).powi(2) + (at[1] - want[1]).powi(2);
            let Some(best) = (0..free.len()).min_by(|&a, &b| near(&free[a].1).total_cmp(&near(&free[b].1))) else { break };
            let (dot, _) = free.swap_remove(best);
            unwrap.rider[dot] = Some(unwrap.cards.len());
            let chance = ((slot as f32 * 127.1 + 3.3).sin() * 43_758.547).rem_euclid(1.0);
            unwrap.cards.push(Flying { slot, home, order: chance, at: [0.0; 2], speed: [0.0; 2], size: [0.0; 2], alpha: 0.0, let_go: [0.0; 4] });
        }
        unwrap
    }
}

impl Motion {
    /// Moves the opening on by `dt` seconds and says whether it has finished.
    fn open(&mut self, dt: f32) -> bool {
        let Some(mut i) = self.intro.take() else { return false };
        i.t += dt;
        let ease = (7.0 * dt).min(1.0);
        (self.look, self.pitch) = ([self.look[0] * (1.0 - ease), self.look[1] * (1.0 - ease)], self.pitch * (1.0 - ease));
        let [w, h] = i.window;
        let small = i.from.map_or(45.0, |f| f[2]);
        // A wait that drags on shows a modest ball with a line under it, not one that fills the window.
        let big = (0.24 * w.min(h)).max(small);
        let (mut centre, radius) = if w > 0.0 {
            let mid = [w / 2.0, h / 2.0];
            let (start, k) = (i.from.map_or(mid, |f| [f[0], f[1]]), smooth(0.0, 0.7, i.t));
            ([mix(start[0], mid[0], k), mix(start[1], mid[1], k)], big - (big - small) * (-i.t / GROW).exp())
        } else {
            (i.from.map_or([0.0; 2], |f| [f[0], f[1]]), if i.from.is_some() { small } else { 0.0 })
        };
        // It opens once it has turned a little, the links are here and the grid has said where its cards are.
        let placed = i.loaded.is_some_and(|at| i.t >= at + 0.5 || (i.t >= at + 0.2 && i.homes.iter().any(Option::is_some)));
        if i.unwrap.is_none() && w > 0.0 && i.t >= LEAST && placed {
            (self.look, self.pitch) = ([0.0; 2], 0.0);
            i.unwrap = Some(i.unwrap(self.yaw, self.speed, centre));
        }
        if i.hurry.is_some()
            && let Some(u) = &mut i.unwrap
        {
            // No more riding round: the ball lets go now.
            u.at = u.at.min(i.t - RIDE);
        }
        let since = i.unwrap.as_ref().map_or(-1.0, |u| i.t - u.at);
        let hurried = i.hurry.map(|at| i.t - at);
        let (riding, flown) = (since < RIDE, (since - RIDE).max(0.0));
        match &i.unwrap {
            Some(u) => {
                let k = smooth(0.0, RIDE, since);
                centre = [mix(u.centre_from[0], u.centre[0], k), mix(u.centre_from[1], u.centre[1], k)];
                self.yaw += u.turn * dt;
            }
            None => {
                self.speed += (BUSY - self.speed) * (1.4 * dt).min(1.0);
                self.yaw += self.speed * dt;
            }
        }
        // Where the ball will rest, so the line holds still while the ball grows toward it.
        stage().caption_at.set([0.0, h / 2.0 + big + CAPTION_GAP]);
        stage().caption_alpha.set(caption_alpha(i.t, i.loaded));
        let fade = if riding { 1.0 } else { 1.0 - smooth(0.0, 0.8, flown) };
        let base = radius * 5.83 / 56.0;
        for (n, dot) in dots().iter().enumerate() {
            let at = place(n, self.yaw - self.look[0], TILT - self.look[1] - self.pitch);
            let (light, near) = lit(at);
            let (r, front) = (base * near, smooth(0.02, 0.25, at[2]));
            let on = [centre[0] + radius * at[0], centre[1] + radius * at[1]];
            let mut alpha = front * light * fade;
            if let Some(u) = &mut i.unwrap
                && let Some(card) = u.rider[n]
            {
                let (width, card) = (u.width, &mut u.cards[card]);
                if riding {
                    // The dot grows into the picture and carries it round.
                    let grown = smooth(0.0, 0.5, since - card.order * (RIDE - 0.7).max(0.1));
                    if dt > 0.0 && card.at != [0.0; 2] {
                        card.speed = [(on[0] - card.at[0]) / dt, (on[1] - card.at[1]) / dt];
                    }
                    card.at = on;
                    let full = radius * width * (0.4 + 0.6 * at[2].max(0.0));
                    card.size = [mix(2.0 * r, full, grown), mix(2.0 * r, full * 11.0 / 16.0, grown)];
                    card.alpha = (grown * 3.0).min(1.0) * front * mix(light, 0.5 + 0.5 * at[2], grown);
                    alpha *= 1.0 - (grown * 3.0).min(1.0);
                } else {
                    alpha = 0.0;
                }
            }
            dot.rect.set([on[0] - r, on[1] - r, 2.0 * r, 2.0 * r]);
            dot.alpha.set(alpha);
        }
        let mut cover = 1.0;
        let mut done = false;
        if let Some(u) = &mut i.unwrap {
            if !riding && !u.let_go {
                u.let_go = true;
                for c in &mut u.cards {
                    let far = (c.at[0] - c.home[0] - c.home[2] / 2.0).hypot(c.at[1] - c.home[1] - c.home[3] / 2.0);
                    c.let_go = [c.size[0], c.size[1], c.alpha, far.max(1.0)];
                }
            }
            // Let go, each picture keeps its speed and a soft spring that comes on gently pulls it to its card.
            let pull = if hurried.is_some() { PULL * 3.0 } else { PULL * smooth(0.0, RAMP, flown) };
            let (mut farthest, mut landed) = (0.0_f32, 0.0);
            for c in &mut u.cards {
                // Its card may have moved since: the window resized, or the page scrolled.
                if let Some(home) = i.homes[c.slot] {
                    c.home = home;
                }
                if !riding {
                    let to = [c.home[0] + c.home[2] / 2.0, c.home[1] + c.home[3] / 2.0];
                    for _ in 0..4 {
                        let step = dt / 4.0;
                        for axis in 0..2 {
                            c.speed[axis] += (-pull * pull * (c.at[axis] - to[axis]) - 2.0 * pull * c.speed[axis]) * step;
                            c.at[axis] += c.speed[axis] * step;
                        }
                    }
                    let far = (c.at[0] - to[0]).hypot(c.at[1] - to[1]);
                    let home = smooth(0.0, 1.0, 1.0 - far / c.let_go[3]);
                    farthest = farthest.max(far);
                    landed += home;
                    c.size = [mix(c.let_go[0], c.home[2], home), mix(c.let_go[1], c.home[3], home)];
                    c.alpha = mix(c.let_go[2], 1.0, (home * 1.8).max(flown / 0.5).min(1.0));
                }
                let slot = &stage().slots[c.slot];
                slot.rect.set([c.at[0] - c.size[0] / 2.0, c.at[1] - c.size[1] / 2.0, c.size[0], c.size[1]]);
                slot.alpha.set(c.alpha);
            }
            if !riding {
                cover = if u.cards.is_empty() { fade } else { 1.0 - smooth(0.2, 0.9, landed / u.cards.len() as f32) };
                done = flown > 0.8 && (farthest < 0.5 || flown > 4.0);
                if let Some(hurried) = hurried {
                    cover = cover.min(1.0 - smooth(0.0, 0.2, hurried));
                    done = farthest < 0.5 || hurried > 0.4;
                }
            }
        }
        stage().cover.set(cover);
        if done {
            settle();
        } else {
            self.intro = Some(i);
        }
        done
    }
}

/// Puts the stage away: the grid shows its own pictures again.
fn settle() {
    let stage = stage();
    stage.cover.set(0.0);
    stage.reveal.set(1.0);
    stage.caption_alpha.set(0.0);
    for slot in &stage.slots {
        slot.alpha.set(0.0);
    }
}

type Opened = Box<dyn Fn() + Send + Sync>;
static OPENED: OnceLock<Opened> = OnceLock::new();

/// What to do once the ball has opened into the grid, so the view can drop [`opening`].
pub fn on_opened(f: impl Fn() + Send + Sync + 'static) {
    let _ = OPENED.set(Box::new(f));
}

/// Starts the opening: the ball leaves where the sign-in screen had it, for the middle of the window.
pub fn begin() {
    let mut m = motion().lock().expect("the logo's motion");
    let from = (m.rect[2] > 0.0).then(|| [m.rect[0] + m.rect[2] / 2.0, m.rect[1] + m.rect[3] / 2.0, m.size * 56.0 / 120.0]);
    m.intro =
        Some(Intro { t: 0.0, from, window: [0.0; 2], ids: Vec::new(), homes: Vec::new(), loaded: None, unwrap: None, scroll: None, hurry: None });
    m.drag = None;
    settle();
    stage().cover.set(1.0);
    stage().reveal.set(0.0);
}

/// Drops an opening that no screen shows any more.
pub fn cancel() {
    if motion().lock().expect("the logo's motion").intro.take().is_some() {
        settle();
    }
}

/// How visible the grid's own pictures are: hidden while the opening flies their copies in.
pub fn reveal() -> &'static Live<f32> {
    &stage().reveal
}

/// The grid says where it drew the picture of card `id`, in window points.
pub fn card_at(id: &str, rect: [f32; 4]) {
    if let Some(i) = &mut motion().lock().expect("the logo's motion").intro
        && let Some(slot) = i.ids.iter().position(|known| known == id)
    {
        i.homes[slot] = Some(rect);
    }
}

/// The grid says how far down it is scrolled. A scroll during the opening carries the flying pictures and
/// their cards along with the page, and when a hand did it (not the page settling), hurries the opening to its end.
pub fn scrolled(offset: f32, by_hand: bool) {
    let mut m = motion().lock().expect("the logo's motion");
    let Some(i) = &mut m.intro else { return };
    let by = offset - i.scroll.replace(offset).unwrap_or(offset);
    if by == 0.0 || !by_hand {
        return;
    }
    i.hurry.get_or_insert(i.t);
    // The grid reports each card's new place itself (`card_at`); a picture already flying moves with the page.
    if let Some(u) = &mut i.unwrap
        && u.let_go
    {
        for c in &mut u.cards {
            c.at[1] -= by;
        }
    }
}

/// The opening, over the whole window: the ball in `ink` on a cover of `ground` with `caption` under it
/// while the library takes its time, and once the library has `loaded`, a copy of each card's picture
/// to fly from the ball to its card.
pub fn opening<S: 'static>(ink: Color, ground: Color, loaded: bool, pictures: Vec<(String, El)>, caption: El) -> El {
    {
        let mut m = motion().lock().expect("the logo's motion");
        m.shown = true;
        if loaded && let Some(i) = &mut m.intro {
            i.loaded.get_or_insert(i.t);
            if i.ids.is_empty() {
                i.ids = pictures.iter().take(SLOTS).map(|(id, _)| id.clone()).collect();
                i.homes = vec![None; i.ids.len()];
            }
        }
    }
    let stage = stage();
    let cover = el().pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0)).fill(ground).live_opacity(&stage.cover);
    let layer = el().key("opening").pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0)).paint_order(90).pixel_snap(false).child(cover);
    let layer = dots().iter().fold(layer, |layer, dot| {
        layer.child(el().pin(Some(0.0), Some(0.0), None, None).size(8.0, 8.0).radius(999.0).fill(ink).live_rect(&dot.rect).live_opacity(&dot.alpha))
    });
    let layer = stage.slots.iter().zip(pictures).fold(layer, |layer, (slot, (_, picture))| {
        layer.child(
            picture
                .pin(Some(0.0), Some(0.0), None, None)
                .size(160.0, 110.0)
                .radius(10.0)
                .clip_rounded(10.0)
                .live_rect(&slot.rect)
                .live_opacity(&slot.alpha),
        )
    });
    let caption = row()
        .key("caption-line")
        .pin(Some(0.0), Some(0.0), Some(0.0), None)
        .justify_center()
        .live_offset(&stage.caption_at)
        .live_opacity(&stage.caption_alpha)
        .child(caption);
    layer.child(caption).child(el().size(1.0, 1.0).looping(LoopSpec::rotation(1.0))).on_layout_tx(|_: &mut S, rect, tx: &mut Tx| {
        if let Some(i) = &mut motion().lock().expect("the logo's motion").intro {
            i.window = [rect[2], rect[3]];
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_line_under_the_ball_waits_then_stays_until_the_links_arrive() {
        assert_eq!(caption_alpha(0.5, None), 0.0, "not in the first moment");
        assert_eq!(caption_alpha(1.2, None), 1.0, "shown once the wait drags on");
        assert_eq!(caption_alpha(9.5, None), 1.0, "and for as long as it lasts");
        assert_eq!(caption_alpha(4.0, Some(3.0)), 0.0, "gone once the links are here");
        assert!(caption_alpha(3.1, Some(3.0)) > 0.0, "fading out, not cut");
    }

    #[test]
    fn a_quick_download_never_shows_the_line() {
        for t in [0.3, 0.6, 0.9, 1.5, 3.0] {
            assert_eq!(caption_alpha(t, Some(0.6)), 0.0, "at {t} s");
        }
    }
}
