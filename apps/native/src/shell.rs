//! The signed-in window: the "Inset" layout from the HTML prototype. A sidebar with search, the
//! library's states and the account, beside a rounded content card that lists the chosen
//! state's links. The sidebar resizes, collapses and peeks (`shell_kit/SIDEBAR.md`).

use std::borrow::Cow;
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
use crate::shell_kit::{PaneState, SidebarPeek, SidebarToggle, SplitView, Toolbar, is_sidebar_toggle};
use crate::{Phase, State, Sync};
pub use palette::{Palette, toggle as toggle_palette};

const SIDEBAR_W: f32 = 248.0;
const SIDEBAR_MIN: f32 = 200.0;
const SIDEBAR_MAX: f32 = 320.0;

/// The library's states, in sidebar order.
const STATES: [(Tab, &str, &Icon); 4] =
    [(Tab::Inbox, "Inbox", &INBOX), (Tab::Completed, "Done", &DONE), (Tab::Archive, "Archive", &ARCHIVE), (Tab::All, "All links", &ALL)];

/// The kinds of link the header filters by. Not wired to the library yet.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Kind {
    #[default]
    All,
    Posts,
    Articles,
    Videos,
}

const KINDS: [(Kind, &str); 4] = [(Kind::All, "All"), (Kind::Posts, "Posts"), (Kind::Articles, "Articles"), (Kind::Videos, "Videos")];

/// How the content panel lays links out. Not wired to the list yet.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Mode {
    #[default]
    Grid,
    Feed,
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

type Press = Box<dyn Fn(&mut State)>;

/// A segmented control: the selected segment is a raised chip.
fn segment(key: &str, items: Vec<(El, bool, Press)>, l: &Look) -> El {
    items.into_iter().fold(row().key(key.to_owned()).role("tablist").padding(2.0).gap(2.0).radius(8.0).fill(l.hover), |seg, (child, on, press)| {
        let b = row().h(26.0).center().radius(6.0).cursor(Cursor::Pointer).role("tab").child(child).on_press(move |s: &mut State| press(s));
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
    let kinds = KINDS
        .iter()
        .map(|&(kind, label)| {
            let on = s.kind == kind;
            let label = text(label).font(font(12.5, 400.0)).color(if on { l.fg } else { l.fg2 }).px(10.0);
            (label, on, Box::new(move |s: &mut State| s.kind = kind) as Press)
        })
        .collect();
    let modes = [(Mode::Grid, &GRID), (Mode::Feed, &FEED)]
        .into_iter()
        .map(|(mode, glyph)| {
            let on = s.mode == mode;
            let glyph = row().w(30.0).center().child(icon(glyph, 15.0).color(if on { l.fg } else { l.fg3 }));
            (glyph, on, Box::new(move |s: &mut State| s.mode = mode) as Press)
        })
        .collect();
    let mut toolbar = Toolbar::new().leading(title);
    if let Some(sync) = sync {
        toolbar = toolbar.trailing(text(sync).key("sync").font(font(12.0, 400.0)).color(l.fg3).truncate().mr(8.0));
    }
    toolbar.trailing(segment("kinds", kinds, l)).trailing(segment("modes", modes, l).ml(4.0))
}

/// One link: its title over its domain. Pressing it opens the link in the browser.
fn link_row(link: &LinkItem, l: &Look) -> El {
    let url = link.url.clone();
    row()
        .key(link.id.clone())
        .role("link")
        .label(link.title.clone())
        .focusable(true)
        .w_full()
        .px(10.0)
        .py(8.0)
        .radius(8.0)
        .hover(l.hover)
        .cursor(Cursor::Pointer)
        .child(
            col()
                .grow(1.0)
                .min_w(0.0)
                .gap(2.0)
                .child(text(link.title.clone()).font(font(13.5, 400.0).lh(19.0)).color(l.fg).truncate())
                .child(text(link.domain.clone()).font(font(12.0, 400.0).lh(16.0)).color(l.fg3).truncate()),
        )
        .on_press(move |_: &mut State| crate::open_link(&url))
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

/// The plain list the feed toggle shows until the feed is built.
fn list(s: &State, l: &Look) -> El {
    shown(s).into_iter().fold(col().key("links").w_full().px(8.0).pb(8.0), |list, link| list.child(link_row(link, l)))
}

const CARD_MIN: f32 = 230.0;
const CARD_GAP: f32 = 16.0;
const ROW_GAP: f32 = 20.0;
/// The grid's edges line up with the toolbar: its left with the title, its right with the
/// toolbar's buttons, and the scroll bar's thumb runs in the right gutter.
const PAGE_PAD_LEFT: f32 = 16.0;
const PAGE_PAD_RIGHT: f32 = 28.0;
/// A card picture's pixel size: 16:11, sharp at 2× up to 400 pt wide. A favicon's, at 2×.
const PICTURE: (u32, u32) = (800, 550);
const FAVICON: (u32, u32) = (28, 28);
pub const IMAGE_SIZES: [(u32, u32); 2] = [PICTURE, FAVICON];

/// The pictures a card draws.
fn card_images(link: &LinkItem) -> impl Iterator<Item = Request> + '_ {
    let picture = link.image.as_deref().map(|url| Request::new(url, PICTURE, Lane::Picture));
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

/// How many cards fit across `width` (CSS `repeat(auto-fill, minmax(230px, 1fr))`).
fn columns(width: f32) -> usize {
    (((width - PAGE_PAD_LEFT - PAGE_PAD_RIGHT + CARD_GAP) / (CARD_MIN + CARD_GAP)).floor() as usize).max(1)
}

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

/// A link card: its picture (or its title, when it has none), the title, then where it's from
/// and when it was saved. Pressing it opens the link in the browser.
fn card(link: &LinkItem, now: i64, l: &Look) -> El {
    let ring = el().pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0)).radius(10.0).border(1.0, l.ring);
    let mut picture = el().w_full().aspect_ratio(16.0 / 11.0).radius(10.0).clip_rounded(10.0).fill(l.tile);
    picture = match &link.image {
        Some(url) => picture.pixels_fit(&images::picture(&Request::new(url, PICTURE, Lane::Picture)), SurfaceFit::Fill),
        None => picture
            .padding(14.0)
            .child(text(one_line(&link.title)).font(font(13.0, 400.0).lh(18.85)).color(l.fg2).w_full().wrap_anywhere().max_lines(6)),
    };
    let favicon = match link.favicon.as_deref().map(|url| Request::new(url, FAVICON, Lane::Icon)).filter(|r| !images::failed(r)) {
        Some(req) => el().size(14.0, 14.0).radius(4.0).fill(l.tile).pixels_fit(&images::picture(&req), SurfaceFit::Fill),
        None => {
            let initial: String = link.domain.chars().take(1).flat_map(char::to_uppercase).collect();
            row().size(14.0, 14.0).center().radius(4.0).fill(l.tile).child(text(initial).font(font(8.0, 600.0)).color(l.fg2))
        }
    };
    let url = link.url.clone();
    col()
        .key(link.id.clone())
        .role("link")
        .label(link.title.clone())
        .focusable(true)
        .min_w(0.0)
        .gap(8.0)
        .cursor(Cursor::Pointer)
        .child(picture.child(ring).live_opacity(crate::sphere::reveal()).on_layout_tx({
            let id = link.id.clone();
            move |_: &mut State, rect, tx| {
                crate::sphere::card_at(&id, rect);
                tx.live_only();
            }
        }))
        .child(text(link.title.clone()).font(font(13.5, 500.0).lh(18.2)).color(l.fg).wrap_anywhere().max_lines(2))
        .child(
            row()
                .w_full()
                .gap(6.0)
                .center_y()
                .child(favicon)
                .child(text(link.domain.clone()).font(font(12.0, 400.0)).color(l.fg3).truncate().grow(1.0).min_w(0.0))
                .child(text(ago(link.created_at, now)).font(font(12.0, 400.0)).color(l.fg3)),
        )
        .on_press(move |_: &mut State| crate::open_link(&url))
}

/// A copy of each of the first cards' pictures, for the opening to fly in (`sphere::opening`).
pub fn opening_pictures(s: &State, dark: bool) -> Vec<(String, El)> {
    if s.mode != Mode::Grid {
        return Vec::new();
    }
    let l = look(dark);
    shown(s)
        .into_iter()
        .take(60)
        .map(|link| {
            let tile = el().fill(l.tile);
            (
                link.id.clone(),
                match &link.image {
                    Some(url) => tile.pixels_fit(&images::picture(&Request::new(url, PICTURE, Lane::Picture)), SurfaceFit::Fill),
                    None => tile,
                },
            )
        })
        .collect()
}

/// The prototype's grid: cards in as many 230 pt+ columns as fit, built a row at a time as they
/// scroll into view, so only those cards fetch their pictures.
fn grid(s: &State, columns: usize, dark: bool) -> El {
    let rows = shown(s).len().div_ceil(columns);
    col()
        .key("grid")
        .w_full()
        .growth(GrowthSpec::default())
        .on_visible_rows(move |s: &mut State, rows: std::ops::Range<usize>| {
            images::visible(shown(s).into_iter().skip(rows.start * columns).take(rows.len() * columns).flat_map(card_images).collect());
            false
        })
        .virtual_rows(
            rows,
            260.0,
            |_: &State, i| Cow::Owned(format!("row-{i}")),
            move |s: &State, i| {
                let l = look(dark);
                let now = now_ms();
                shown(s)
                    .iter()
                    .skip(i * columns)
                    .take(columns)
                    .fold(row().w_full().equal_columns(columns).gap(CARD_GAP).pb(ROW_GAP), |r, link| r.child(card(link, now, &l)))
            },
        )
}

fn page(s: &State, cx: &mut Cx<State>, dark: bool, l: &Look) -> El {
    let body = if shown(s).is_empty() {
        let empty = if matches!(s.place, Place::Space(_)) || s.sync == Sync::Online { "Nothing here yet." } else { "Loading your library…" };
        text(empty).key("empty").font(font(13.0, 400.0)).color(l.fg3)
    } else if s.mode == Mode::Grid {
        grid(s, cx.layout_with("viewport", |r| columns(r[2])).unwrap_or(3), dark)
    } else {
        list(s, l)
    };
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
                divider.set(divider_opacity(at.offset[1]));
            }
        })
        .child(col().key("page").w_full().pl(PAGE_PAD_LEFT).pr(PAGE_PAD_RIGHT).pt(16.0).pb(80.0).child(body));
    col()
        .key("viewport-area")
        .w_full()
        .h_full()
        .min_h(0.0)
        .child(el().key("divider").w_full().h(1.0).fill(solid(l.line2, l.panel)).live_opacity(&divider))
        .child(viewport.key("viewport").scroll_bar_styled(scroll_bar(l)))
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
        .titlebar_inset(cx.titlebar_inset())
        .build(kit(dark));
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

/// ⌘K opens and closes the command palette, and ⌘1 to ⌘4 go to the library's states. ⌘B toggles
/// the sidebar, like the reference apps, and so do rune-kit's ⇧⌘B and ⌃⌘S. ⌥⌘R
/// throws away the saved pictures and loads them again, for experiments.
pub fn on_key(s: &mut State, e: &KeyEvent, _: &mut Tx) -> bool {
    if !matches!(s.phase, Phase::SignedIn(_)) {
        return false;
    }
    if let Some(place) = shortcut(e) {
        nav::go(s, place);
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
        assert_eq!(columns(300.0), 1);
        let pad = PAGE_PAD_LEFT + PAGE_PAD_RIGHT;
        assert_eq!(columns(pad + 2.0 * CARD_MIN + CARD_GAP), 2);
        assert_eq!(columns(pad + 2.0 * CARD_MIN + CARD_GAP - 1.0), 1);
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
