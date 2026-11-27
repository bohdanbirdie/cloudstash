//! A frame meter after overengineeringstudio/fps-meter, in Cloudstash Dev only (release builds
//! leave it out), at the foot of the sidebar so it never
//! covers the content card: every display refresh is a bar, faint when a frame was drawn in it and red when it was missed,
//! beside the average rate over the last two seconds. While it shows, the window draws every
//! refresh, as a `requestAnimationFrame` loop does. Bars and text are live values, so frames
//! never re-run the view. Above them, the readings other parts of the app register with
//! [`probe`], refreshed four times a second; the meter knows nothing about what they measure.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use rune::{Color, Cursor, El, FrameEncoded, FrameOutcome, Live, LiveText, LoopSpec, TextStyle, col, el, oklch, oklcha, row, text};

const BARS: usize = 120;
const BARS_H: f32 = 14.0;
const WINDOW: Duration = Duration::from_secs(2);
/// Longer gaps are the window resting or hidden, not missed frames.
const MAX_GAP: Duration = Duration::from_millis(500);
const PROBE_EVERY: Duration = Duration::from_millis(250);

#[derive(Clone, Copy, PartialEq)]
enum Slot {
    Empty,
    Hit,
    Miss,
}

struct Handles {
    bars: Vec<Live<Color>>,
    text: LiveText,
}

fn handles() -> &'static Handles {
    static HANDLES: OnceLock<Handles> = OnceLock::new();
    HANDLES.get_or_init(|| Handles { bars: (0..BARS).map(|_| Live::new(Color::TRANSPARENT)).collect(), text: LiveText::new("– FPS") })
}

type Reading = Box<dyn Fn() -> String + Send>;

struct Probe {
    text: LiveText,
    read: Reading,
    press: Option<Arc<dyn Fn() + Send + Sync>>,
    /// What it read last, and how many characters wide the meter laid it out.
    last: String,
    laid: usize,
}

static RELAYOUT: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

/// How to run the view again, so a reading that grew or shrank gets a slot its new width.
pub fn on_relayout(f: impl Fn() + Send + Sync + 'static) {
    let _ = RELAYOUT.set(Box::new(f));
}

fn probes() -> &'static Mutex<Vec<Probe>> {
    static PROBES: OnceLock<Mutex<Vec<Probe>>> = OnceLock::new();
    PROBES.get_or_init(Mutex::default)
}

/// Shows `read()` on the meter, above the frame rate, in the order registered. A live text
/// keeps the box it was laid out in, so the view runs again when a reading's length changes.
/// Register before the first view runs.
pub fn probe(read: impl Fn() -> String + Send + 'static) {
    add(Box::new(read), None);
}

/// A [`probe`] that runs `press` when clicked.
pub fn probe_pressable(read: impl Fn() -> String + Send + 'static, press: impl Fn() + Send + Sync + 'static) {
    add(Box::new(read), Some(Arc::new(press)));
}

fn add(read: Reading, press: Option<Arc<dyn Fn() + Send + Sync>>) {
    let last = read();
    probes().lock().expect("probes").push(Probe { text: LiveText::new(last.clone()), read, press, last, laid: 0 });
}

fn refresh_probes() {
    let mut relayout = false;
    for p in probes().lock().expect("probes").iter_mut() {
        let now = (p.read)();
        if now != p.last {
            relayout |= now.chars().count() != p.laid;
            p.text.set(now.clone());
            p.last = now;
        }
    }
    if relayout && let Some(f) = RELAYOUT.get() {
        f();
    }
}

/// Counts the window's frames; feed it from `App::on_frame_encoded`.
#[derive(Default)]
pub struct Tracker {
    slots: VecDeque<Slot>,
    drawn: VecDeque<Instant>,
    last: Option<Instant>,
    probed: Option<Instant>,
}

impl Tracker {
    pub fn frame(&mut self, f: &FrameEncoded) {
        if !matches!(f.outcome(), FrameOutcome::Drawn | FrameOutcome::Unchanged) {
            return;
        }
        let at = f.at();
        if self.probed.is_none_or(|t| at.duration_since(t) >= PROBE_EVERY) {
            self.probed = Some(at);
            refresh_probes();
        }
        let rate = f.refresh_hz().unwrap_or(60.0).clamp(30.0, 240.0);
        if let Some(last) = self.last {
            let gap = at.duration_since(last);
            if gap < MAX_GAP {
                let missed = ((gap.as_secs_f64() * rate).round() as usize).saturating_sub(1).min(BARS);
                self.slots.extend(std::iter::repeat_n(Slot::Miss, missed));
            }
        }
        self.last = Some(at);
        self.slots.push_back(Slot::Hit);
        while self.slots.len() > BARS {
            self.slots.pop_front();
        }
        self.drawn.push_back(at);
        while self.drawn.front().is_some_and(|&t| at.duration_since(t) > WINDOW) {
            self.drawn.pop_front();
        }
        let h = handles();
        let offset = BARS - self.slots.len();
        for (i, bar) in h.bars.iter().enumerate() {
            let slot = if i < offset { Slot::Empty } else { self.slots[i - offset] };
            bar.set(match slot {
                Slot::Empty => Color::TRANSPARENT,
                Slot::Hit => oklcha(0.6, 0.0, 0.0, 0.35),
                Slot::Miss => oklch(0.63, 0.22, 27.0),
            });
        }
        let span = self.drawn.back().zip(self.drawn.front()).map_or(0.0, |(b, a)| b.duration_since(*a).as_secs_f64());
        if span > 0.0 {
            h.text.set(format!("{:.0} FPS", (self.drawn.len() - 1) as f64 / span));
        }
    }
}

/// The meter as a quiet sidebar block, as wide as the sidebar: the readings on one line, the
/// frame rate and its bars below. A reading that does something when clicked lights up under the
/// pointer (`hover`) and while held (`press`), as the sidebar's rows do.
pub fn meter<S: 'static>(fg: Color, line: Color, hover: Color, press: Color) -> El {
    let h = handles();
    let font = TextStyle::new(11.0, 500.0).features("'tnum' 1");
    let divider = || el().size(1.0, 10.0).fill(line);
    let bars = h.bars.iter().fold(row().grow(1.0).min_w(0.0).h(BARS_H).clip_rounded(3.0).fill(fg.alpha(0.1)), |r, bar| {
        r.child(el().grow(1.0).min_w(0.0).h_full().live_fill(bar))
    });
    let mut readings = row().gap(7.0).center_y();
    for (n, p) in probes().lock().expect("probes").iter_mut().enumerate() {
        p.laid = p.last.chars().count();
        let mut reading = text(p.last.clone()).live_text(&p.text).font(font).color(fg);
        if let Some(on_press) = p.press.clone() {
            reading = row()
                .px(4.0)
                .py(1.0)
                .mx(-4.0)
                .radius(4.0)
                .hover(hover)
                .press(press)
                .cursor(Cursor::Pointer)
                .on_press(move |_: &mut S| on_press())
                .child(reading);
        }
        if n > 0 {
            readings = readings.child(divider());
        }
        readings = readings.child(reading);
    }
    col()
        .key("fps-meter")
        .w_full()
        .px(8.0)
        .pt(4.0)
        .pb(10.0)
        .gap(5.0)
        .a11y_hidden()
        .child(readings)
        .child(row().w_full().gap(8.0).center_y().child(text("").live_text(&h.text).font(font).color(fg).w(46.0)).child(bars))
        .child(el().key("fps-tick").size(1.0, 1.0).looping(LoopSpec::rotation(1.0)))
}
