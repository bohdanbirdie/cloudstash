//! The signed-in window: the "Inset" layout from the HTML prototype. A sidebar with search, the
//! library's states and the account, beside a rounded content card that lists the chosen
//! state's links. The sidebar resizes, collapses and peeks (`shell_kit/SIDEBAR.md`).

use std::borrow::Cow;
use std::cell::Cell;
use std::rc::Rc;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rune::{
    Color, Cursor, Cx, El, GrowthSpec, Icon, Key, KeyEvent, Live, LoopSpec, Mods, ScrollFade, ScrollSpec, Shadow, Side, Spring, SpringPair,
    SurfaceFit, TextStyle, Transition, Tx, Vec2, col, el, icon, oklch, oklcha, row, text,
};
use rune_kit::{Kit, ScrollBar, ScrollBarStyle};

use crate::auth::Account;
use crate::fps;
use crate::icons::LOADER_CIRCLE;
use crate::images::{self, Lane, Request};
use crate::nav::{self, Place};
use crate::update::{self, Update};

mod palette;
use crate::livestore::library::{LinkItem, Tab};
use crate::shell_kit::{PaneState, SidebarPeek, SidebarToggle, SplitView, TOOLBAR_HEIGHT, Toolbar, is_sidebar_toggle};
use crate::{Phase, State, Sync};
pub use palette::{Palette, toggle as toggle_palette};

const SIDEBAR_W: f32 = 248.0;
const SIDEBAR_MIN: f32 = 200.0;
const SIDEBAR_MAX: f32 = 320.0;

/// The library's states, in sidebar order.
const STATES: [(Tab, &str, &Icon); 4] =
    [(Tab::Inbox, "Inbox", &INBOX), (Tab::Completed, "Done", &DONE), (Tab::Archive, "Archive", &ARCHIVE), (Tab::All, "All links", &ALL)];

/// How close the content panel shows links, from many small pictures to a one-column feed. The
/// toolbar's control picks it, and so do 1 to 4 and ⌘+ and ⌘−.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Zoom {
    /// Pictures alone, many to a row.
    Pictures,
    /// Pictures with their titles.
    #[default]
    Titles,
    /// Bigger cards with a few lines of the summary.
    Summaries,
    /// One column, like a social feed.
    Feed,
}

impl Zoom {
    pub const ALL: [Zoom; 4] = [Zoom::Pictures, Zoom::Titles, Zoom::Summaries, Zoom::Feed];

    fn label(self) -> &'static str {
        match self {
            Zoom::Pictures => "Pictures",
            Zoom::Titles => "Titles",
            Zoom::Summaries => "Summaries",
            Zoom::Feed => "Feed",
        }
    }

    fn glyph(self) -> &'static Icon {
        match self {
            Zoom::Pictures => &PICTURES,
            Zoom::Titles => &GRID,
            Zoom::Summaries => &SUMMARIES,
            Zoom::Feed => &FEED,
        }
    }

    /// The narrowest a card gets, or None for a single column.
    fn card_min(self) -> Option<f32> {
        match self {
            Zoom::Pictures => Some(150.0),
            Zoom::Titles => Some(CARD_MIN),
            Zoom::Summaries => Some(300.0),
            Zoom::Feed => None,
        }
    }

    /// A row's height before it's measured, for the grid's scroll bar.
    fn row_estimate(self) -> f32 {
        match self {
            Zoom::Pictures => 125.0,
            Zoom::Titles => 260.0,
            Zoom::Summaries => 340.0,
            Zoom::Feed => 600.0,
        }
    }

    /// One step closer (`by` 1) or further (−1), stopping at the ends.
    pub fn step(self, by: i32) -> Zoom {
        let at = Zoom::ALL.iter().position(|z| *z == self).unwrap_or(1) as i32;
        Zoom::ALL[(at + by).clamp(0, Zoom::ALL.len() as i32 - 1) as usize]
    }
}

/// The link shown over the library: a preview over the grid first, then the whole page. A click
/// on a card opens the preview, a click on the preview or ↵ opens it all the way, and Esc goes
/// back one step.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Preview {
    pub id: String,
    pub full: bool,
}

/// Shows `link`'s preview, or opens it all the way.
pub fn preview(s: &mut State, id: &str, full: bool) {
    s.palette = None;
    if full {
        grown().set(GROWN_FROM);
    }
    s.preview = Some(Preview { id: id.to_owned(), full });
}

/// How large the opened page draws. It mounts at the preview's size and springs to full with the
/// preview growing into it, so its text grows with the card rather than waiting at its own size.
fn grown() -> &'static Live<f32> {
    static GROWN: OnceLock<Live<f32>> = OnceLock::new();
    GROWN.get_or_init(|| Live::new(1.0))
}
const GROWN_FROM: f32 = 0.9;

fn previewed(s: &State) -> Option<(&LinkItem, bool)> {
    let p = s.preview.as_ref()?;
    s.links.iter().find(|l| l.id == p.id).map(|l| (l, p.full))
}

/// A space in the sidebar. Hardcoded until the library has spaces.
struct Space {
    id: &'static str,
    name: &'static str,
    hue: f32,
    /// Suggested but not yet accepted: a dashed swatch and a "New" badge.
    draft: bool,
}

const SPACES: [Space; 6] = [
    Space { id: "agents", name: "Agents", hue: 268.0, draft: false },
    Space { id: "design", name: "Design", hue: 330.0, draft: false },
    Space { id: "cf", name: "Edge platforms", hue: 30.0, draft: false },
    Space { id: "effect", name: "TypeScript", hue: 230.0, draft: false },
    Space { id: "canvas", name: "Canvas UI", hue: 190.0, draft: false },
    Space { id: "mac", name: "Mac apps", hue: 145.0, draft: true },
];

/// The id of the space called `id`, if there is one.
pub fn space(id: &str) -> Option<&'static str> {
    SPACES.iter().find(|space| space.id == id).map(|space| space.id)
}

pub fn sidebar_state() -> PaneState {
    PaneState::new(SIDEBAR_W).range(SIDEBAR_MIN, SIDEBAR_MAX)
}

macro_rules! glyph {
    ($name:literal, $paths:literal) => {
        Icon {
            name: $name,
            view: 16.0,
            body: concat!(
                r#"<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">"#,
                $paths,
                "</g>"
            ),
        }
    };
}

static INBOX: Icon = glyph!("cs-inbox", r#"<path d="M2.5 9.5 4 3.5h8l1.5 6v3h-11v-3Z"/><path d="M2.5 9.5H6l.5 1.5h3l.5-1.5h3.5"/>"#);
static DONE: Icon = glyph!("cs-done", r#"<circle cx="8" cy="8" r="5.5"/><path d="m5.5 8 1.8 1.8L10.5 6.5"/>"#);
static ARCHIVE: Icon = glyph!("cs-archive", r#"<rect x="2.5" y="3" width="11" height="3" rx="1"/><path d="M3.5 6v6.5h9V6M6.5 8.5h3"/>"#);
static ALL: Icon = glyph!("cs-all", r#"<path d="M3 5.5 8 3l5 2.5L8 8 3 5.5Z"/><path d="m3 8.5 5 2.5 5-2.5M3 11l5 2.5 5-2.5"/>"#);
static CHEVRON: Icon = glyph!("cs-chevron", r#"<path d="m6 4 4 4-4 4"/>"#);
static GRID: Icon = glyph!(
    "cs-grid",
    r#"<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1.2"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1.2"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1.2"/><rect x="9" y="9" width="4.5" height="4.5" rx="1.2"/>"#
);
static FEED: Icon = glyph!("cs-feed", r#"<rect x="3.5" y="2.5" width="9" height="6" rx="1.2"/><path d="M3.5 11h9M3.5 13.5h6"/>"#);
static PICTURES: Icon = glyph!(
    "cs-pictures",
    r#"<rect x="2.5" y="2.5" width="3" height="3" rx=".8"/><rect x="6.5" y="2.5" width="3" height="3" rx=".8"/><rect x="10.5" y="2.5" width="3" height="3" rx=".8"/><rect x="2.5" y="6.5" width="3" height="3" rx=".8"/><rect x="6.5" y="6.5" width="3" height="3" rx=".8"/><rect x="10.5" y="6.5" width="3" height="3" rx=".8"/><rect x="2.5" y="10.5" width="3" height="3" rx=".8"/><rect x="6.5" y="10.5" width="3" height="3" rx=".8"/><rect x="10.5" y="10.5" width="3" height="3" rx=".8"/>"#
);
static SUMMARIES: Icon = glyph!(
    "cs-summaries",
    r#"<rect x="2.5" y="2.5" width="4.5" height="4" rx="1"/><rect x="9" y="2.5" width="4.5" height="4" rx="1"/><path d="M2.5 9.5h4.5M2.5 12h3M9 9.5h4.5M9 12h3"/>"#
);
static BACK: Icon = glyph!("cs-back", r#"<path d="m10 4-4 4 4 4"/>"#);
static TAG: Icon = glyph!("cs-tag", r#"<path d="M2.5 8.2V3.5a1 1 0 0 1 1-1h4.7l5.3 5.3-5.7 5.7-5.3-5.3Z"/><circle cx="5.5" cy="5.5" r=".8"/>"#);
static TRASH: Icon = glyph!("cs-trash", r#"<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>"#);
static BROWSER: Icon =
    glyph!("cs-browser", r#"<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5"/><path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/>"#);
static SIGN_OUT: Icon = glyph!("cs-sign-out", r#"<path d="M6 13.5H3.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H6"/><path d="m10 11 3-3-3-3M13 8H6"/>"#);
static RESET: Icon = glyph!("cs-reset", r#"<path d="M3 8a5 5 0 1 0 1.5-3.5"/><path d="M3 2.5v3h3"/>"#);
static RETURN: Icon = glyph!("cs-return", r#"<path d="M12.5 3.5v4a2 2 0 0 1-2 2h-7"/><path d="m6 6.5-3 3 3 3"/>"#);
static SETTINGS: Icon = glyph!(
    "cs-settings",
    r#"<g transform="scale(0.6667)" stroke-width="2.1"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></g>"#
);
static SEARCH: Icon = glyph!("cs-search", r#"<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>"#);

/// The HTML prototype's tokens.
struct Look {
    side: Color,
    panel: Color,
    fg: Color,
    fg2: Color,
    fg3: Color,
    hover: Color,
    active: Color,
    line: Color,
    line2: Color,
    /// The sidebar's edge while it's dragged, and the dot beside a waiting update.
    accent: Color,
    /// A filled main button, under a white label.
    primary: Color,
    warning: Color,
    /// Dims the window behind the peeking sidebar.
    scrim: Color,
    /// Behind a card's picture while it loads, and behind a card without one.
    tile: Color,
    /// The hairline inside a card's picture.
    ring: Color,
    dark: bool,
}

fn look(dark: bool) -> Look {
    let t = crate::theme::palette(dark);
    if dark {
        Look {
            side: oklch(0.15, 0.0, 0.0),
            panel: oklch(0.205, 0.0, 0.0),
            fg: oklch(0.94, 0.0, 0.0),
            fg2: oklch(0.72, 0.0, 0.0),
            fg3: oklch(0.53, 0.0, 0.0),
            hover: oklcha(1.0, 0.0, 0.0, 0.045),
            active: oklcha(1.0, 0.0, 0.0, 0.08),
            line: oklcha(1.0, 0.0, 0.0, 0.06),
            line2: oklcha(1.0, 0.0, 0.0, 0.1),
            accent: t.accent_text,
            primary: t.primary,
            warning: t.warning,
            scrim: oklcha(0.0, 0.0, 0.0, 0.3),
            tile: oklch(0.235, 0.0, 0.0),
            ring: oklcha(1.0, 0.0, 0.0, 0.08),
            dark: true,
        }
    } else {
        Look {
            side: oklch(0.965, 0.0, 0.0),
            panel: oklch(1.0, 0.0, 0.0),
            fg: oklch(0.22, 0.0, 0.0),
            fg2: oklch(0.47, 0.0, 0.0),
            fg3: oklch(0.66, 0.0, 0.0),
            hover: oklcha(0.0, 0.0, 0.0, 0.04),
            active: oklcha(0.0, 0.0, 0.0, 0.065),
            line: oklcha(0.0, 0.0, 0.0, 0.07),
            line2: oklcha(0.0, 0.0, 0.0, 0.1),
            accent: t.accent_text,
            primary: t.primary,
            warning: t.warning,
            scrim: oklcha(0.0, 0.0, 0.0, 0.06),
            tile: oklch(0.965, 0.0, 0.0),
            ring: oklcha(0.0, 0.0, 0.0, 0.08),
            dark: false,
        }
    }
}

/// A see-through line token as the solid colour it shows on `surface`, so it looks the same
/// but no longer brightens where it crosses another line (the toolbar's divider at the content
/// card's edge). Rune blends in sRGB-encoded values, so the mix does too.
fn solid(line: Color, surface: Color) -> Color {
    use rune::color::{srgb_decode, srgb_encode};
    let mix = |s: f32, l: f32| srgb_decode(srgb_encode(s) + (srgb_encode(l) - srgb_encode(s)) * line.a);
    Color { r: mix(surface.r, line.r), g: mix(surface.g, line.g), b: mix(surface.b, line.b), a: 1.0 }
}

/// rune-kit's neutral kit with the prototype's window, panel and panel-edge colours, built once
/// per appearance.
fn kit(dark: bool) -> &'static Kit {
    static LIGHT: OnceLock<Kit> = OnceLock::new();
    static DARK: OnceLock<Kit> = OnceLock::new();
    (if dark { &DARK } else { &LIGHT }).get_or_init(|| {
        let l = look(dark);
        let mut k = Kit::neutral(dark);
        k.c.bg_deep = l.side;
        k.c.border_focus = l.accent;
        k.c.bg_base = l.panel;
        k.c.border_muted = solid(l.line, l.panel);
        k
    })
}

fn font(size: f32, weight: f32) -> TextStyle {
    TextStyle::new(size, weight)
}

fn count(n: usize, l: &Look) -> El {
    text(n.to_string()).font(font(12.0, 400.0).features("'tnum' 1")).color(l.fg3)
}

fn elevated(e: El, l: &Look) -> El {
    let ring = if l.dark { oklcha(1.0, 0.0, 0.0, 0.07) } else { oklcha(0.0, 0.0, 0.0, 0.06) };
    let e = e.box_shadow(Shadow { spread: 1.0, color: ring, ..Shadow::default() });
    if l.dark {
        return e;
    }
    e.box_shadow(Shadow { y: 1.0, blur: 2.0, color: oklcha(0.0, 0.0, 0.0, 0.04), ..Shadow::default() }).box_shadow(Shadow {
        y: 4.0,
        blur: 12.0,
        color: oklcha(0.0, 0.0, 0.0, 0.04),
        ..Shadow::default()
    })
}

type Press = Box<dyn Fn(&mut State, &mut Tx)>;

/// A segmented control: the selected segment is a raised chip.
fn segment(key: &str, items: Vec<(El, bool, Press)>, l: &Look) -> El {
    items.into_iter().fold(row().key(key.to_owned()).role("tablist").padding(2.0).gap(2.0).radius(8.0).fill(l.hover), |seg, (child, on, press)| {
        let b = row()
            .h(26.0)
            .center()
            .radius(6.0)
            .cursor(Cursor::Pointer)
            .role("tab")
            .child(child)
            .on_press_tx(move |s: &mut State, tx: &mut Tx| press(s, tx));
        seg.child(if on { elevated(b.fill(l.panel), l) } else { b })
    })
}

fn swatch(space: &Space, size: f32, l: &Look) -> El {
    let mark = el().size(size, size).radius(size * 0.3);
    let color = crate::theme::space(l.dark, space.hue);
    if space.draft { mark.border(1.5, color).border_dash(2.5, 1.5) } else { mark.fill(color) }
}

/// A shortcut's keycap, on `surface`.
fn kbd(label: &str, surface: Color, l: &Look) -> El {
    row().h(18.0).px(5.0).center().radius(4.0).border(1.0, solid(l.line2, surface)).child(text(label).font(font(11.0, 400.0)).color(l.fg3))
}

/// A sidebar row: the selected one is filled, the others light up under the pointer.
fn nav_row(key: String, label: &str, on: bool, lead: El, tail: El, l: &Look) -> El {
    let r = row()
        .key(key)
        .role("button")
        .label(label)
        .focusable(true)
        .w_full()
        .h(30.0)
        .px(8.0)
        .gap(9.0)
        .center_y()
        .radius(8.0)
        .cursor(Cursor::Pointer)
        .child(lead)
        .child(text(label).font(font(13.5, 400.0)).color(if on { l.fg } else { l.fg2 }).truncate().grow(1.0))
        .child(tail);
    if on { r.fill(l.active) } else { r.hover(l.hover) }
}

fn sidebar(s: &State, account: &Account, l: &Look) -> El {
    let search = row()
        .key("search")
        .role("button")
        .label("Search")
        .focusable(true)
        .w_full()
        .h(32.0)
        .px(8.0)
        .gap(8.0)
        .center_y()
        .radius(8.0)
        .hover(l.hover)
        .cursor(Cursor::Pointer)
        .child(icon(&SEARCH, 16.0).color(l.fg2))
        .child(text("Search").font(font(13.5, 400.0)).color(l.fg2).grow(1.0))
        .children((s.hints == Hints::Shown).then(|| kbd("⌘K", l.side, l)))
        .on_press(palette::toggle);
    let mut list = col().key("nav").w_full().gap(1.0).child(search).child(el().h(6.0));
    for (i, (tab, label, glyph)) in STATES.into_iter().enumerate() {
        let on = s.place == Place::Tab(tab);
        let lead = icon(glyph, 16.0).color(if on { l.fg } else { l.fg2 });
        let tail = if s.hints == Hints::Shown { kbd(&format!("⌘{}", i + 1), l.side, l) } else { count(tab.links(&s.links).len(), l) };
        list = list.child(nav_row(format!("nav-{label}"), label, on, lead, tail, l).on_press(move |s: &mut State| nav::go(s, Place::Tab(tab))));
    }
    list = list.child(text("Spaces").font(font(12.0, 400.0)).color(l.fg3).px(8.0).pt(16.0).pb(4.0));
    for space in &SPACES {
        let lead = row().size(16.0, 16.0).center().child(swatch(space, 10.0, l));
        let tail = if space.draft {
            row()
                .h(17.0)
                .px(6.0)
                .center()
                .radius(99.0)
                .fill(Color { a: 0.12, ..crate::theme::space(l.dark, space.hue) })
                .child(text("New").font(font(10.5, 500.0)).color(crate::theme::space(l.dark, space.hue)))
        } else {
            el()
        };
        let (id, on) = (space.id, s.place == Place::Space(space.id));
        let row = nav_row(format!("space-{id}"), space.name, on, lead, tail, l);
        list = list.child(row.on_press(move |s: &mut State| nav::go(s, Place::Space(id))));
    }
    let name = account.name.as_deref().and_then(|n| n.split_whitespace().next()).unwrap_or(&account.email);
    let initial: String = name.chars().take(1).flat_map(char::to_uppercase).collect();
    let user = row()
        .key("user")
        .role("button")
        .label(name.to_owned())
        .focusable(true)
        .w_full()
        .h(32.0)
        .pl(6.0)
        .pr(8.0)
        .gap(8.0)
        .center_y()
        .radius(8.0)
        .cursor(Cursor::Pointer)
        .child(row().size(20.0, 20.0).center().radius(10.0).fill(l.active).child(text(initial).font(font(10.5, 600.0)).color(l.fg2)))
        .child(text(name.to_owned()).font(font(13.0, 500.0)).color(l.fg).truncate().grow(1.0).min_w(0.0))
        .on_press_tx(|s: &mut State, tx: &mut Tx| show_account_menu(s, true, tx));
    let user = if s.account_menu { user.fill(l.active) } else { user.hover(l.hover) };
    let mut sidebar = col().key("sidebar").w_full().h_full().pb(12.0).child(list).child(el().grow(1.0).w_full().window_drag());
    if s.update.in_sidebar() {
        sidebar = sidebar.child(update_row(s.update, l));
    }
    sidebar.child(user)
}

/// Opens or closes the account's menu. A peeking sidebar stays while it's open, whatever the
/// pointer or the window's focus do. Once it closes, the sidebar stays if the pointer is over it,
/// as after a click in it, and slides away otherwise, as Linear's does.
fn show_account_menu(s: &mut State, open: bool, tx: &mut Tx) {
    tx.animated();
    s.account_menu = open;
    if open {
        s.sidebar.hold_peek();
    } else {
        s.sidebar.release_peek();
    }
}

/// The account's menu, over its name while it's open: Settings and signing out. A modal, so a
/// press anywhere outside it only closes it, title bar bands included (those would move the
/// window instead). It opens above the account row, so it grows from its bottom-leading corner.
fn account_menu(s: &State, l: &Look) -> Option<El> {
    if !s.account_menu {
        return None;
    }
    let item = |key: &str, label: &str, glyph: &'static Icon, tail: El, run: fn(&mut State)| {
        row()
            .key(key.to_owned())
            .role("menuitem")
            .label(label)
            .focusable(true)
            .w_full()
            .h(28.0)
            .px(8.0)
            .gap(8.0)
            .center_y()
            .radius(8.0)
            .hover(l.hover)
            .cursor(Cursor::Pointer)
            .child(icon(glyph, 15.0).color(l.fg2))
            .child(text(label.to_owned()).font(font(13.0, 400.0)).color(l.fg).grow(1.0))
            .child(tail)
            .on_press_tx(move |s: &mut State, tx: &mut Tx| {
                show_account_menu(s, false, tx);
                run(s);
            })
    };
    let settings_hint = if s.hints == Hints::Shown { kbd("⌘,", l.panel, l) } else { el() };
    let menu = col()
        .key("account-menu")
        .role("menu")
        .label("Account")
        .min_w(200.0)
        .padding(4.0)
        .gap(1.0)
        .radius(12.0)
        .fill(l.panel)
        .child(item("menu-settings", "Settings", &SETTINGS, settings_hint, crate::settings::open))
        .child(el().w_full().h(1.0).my(3.0).fill(solid(l.line, l.panel)))
        .child(item("menu-sign-out", "Sign out", &SIGN_OUT, el(), crate::sign_out));
    let origin = Vec2::new(0.0, 1.0);
    Some(
        palette::lifted(menu, l)
            .anchored("user", Side::Top, rune::Align::Start, 6.0)
            .transition(Transition::asymmetric(Transition::scale_anchor(0.96, origin), Transition::scale_anchor(0.98, origin)))
            .modal_tx(true, |s: &mut State, tx: &mut Tx| show_account_menu(s, false, tx))
            .raise(),
    )
}

/// A downloaded update, above the account: a click asks before restarting into it. A small dot
/// where the other rows have an icon, blue, or amber once restarting has failed; a spinner while
/// it restarts.
fn update_row(update: Update, l: &Look) -> El {
    let dot = |c: Color| el().size(6.0, 6.0).radius(3.0).fill(c).box_shadow(Shadow { spread: 3.0, color: c.alpha(0.18), ..Shadow::default() });
    let (label, slot) = match update {
        Update::Installing => ("Restart to update", icon(&LOADER_CIRCLE, 14.0).color(l.fg3).looping(LoopSpec::rotation(1.0))),
        Update::Failed => ("Couldn’t update. Try again", dot(l.warning)),
        _ => ("Restart to update", dot(l.accent)),
    };
    let installing = update == Update::Installing;
    let r = row()
        .key("update")
        .role("button")
        .label(label)
        .focusable(!installing)
        .w_full()
        .min_h(30.0)
        .px(8.0)
        .py(5.0)
        .gap(9.0)
        .mb(6.0)
        .center_y()
        .radius(8.0)
        .child(row().size(16.0, 16.0).center().child(slot))
        .child(text(label).font(font(13.5, 400.0)).color(if installing { l.fg3 } else { l.fg2 }).wrap().grow(1.0).min_w(0.0));
    if installing { r } else { r.hover(l.hover).cursor(Cursor::Pointer).on_press(|s: &mut State| s.confirm_update = true) }
}

/// The update dialog's springs: a quick open, a quicker close.
const DIALOG: SpringPair = SpringPair::new(Spring::new(0.12, 0.0), Spring::new(0.08, 0.0));

/// Asks before restarting into the downloaded update, since restarting closes the window. Return
/// restarts; Escape, a click outside or Later keeps working on this version.
fn update_dialog(s: &State, l: &Look) -> Vec<El> {
    if !s.confirm_update || !s.update.in_sidebar() {
        return Vec::new();
    }
    let button = |key: &'static str, label: &'static str, fill: Color, ink: Color| {
        row()
            .key(key)
            .role("button")
            .label(label)
            .focusable(true)
            .grow(1.0)
            .h(30.0)
            .center()
            .radius(8.0)
            .fill(fill)
            .press_scale(0.97)
            .cursor(Cursor::Pointer)
            .child(text(label).font(font(13.0, 500.0)).color(ink))
    };
    let card = col()
        .key("update-dialog")
        .role("alertdialog")
        .label("Restart to update?")
        .w(320.0)
        .padding(20.0)
        .radius(14.0)
        .fill(l.panel)
        .child(text("Restart to update?").font(font(15.0, 600.0)).color(l.fg))
        .child(
            text("A new version of Cloudstash is ready. The app closes and opens again on it, which takes a few seconds.")
                .font(font(13.0, 400.0).lh(19.0))
                .color(l.fg2)
                .wrap()
                .mt(6.0),
        )
        .child(
            row()
                .w_full()
                .gap(8.0)
                .mt(18.0)
                .child(button("update-later", "Later", l.active, l.fg).hover(l.line2).on_press(|s: &mut State| s.confirm_update = false))
                .child(button("update-restart", "Restart", l.primary, oklch(1.0, 0.0, 0.0)).default_button().on_press(|s: &mut State| {
                    s.confirm_update = false;
                    update::restart(s);
                })),
        );
    let card = palette::lifted(card, l).modal(true, |s: &mut State| s.confirm_update = false);
    vec![
        el().key("update-scrim")
            .absolute(0.0, 0.0)
            .w_full()
            .h_full()
            .backdrop_blur(4.0)
            .fill(oklcha(0.0, 0.0, 0.0, if l.dark { 0.45 } else { 0.18 }))
            .transition(Transition::opacity().springs(DIALOG))
            .a11y_hidden(),
        col()
            .key("update-layer")
            .absolute(0.0, 0.0)
            .w_full()
            .h_full()
            .center()
            .transition(Transition::asymmetric(Transition::scale_anchor(0.96, Vec2::new(0.5, 0.5)), Transition::opacity()).springs(DIALOG))
            .child(card),
    ]
}

/// The toolbar while a link is open all the way: the way back in the title's place, so it moves
/// as the title does when the sidebar opens or closes, and where the link sits in the list.
fn opened_bar(s: &State, link: &LinkItem, lead: f32, l: &Look) -> El {
    let list = shown(s);
    let at = list.iter().position(|x| x.id == link.id).map_or(0, |i| i + 1);
    let place = match s.place {
        Place::Tab(tab) => STATES.iter().find(|(t, ..)| *t == tab).map_or("Back", |(_, name, _)| name),
        Place::Space(id) => SPACES.iter().find(|space| space.id == id).map_or("Back", |space| space.name),
    };
    let back = row()
        .key("preview-back")
        .role("button")
        .label(format!("Back to {place}"))
        .focusable(true)
        .h(CRUMB_H)
        .pl(4.0)
        .pr(8.0)
        .gap(4.0)
        .center_y()
        .radius(8.0)
        .hover(l.hover)
        .press_scale(0.96)
        .cursor(Cursor::Pointer)
        .help("Back  Esc")
        .child(icon(&BACK, 14.0).color(l.fg2))
        .child(text(place).font(font(13.5, 500.0)).color(l.fg))
        .on_press(|s: &mut State| s.preview = None);
    let count = text(format!("{at} of {}", list.len())).key("preview-count").font(font(12.5, 400.0).features("'tnum' 1")).color(l.fg3);
    row().key("opened-bar").w_full().h(TOOLBAR_HEIGHT).pl(lead).pr(16.0).center_y().window_drag().child(back).child(el().grow(1.0)).child(count)
}

fn toolbar(s: &State, l: &Look) -> Toolbar {
    let title = match s.place {
        Place::Space(id) => match SPACES.iter().find(|space| space.id == id) {
            Some(space) => row()
                .key("crumb")
                .gap(8.0)
                .center_y()
                .pl(4.0)
                .child(text("Spaces").font(font(13.5, 400.0)).color(l.fg3))
                .child(icon(&CHEVRON, 12.0).color(l.fg3))
                .child(swatch(space, 10.0, l))
                .child(text(space.name).font(font(13.5, 500.0)).color(l.fg)),
            None => row().key("crumb"),
        },
        Place::Tab(tab) => {
            let name = STATES.iter().find(|(t, ..)| *t == tab).map_or("", |(_, name, _)| name);
            row().key("crumb").pl(4.0).child(text(name).font(font(13.5, 500.0)).color(l.fg))
        }
    };
    let sync = match &s.sync {
        Sync::Online => None,
        Sync::Connecting => Some("Connecting…".to_owned()),
        Sync::Offline => Some("Offline".to_owned()),
        Sync::Failed(e) => Some(e.clone()),
    };
    let zooms = Zoom::ALL
        .into_iter()
        .enumerate()
        .map(|(i, zoom)| {
            let on = s.zoom == zoom;
            let glyph = row().w(30.0).center().help(format!("{}  {}", zoom.label(), i + 1)).child(icon(zoom.glyph(), 15.0).color(if on {
                l.fg
            } else {
                l.fg3
            }));
            (glyph, on, Box::new(move |s: &mut State, tx: &mut Tx| zoom_to(s, zoom, tx)) as Press)
        })
        .collect();
    let mut toolbar = Toolbar::new().leading(title);
    if let Some(sync) = sync {
        toolbar = toolbar.trailing(text(sync).key("sync").font(font(12.0, 400.0)).color(l.fg3).truncate().mr(8.0));
    }
    toolbar.trailing(segment("zoom", zooms, l))
}

/// A title on one line: an X post's title keeps the post's line breaks.
fn one_line(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The links the content panel shows: the chosen state's, or none for a space (spaces have no
/// links yet).
fn shown(s: &State) -> Vec<&LinkItem> {
    match s.place {
        Place::Tab(tab) => tab.links(&s.links),
        Place::Space(_) => Vec::new(),
    }
}

const CARD_MIN: f32 = 230.0;
const CARD_GAP: f32 = 16.0;
const ROW_GAP: f32 = 20.0;
/// A card's hover plate reaches this far past its picture, into the gaps, so the pictures
/// stay where the gaps and page padding put them.
const CARD_PAD: f32 = 8.0;
const PICTURE_RADIUS: f32 = 10.0;
/// The grid's edges line up with the toolbar: its left with the title, its right with the
/// toolbar's buttons, and the scroll bar's thumb runs in the right gutter.
const PAGE_PAD_LEFT: f32 = 16.0;
const PAGE_PAD_RIGHT: f32 = 28.0;
/// Above the first row of cards: its pictures start 16 points down.
const PAGE_PAD_TOP: f32 = 16.0 - CARD_PAD;
/// A card picture's pixel size: 16:11, sharp at 2× up to 400 pt wide. A favicon's, at 2×.
/// A card's picture, whole: at most this many pixels a side, at its own shape.
const PICTURE: (u32, u32) = (800, 420);
const FAVICON: (u32, u32) = (28, 28);
pub const IMAGE_SIZES: [(u32, u32); 3] = [PICTURE, FAVICON, WHOLE];

/// The pictures a card draws.
fn card_images(link: &LinkItem) -> impl Iterator<Item = Request> + '_ {
    let picture = link.image.as_deref().map(|url| Request::whole(url, PICTURE));
    let favicon = link.favicon.as_deref().map(|url| Request::new(url, FAVICON, Lane::Icon));
    picture.into_iter().chain(favicon)
}

/// Every card's pictures, newest link first, for the background fill.
pub fn wanted_images(links: &[LinkItem]) -> Vec<Request> {
    let mut newest: Vec<&LinkItem> = links.iter().filter(|l| l.deleted_at.is_none()).collect();
    newest.sort_by_key(|l| std::cmp::Reverse(l.created_at));
    newest.into_iter().flat_map(card_images).collect()
}

/// Only the bottom fades, over 20 pt at a strength that follows what's still below and gone at
/// the end. The top has no fade: a hairline under the toolbar fades in over the first
/// `DIVIDER_RAMP` points scrolled.
const FADE: f32 = 20.0;
const DIVIDER_RAMP: f32 = 24.0;

/// The divider's opacity once the grid is scrolled `offset` points.
fn divider_opacity(offset: f32) -> f32 {
    (offset / DIVIDER_RAMP).clamp(0.0, 1.0)
}

/// How many cards fit across `width` at `zoom` (CSS `repeat(auto-fill, minmax(230px, 1fr))`).
fn columns(width: f32, zoom: Zoom) -> usize {
    let Some(min) = zoom.card_min() else { return 1 };
    (((width - PAGE_PAD_LEFT - PAGE_PAD_RIGHT + CARD_GAP) / (min + CARD_GAP)).floor() as usize).max(1)
}

/// The feed's column, at most this wide.
const FEED_W: f32 = 600.0;

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64)
}

/// When a link was saved, as the prototype says it: Today, Yesterday, 3d, 2w, then Mar 4.
fn ago(created_ms: i64, now_ms: i64) -> String {
    const DAY: i64 = 86_400_000;
    let days = now_ms.div_euclid(DAY) - created_ms.div_euclid(DAY);
    match days {
        ..=0 => "Today".to_owned(),
        1 => "Yesterday".to_owned(),
        2..=6 => format!("{days}d"),
        7..=30 => format!("{}w", (days as f32 / 7.0).round()),
        _ => {
            let (month, day) = month_day(created_ms.div_euclid(DAY));
            const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            format!("{} {day}", MONTHS[month - 1])
        }
    }
}

/// The month (1–12) and day of a day count since 1970-01-01 (Howard Hinnant's civil_from_days).
fn month_day(days: i64) -> (usize, i64) {
    let z = days + 719_468;
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (month as usize, day)
}

/// A link's favicon, or its domain's initial when there's none or it can't be loaded.
fn favicon(link: &LinkItem, size: f32, l: &Look) -> El {
    match link.favicon.as_deref().map(|url| Request::new(url, FAVICON, Lane::Icon)).filter(|r| !images::failed(r)) {
        Some(req) => el().size(size, size).radius(4.0).fill(l.tile).pixels_fit(&images::picture(&req), SurfaceFit::Fill),
        None => {
            let initial: String = link.domain.chars().take(1).flat_map(char::to_uppercase).collect();
            row().size(size, size).center().radius(4.0).fill(l.tile).child(text(initial).font(font(size * 0.57, 600.0)).color(l.fg2))
        }
    }
}

/// A link's picture, or its title on a tile when it has none.
fn picture(link: &LinkItem, radius: f32, l: &Look) -> El {
    let ring = el().pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0)).radius(radius).border(1.0, l.ring);
    let tile = el().w_full().aspect_ratio(16.0 / 11.0).radius(radius).clip_rounded(radius).fill(l.tile);
    let tile = match &link.image {
        Some(url) => tile.pixels_fit(&images::picture(&Request::whole(url, PICTURE)), SurfaceFit::Fill),
        None => {
            tile.padding(14.0).child(text(one_line(&link.title)).font(font(13.0, 400.0).lh(18.85)).color(l.fg2).w_full().wrap_anywhere().max_lines(6))
        }
    };
    tile.child(ring)
}

/// What a card says about a link under its title: the summary, else the description.
fn blurb(link: &LinkItem) -> Option<String> {
    link.summary.as_deref().or(link.description.as_deref()).map(one_line).filter(|t| !t.is_empty())
}

/// A link card at `zoom`: its picture, then as much about it as the zoom shows. A click opens
/// its preview; ⌘-click opens it in the browser.
fn card(link: &LinkItem, now: i64, zoom: Zoom, l: &Look) -> El {
    let fly = |what: &str, el: El| el.matched(format!("{what}-{}", link.id)).matched_motion(REFLOW).transition(Transition::opacity());
    let picture = fly(
        "picture",
        picture(link, PICTURE_RADIUS, l).key("picture").live_opacity(crate::sphere::reveal()).on_layout_tx({
            let id = link.id.clone();
            move |_: &mut State, rect, tx| {
                crate::sphere::card_at(&id, rect);
                tx.live_only();
            }
        }),
    );
    let meta = row()
        .w_full()
        .gap(6.0)
        .center_y()
        .child(favicon(link, 14.0, l))
        .child(text(link.domain.clone()).font(font(12.0, 400.0)).color(l.fg3).group_color(l.fg2).truncate().grow(1.0).min_w(0.0))
        .child(text(ago(link.created_at, now)).font(font(12.0, 400.0)).color(l.fg3).group_color(l.fg2));
    let (url, id) = (link.url.clone(), link.id.clone());
    let card = col()
        .key(card_key(&link.id, zoom))
        .role("link")
        .label(link.title.clone())
        .focusable(true)
        .min_w(0.0)
        .gap(8.0)
        .padding(CARD_PAD)
        .radius(PICTURE_RADIUS + CARD_PAD)
        .hover(l.hover)
        .press(l.hover)
        .cursor(Cursor::Pointer)
        .hover_group()
        .on_hover_change({
            let (image, id) = (link.image.clone(), link.id.clone());
            move |s: &mut State, inside, tx: &mut Tx| {
                if inside {
                    s.hovered = Some(id.clone());
                } else if s.hovered.as_ref() == Some(&id) {
                    s.hovered = None;
                }
                if let Some(url) = image.as_deref().filter(|_| inside) {
                    images::picture(&Request::whole(url, WHOLE));
                }
                tx.live_only();
            }
        })
        .on_press_tx(move |s: &mut State, tx: &mut Tx| {
            if tx.mods().cmd {
                return crate::open_link(&url);
            }
            preview(s, &id, false);
        });
    let title =
        |size: f32, lh: f32, lines: usize| text(link.title.clone()).font(font(size, 500.0).lh(lh)).color(l.fg).wrap_anywhere().max_lines(lines);
    let blurb = |lines: usize| blurb(link).map(|b| text(b).font(font(13.0, 400.0).lh(19.0)).color(l.fg2).wrap().max_lines(lines));
    let words =
        |title: El, lines: usize| fly("words", col().w_full().gap(8.0).child(title).children(blurb(lines).filter(|_| lines > 0)).matched_crop());
    let meta = fly("meta", meta.matched_crop());
    match zoom {
        Zoom::Pictures => card.help(link.title.clone()).child(picture),
        Zoom::Titles => card.child(picture).child(words(title(13.5, 18.2, 2), 0)).child(meta),
        Zoom::Summaries => card.child(picture).child(words(title(14.5, 19.5, 2), 3)).child(meta),
        Zoom::Feed => card.gap(10.0).child(meta).child(picture).child(words(title(17.0, 23.0, 3), 6)),
    }
}

/// Changes the zoom and keeps the card under the pointer, else the first card whose top is in
/// view, where it shows, so the eye has something to hold on to; every other card the new grid
/// shows flies to its place (`REFLOW`), as Atlas's grid does. A card the old grid had in view
/// flies from where it was, and any other from its place in the old grid, out of view, after a
/// frame that has a stand-in for it there (`Ghost`): the whole grid moves, none of it fades.
///
/// Rows a virtual list mounts for a scroll land at once and wouldn't fly, so until the held card
/// lands the new grid isn't virtual: it builds the rows it shows where it lands (`State::landing`)
/// between spacers at the rows' estimated height, as the list places rows it hasn't built.
fn zoom_to(s: &mut State, zoom: Zoom, tx: &mut Tx) {
    if zoom == s.zoom || !s.ghosts.is_empty() {
        return;
    }
    let list = shown(s);
    let hovered = s.hovered.as_ref().and_then(|id| list.iter().position(|l| &l.id == id));
    let candidates: Vec<(usize, String)> = match hovered {
        Some(at) => vec![at],
        None => s.top_cards.to_vec(),
    }
    .into_iter()
    .filter_map(|at| Some((at, card_key(&list.get(at)?.id, s.zoom))))
    .collect();
    if candidates.is_empty() {
        s.zoom = zoom;
        return;
    }
    let viewport = Rc::new(Cell::new(None));
    tx.read_layout("viewport", {
        let viewport = viewport.clone();
        move |_: &mut State, rect, _: &mut Tx| viewport.set(rect)
    });
    let found = Rc::new(Cell::new(None::<(usize, [f32; 4])>));
    let last = candidates.len() - 1;
    for (i, (at, id)) in candidates.into_iter().enumerate() {
        let (viewport, found) = (viewport.clone(), found.clone());
        tx.read_layout(id, move |s: &mut State, rect, tx: &mut Tx| {
            let Some(v) = viewport.get() else { return };
            if let Some(card) = rect
                && found.get().is_none_or(|(_, was)| was[1] < v[1])
            {
                found.set(Some((at, card)));
            }
            if i != last {
                return;
            }
            let Some((at, card)) = found.get() else {
                s.zoom = zoom;
                return;
            };
            let (columns, pitch) = (columns(v[2], zoom), zoom.row_estimate());
            let row = at / columns;
            let list = shown(s);
            let end = (PAGE_PAD_TOP + list.len().div_ceil(columns) as f32 * pitch + 80.0 - v[3]).max(0.0);
            let to = (PAGE_PAD_TOP + row as f32 * pitch - (card[1] - v[1])).clamp(0.0, end);
            let y = PAGE_PAD_TOP + row as f32 * pitch - to;
            let rows = row.saturating_sub(((y - PAGE_PAD_TOP) / pitch).ceil().max(0.0) as usize + 1)
                ..row + ((v[3] - y) / pitch).ceil().max(0.0) as usize + 2;
            let key = card_key(&list[at].id, zoom);
            for ghost in ghosts(s, zoom, at, card, v[1] + y, v) {
                tx.read_layout(card_key(&ghost.id, s.zoom), move |s: &mut State, mounted, _: &mut Tx| {
                    if mounted.is_none() {
                        s.ghosts.push(ghost.clone());
                    }
                });
            }
            let switch = move |s: &mut State, _: Option<[f32; 4]>, tx: &mut Tx| {
                s.zoom = zoom;
                s.ghosts.clear();
                s.landing = Some(rows);
                tx.animated();
                tx.read_layout(key.clone(), move |_: &mut State, landed, tx: &mut Tx| {
                    if let Some(landed) = landed {
                        tx.scroll_to_with("viewport", 0.0, (SCROLLED.get() + landed[1] - card[1]).max(0.0), REFLOW);
                    }
                    once_landed(
                        tx,
                        key.clone(),
                        None,
                        Rc::new({
                            let key = key.clone();
                            move |s: &mut State, tx: &mut Tx| {
                                s.landing = None;
                                tx.instant();
                                tx.keep_on_screen(key.clone());
                            }
                        }),
                    );
                });
            };
            tx.read_layout("viewport", move |_: &mut State, _, tx: &mut Tx| tx.read_layout("viewport", switch));
        });
    }
}

type Then = Rc<dyn Fn(&mut State, &mut Tx)>;

/// Runs `then` once the element keyed `key` has stopped moving: drawn in the same place two
/// frames running.
fn once_landed(tx: &mut Tx, key: String, was: Option<[f32; 4]>, then: Then) {
    tx.read_presented(key.clone(), move |s: &mut State, drawn, tx: &mut Tx| match drawn.map(|(rect, _)| rect) {
        Some(rect) if was != Some(rect) => once_landed(tx, key, Some(rect), then),
        _ => then(s, tx),
    });
}

thread_local! {
    /// How far the grid is scrolled, for a zoom change to work out where to scroll it.
    static SCROLLED: Cell<f32> = const { Cell::new(0.0) };
}

/// A card's key at `zoom`: a zoom change mounts every card afresh, so each one flies (`matched`)
/// rather than some jumping where they stay in the same row.
fn card_key(id: &str, zoom: Zoom) -> String {
    format!("{id}@{}", zoom.label())
}

/// A stand-in for a card in the frame before a zoom change: its id, and where it would be in
/// the old grid, from the viewport's top left.
#[derive(Clone, Debug, PartialEq)]
pub struct Ghost {
    id: String,
    rect: [f32; 4],
}

/// Where card `i` lands in the grid at `zoom` in a viewport at `v` (window points), when card
/// `anchor` lands with its top at `top`: its column exact, its row at the zoom's estimated row
/// height.
fn slot(i: usize, anchor: usize, top: f32, v: [f32; 4], zoom: Zoom) -> [f32; 4] {
    let columns = columns(v[2], zoom);
    let gap = CARD_GAP - 2.0 * CARD_PAD;
    let inner = v[2] - PAGE_PAD_LEFT - PAGE_PAD_RIGHT + 2.0 * CARD_PAD;
    let w = if zoom == Zoom::Feed { inner.min(FEED_W + 2.0 * CARD_PAD) } else { (inner - gap * (columns - 1) as f32) / columns as f32 };
    let left = v[0] + PAGE_PAD_LEFT - CARD_PAD + (inner - w * columns as f32 - gap * (columns - 1) as f32) / 2.0;
    let rows = (i / columns) as f32 - (anchor / columns) as f32;
    let pitch = zoom.row_estimate();
    [left + (i % columns) as f32 * (w + gap), top + rows * pitch, w, pitch - gap]
}

/// The stand-ins for the frame before changing to `zoom`, card `at` (drawn at `card`) landing
/// with its top at `land`: one for each card the new grid shows in the viewport `v` that isn't in view now, at
/// its place in the grid as it is, so every card moves from where it was, as the ones in view do.
fn ghosts(s: &State, zoom: Zoom, at: usize, card: [f32; 4], land: f32, v: [f32; 4]) -> Vec<Ghost> {
    let list = shown(s);
    let held = slot(at, at, card[1], v, s.zoom);
    let columns = columns(v[2], zoom);
    let pitch = zoom.row_estimate();
    let above = ((land - v[1]) / pitch).ceil().max(0.0) as usize + 1;
    let below = ((v[1] + v[3] - land) / pitch).ceil().max(0.0) as usize + 1;
    let first = (at / columns).saturating_sub(above) * columns;
    let end = ((at / columns + below + 1) * columns).min(list.len());
    (first..end)
        .filter(|i| !s.in_view.contains(i))
        .filter_map(|i| {
            let r = slot(i, at, land, v, zoom);
            (r[1] < v[1] + v[3] && r[1] + r[3] > v[1]).then(|| {
                let was = slot(i, at, card[1], v, s.zoom);
                Ghost { id: list[i].id.clone(), rect: [was[0] + card[0] - held[0] - v[0], was[1] - v[1], card[2], card[3]] }
            })
        })
        .collect()
}

/// A copy of each of the first cards' pictures, for the opening to fly in (`sphere::opening`).
pub fn opening_pictures(s: &State, dark: bool) -> Vec<(String, El)> {
    let l = look(dark);
    shown(s)
        .into_iter()
        .take(60)
        .map(|link| {
            let tile = el().fill(l.tile);
            (
                link.id.clone(),
                match &link.image {
                    Some(url) => tile.pixels_fit(&images::picture(&Request::whole(url, PICTURE)), SurfaceFit::Fill),
                    None => tile,
                },
            )
        })
        .collect()
}

/// The prototype's grid: cards in as many columns as fit at the zoom, built a row at a time as
/// they scroll into view, so only those cards fetch their pictures. The feed is one column.
fn grid(s: &State, columns: usize, dark: bool) -> El {
    let rows = shown(s).len().div_ceil(columns);
    let zoom = s.zoom;
    let grid = col().key("grid").w_full();
    let grid = if zoom == Zoom::Feed { grid.max_w(FEED_W + 2.0 * CARD_PAD) } else { grid };
    let row = move |s: &State, i: usize| {
        let l = look(dark);
        let now = now_ms();
        let gap = if zoom == Zoom::Feed { 40.0 } else { ROW_GAP };
        shown(s)
            .iter()
            .skip(i * columns)
            .take(columns)
            .fold(row().w_full().equal_columns(columns).gap(CARD_GAP - 2.0 * CARD_PAD).pb(gap - 2.0 * CARD_PAD), |r, link| {
                r.child(card(link, now, zoom, &l))
            })
    };
    if let Some(landing) = &s.landing {
        let (first, end) = (landing.start.min(rows), landing.end.min(rows));
        let pitch = zoom.row_estimate();
        return grid
            .child(el().key("rows-above").h(first as f32 * pitch))
            .children((first..end).map(|i| row(s, i).key(format!("row-{i}@{}", zoom.label()))))
            .child(el().key("rows-below").h((rows - end) as f32 * pitch));
    }
    grid.growth(GrowthSpec::default())
        .on_visible_rows(move |s: &mut State, rows: std::ops::Range<usize>| {
            s.top_cards = [rows.start * columns, (rows.start + 1) * columns];
            s.in_view = rows.start * columns..rows.end * columns;
            images::visible(shown(s).into_iter().skip(rows.start * columns).take(rows.len() * columns).flat_map(card_images).collect());
            false
        })
        .virtual_rows(rows, zoom.row_estimate(), move |_: &State, i| Cow::Owned(format!("row-{i}@{}", zoom.label())), row)
}

fn page(s: &State, cx: &mut Cx<State>, dark: bool, l: &Look) -> El {
    let body = if shown(s).is_empty() {
        let empty = if matches!(s.place, Place::Space(_)) || s.sync == Sync::Online { "Nothing here yet." } else { "Loading your library…" };
        text(empty).key("empty").font(font(13.0, 400.0)).color(l.fg3)
    } else {
        let zoom = s.zoom;
        grid(s, cx.layout_with("viewport", move |r| columns(r[2], zoom)).unwrap_or(3), dark)
    };
    let centered = s.zoom == Zoom::Feed;
    let divider = Live::new(0.0);
    let viewport = col()
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .scroll(ScrollSpec { stick_bottom: false })
        .scroll_fade(ScrollFade::strength(FADE).end_only())
        .scroll_margin(FADE)
        .on_scroll_offset({
            let divider = divider.clone();
            move |at| {
                SCROLLED.set(at.offset[1]);
                divider.set(divider_opacity(at.offset[1]));
                crate::sphere::scrolled(at.offset[1], rune::scroll_watch_state().0);
            }
        })
        .child({
            let page = col().key("page").w_full().pl(PAGE_PAD_LEFT - CARD_PAD).pr(PAGE_PAD_RIGHT - CARD_PAD).pt(PAGE_PAD_TOP).pb(80.0);
            if centered { page.items_center() } else { page }.child(body)
        });
    let opened = matches!(previewed(s), Some((_, true)));
    let viewport = viewport.key("viewport").scroll_bar_styled(scroll_bar(l));
    col()
        .key("viewport-area")
        .w_full()
        .h_full()
        .min_h(0.0)
        .children((!opened).then(|| el().key("divider").w_full().h(1.0).fill(solid(l.line2, l.panel)).live_opacity(&divider)))
        .child(col().key("viewport-box").w_full().grow(1.0).min_h(0.0).child(if opened { viewport.inert() } else { viewport }).children(
            s.ghosts.iter().map(|g| {
                let w = g.rect[2] - 2.0 * CARD_PAD;
                el().key(format!("ghost-{}", g.id))
                    .matched(format!("picture-{}", g.id))
                    .pin(Some(g.rect[0] + CARD_PAD), Some(g.rect[1] + CARD_PAD), None, None)
                    .size(w, w * 11.0 / 16.0)
                    .radius(PICTURE_RADIUS)
                    .a11y_hidden()
            }),
        ))
}

/// The preview grows into the opened link, its panel's fill fading into the content card's as it
/// does; they share this id.
const OPENING: &str = "link-shown";
const GROW: Spring = Spring::new(0.26, 0.0);
/// Cards fly to their new places on this when the zoom changes the columns: SwiftUI's smooth
/// spring, a touch longer than a control's so a whole grid travelling reads as one move, with
/// just enough bounce that it settles rather than stops.
const REFLOW: Spring = Spring::new(0.36, 0.12);
/// The opened link settles back a touch and fades as it closes, quickly.
const CLOSE: SpringPair = SpringPair::new(Spring::new(0.2, 0.0), Spring::new(0.16, 0.0));
/// The preview and the dim behind it come in on a quick spring and go on a quicker one.
const DIM: SpringPair = SpringPair::new(Spring::new(0.2, 0.0), Spring::new(0.14, 0.0));

/// The whole picture, for the preview: at most this many pixels a side, at its own shape.
const WHOLE: (u32, u32) = (1400, 1400);

/// "Saved 3d ago", "Saved today", "Saved Mar 4".
fn saved(created_ms: i64, now_ms: i64) -> String {
    match ago(created_ms, now_ms).as_str() {
        "Today" => "Saved today".to_owned(),
        "Yesterday" => "Saved yesterday".to_owned(),
        a if a.ends_with('d') || a.ends_with('w') => format!("Saved {a} ago"),
        a => format!("Saved {a}"),
    }
}

/// The link's picture on the preview and the opened link, as the web app shows it: as wide as
/// its place at a fixed 16:9, filled and cropped when its shape differs, so stepping between
/// links never moves the text; None when the link has none. The sharper copy draws over the
/// card's, so the card's shows until it loads and it shows the moment it does.
fn whole_picture(link: &LinkItem, l: &Look) -> Option<El> {
    let url = link.image.as_deref()?;
    let sharper = el().pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0)).pixels_fit(&images::picture(&Request::whole(url, WHOLE)), SurfaceFit::Fill);
    let ring = el().pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0)).radius(10.0).border(1.0, l.ring);
    Some(
        el().key("preview-picture")
            .w_full()
            .aspect_ratio(16.0 / 9.0)
            .radius(10.0)
            .clip_rounded(10.0)
            .fill(l.tile)
            .pixels_fit(&images::picture(&Request::whole(url, PICTURE)), SurfaceFit::Fill)
            .child(sharper)
            .child(ring)
            .a11y_hidden(),
    )
}

/// The page text the preview and the opened link show. The reader's text comes later; until then
/// it's what the page says about itself.
fn page_text(link: &LinkItem, size: f32, lh: f32, l: &Look) -> El {
    match link.description.as_deref().map(str::trim).filter(|t| !t.is_empty() && Some(*t) != link.summary.as_deref().map(str::trim)) {
        Some(t) => text(t.to_owned()).font(font(size, 400.0).lh(lh)).color(l.fg).wrap_anywhere(),
        None => text("This page has no saved text yet.").font(font(14.0, 400.0).lh(21.0)).color(l.fg2).wrap(),
    }
}

/// The link shown over the grid, inside the content card: it lays out with the card, so it keeps
/// to the card's size as the sidebar opens and closes. The preview is a panel centred under the
/// toolbar over a dimmed, blurred card, toolbar included; a click on it or ↵ opens the link all
/// the way, over the content under the toolbar, which then shows the way back in its title's
/// place. Esc, a click on the dimmed card or Back closes it, and the sidebar stays usable; in the preview, ← and → step to the links
/// beside it.
fn overlay(s: &State, lead: f32, l: &Look) -> Vec<El> {
    let Some((link, full)) = previewed(s) else {
        return Vec::new();
    };
    if full {
        return vec![opened(s, link, lead, l)];
    }
    let id = link.id.clone();
    let radius = kit(l.dark).radius.lg;
    let dim = el()
        .key("preview-dim")
        .pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
        .radius(radius)
        .clip_rounded(radius)
        .backdrop_blur(2.0)
        .fill(oklcha(0.0, 0.0, 0.0, if l.dark { 0.35 } else { 0.14 }))
        .border(1.0, kit(l.dark).c.border_muted)
        .transition(Transition::opacity().springs(DIM))
        .a11y_hidden()
        .on_press(|s: &mut State| s.preview = None);
    let panel = col()
        .key("preview-panel")
        .matched(OPENING)
        .matched_motion(GROW)
        .role("dialog")
        .label(link.title.clone())
        .w_full()
        .max_w(PEEK_W)
        .h_full()
        .radius(20.0)
        .clip_rounded(20.0)
        .fill(l.panel)
        .cursor(Cursor::Pointer)
        .transition(Transition::scale(0.97).combined(Transition::opacity()).springs(DIM))
        .child(peek(link, whole_picture(link, l), l))
        .on_press(move |s: &mut State| preview(s, &id, true));
    let stage = col()
        .key("preview-stage")
        .pin(Some(0.0), Some(TOOLBAR_HEIGHT), Some(0.0), Some(0.0))
        .px(24.0)
        .py(20.0)
        .items_center()
        .child(palette::lifted(panel, l));
    vec![dim, stage]
}

/// The opened link's margin: its width, and where its picture sits below the way back.
const MARGIN_W: f32 = 280.0;
/// The preview's widest.
const PEEK_W: f32 = 720.0;
const MARGIN_PAD: [f32; 4] = [24.0, 18.0, 40.0, 24.0];
const CRUMB_H: f32 = 28.0;

const MARGIN_GAP: f32 = 20.0;

/// How far the preview's text and picture fade into its top edge and its footer as they scroll
/// under them; nothing fades while there's nothing more to scroll that way.
const PEEK_FADE: f32 = 32.0;

/// What the preview holds: the picture, where the link is from, the title, the summary and the
/// page's text, and a footer saying what a click does.
fn peek(link: &LinkItem, picture: Option<El>, l: &Look) -> El {
    let now = now_ms();
    let meta = row()
        .w_full()
        .gap(6.0)
        .center_y()
        .child(favicon(link, 14.0, l))
        .child(text(link.domain.clone()).font(font(12.5, 400.0)).color(l.fg3))
        .child(text("·").font(font(12.5, 400.0)).color(l.fg3))
        .child(text(saved(link.created_at, now)).font(font(12.5, 400.0).features("'tnum' 1")).color(l.fg3));
    let reading = col()
        .w_full()
        .max_w(660.0)
        .self_center()
        .px(14.0)
        .pt(18.0)
        .pb(36.0)
        .child(meta)
        .child(text(link.title.clone()).font(font(24.0, 700.0).lh(29.0)).color(l.fg).wrap_anywhere().mt(8.0).mb(12.0))
        .children(link.summary.as_deref().map(|t| text(one_line(t)).font(font(14.0, 400.0).lh(21.7)).color(l.fg2).wrap().mb(18.0)))
        .child(page_text(link, 17.0, 28.9, l));
    let body = col()
        .key("peek-body")
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .px(10.0)
        .pt(10.0)
        .pb(10.0)
        .scroll(ScrollSpec { stick_bottom: false })
        .scroll_edge_fade(PEEK_FADE)
        .children(picture)
        .child(reading);
    let foot = row()
        .w_full()
        .px(16.0)
        .py(9.0)
        .gap(16.0)
        .center_y()
        .child(
            row()
                .gap(6.0)
                .center_y()
                .child(icon(&RETURN, 13.0).color(l.accent))
                .child(text("Click or ↵ to open").font(font(12.0, 500.0)).color(l.accent)),
        )
        .child(text("← → next").font(font(12.0, 400.0)).color(l.fg3))
        .child(el().grow(1.0))
        .child(text("Esc or click outside to close").font(font(12.0, 400.0)).color(l.fg3));
    col().key("peek").w_full().h_full().child(body).child(el().w_full().h(1.0).fill(solid(l.line, l.panel))).child(foot)
}

/// A small heading in the opened link's margin.
fn label(t: &str, l: &Look) -> El {
    text(t.to_uppercase()).font(font(11.0, 600.0)).color(l.fg3).mb(6.0)
}

/// A link opened all the way, over the content under the toolbar, which shows the way back: a
/// margin with the picture, where it's from, the summary, the tags and the actions, beside the
/// title and the page's text, which scroll on their own. The actions that change a link come
/// later; they show, marked as such, so their place is set. It takes every click on it, and the
/// grid keeps its place underneath for when it closes.
fn opened(s: &State, link: &LinkItem, lead: f32, l: &Look) -> El {
    let now = now_ms();
    let url = link.url.clone();
    let site = row()
        .key("preview-site")
        .role("link")
        .label(format!("Open {} in the browser", link.domain))
        .focusable(true)
        .gap(6.0)
        .center_y()
        .cursor(Cursor::Pointer)
        .child(favicon(link, 14.0, l))
        .child(text(link.domain.clone()).font(font(12.5, 500.0)).color(l.fg))
        .child(icon(&BROWSER, 12.0).color(l.fg3))
        .on_press(move |_: &mut State| crate::open_link(&url));
    let facts =
        col().w_full().gap(3.0).child(site).child(text(saved(link.created_at, now)).font(font(12.5, 400.0).features("'tnum' 1")).color(l.fg2));
    let summary = link
        .summary
        .as_deref()
        .map(|t| col().w_full().child(label("Summary", l)).child(text(one_line(t)).font(font(13.5, 400.0).lh(21.0)).color(l.fg2).wrap()));
    let tags = (!link.tags.is_empty()).then(|| {
        let chips = link.tags.iter().fold(row().w_full().gap(6.0).flex_wrap(), |r, tag| {
            r.child(row().h(22.0).px(8.0).center().radius(99.0).fill(l.hover).child(text(format!("#{tag}")).font(font(12.0, 400.0)).color(l.fg2)))
        });
        col().w_full().child(label("Tags", l)).child(chips)
    });
    let url = link.url.clone();
    let act = |key: &str, glyph: &'static Icon, name: &str| {
        row()
            .key(key.to_owned())
            .role("button")
            .label(name.to_owned())
            .w_full()
            .h(32.0)
            .px(8.0)
            .gap(10.0)
            .center_y()
            .radius(8.0)
            .child(icon(glyph, 15.0).color(l.fg3))
    };
    let later = |key: &str, glyph: &'static Icon, name: &str| {
        act(key, glyph, name)
            .child(text(name.to_owned()).font(font(13.0, 400.0)).color(l.fg3).grow(1.0))
            .child(text("soon").font(font(11.0, 400.0)).color(l.fg3))
    };
    let acts = col()
        .w_full()
        .ml(-8.0)
        .gap(1.0)
        .child(
            act("preview-browser", &BROWSER, "Open in browser")
                .focusable(true)
                .hover(l.hover)
                .press_scale(0.96)
                .cursor(Cursor::Pointer)
                .child(text("Open in browser").font(font(13.0, 400.0)).color(l.fg2).grow(1.0))
                .child(kbd("⌘↵", l.panel, l))
                .on_press(move |_: &mut State| crate::open_link(&url)),
        )
        .child(later("preview-done", &DONE, "Mark done"))
        .child(later("preview-tags", &TAG, "Edit tags"))
        .child(later("preview-delete", &TRASH, "Delete"));
    let margin =
        col().key("preview-margin").w(MARGIN_W).h_full().pt(MARGIN_GAP).pr(MARGIN_PAD[1]).pb(MARGIN_PAD[2]).pl(MARGIN_PAD[3]).gap(MARGIN_GAP);
    let margin = margin.children(whole_picture(link, l)).child(facts).children(summary).children(tags).child(acts);
    let reading = col().key("preview-text").grow(1.0).min_w(0.0).h_full().scroll(ScrollSpec { stick_bottom: false }).child(
        col()
            .w_full()
            .max_w(680.0 + 84.0)
            .pt(MARGIN_GAP)
            .pr(56.0)
            .pb(140.0)
            .pl(28.0)
            .child(text(link.title.clone()).font(font(34.0, 700.0).lh(38.8)).color(l.fg).wrap_anywhere().mb(24.0))
            .child(page_text(link, 18.0, 31.0, l)),
    );
    let k = kit(l.dark);
    col()
        .key("opened")
        .matched(OPENING)
        .matched_motion(GROW)
        .role("dialog")
        .label(link.title.clone())
        .pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
        .radius(k.radius.lg)
        .clip_rounded(k.radius.lg)
        .fill(l.panel)
        .border(1.0, k.c.border_muted)
        .transition(Transition::scale(0.98).combined(Transition::opacity()).springs(CLOSE))
        .on_background_press(|_: &mut State| {})
        .child(
            col()
                .key("opened-body")
                .w_full()
                .h_full()
                .origin(0.5, 0.0)
                .live_scale(grown().smooth(GROW))
                .on_layout_tx(|_: &mut State, _, tx| {
                    grown().set(1.0);
                    tx.live_only();
                })
                .child(opened_bar(s, link, lead, l))
                .child(row().w_full().grow(1.0).min_h(0.0).child(margin).child(reading)),
        )
}

/// The app's scroll bar: thin, widening and darkening under the pointer.
fn scroll_bar(l: &Look) -> ScrollBarStyle {
    ScrollBarStyle::scroll_view(kit(l.dark)).width(6.0).hover_width(10.0).thumb(l.fg3.alpha(0.5)).thumb_hover(l.fg3.alpha(0.85))
}

pub fn view(s: &State, account: &Account, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let l = look(dark);
    let shell = SplitView::new(page(s, cx, dark, &l))
        .sidebar::<State>(&s.sidebar, |s| &mut s.sidebar, sidebar(s, account, &l))
        .sidebar_padding(8.0, 8.0)
        .sidebar_toggle(SidebarToggle::new().shortcut("⌘B"))
        .sidebar_peek(SidebarPeek::new().edge(16.0, EDGE_PEEK_DELAY).toggle_delay(Duration::ZERO).scrim(l.scrim))
        .sidebar_floater(account_menu(s, &l))
        .toolbar(toolbar(s, &l))
        .toolbar_in_panel()
        .titlebar_inset(cx.titlebar_inset());
    let lead = shell.toolbar_lead();
    let shell = shell.main_overlay(overlay(s, lead, &l)).build(kit(dark));
    let palette = palette::layers(s, &l);
    el().key("window")
        .w_full()
        .h_full()
        .child(shell)
        .children(palette)
        .children(update_dialog(s, &l))
        .child(fps::meter::<State>(l.fg2, l.panel, l.line2).pin(None, None, Some(20.0), Some(20.0)).paint_order(100))
}

/// How long the pointer rests on the window's left edge before the closed sidebar peeks, so
/// passing over the edge on the way to something else doesn't open it. Its toggle opens it at once.
const EDGE_PEEK_DELAY: Duration = Duration::from_millis(650);

/// How long ⌘ is held alone before the sidebar shows its shortcuts, as Grok and Raycast do.
const HINT_DELAY: f64 = 0.6;

/// The sidebar's shortcut hints: hidden, waiting for ⌘ to be held until a time, or shown.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum Hints {
    #[default]
    Hidden,
    Until(f64),
    Shown,
}

impl Hints {
    /// ⌘ went down alone (or another modifier joined it, or it went up) at `now`.
    fn held(self, alone: bool, now: f64) -> Hints {
        match (alone, self) {
            (false, _) => Hints::Hidden,
            (true, Hints::Hidden) => Hints::Until(now + HINT_DELAY),
            (true, held) => held,
        }
    }

    fn at(self, now: f64) -> Hints {
        match self {
            Hints::Until(due) if now >= due => Hints::Shown,
            hints => hints,
        }
    }
}

/// Starts or ends holding ⌘ alone; leaving the window lets go of every modifier.
pub fn on_modifiers(s: &mut State, mods: Mods, tx: &mut Tx) {
    let alone = mods.cmd && !mods.shift && !mods.alt && !mods.ctrl;
    s.hints = s.hints.held(alone, tx.clock());
    if matches!(s.hints, Hints::Until(_)) {
        tx.wake_after(Duration::from_secs_f64(HINT_DELAY));
    }
}

/// Shows the hints once ⌘ has been held long enough.
pub fn poll_hints(s: &mut State, now: f64) -> bool {
    let hints = s.hints.at(now);
    std::mem::replace(&mut s.hints, hints) != hints
}

/// The place ⌘1 to ⌘4 go to: the library's states in sidebar order.
pub fn shortcut(e: &KeyEvent) -> Option<Place> {
    if e.mods.shift || e.mods.alt {
        return None;
    }
    STATES.iter().zip(['1', '2', '3', '4']).find(|(_, n)| e.is_command(*n)).map(|((tab, ..), _)| Place::Tab(*tab))
}

/// The zoom 1 to 4 pick, or ⌘+ and ⌘− step to. ⌘ and a number stay the sidebar's.
fn zoom_key(zoom: Zoom, e: &KeyEvent) -> Option<Zoom> {
    let m = e.mods;
    match &e.key {
        Key::Text(t) if !m.cmd && !m.ctrl && !m.alt => match t.as_str() {
            "1" => Some(Zoom::Pictures),
            "2" => Some(Zoom::Titles),
            "3" => Some(Zoom::Summaries),
            "4" => Some(Zoom::Feed),
            _ => None,
        },
        Key::Command('=' | '+') if !m.alt => Some(zoom.step(1)),
        Key::Command('-') if !m.alt => Some(zoom.step(-1)),
        _ => None,
    }
}

/// While a link is shown: ↵ opens the preview all the way, ⌘↵ opens the link in the browser,
/// ← and → step to the links beside it and Esc closes it. The digits stay out of the zoom.
fn on_preview_key(s: &mut State, e: &KeyEvent) -> bool {
    let Some((link, full)) = previewed(s) else { return false };
    let step = |by: isize| {
        let list = shown(s);
        let at = list.iter().position(|x| x.id == link.id)? as isize + by;
        list.get(usize::try_from(at).ok()?).map(|x| x.id.clone())
    };
    match e.key {
        Key::Enter if e.mods.cmd => crate::open_link(&link.url),
        Key::Enter if !full => s.preview = Some(Preview { id: link.id.clone(), full: true }),
        Key::Left | Key::Right if !full && !e.mods.cmd && !e.mods.alt => {
            if let Some(id) = step(if e.key == Key::Left { -1 } else { 1 }) {
                s.preview = Some(Preview { id, full });
            }
        }
        Key::Escape => s.preview = None,
        Key::Text(_) if !e.mods.cmd => {}
        _ => return false,
    }
    true
}

/// ⌘K opens and closes the command palette, and ⌘1 to ⌘4 go to the library's states. ⌘B toggles
/// the sidebar, like the reference apps, and so do rune-kit's ⇧⌘B and ⌃⌘S. ⌥⌘R
/// throws away the saved pictures and loads them again, for experiments.
pub fn on_key(s: &mut State, e: &KeyEvent, tx: &mut Tx) -> bool {
    if !matches!(s.phase, Phase::SignedIn(_)) {
        return false;
    }
    if let Some(place) = shortcut(e) {
        nav::go(s, place);
        return true;
    }
    if s.palette.is_none() && on_preview_key(s, e) {
        return true;
    }
    if s.palette.is_none()
        && let Some(zoom) = zoom_key(s.zoom, e)
    {
        zoom_to(s, zoom, tx);
        return true;
    }
    if e.is_command('k') && !e.mods.shift && !e.mods.alt {
        palette::toggle(s);
        return true;
    }
    if e.is_command('r') && e.mods.alt && !e.mods.shift {
        images::reset();
        return true;
    }
    let cmd_b = e.is_command('b') && !e.mods.shift && !e.mods.alt;
    if !(cmd_b || is_sidebar_toggle(e)) || e.key == Key::Escape {
        return false;
    }
    s.sidebar.toggle();
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cards_fill_columns_of_at_least_230_points() {
        assert_eq!(columns(300.0, Zoom::Titles), 1);
        let pad = PAGE_PAD_LEFT + PAGE_PAD_RIGHT;
        assert_eq!(columns(pad + 2.0 * CARD_MIN + CARD_GAP, Zoom::Titles), 2);
        assert_eq!(columns(pad + 2.0 * CARD_MIN + CARD_GAP - 1.0, Zoom::Titles), 1);
    }

    #[test]
    fn each_zoom_fits_a_different_number_of_columns_and_the_feed_one() {
        let counts = Zoom::ALL.map(|z| columns(1200.0, z));
        assert!(counts.windows(2).all(|w| w[0] > w[1]), "{counts:?}");
        assert_eq!(counts[3], 1);
    }

    #[test]
    fn numbers_pick_a_zoom_and_command_plus_and_minus_step_it() {
        let key = |key: Key, cmd: bool| KeyEvent { key, mods: rune::Mods { cmd, ..rune::Mods::default() } };
        assert_eq!(zoom_key(Zoom::Titles, &key(Key::Text("4".into()), false)), Some(Zoom::Feed));
        assert_eq!(zoom_key(Zoom::Titles, &key(Key::Command('='), true)), Some(Zoom::Summaries));
        assert_eq!(zoom_key(Zoom::Pictures, &key(Key::Command('-'), true)), Some(Zoom::Pictures));
        assert_eq!(zoom_key(Zoom::Titles, &key(Key::Command('2'), true)), None, "⌘ and a number stay the sidebar's");
    }

    #[test]
    fn a_click_previews_a_link_and_going_elsewhere_closes_it() {
        let mut s = State::default();
        preview(&mut s, "a", false);
        assert_eq!(s.preview, Some(Preview { id: "a".into(), full: false }));
        nav::go(&mut s, Place::Tab(Tab::All));
        assert_eq!(s.preview, None);
    }

    #[test]
    fn the_divider_fades_in_over_the_first_points_scrolled() {
        assert_eq!(divider_opacity(0.0), 0.0);
        assert_eq!(divider_opacity(DIVIDER_RAMP / 2.0), 0.5);
        assert_eq!(divider_opacity(400.0), 1.0);
    }

    #[test]
    fn ages_read_like_the_prototype() {
        const DAY: i64 = 86_400_000;
        let now = 20_000 * DAY + 5;
        assert_eq!(ago(now, now), "Today");
        assert_eq!(ago(now - DAY, now), "Yesterday");
        assert_eq!(ago(now - 3 * DAY, now), "3d");
        assert_eq!(ago(now - 14 * DAY, now), "2w");
        assert_eq!(ago(0, now), "Jan 1");
        assert_eq!(month_day(19_783), (3, 1));
    }

    #[test]
    fn command_and_a_number_goes_to_that_state_in_sidebar_order() {
        let cmd = |c: char, shift: bool| KeyEvent { key: Key::Command(c), mods: rune::Mods { cmd: true, shift, ..rune::Mods::default() } };
        assert_eq!(shortcut(&cmd('1', false)), Some(Place::Tab(Tab::Inbox)));
        assert_eq!(shortcut(&cmd('2', false)), Some(Place::Tab(Tab::Completed)));
        assert_eq!(shortcut(&cmd('3', false)), Some(Place::Tab(Tab::Archive)));
        assert_eq!(shortcut(&cmd('4', false)), Some(Place::Tab(Tab::All)));
        assert_eq!(shortcut(&cmd('5', false)), None);
        assert_eq!(shortcut(&cmd('1', true)), None);
    }

    #[test]
    fn holding_command_alone_shows_the_hints_after_a_moment() {
        let held = Hints::Hidden.held(true, 1.0);
        assert_eq!(held.at(1.0 + HINT_DELAY / 2.0), held);
        assert_eq!(held.at(1.0 + HINT_DELAY), Hints::Shown);
        assert_eq!(held.held(true, 5.0), held, "a repeat report doesn't restart the wait");
        assert_eq!(Hints::Shown.held(false, 2.0), Hints::Hidden, "letting go or adding shift hides them");
    }

    #[test]
    fn sidebar_width_is_capped_and_a_narrow_drag_collapses_it() {
        let mut p = sidebar_state();
        p.drag_to(900.0);
        assert_eq!(p.width(), SIDEBAR_MAX);
        p.drag_to(SIDEBAR_MIN * 0.4);
        assert!(!p.is_open());
    }
}
