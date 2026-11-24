//! A window's split layout: a resizable, collapsible sidebar, the main pane under a toolbar,
//! and an optional inspector, with the title bar region cleared for the traffic lights.

use std::rc::Rc;
use std::time::Duration;

use rune::{Anim, Color, Cursor, Curve, Drag, Easing, El, Phase, Spring, Transition, Tx, col, el, row};

use super::pane::{PaneMotion, PaneState, Peek, SidebarPeek};
use super::toolbar::{TOOLBAR_HEIGHT, Toolbar};
use rune_kit::{ControlSize, IconButton, IconButtonVariant, Kit};

type Apply = Box<dyn FnOnce(El) -> El>;
/// Delayed hover on an element: `(e, enter, leave, zone)` peeks the sidebar once the pointer
/// rests on the toggle or the window's edge, and ends the peek once it stays out of the hold.
type Hover = Rc<dyn Fn(El, Duration, Duration, Zone) -> El>;

/// Where a hover that peeks the sidebar sits.
#[derive(Clone, Copy)]
enum Zone {
    Toggle,
    Edge,
    Hold,
}

/// The resize grip's width. A sidebar's straddles its edge, half over the content beside it; an
/// inspector's sits inside its edge.
const GRIP: f32 = 12.0;
/// How long the pointer rests on the sidebar's edge before the edge shows.
const EDGE_HINT_DELAY: Duration = Duration::from_millis(700);

struct Pane {
    state: PaneState,
    content: El,
    handlers: Vec<Apply>,
    toggle: Option<Apply>,
    clear: Option<Apply>,
    hover: Option<Hover>,
}

/// Where the sidebar's toggle button sits and how it looks:
/// `SidebarToggle::new().size(ControlSize::Large).past_lights(16.0).in_header()`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SidebarToggle {
    size: ControlSize,
    past_lights: f32,
    edge: f32,
    gap: f32,
    in_header: bool,
    unread: bool,
    shortcut: Option<&'static str>,
}

const DEFAULT_TOGGLE_SHORTCUT: &str = if cfg!(target_os = "macos") { "⇧⌘B" } else { "Ctrl+Shift+B" };

impl SidebarToggle {
    /// A 24 point button 8 points past the traffic lights (12 from the window's edge when there
    /// are none), 8 points before the toolbar's first item while the sidebar is closed.
    pub fn new() -> SidebarToggle {
        SidebarToggle {
            size: ControlSize::Regular,
            past_lights: 8.0,
            edge: 12.0,
            gap: 8.0,
            in_header: false,
            unread: false,
            shortcut: Some(DEFAULT_TOGGLE_SHORTCUT),
        }
    }
    /// The button's size: 16, 20, 24, 28 or 36 points.
    pub fn size(mut self, s: ControlSize) -> Self {
        self.size = s;
        self
    }
    /// Points between the traffic lights and the button.
    pub fn past_lights(mut self, points: f32) -> Self {
        self.past_lights = points.max(0.0);
        self
    }
    /// Points from the window's leading edge when there are no traffic lights (full screen,
    /// and off macOS).
    pub fn edge(mut self, points: f32) -> Self {
        self.edge = points.max(0.0);
        self
    }
    /// Points between the button and what follows it in the title bar while the sidebar is
    /// closed.
    pub fn gap(mut self, points: f32) -> Self {
        self.gap = points.max(0.0);
        self
    }
    /// While the sidebar is open, the button sits at the end of the sidebar's title bar row
    /// instead of past the traffic lights, and travels between the two on the sidebar's spring.
    pub fn in_header(mut self) -> Self {
        self.in_header = true;
        self
    }
    /// Marks the button with a dot while the sidebar is closed (unread activity in it).
    pub fn unread(mut self, unread: bool) -> Self {
        self.unread = unread;
        self
    }
    /// The shortcut hint shown in the toggle button's tooltip (`"⇧⌘B"` on macOS,
    /// `"Ctrl+Shift+B"` elsewhere by default; pass `""` to omit).
    pub fn shortcut(mut self, shortcut: &'static str) -> Self {
        self.shortcut = (!shortcut.is_empty()).then_some(shortcut);
        self
    }

    fn side(&self) -> f32 {
        match self.size {
            ControlSize::Mini => 16.0,
            ControlSize::Small => 20.0,
            ControlSize::Large => 28.0,
            ControlSize::ExtraLarge => 36.0,
            _ => 24.0,
        }
    }
}

impl Default for SidebarToggle {
    fn default() -> Self {
        Self::new()
    }
}

/// The app shell: `SplitView::new(main).sidebar(..).toolbar(..).inspector(..)
/// .titlebar_inset(cx.titlebar_inset()).build(&kit)`.
///
/// The sidebar and inspector are flush panes on the window's deep background; the main pane is
/// a rounded card beside them, inset by [`Self::frame_inset`] where no pane borders it. A 48
/// point band across the top is the title bar: it drags the window, its leading end clears the
/// traffic lights (pass [`Cx::titlebar_inset`], 0 in full screen), and the sidebar's toggle
/// button sits just past them ([`SidebarToggle`]). Panes resize from their inner edge
/// (double-click resets the width, dragging below half the minimum collapses) and open and
/// close together on one spring ([`PaneMotion`]). Under Reduce Motion they snap. Widths and
/// open states live in the app's [`PaneState`]s. With [`SidebarPeek`], a closed sidebar slides
/// in over the content while the pointer rests at the window's edge.
///
/// The band's middle is 24 points down: place the traffic lights there with
/// `Chrome { traffic_lights: Some((16.0, 17.0)), .. }` (with [`Self::toolbar_in_panel`], the
/// frame inset further down).
///
/// [`Cx::titlebar_inset`]: rune::Cx::titlebar_inset
pub struct SplitView {
    main: El,
    sidebar: Option<Pane>,
    inspector: Option<Pane>,
    toolbar: Option<Toolbar>,
    inset: f32,
    show_toggle: bool,
    toggle: SidebarToggle,
    frame: f32,
    in_panel: bool,
    padding: [f32; 2],
    motion: PaneMotion,
    peek: Option<SidebarPeek>,
    reduced: bool,
}

impl SplitView {
    pub fn new(main: El) -> SplitView {
        SplitView {
            main,
            sidebar: None,
            inspector: None,
            toolbar: None,
            inset: 0.0,
            show_toggle: true,
            toggle: SidebarToggle::new(),
            frame: 8.0,
            in_panel: false,
            padding: [0.0; 2],
            motion: PaneMotion::new(),
            peek: None,
            reduced: false,
        }
    }
    /// The leading pane. `access` finds its state in the app's; the grip and the toggle button
    /// write to it. `content` is usually a built `Sidebar`.
    pub fn sidebar<S: 'static>(mut self, state: &PaneState, access: fn(&mut S) -> &mut PaneState, content: El) -> Self {
        self.sidebar = Some(pane(*state, access, content, 1.0, true));
        self
    }
    /// The trailing pane, resized from its leading edge.
    pub fn inspector<S: 'static>(mut self, state: &PaneState, access: fn(&mut S) -> &mut PaneState, content: El) -> Self {
        self.inspector = Some(pane(*state, access, content, -1.0, false));
        self
    }
    /// The band above the main pane (and the inspector). Without one the band is empty and
    /// still drags the window.
    pub fn toolbar(mut self, t: Toolbar) -> Self {
        self.toolbar = Some(t);
        self
    }
    /// Points the traffic lights take at the window's leading edge: `Cx::titlebar_inset`.
    pub fn titlebar_inset(mut self, points: f32) -> Self {
        self.inset = points.max(0.0);
        self
    }
    /// Leaves out the sidebar's toggle button (the app shows its own, or none).
    pub fn hide_sidebar_toggle(mut self) -> Self {
        self.show_toggle = false;
        self
    }
    /// Where the sidebar's toggle button sits and how it looks.
    pub fn sidebar_toggle(mut self, t: SidebarToggle) -> Self {
        self.toggle = t;
        self
    }
    /// The window background showing around the main pane where no pane borders it (default
    /// 8 points).
    pub fn frame_inset(mut self, points: f32) -> Self {
        self.frame = points.max(0.0);
        self
    }
    /// Puts the toolbar inside the main pane, at its top, and insets the pane from the window's
    /// top too. The strip above it drags the window, and the sidebar's title bar row lines up
    /// with the toolbar.
    pub fn toolbar_in_panel(mut self) -> Self {
        self.in_panel = true;
        self
    }
    /// Points between the sidebar's edges and its contents: `start` at the window's edge, `end`
    /// at the main pane.
    pub fn sidebar_padding(mut self, start: f32, end: f32) -> Self {
        self.padding = [start.max(0.0), end.max(0.0)];
        self
    }
    /// How the panes open and close. Both move on the spring for the sidebar's width (the
    /// inspector's without one), so they move as one.
    pub fn pane_motion(mut self, m: PaneMotion) -> Self {
        self.motion = m;
        self
    }
    /// Lets the closed sidebar peek over the content.
    pub fn sidebar_peek(mut self, p: SidebarPeek) -> Self {
        self.peek = Some(p);
        self
    }
    /// Pass [`Cx::is_reduced_motion`]: fades replace the slides of the panes' contents and of
    /// a peek, as [`PaneMotion::reduced_motion_fade`] and [`SidebarPeek::reduced_motion_fade`]
    /// set. Widths snap under Reduce Motion either way.
    ///
    /// [`Cx::is_reduced_motion`]: rune::Cx::is_reduced_motion
    pub fn reduced_motion(mut self, reduced: bool) -> Self {
        self.reduced = reduced;
        self
    }

    pub fn build(self, k: &Kit) -> El {
        let c = &k.c;
        let t = self.toggle;
        let side = t.side();
        let top = if self.in_panel { self.frame } else { 0.0 };
        let sidebar_state = self.sidebar.as_ref().map(|p| p.state);
        let sidebar_open = sidebar_state.is_some_and(|s| s.is_open());
        let inspector_state = self.inspector.as_ref().map(|p| p.state);
        let inspector_open = inspector_state.is_some_and(|s| s.is_open());
        let spring = self.motion.spring_for(k, sidebar_state.or(inspector_state).map_or(0.0, |s| s.width()));
        let lights = if self.inset > 0.0 { self.inset + t.past_lights } else { t.edge };
        let toggle = self.show_toggle && self.sidebar.is_some();
        let past_toggle = if toggle { lights + side + t.gap } else { lights };
        let peek = self.peek;
        let d = Dock { k, spring, motion: self.motion, reduced: self.reduced };

        let mut overlay = None;
        let mut zones = Vec::new();
        let mut clears = Vec::new();
        let sidebar = self.sidebar.map(|mut p| {
            let s = p.state;
            let open = s.is_open();
            let shown = peek.is_some() && s.is_peeking();
            let floating = peek.is_some() && s.peek_phase() != Peek::None;
            if let Some(c) = p.clear.take() {
                clears.push(c);
            }
            let hover = p.hover.take();
            if let Some(tg) = p.toggle.take().filter(|_| toggle) {
                let label = if open { "Hide sidebar" } else { "Show sidebar" };
                let mut button =
                    IconButton::new(&super::SIDEBAR).variant(IconButtonVariant::GhostMuted).control_size(t.size).label(label).help(label);
                if let Some(sc) = t.shortcut {
                    button = button.shortcut(sc);
                }
                let mut button = button.build(k).expanded(open);
                if t.unread {
                    // A tween ends where it says; a spring's exit would run on unseen for a while.
                    let dot = el().key("sidebar-toggle-unread").size(7.0, 7.0).radius(3.5).fill(c.bg_accent);
                    let fade = Curve::tween(DOT_FADE, Easing::EASE_IN_OUT);
                    button = button.child(dot.absolute(side - 5.0, -2.0).opacity(if open { 0.0 } else { 1.0 }).opacity_motion(fade));
                }
                let x = if open && t.in_header { s.width() - self.padding[1] - side } else { lights };
                let mut b = tg(button).key("sidebar-toggle").absolute(x, top + (TOOLBAR_HEIGHT - side) / 2.0).motion(spring);
                if let (Some(pk), Some(h)) = (peek, &hover)
                    && !open
                {
                    b = h(b, pk.toggle_delay, Duration::ZERO, Zone::Toggle);
                }
                if floating {
                    b = b.raise();
                }
                overlay = Some(b);
            }
            if let (Some(pk), Some(h)) = (peek, &hover) {
                let instant = Transition::none();
                if shown {
                    let hold = el().key("sidebar-peek-hold").pin(Some(0.0), Some(0.0), None, Some(0.0)).w(s.width() + pk.margin);
                    zones.push(h(hold.transition(instant), Duration::ZERO, pk.grace, Zone::Hold));
                } else if !open && !s.is_resizing() {
                    let below = pk.below.unwrap_or(top + TOOLBAR_HEIGHT);
                    let edge = el().key("sidebar-peek-edge").pin(Some(0.0), Some(below), None, Some(0.0)).w(self.frame + pk.edge);
                    zones.push(h(edge.transition(instant), pk.edge_delay, Duration::ZERO, Zone::Edge));
                }
            }
            // The title bar row clears the traffic lights, and the toggle wherever it floats
            // over the row.
            let clear = if toggle && (!open || !t.in_header) {
                past_toggle
            } else if self.inset > 0.0 {
                self.inset + t.past_lights
            } else {
                0.0
            };
            let mut band = row()
                .key("sidebar-titlebar")
                .w_full()
                .h(top + TOOLBAR_HEIGHT)
                .pt(top)
                .center_y()
                .window_drag()
                .child(el().key("sidebar-titlebar-clear").w((clear - self.padding[0]).max(0.0)).motion(spring).a11y_hidden());
            if toggle && t.in_header {
                band = band
                    .child(el().key("sidebar-spacer").grow(1.0).a11y_hidden())
                    .child(el().key("sidebar-toggle-slot").w(side).ml(8.0).a11y_hidden());
            }
            let content = Contents { pad: self.padding, slide: peek.is_some(), peek, band: Some(band), frame: self.frame };
            dock(&d, "sidebar-pane", p, true, content, &mut zones)
        });
        let toolbar = self
            .toolbar
            .unwrap_or_default()
            .padding(if sidebar_open {
                12.0
            } else if self.in_panel {
                (past_toggle - self.frame).max(12.0)
            } else {
                past_toggle
            })
            .build(k)
            .motion(spring);
        let (toolbar, above) = if self.in_panel { (Some(toolbar), None) } else { (None, Some(toolbar)) };
        let card = col()
            .key("main-pane")
            .role("main")
            .grow(1.0)
            .min_w(0.0)
            .min_h(0.0)
            .ml(if sidebar_open { 0.0 } else { self.frame })
            .mr(if inspector_open { 0.0 } else { self.frame })
            .mb(self.frame)
            .fill(c.bg_base)
            .radius(k.radius.lg)
            .border(1.0, c.border_muted)
            .clip_rounded(k.radius.lg)
            .motion(spring)
            .children(toolbar)
            .child(self.main.grow(1.0).min_h(0.0));
        let mut below = row().key("main-row").w_full().grow(1.0).min_h(0.0).motion(spring).child(card);
        if let Some(mut p) = self.inspector {
            if let Some(c) = p.clear.take() {
                clears.push(c);
            }
            let content = Contents { pad: [0.0; 2], slide: false, peek: None, band: None, frame: self.frame };
            below = below.child(dock(&d, "inspector-pane", p, false, content, &mut Vec::new()));
        }
        let strip = self.in_panel.then(|| el().key("titlebar-strip").w_full().h(self.frame).window_drag());
        let main = col().key("main-column").grow(1.0).min_w(0.0).h_full().motion(spring).children(above).children(strip).child(below);
        let mut split = row().key("split").w_full().h_full().motion(spring);
        if let Some(s) = sidebar {
            split = split.child(s);
        }
        let peeking = sidebar_state.is_some_and(|s| s.is_peeking());
        let scrim = peek.and_then(|pk| pk.scrim).map(|color| {
            el().key("peek-scrim")
                .pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
                .fill(color)
                .opacity(if peeking { 1.0 } else { 0.0 })
                .opacity_motion(Curve::tween(SCRIM_FADE, Easing::EASE_OUT))
                .a11y_hidden()
        });
        let mut root = el().key("shell").w_full().h_full().fill(c.bg_deep).child(split.child(main)).children(scrim).children(zones);
        if let Some(o) = overlay {
            root = root.child(o);
        }
        for clear in clears {
            root = clear(root);
        }
        root
    }
}

/// A full-window screen without side panes — a settings page, lock screen or onboarding view
/// in the same window as a [`SplitView`]. Shares [`SplitView`]'s title bar height, traffic-light
/// clearance, window-drag band and framed content card so switching screens matches pixel for
/// pixel: `Page::new(content).title("Settings").leading(back).trailing(done).titlebar_inset(cx.titlebar_inset()).build(&kit)`.
pub struct Page {
    main: El,
    toolbar: Toolbar,
    inset: f32,
    toggle: SidebarToggle,
    frame: f32,
    in_panel: bool,
}

impl Page {
    pub fn new(main: El) -> Page {
        Page { main, toolbar: Toolbar::new(), inset: 0.0, toggle: SidebarToggle::new(), frame: 8.0, in_panel: false }
    }
    /// A centred title in the toolbar band.
    pub fn title(mut self, t: impl Into<String>) -> Self {
        self.toolbar = self.toolbar.title(t);
        self
    }
    /// The toolbar's centre slot (replaces [`Self::title`]).
    pub fn center(mut self, e: El) -> Self {
        self.toolbar = self.toolbar.center(e);
        self
    }
    /// Adds a leading control to the toolbar (a Back button, say), placed past the traffic lights.
    pub fn leading(mut self, e: El) -> Self {
        self.toolbar = self.toolbar.leading(e);
        self
    }
    /// Adds a trailing control to the toolbar.
    pub fn trailing(mut self, e: El) -> Self {
        self.toolbar = self.toolbar.trailing(e);
        self
    }
    /// Replaces the toolbar with a pre-built [`Toolbar`].
    pub fn toolbar(mut self, t: Toolbar) -> Self {
        self.toolbar = t;
        self
    }
    /// Points the traffic lights take at the window's leading edge: `Cx::titlebar_inset`.
    pub fn titlebar_inset(mut self, points: f32) -> Self {
        self.inset = points.max(0.0);
        self
    }
    /// Points past the traffic lights (or the window's edge in full screen) where the toolbar's
    /// leading slot starts, matching [`SplitView::sidebar_toggle`].
    pub fn past_lights(mut self, past_lights: f32, edge: f32) -> Self {
        self.toggle = self.toggle.past_lights(past_lights).edge(edge);
        self
    }
    /// The window background showing around the content pane (default 8 points, matching
    /// [`SplitView::frame_inset`]).
    pub fn frame_inset(mut self, points: f32) -> Self {
        self.frame = points.max(0.0);
        self
    }
    /// Puts the toolbar inside the framed content pane at its top, matching
    /// [`SplitView::toolbar_in_panel`].
    pub fn toolbar_in_panel(mut self) -> Self {
        self.in_panel = true;
        self
    }

    pub fn build(self, k: &Kit) -> El {
        let mut split = SplitView::new(self.main)
            .toolbar(self.toolbar)
            .titlebar_inset(self.inset)
            .sidebar_toggle(self.toggle)
            .frame_inset(self.frame)
            .hide_sidebar_toggle();
        if self.in_panel {
            split = split.toolbar_in_panel();
        }
        split.build(k)
    }
}

/// Handlers for a pane's grip and toggle, typed by the app's state.
fn pane<S: 'static>(state: PaneState, access: fn(&mut S) -> &mut PaneState, content: El, sign: f32, toggle: bool) -> Pane {
    let drag: Apply = Box::new(move |e: El| {
        e.on_drag(move |s: &mut S, d: &mut Drag, tx: &mut Tx| {
            let p = access(s);
            match d.phase {
                Phase::Down => p.press_grip(d.window_point()),
                Phase::Move => {
                    let (ticks, open) = (p.pull_ticks(), p.is_open());
                    p.drag_grip(d.window_point(), sign * d.dx);
                    // rune snaps a drag's moves so the edge follows the pointer; collapsing from the
                    // drag, and every move after it in the same drag (opening it again), moves on
                    // the pane's spring, like the toggle.
                    if open != p.is_open() || p.drag_collapsed() {
                        tx.animated();
                    }
                    if open && !p.is_open() {
                        super::mac::tap(true);
                    } else if p.pull_ticks() > ticks {
                        super::mac::tap(false);
                    }
                }
                Phase::Up => {
                    // A stretch past the maximum eases back.
                    if p.stretch() > 0.0 {
                        tx.animated();
                        tx.motion_curve(Curve::tween(STRETCH_RELEASE, Easing::cubic(0.45, 0.0, 0.2, 1.0)));
                    }
                    p.release_grip(d.cancelled());
                }
            }
        })
        .hover_delays(EDGE_HINT_DELAY, Duration::ZERO)
        .on_hover_change(move |s: &mut S, inside, _| access(s).hover_edge(inside))
        .on_double_press(move |s: &mut S| access(s).reset_width())
        .on_step(move |s: &mut S, steps, _| {
            let p = access(s);
            p.set_width(p.width() + steps as f32 * GRIP_STEP);
        })
    });
    let toggle: Option<Apply> = toggle.then(|| Box::new(move |e: El| e.on_press(move |s: &mut S| access(s).press_toggle())) as Apply);
    // A drag whose release is lost (the grip unmounted, a modal took the pointer) ends on blur
    // or once the pointer moves where the drag doesn't hear it. Blur also ends a peek.
    let clear = (state.is_resizing() || state.is_peeking()).then(|| {
        Box::new(move |e: El| {
            e.on_window_focus(move |s: &mut S, focused, _| {
                if !focused {
                    access(s).lose_grip();
                    access(s).end_peek();
                }
            })
            .on_pointer_move(move |s: &mut S, p| access(s).pointer_grip([p.x, p.y]))
        }) as Apply
    });
    let hover = (sign > 0.0).then(|| {
        Rc::new(move |e: El, enter: Duration, leave: Duration, zone: Zone| {
            e.hover_delays(enter, leave).on_hover_change(move |s: &mut S, inside, _| match (zone, inside) {
                (Zone::Toggle, true) => access(s).rest_on_toggle(),
                (Zone::Toggle, false) => access(s).leave_toggle(),
                (Zone::Edge, true) => access(s).peek(),
                (Zone::Hold, false) => access(s).end_peek(),
                _ => {}
            })
        }) as Hover
    });
    Pane { state, content, handlers: vec![drag], toggle, clear, hover }
}

const DOT_FADE: f32 = 0.15;
/// Seconds a sidebar stretched past its maximum takes to ease back when let go, starting gently
/// and landing softly.
const STRETCH_RELEASE: f32 = 0.4;
/// The macOS window's own border, which the sidebar's edge lines stop short of.
const WINDOW_BORDER: f32 = 1.0;
/// Seconds the sidebar's edge line takes to fade.
const EDGE_HINT_FADE: f32 = 0.15;
/// Seconds the scrim behind a peeking sidebar takes to fade.
const SCRIM_FADE: f32 = 0.2;
/// Points between a peeking sidebar's card and its contents.
const CARD_PAD: f32 = 6.0;
/// How far an open pane's contents fade as its edge is pulled toward collapsing, at the most.
const PULL_FADE: f32 = 0.45;
/// Points one increment from assistive technology widens a pane by.
const GRIP_STEP: f32 = 8.0;

/// What the panes share.
struct Dock<'a> {
    k: &'a Kit,
    spring: Spring,
    motion: PaneMotion,
    reduced: bool,
}

/// How one pane holds its contents.
struct Contents {
    pad: [f32; 2],
    slide: bool,
    peek: Option<SidebarPeek>,
    band: Option<El>,
    /// The window's inset around the content card, which a peeking sidebar's card shares.
    frame: f32,
}

/// The pane's slot: its width springs between 0 and the pane's width while the content keeps
/// its full width, clipped, pinned to the leading edge (or the trailing one, sliding). The
/// content fades as the motion says. A peeking sidebar's content slides out past the slot's
/// edge, unclipped and raised over the main pane, on a floating surface.
/// A sidebar's grip, and the line that shows its edge while the pointer rests there or drags it,
/// go to `edge`: over the window, so the grip can reach past the sidebar's clip into the content.
fn dock(d: &Dock, key: &str, p: Pane, leading: bool, content: Contents, edge: &mut Vec<El>) -> El {
    let (k, spring) = (d.k, d.spring);
    let s = p.state;
    let open = s.is_open();
    // Stretched past its maximum, the contents widen with the pane instead of sliding right.
    let w = s.width().max(s.shown_width());
    let phase = if content.peek.is_some() { s.peek_phase() } else { Peek::None };
    let floating = phase != Peek::None;
    let fade_peek = |pk: &SidebarPeek| -> Anim {
        if d.reduced && pk.reduced_fade > 0.0 { Curve::tween(pk.reduced_fade, Easing::EASE_IN_OUT).into() } else { Anim::INSTANT }
    };
    let (opacity, fade) = match (open, phase, &content.peek) {
        // Pulled past its minimum, it fades on the way to closing, and closes from there.
        (true, ..) if s.is_resizing() => (1.0 - PULL_FADE * s.pull(), Anim::INSTANT),
        (false, Peek::Shown, Some(pk)) => (1.0, fade_peek(pk)),
        // It slides out past the edge; under Reduce Motion it fades where it is.
        (false, Peek::Left, Some(pk)) => (if d.reduced { 0.0 } else { 1.0 }, fade_peek(pk)),
        (true, ..) => (1.0, d.motion.fade(spring, true, d.reduced)),
        (false, ..) => (0.0, d.motion.fade(spring, false, d.reduced)),
    };
    // A peek's card sits at the window's inset, its contents a little inside it.
    let card = matches!(phase, Peek::Shown | Peek::Left);
    let pad = if card { [content.frame + CARD_PAD, CARD_PAD] } else { content.pad };
    let mut body = col().key("pane-content").w(w).h_full().pl(pad[0]).pr(pad[1]).opacity(opacity).opacity_motion(fade);
    body =
        if content.slide { body.pin(None, Some(0.0), Some(0.0), Some(0.0)).motion(spring) } else { body.pin(Some(0.0), Some(0.0), None, Some(0.0)) };
    if let Some(pk) = content.peek {
        let peek_spring: Anim = pk.spring.unwrap_or(k.motion.control).into();
        // Peeking, the contents sit at the window's edge: a whole width past the closed slot.
        let shown = !open && phase == Peek::Shown;
        let (x, slide) = match phase {
            Peek::Shown | Peek::Left => (if shown { w } else { 0.0 }, peek_spring),
            // Docking, the slot's edge carries the contents as far as the offset lets go of
            // them, on the same spring, so they hold still.
            _ => (0.0, spring.into()),
        };
        let surface_motion: Anim = if d.reduced && pk.reduced_fade > 0.0 {
            Curve::tween(pk.reduced_fade, Easing::EASE_IN_OUT).into()
        } else if phase == Peek::Docked {
            spring.into()
        } else {
            peek_spring
        };
        let surface = el()
            .key("pane-surface")
            .pin(Some(content.frame), Some(content.frame), Some(0.0), Some(content.frame))
            .fill(k.c.bg_base)
            .radius(k.radius.lg)
            .border(1.0, k.c.border_muted)
            .opacity(if shown { 1.0 } else { 0.0 })
            .opacity_motion(surface_motion)
            // Its size only changes while it's hidden (a resize of the open pane).
            .motion(Spring::NONE);
        body = body.offset(x, 0.0).offset_motion(slide).child(k.elevate(surface, &k.elevation.floating));
    }
    if floating {
        body = body.raise();
    }
    let body = body.children(content.band).child(col().key("pane-body").w_full().grow(1.0).min_h(0.0).child(p.content.w_full().h_full()));
    let mut slot =
        el().key(key).role("region").label(if leading { "Sidebar" } else { "Inspector" }).w(s.shown_width()).h_full().motion(spring).child(body);
    if !floating {
        slot = slot.clip_soft(0.0);
    }
    if !open && !floating && !s.is_resizing() {
        slot = slot.a11y_hidden();
    }
    if open {
        let instant = Transition::none();
        if leading {
            slot = slot
                .child(el().key("pane-open-main").size(0.0, 0.0).a11y_hidden().transition(instant).focus_return("main-column"))
                .child(el().key("pane-open").size(0.0, 0.0).a11y_hidden().transition(instant).focus_return("sidebar-toggle"));
        } else {
            slot = slot
                .child(el().key("pane-open").size(0.0, 0.0).a11y_hidden().transition(instant).focus_return("sidebar-toggle"))
                .child(el().key("pane-open-main").size(0.0, 0.0).a11y_hidden().transition(instant).focus_return("main-pane"));
        }
    }
    if open || s.is_resizing() {
        let mut grip = el()
            .key(if leading { "sidebar-grip" } else { "inspector-grip" })
            .role("separator")
            .label(if leading { "Resize sidebar" } else { "Resize inspector" })
            // Its value is the pane's width; a reader's increment and decrement step it.
            .range_value(f64::from(s.width()), f64::from(s.min_width()), f64::from(s.max_width()))
            .range_step(f64::from(GRIP_STEP))
            .w(GRIP)
            // At its widest, the edge can only go back: AppKit's one-way cursor says so.
            .cursor(if leading && s.width() >= s.max_width() { super::mac::resize_left_cursor() } else { Cursor::ResizeColumn })
            .fill(Color::TRANSPARENT)
            .opacity(0.02)
            .transition(Transition::none());
        // A sidebar's edge is the middle of the gutter between its contents and the content card.
        let edge_x = s.shown_width() - content.pad[1] / 2.0;
        grip =
            if leading { grip.pin(Some(edge_x - GRIP / 2.0), Some(0.0), None, Some(0.0)) } else { grip.pin(Some(0.0), Some(0.0), None, Some(0.0)) };
        if floating {
            grip = grip.raise();
        }
        for h in p.handlers {
            grip = h(grip);
        }
        // Not a Tab stop: AppKit's dividers aren't either.
        let grip = grip.focusable(false);
        if !leading {
            return slot.child(grip);
        }
        // The edge's lines run the window's height, short of its 1 point border. The neutral one shows while the pointer
        // rests on the edge and goes at once when a drag starts; the accent one marks the drag and
        // rides the edge on its spring, so a pull that collapses the sidebar carries it as it fades.
        let c = &d.k.c;
        let line = |key: &'static str, color: Color| {
            el().key(key).pin(Some(edge_x - 1.0), Some(WINDOW_BORDER), None, Some(WINDOW_BORDER)).w(2.0).fill(color).a11y_hidden()
        };
        let hint = open && s.is_edge_hovered() && !s.is_resizing();
        let hint_fade: Anim = if s.is_resizing() { Anim::INSTANT } else { Curve::tween(EDGE_HINT_FADE, Easing::EASE_OUT).into() };
        edge.push(line("sidebar-edge-hint", c.border_strong).opacity(if hint { 1.0 } else { 0.0 }).opacity_motion(hint_fade));
        let drag_fade: Anim = if open { Anim::INSTANT } else { d.motion.fade(spring, false, d.reduced) };
        let dragging = open && s.is_resizing();
        edge.push(line("sidebar-edge-drag", c.border_focus).opacity(if dragging { 1.0 } else { 0.0 }).opacity_motion(drag_fade).motion(spring));
        edge.push(grip);
    }
    slot
}
