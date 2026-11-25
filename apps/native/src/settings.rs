//! The Settings window (⌘,), after macOS System Settings: a sidebar with General and About
//! beside the chosen page, its settings in rounded groups. It's a window of its own with its own
//! state; the main window hands it the account when it opens, and its Sign Out runs in the main
//! window, and so do its Theme, Dock icon and menu bar icon switches. Open at login goes to
//! macOS's Login Items. The Updates page shows and steers the main window's updater.

use rune::{
    Align, AppHandle, AppSpec, Chrome, Color, Cx, El, FontSmoothing, Icon, PopupMenu, Shadow, TextStyle, Tx, WindowHandle, WindowOptions, WindowSpec,
    col, el, icon, oklch, oklcha, row, text,
};

use crate::appearance::{THEMES, Theme};
use crate::auth::Account;
use crate::login_item::{self, Login};
use crate::{Phase, State, icons};

const SIZE: (f32, f32) = (720.0, 500.0);
const SIDEBAR_W: f32 = 200.0;
/// The title row, level with the traffic lights.
const TITLE_H: f32 = 52.0;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum Page {
    #[default]
    General,
    Updates,
    About,
}

const PAGES: [(Page, &str, &Icon); 3] =
    [(Page::General, "General", &icons::SETTINGS), (Page::Updates, "Updates", &UPDATES), (Page::About, "About", &INFO)];

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

static UPDATES: Icon =
    glyph!("cs-updates", r#"<path d="M4.5 11.5a3 3 0 0 1-.4-6 4 4 0 0 1 7.8 0 3 3 0 0 1-.4 6"/><path d="M8 7.5v6M6 11.5l2 2 2-2"/>"#);
static INFO: Icon = glyph!("cs-info", r#"<circle cx="8" cy="8" r="5.5"/><path d="M8 7.5v3M8 5.3h.01"/>"#);
static UP_DOWN: Icon = glyph!("cs-up-down", r#"<path d="m5 6 3-2.5L11 6M5 10l3 2.5 3-2.5"/>"#);

#[derive(Default)]
pub struct Settings {
    page: Page,
    account: Option<Account>,
    server: String,
    theme: Theme,
    login: Login,
    auto_update: bool,
    updater: crate::update::Status,
    dock_icon: bool,
    menu_bar: bool,
    /// The sign-out sheet is showing.
    confirming: bool,
    main: Option<AppHandle<State>>,
}

/// The main window's way to the Settings window.
#[derive(Clone)]
pub struct Link {
    ui: AppHandle<Settings>,
    window: WindowHandle,
}

fn new_settings() -> Settings {
    Settings { dock_icon: true, auto_update: true, ..Settings::default() }
}

/// The window, hidden until it's opened.
pub fn window(fonts: &'static [&'static [u8]], families: &'static str) -> WindowSpec<Settings> {
    let spec = AppSpec {
        scenes: &[
            ("general", |s: &mut Settings| s.account = Some(sample())),
            ("updates", |s: &mut Settings| s.page = Page::Updates),
            ("about", |s: &mut Settings| s.page = Page::About),
            ("confirm", |s: &mut Settings| {
                s.account = Some(sample());
                s.confirming = true;
            }),
        ],
        fonts,
        families: (families, families),
        min_size: Some(SIZE),
        ..AppSpec::new("Settings", SIZE, new_settings, view)
    };
    WindowSpec::new("settings", spec)
        .chrome(Chrome { full_size_content: true, traffic_lights: Some((20.0, 20.0)), drag_regions: true })
        .font_smoothing(FontSmoothing::Off)
        .options(WindowOptions { visible: false, resizable: false, ..WindowOptions::default() })
}

fn sample() -> Account {
    Account { name: Some("Ada Example".to_owned()), email: "ada@example.com".to_owned(), library_id: "org_example".to_owned() }
}

/// Connects the two windows once both exist.
pub fn link(ui: AppHandle<Settings>, window: WindowHandle, main: AppHandle<State>) -> Link {
    ui.update(move |s, _| s.main = Some(main));
    Link { ui, window }
}

/// Opens Settings on the signed-in account, or brings it forward.
pub fn open(s: &mut State) {
    let (Some(link), Phase::SignedIn(account), Some(backend)) = (&s.settings, &s.phase, &s.backend) else {
        return;
    };
    let (account, server, theme, dock_icon, menu_bar) = (account.clone(), backend.auth.base.clone(), s.theme, !s.hide_dock, s.menu_bar);
    let (auto_update, updater) = (!s.manual_updates, s.updater.clone());
    link.ui.update(move |s, _| {
        s.auto_update = auto_update;
        s.updater = updater;
        s.account = Some(account);
        s.server = server;
        s.theme = theme;
        s.dock_icon = dock_icon;
        s.menu_bar = menu_bar;
        s.confirming = false;
        s.login = login_item::state();
    });
    link.window.open();
}

/// Shows or hides the Dock icon from Settings when it's open, and returns whether it did.
/// Hiding it makes the app an accessory, which macOS deactivates; focusing in the same step,
/// from the window the switch was flipped in, keeps that window in front.
pub fn set_dock_icon(s: &State, visible: bool) -> bool {
    let Some(link) = s.settings.as_ref().filter(|link| link.ui.is_visible()) else {
        return false;
    };
    link.ui.set_dock_icon(visible);
    if !visible {
        link.ui.focus();
    }
    true
}

/// Hands the updater's progress to Settings.
pub fn show_updater(s: &State) {
    if let Some(link) = &s.settings {
        let updater = s.updater.clone();
        link.ui.update(move |s, _| s.updater = updater);
    }
}

/// Closes Settings, as signing out does.
pub fn close(s: &State) {
    if let Some(link) = &s.settings {
        link.window.close();
    }
}

fn sign_out(s: &mut Settings, tx: &mut Tx) {
    s.confirming = false;
    if let Some(main) = &s.main {
        main.update(|s, _| crate::sign_out(s));
    }
    tx.close_window();
}

/// macOS System Settings' surfaces, in the app's neutral greys.
struct Look {
    side: Color,
    content: Color,
    card: Color,
    fg: Color,
    fg2: Color,
    fg3: Color,
    line: Color,
    hair: Color,
    active: Color,
    hover: Color,
    button: Color,
    button_ring: Color,
    danger: Color,
    scrim: Color,
    /// A switch's track on and off, and its knob.
    on: Color,
    off: Color,
    knob: Color,
    /// How dark the sign-out sheet's shadow is.
    lift: f32,
}

fn look(dark: bool) -> Look {
    let t = crate::theme::palette(dark);
    if dark {
        Look {
            side: oklch(0.165, 0.0, 0.0),
            content: oklch(0.19, 0.0, 0.0),
            card: oklch(0.225, 0.0, 0.0),
            fg: oklch(0.94, 0.0, 0.0),
            fg2: oklch(0.74, 0.0, 0.0),
            fg3: oklch(0.56, 0.0, 0.0),
            line: oklcha(1.0, 0.0, 0.0, 0.08),
            hair: oklcha(1.0, 0.0, 0.0, 0.06),
            active: oklcha(1.0, 0.0, 0.0, 0.09),
            hover: oklcha(1.0, 0.0, 0.0, 0.05),
            button: oklcha(1.0, 0.0, 0.0, 0.08),
            button_ring: oklcha(1.0, 0.0, 0.0, 0.1),
            danger: t.destructive,
            scrim: oklcha(0.0, 0.0, 0.0, 0.35),
            on: t.primary,
            off: oklcha(1.0, 0.0, 0.0, 0.14),
            knob: oklch(0.97, 0.0, 0.0),
            lift: 0.5,
        }
    } else {
        Look {
            side: oklch(0.945, 0.0, 0.0),
            content: oklch(0.985, 0.0, 0.0),
            card: oklch(1.0, 0.0, 0.0),
            fg: oklch(0.22, 0.0, 0.0),
            fg2: oklch(0.47, 0.0, 0.0),
            fg3: oklch(0.62, 0.0, 0.0),
            line: oklcha(0.0, 0.0, 0.0, 0.08),
            hair: oklcha(0.0, 0.0, 0.0, 0.06),
            active: oklcha(0.0, 0.0, 0.0, 0.08),
            hover: oklcha(0.0, 0.0, 0.0, 0.045),
            button: oklch(1.0, 0.0, 0.0),
            button_ring: oklcha(0.0, 0.0, 0.0, 0.14),
            danger: t.destructive,
            scrim: oklcha(0.0, 0.0, 0.0, 0.18),
            on: t.primary,
            off: oklcha(0.0, 0.0, 0.0, 0.12),
            knob: oklch(1.0, 0.0, 0.0),
            lift: 0.2,
        }
    }
}

fn font(size: f32, weight: f32) -> TextStyle {
    TextStyle::new(size, weight)
}

fn ring(color: Color) -> Shadow {
    Shadow { spread: 1.0, color, ..Shadow::default() }
}

fn view(s: &Settings, cx: &mut Cx<Settings>) -> El {
    let l = look(cx.system_dark());
    let nav = PAGES.iter().fold(
        col().key("nav").w(SIDEBAR_W).h_full().fill(l.side).px(10.0).pt(TITLE_H).gap(1.0).window_drag(),
        |nav, &(page, name, glyph)| {
            let on = s.page == page;
            let r = row()
                .key(format!("nav-{name}"))
                .role("tab")
                .label(name)
                .focusable(true)
                .w_full()
                .h(30.0)
                .px(9.0)
                .gap(9.0)
                .center_y()
                .radius(7.0)
                .child(icon(glyph, 16.0).color(if on { l.fg } else { l.fg3 }))
                .child(text(name).font(font(13.0, 400.0)).color(if on { l.fg } else { l.fg2 }))
                .on_press(move |s: &mut Settings| s.page = page);
            nav.child(if on { r.fill(l.active) } else { r.hover(l.hover) })
        },
    );
    let name = PAGES.iter().find(|(page, ..)| *page == s.page).map_or("", |(_, name, _)| name);
    let body = match s.page {
        Page::General => general(s, &l),
        Page::Updates => updates(s, &l),
        Page::About => about(s, &l),
    };
    let main = col()
        .key("main")
        .grow(1.0)
        .min_w(0.0)
        .h_full()
        .fill(l.content)
        .child(
            row()
                .key("title")
                .w_full()
                .h(TITLE_H)
                .px(28.0)
                .center_y()
                .window_drag()
                .child(text(name).font(font(15.0, 600.0).tracking(-0.15)).color(l.fg)),
        )
        .child(col().key("page").w_full().grow(1.0).px(28.0).pb(28.0).child(body));
    row().key("window").w_full().h_full().fill(l.content).child(nav).child(el().w(1.0).h_full().fill(l.line)).child(main).children(sheet(s, &l))
}

fn group(title: &str, rows: Vec<El>, l: &Look) -> El {
    let n = rows.len();
    let box_ = rows.into_iter().enumerate().fold(col().w_full().radius(10.0).fill(l.card).box_shadow(ring(l.hair)), |b, (i, r)| {
        let b = b.child(r);
        if i + 1 < n { b.child(el().w_full().h(1.0).px(14.0).child(el().w_full().h_full().fill(l.hair))) } else { b }
    });
    col()
        .key(format!("group-{title}"))
        .w_full()
        .child(text(title.to_owned()).font(font(12.0, 500.0)).color(l.fg3).mx(14.0).mt(20.0).mb(8.0))
        .child(box_)
}

fn setting(key: &str, label: &str, detail: Option<&str>, control: El, l: &Look) -> El {
    let mut words = col().grow(1.0).min_w(0.0).child(text(label.to_owned()).font(font(13.0, 400.0)).color(l.fg).wrap());
    if let Some(detail) = detail {
        words = words.child(text(detail.to_owned()).font(font(12.0, 400.0)).color(l.fg3).mt(1.0).wrap());
    }
    row().key(key.to_owned()).w_full().min_h(44.0).px(14.0).py(8.0).gap(12.0).center_y().child(words).child(control)
}

fn button(key: &str, label: &str, ink: Color, l: &Look) -> El {
    row()
        .key(key.to_owned())
        .role("button")
        .label(label)
        .focusable(true)
        .h(24.0)
        .px(11.0)
        .center()
        .radius(6.0)
        .fill(l.button)
        .box_shadow(Shadow { spread: 0.5, color: l.button_ring, ..Shadow::default() })
        .child(text(label.to_owned()).font(font(13.0, 400.0)).color(ink))
}

/// A macOS switch: the knob sits right while it's on.
fn switch(on: bool, label: &str, flip: fn(&mut Settings), l: &Look) -> El {
    locked_switch(on, false, label, flip, l)
}

/// A switch that can't be flipped while `locked`, dimmed.
fn locked_switch(on: bool, locked: bool, label: &str, flip: fn(&mut Settings), l: &Look) -> El {
    let knob = row()
        .role("switch")
        .label(label)
        .focusable(true)
        .size(34.0, 20.0)
        .padding(2.0)
        .radius(10.0)
        .fill(if on { l.on } else { l.off })
        .child(el().w(if on { 14.0 } else { 0.0 }))
        .child(el().size(16.0, 16.0).radius(8.0).fill(l.knob).box_shadow(Shadow {
            y: 1.0,
            blur: 2.0,
            color: oklcha(0.0, 0.0, 0.0, 0.2),
            ..Shadow::default()
        }));
    if locked { knob.opacity(0.4) } else { knob.on_press(flip) }
}

fn general(s: &Settings, l: &Look) -> El {
    let account = match &s.account {
        Some(account) => {
            let name = account.name.clone().unwrap_or_else(|| account.email.clone());
            let initial: String = name.chars().take(1).flat_map(char::to_uppercase).collect();
            row()
                .key("account")
                .w_full()
                .padding(14.0)
                .gap(12.0)
                .center_y()
                .child(row().size(40.0, 40.0).center().radius(20.0).fill(l.active).child(text(initial).font(font(16.0, 500.0)).color(l.fg2)))
                .child(
                    col()
                        .grow(1.0)
                        .min_w(0.0)
                        .child(text(name).font(font(13.0, 600.0)).color(l.fg).truncate())
                        .child(text(account.email.clone()).font(font(12.0, 400.0)).color(l.fg3).truncate().mt(1.0)),
                )
                .child(button("sign-out", "Sign Out", l.fg, l).on_press(|s: &mut Settings| s.confirming = true))
        }
        None => setting("account", "Not signed in", None, el(), l),
    };
    let (_, _, theme) = THEMES.into_iter().find(|(theme, ..)| *theme == s.theme).unwrap_or(THEMES[0]);
    let picker = row()
        .key("theme")
        .role("button")
        .label("Theme")
        .focusable(true)
        .h(24.0)
        .pl(10.0)
        .pr(6.0)
        .gap(6.0)
        .center_y()
        .radius(6.0)
        .fill(l.button)
        .box_shadow(Shadow { spread: 0.5, color: l.button_ring, ..Shadow::default() })
        .child(text(theme).font(font(13.0, 400.0)).color(l.fg))
        .child(icon(&UP_DOWN, 12.0).color(l.fg3))
        .on_press_tx(|s: &mut Settings, tx: &mut Tx| {
            let current = THEMES.into_iter().find(|(theme, ..)| *theme == s.theme).map_or("system", |(_, id, _)| id);
            tx.popup_menu(PopupMenu::picker(THEMES.map(|(_, id, name)| (id, name)), current), "theme", |s: &mut Settings, picked, _| {
                let Some((theme, ..)) = THEMES.into_iter().find(|(_, id, _)| Some(*id) == picked) else {
                    return;
                };
                s.theme = theme;
                if let Some(main) = &s.main {
                    main.update(move |s, _| s.theme = theme);
                }
            });
        });
    col()
        .w_full()
        .child(group("Account", vec![account], l))
        .child(group("Appearance", vec![setting("theme-row", "Theme", None, picker, l)], l))
        .child(group(
            "System",
            vec![
                setting(
                    "login",
                    "Open at login",
                    (s.login == Login::NeedsApproval).then_some("Allow Cloudstash in System Settings → Login Items."),
                    switch(s.login != Login::Off, "Open at login", |s| s.login = login_item::set(s.login == Login::Off), l),
                    l,
                ),
                setting(
                    "dock",
                    "Show Dock icon",
                    None,
                    locked_switch(
                        s.dock_icon,
                        s.dock_icon && !s.menu_bar,
                        "Show Dock icon",
                        |s| {
                            s.dock_icon = !s.dock_icon;
                            show_icons(s);
                        },
                        l,
                    ),
                    l,
                ),
                setting(
                    "menu-bar",
                    "Show menu bar icon",
                    Some("Keep this or the Dock icon on so you can reach Cloudstash."),
                    locked_switch(
                        s.menu_bar,
                        s.menu_bar && !s.dock_icon,
                        "Show menu bar icon",
                        |s| {
                            s.menu_bar = !s.menu_bar;
                            show_icons(s);
                        },
                        l,
                    ),
                    l,
                ),
            ],
            l,
        ))
}

/// Hands the Dock and menu bar icons' switches to the main window, which shows them.
fn show_icons(s: &Settings) {
    let (hide_dock, menu_bar) = (!s.dock_icon, s.menu_bar);
    if let Some(main) = &s.main {
        main.update(move |s, _| {
            s.hide_dock = hide_dock && menu_bar;
            s.menu_bar = menu_bar;
        });
    }
}

/// The updater's switch and its state, with the one thing to do next: check, or restart into
/// what's downloaded.
fn updates(s: &Settings, l: &Look) -> El {
    use crate::update::Status;
    let version = format!("Version {}", env!("CARGO_PKG_VERSION"));
    let main = |f: fn(&mut State)| {
        move |s: &mut Settings| {
            if let Some(main) = &s.main {
                main.update(move |s, _| f(s));
            }
        }
    };
    let check = button("check", "Check for Updates", l.fg, l);
    let waiting = button("check", "Check for Updates", l.fg3, l).focusable(false);
    let (detail, control) = match &s.updater {
        Status::Off => ("This copy doesn't update itself.".to_owned(), waiting),
        Status::UpToDate => ("You're up to date.".to_owned(), check.on_press(main(crate::update::check_now))),
        Status::Available(next) => (format!("Version {next} is out."), button("check", "Download", l.fg, l).on_press(main(crate::update::check_now))),
        Status::Checking => ("Checking for updates…".to_owned(), waiting),
        Status::Downloading(next, percent) => (format!("Downloading version {next}… {percent}%"), waiting),
        Status::Ready(next) => {
            (format!("Version {next} is ready."), button("restart", "Restart to Update", l.fg, l).on_press(main(crate::update::restart)))
        }
        Status::Failed => ("Couldn't check for updates. Try again later.".to_owned(), check.on_press(main(crate::update::check_now))),
    };
    col().w_full().child(group(
        "Cloudstash for Mac",
        vec![
            setting(
                "auto-update",
                "Automatic updates",
                Some("Download updates in the background. You choose when to restart."),
                locked_switch(
                    s.auto_update,
                    s.updater == Status::Off,
                    "Automatic updates",
                    |s| {
                        s.auto_update = !s.auto_update;
                        let on = s.auto_update;
                        if let Some(main) = &s.main {
                            main.update(move |s, _| crate::update::set_auto(s, on));
                        }
                    },
                    l,
                ),
                l,
            ),
            setting("version", &version, Some(&detail), control, l),
        ],
        l,
    ))
}

fn about(s: &Settings, l: &Look) -> El {
    let site = if s.server.is_empty() { crate::auth::DEFAULT_BASE.to_owned() } else { s.server.clone() };
    let host = url::Url::parse(&site).ok().and_then(|u| u.host_str().map(str::to_owned)).unwrap_or_else(|| site.clone());
    let website = button("website", &format!("Open {host}"), l.fg, l).on_press(move |_: &mut Settings| crate::open_browser(&site));
    let logs = button("logs", "Show in Finder", l.fg, l).on_press(|_: &mut Settings| {
        if let Some(path) = crate::log::path() {
            let _ = std::process::Command::new("open").arg("-R").arg(path).spawn();
        }
    });
    col()
        .w_full()
        .child(
            col()
                .key("brand")
                .w_full()
                .items_center()
                .pt(24.0)
                .gap(6.0)
                .child(crate::sphere::tile(64.0))
                .child(text("Cloudstash for Mac").font(font(15.0, 600.0)).color(l.fg).mt(6.0))
                .child(text(format!("Version {}", env!("CARGO_PKG_VERSION"))).font(font(12.0, 400.0)).color(l.fg3)),
        )
        .child(group(
            "Help",
            vec![
                setting("website-row", "Website", None, website, l),
                setting("logs-row", "Logs", Some("Include them when you report a bug."), logs, l),
            ],
            l,
        ))
}

/// The sign-out sheet, dropped from the title bar as macOS does.
fn sheet(s: &Settings, l: &Look) -> Vec<El> {
    if !s.confirming {
        return Vec::new();
    }
    let card = col()
        .key("sheet")
        .role("alertdialog")
        .label("Sign out of Cloudstash?")
        .w(300.0)
        .padding(18.0)
        .pt(20.0)
        .items_center()
        .radius(12.0)
        .fill(l.content)
        .box_shadow(ring(l.line))
        .box_shadow(Shadow { y: 12.0, blur: 40.0, color: oklcha(0.0, 0.0, 0.0, l.lift), ..Shadow::default() })
        .child(crate::sphere::tile(52.0))
        .child(text("Sign out of Cloudstash?").font(font(13.0, 600.0)).color(l.fg).mt(10.0))
        .child(
            text("Your links stay in your account. This Mac's copy is removed and syncs again when you sign back in.")
                .font(font(12.0, 400.0).lh(17.5))
                .color(l.fg2)
                .align(Align::Center)
                .wrap()
                .mt(6.0),
        )
        .child(
            row()
                .w_full()
                .gap(8.0)
                .mt(16.0)
                .child(button("cancel", "Cancel", l.fg, l).grow(1.0).h(28.0).on_press(|s: &mut Settings| s.confirming = false))
                .child(
                    button("confirm-sign-out", "Sign Out", oklch(1.0, 0.0, 0.0), l)
                        .grow(1.0)
                        .h(28.0)
                        .fill(l.danger)
                        .box_shadow(Shadow::default())
                        .on_press_tx(sign_out),
                ),
        )
        .modal(true, |s: &mut Settings| s.confirming = false);
    vec![
        el().key("sheet-scrim").absolute(0.0, 0.0).w_full().h_full().fill(l.scrim).a11y_hidden(),
        col().key("sheet-layer").absolute(0.0, 0.0).w_full().h_full().items_center().pt(TITLE_H).child(card),
    ]
}
