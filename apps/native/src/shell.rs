//! The signed-in window: the "Inset" layout from the HTML prototype. A sidebar with search, the
//! library's states and the account, beside a rounded content card that lists the chosen
//! state's links. The sidebar resizes, collapses and peeks (`shell_kit/SIDEBAR.md`).

use std::sync::OnceLock;

use rune::{Color, Cursor, Shadow, Cx, El, Icon, Key, KeyEvent, ScrollSpec, TextStyle, Tx, col, el, icon, oklch, oklcha, row, text};
use rune_kit::Kit;

use crate::auth::Account;
use crate::livestore::library::{LinkItem, Tab};
use crate::shell_kit::{PaneState, SidebarPeek, SidebarToggle, SplitView, Toolbar, is_sidebar_toggle};
use crate::{Phase, State, Sync};

const SIDEBAR_W: f32 = 248.0;
const SIDEBAR_MIN: f32 = 200.0;
const SIDEBAR_MAX: f32 = 320.0;

/// The library's states, in sidebar order.
const STATES: [(Tab, &str, &Icon); 4] =
    [(Tab::Inbox, "Inbox", &INBOX), (Tab::Completed, "Done", &DONE), (Tab::Archive, "Archive", &ARCHIVE), (Tab::All, "All links", &ALL)];

/// The kinds of link the header filters by. Not wired to the library yet.
#[derive(Clone, Copy, PartialEq, Eq, Default)]
pub enum Kind {
    #[default]
    All,
    Posts,
    Articles,
    Videos,
}

const KINDS: [(Kind, &str); 4] = [(Kind::All, "All"), (Kind::Posts, "Posts"), (Kind::Articles, "Articles"), (Kind::Videos, "Videos")];

/// How the content panel lays links out. Not wired to the list yet.
#[derive(Clone, Copy, PartialEq, Eq, Default)]
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
    /// The sidebar's edge while it's dragged.
    accent: Color,
    /// Dims the window behind the peeking sidebar.
    scrim: Color,
    /// The lightness of a space's swatch.
    swatch_l: f32,
    dark: bool,
}

fn look(dark: bool) -> Look {
    if dark {
        Look {
            side: oklch(0.15, 0.0, 0.0),
            panel: oklch(0.205, 0.0, 0.0),
            fg: oklch(0.94, 0.002, 90.0),
            fg2: oklch(0.72, 0.004, 90.0),
            fg3: oklch(0.53, 0.004, 90.0),
            hover: oklcha(1.0, 0.0, 0.0, 0.045),
            active: oklcha(1.0, 0.0, 0.0, 0.08),
            line: oklcha(1.0, 0.0, 0.0, 0.06),
            line2: oklcha(1.0, 0.0, 0.0, 0.1),
            accent: oklch(0.7, 0.15, 262.0),
            scrim: oklcha(0.0, 0.0, 0.0, 0.3),
            swatch_l: 0.72,
            dark: true,
        }
    } else {
        Look {
            side: oklch(0.965, 0.002, 106.0),
            panel: oklch(1.0, 0.0, 0.0),
            fg: oklch(0.22, 0.002, 106.0),
            fg2: oklch(0.47, 0.005, 90.0),
            fg3: oklch(0.66, 0.006, 90.0),
            hover: oklcha(0.0, 0.0, 0.0, 0.04),
            active: oklcha(0.0, 0.0, 0.0, 0.065),
            line: oklcha(0.0, 0.0, 0.0, 0.07),
            line2: oklcha(0.0, 0.0, 0.0, 0.1),
            accent: oklch(0.6, 0.17, 262.0),
            scrim: oklcha(0.0, 0.0, 0.0, 0.06),
            swatch_l: 0.62,
            dark: false,
        }
    }
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
        k.c.border_muted = l.line;
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
    e.box_shadow(Shadow { y: 1.0, blur: 2.0, color: oklcha(0.0, 0.0, 0.0, 0.04), ..Shadow::default() })
        .box_shadow(Shadow { y: 4.0, blur: 12.0, color: oklcha(0.0, 0.0, 0.0, 0.04), ..Shadow::default() })
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
    let color = oklch(l.swatch_l, 0.15, space.hue);
    if space.draft { mark.border(1.5, color).border_dash(2.5, 1.5) } else { mark.fill(color) }
}

fn kbd(label: &str, l: &Look) -> El {
    row().h(18.0).px(5.0).center().radius(4.0).border(1.0, l.line2).child(text(label).font(font(11.0, 400.0)).color(l.fg3))
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
        .child(kbd("⌘K", l));
    let mut list = col().key("nav").w_full().gap(1.0).child(search).child(el().h(6.0));
    for (tab, label, glyph) in STATES {
        let on = s.space.is_none() && s.tab == tab;
        let lead = icon(glyph, 16.0).color(if on { l.fg } else { l.fg2 });
        let n = tab.links(&s.links).len();
        list = list.child(nav_row(format!("nav-{label}"), label, on, lead, count(n, l), l).on_press(move |s: &mut State| {
            s.tab = tab;
            s.space = None;
        }));
    }
    list = list.child(text("Spaces").font(font(12.0, 400.0)).color(l.fg3).px(8.0).pt(16.0).pb(4.0));
    for (i, space) in SPACES.iter().enumerate() {
        let lead = row().size(16.0, 16.0).center().child(swatch(space, 10.0, l));
        let tail = if space.draft {
            row()
                .h(17.0)
                .px(6.0)
                .center()
                .radius(99.0)
                .fill(oklcha(l.swatch_l, 0.15, space.hue, 0.12))
                .child(text("New").font(font(10.5, 500.0)).color(oklch(l.swatch_l, 0.15, space.hue)))
        } else {
            el()
        };
        let row = nav_row(format!("space-{}", space.id), space.name, s.space == Some(i), lead, tail, l);
        list = list.child(row.on_press(move |s: &mut State| s.space = Some(i)));
    }
    let name = account.name.as_deref().unwrap_or(&account.email);
    let initial: String = name.chars().take(1).flat_map(char::to_uppercase).collect();
    let sign_out = row()
        .key("sign-out")
        .role("button")
        .label("Sign out")
        .focusable(true)
        .h(26.0)
        .px(8.0)
        .center()
        .radius(6.0)
        .hover(l.hover)
        .cursor(Cursor::Pointer)
        .child(text("Sign out").font(font(12.0, 500.0)).color(l.fg2))
        .on_press(crate::sign_out);
    let user = row()
        .key("user")
        .w_full()
        .padding(8.0)
        .gap(10.0)
        .center_y()
        .child(row().size(28.0, 28.0).center().radius(14.0).fill(l.active).child(text(initial).font(font(12.5, 500.0)).color(l.fg2)))
        .child(
            col()
                .grow(1.0)
                .min_w(0.0)
                .child(text(name.to_owned()).font(font(13.0, 500.0)).color(l.fg).truncate())
                .child(text(account.email.clone()).font(font(12.0, 400.0)).color(l.fg3).truncate()),
        )
        .child(sign_out);
    col().key("sidebar").w_full().h_full().pb(12.0).child(list).child(el().grow(1.0).w_full().window_drag()).child(user)
}

fn toolbar(s: &State, l: &Look) -> Toolbar {
    let title = match s.space.map(|i| &SPACES[i]) {
        Some(space) => row()
            .key("crumb")
            .gap(8.0)
            .center_y()
            .pl(4.0)
            .child(text("Spaces").font(font(13.5, 400.0)).color(l.fg3))
            .child(icon(&CHEVRON, 12.0).color(l.fg3))
            .child(swatch(space, 10.0, l))
            .child(text(space.name).font(font(13.5, 500.0)).color(l.fg)),
        None => {
            let name = STATES.iter().find(|(tab, ..)| *tab == s.tab).map_or("", |(_, name, _)| name);
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
        .on_press(move |_: &mut State| crate::open_browser(&url))
}

fn links(s: &State, l: &Look) -> El {
    let shown = if s.space.is_some() { Vec::new() } else { s.tab.links(&s.links) };
    let mut list = col().key("links").w_full().px(8.0).pb(8.0);
    if shown.is_empty() {
        let empty = if s.space.is_some() || s.sync == Sync::Online { "Nothing here yet." } else { "Loading your library…" };
        list = list.child(text(empty).key("empty").font(font(13.0, 400.0)).color(l.fg3).px(10.0).py(8.0));
    }
    for link in shown {
        list = list.child(link_row(link, l));
    }
    col().key("viewport").w_full().h_full().min_h(0.0).scroll(ScrollSpec { stick_bottom: false }).child(list)
}

pub fn view(s: &State, account: &Account, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let l = look(dark);
    SplitView::new(links(s, &l))
        .sidebar::<State>(&s.sidebar, |s| &mut s.sidebar, sidebar(s, account, &l))
        .sidebar_padding(8.0, 8.0)
        .sidebar_toggle(SidebarToggle::new().shortcut("⌘B"))
        .sidebar_peek(SidebarPeek::new().scrim(l.scrim))
        .toolbar(toolbar(s, &l))
        .toolbar_in_panel()
        .titlebar_inset(cx.titlebar_inset())
        .build(kit(dark))
}

/// ⌘B toggles the sidebar, like the reference apps, and so do rune-kit's ⇧⌘B and ⌃⌘S.
pub fn on_key(s: &mut State, e: &KeyEvent, _: &mut Tx) -> bool {
    let cmd_b = e.is_command('b') && !e.mods.shift && !e.mods.alt;
    if !matches!(s.phase, Phase::SignedIn(_)) || !(cmd_b || is_sidebar_toggle(e)) || e.key == Key::Escape {
        return false;
    }
    s.sidebar.toggle();
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sidebar_width_is_capped_and_a_narrow_drag_collapses_it() {
        let mut p = sidebar_state();
        p.drag_to(900.0);
        assert_eq!(p.width(), SIDEBAR_MAX);
        p.drag_to(SIDEBAR_MIN * 0.4);
        assert!(!p.is_open());
    }
}
