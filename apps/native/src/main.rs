//! Cloudstash for Mac, prototype: sign in through the browser, then sync the library with LiveStore
//! and show it in the "Inset" shell: a sidebar with the inbox, done, archive and all links,
//! beside a content card listing the chosen state's links (`shell.rs`).
//!
//! ```text
//! scripts/run.sh                                    # against https://cloudstash.dev
//! CLOUDSTASH_URL=http://127.0.0.1:3000 scripts/run.sh   # against a local dev server
//! ```

mod appearance;
mod auth;
mod fps;
mod icons;
mod images;
mod livestore;
mod log;
mod login_item;
mod menu_bar;
mod nav;
mod search;
mod settings;
mod shell;
mod shell_kit;
mod sphere;
mod theme;
mod ui_state;
mod update;

use std::sync::Arc;

use auth::{Account, Auth, Link};
use livestore::library::{self, Library, LinkItem, Tab};
use rune::{Align, App, AppHandle, AppSpec, Chrome, Color, Cx, El, FontSmoothing, MenuItem, Shadow, TextStyle, Tx, col, el, icon, row, text};
use shell_kit::PaneState;
use theme::Palette;

const APP_TITLE: &str = "Cloudstash";
/// `@fontsource-variable/noto-sans` 5.2.10's subsets, one family each, listed so each
/// character falls back to its subset as the web's `unicode-range` faces do.
const NOTO_SANS: &str = "Noto Sans Latin, Noto Sans Latin Ext, Noto Sans Cyrillic, Noto Sans Cyrillic Ext, Noto Sans Greek, Noto Sans Greek Ext, Noto Sans Vietnamese, Noto Sans Devanagari";

const FONTS: &[&[u8]] = &[
    include_bytes!("../fonts/noto-sans-latin.ttf"),
    include_bytes!("../fonts/noto-sans-latin-ext.ttf"),
    include_bytes!("../fonts/noto-sans-cyrillic.ttf"),
    include_bytes!("../fonts/noto-sans-cyrillic-ext.ttf"),
    include_bytes!("../fonts/noto-sans-greek.ttf"),
    include_bytes!("../fonts/noto-sans-greek-ext.ttf"),
    include_bytes!("../fonts/noto-sans-vietnamese.ttf"),
    include_bytes!("../fonts/noto-sans-devanagari.ttf"),
];

#[derive(Default)]
enum Phase {
    #[default]
    Restoring,
    SignedOut,
    /// Signing out: the key and this Mac's copy of the library go before signing in again can
    /// start, so cleaning up can't reach the next session's.
    SigningOut,
    /// The browser is open; the sign-in finishes when its deep link arrives.
    WaitingForBrowser,
    /// The link arrived and the code is being exchanged.
    Finishing,
    SignedIn(Account),
}

/// The library's connection to the sync backend.
#[derive(Default, Clone, PartialEq)]
pub(crate) enum Sync {
    #[default]
    Connecting,
    Online,
    Offline,
    Failed(String),
}

#[derive(Default)]
pub(crate) struct State {
    phase: Phase,
    notice: Option<String>,
    library: Option<Library>,
    links: Vec<LinkItem>,
    /// The library has opened and given its links, caught up with the server or done waiting for it.
    loaded: bool,
    /// The logo is opening into the library (`sphere::opening`).
    intro: bool,
    place: nav::Place,
    sync: Sync,
    backend: Option<Backend>,
    /// A link that arrived before the backend was ready, as when it launched the app.
    early_link: Option<String>,
    sidebar: PaneState,
    zoom: shell::Zoom,
    /// The card under the pointer, else the first card in the first row whose top is in view:
    /// where a zoom change holds still.
    hovered: Option<String>,
    /// The first cards of the first two rows in view.
    top_cards: [usize; 2],
    /// The cards in the rows in view.
    in_view: std::ops::Range<usize>,
    /// For the frame before a zoom change: a stand-in for each card the new grid shows that the
    /// old one doesn't, where it would be if the old grid ran on that far, so it flies in too.
    ghosts: Vec<shell::Ghost>,
    /// While a zoom change lands: the rows the grid builds, not virtual (`shell::zoom_to`).
    landing: Option<std::ops::Range<usize>>,
    /// The link shown over the library, as a preview or all the way.
    preview: Option<shell::Preview>,
    /// Whether ⌘ is held alone, and since when, for the sidebar's shortcut hints.
    hints: shell::Hints,
    /// The command palette, while it's open.
    palette: Option<shell::Palette>,
    memory: ui_state::Memory,
    settings: Option<settings::Link>,
    theme: appearance::Theme,
    /// No Dock icon; only while the menu bar icon shows, so the app can always be found.
    hide_dock: bool,
    menu_bar: bool,
    tray: Option<tray_icon::TrayIcon>,
    update: update::Update,
    updater: update::Status,
    /// Automatic updates are off in Settings: the updater checks only when asked.
    manual_updates: bool,
    /// The dialog that asks before restarting into a downloaded update is open.
    confirm_update: bool,
    /// The account's menu, under its name, is open.
    account_menu: bool,
}

/// Headless snapshots render a named scene and must not touch the keychain, the network or the
/// saved window.
fn headless() -> bool {
    std::env::args().any(|arg| matches!(arg.as_str(), "--snap" | "--tree" | "--script"))
}

fn new_state() -> State {
    let mut s = State { sidebar: shell::sidebar_state(), ..State::default() };
    if !headless() {
        match auth::state_dir() {
            Ok(dir) => ui_state::restore(&mut s, dir.join("ui.json")),
            Err(e) => tracing::warn!("{e}"),
        }
    }
    s
}

fn poll(s: &mut State, now: f64, tx: &mut Tx) -> bool {
    ui_state::poll(s, now, tx);
    shell::poll_hints(s, now)
}

#[derive(Clone)]
struct Backend {
    auth: Arc<Auth>,
    ui: AppHandle<State>,
}

impl Backend {
    fn show(&self, result: Result<Option<Account>, String>) {
        let backend = self.clone();
        self.ui.update(move |s, _| match result {
            Ok(Some(account)) => {
                s.sync = Sync::Connecting;
                s.loaded = false;
                // The logo opens into the library after a sign-in, not each time the app starts.
                s.intro = matches!(s.phase, Phase::Finishing | Phase::WaitingForBrowser);
                if s.intro {
                    sphere::begin();
                }
                match backend.open_library(&account) {
                    Ok(library) => s.library = Some(library),
                    Err(e) => s.sync = Sync::Failed(e),
                }
                s.phase = Phase::SignedIn(account);
            }
            Ok(None) => {
                s.phase = Phase::SignedOut;
                std::thread::spawn(move || backend.forget_libraries());
            }
            Err(e) => {
                s.phase = Phase::SignedOut;
                s.notice = Some(e);
            }
        });
    }
}

impl Backend {
    /// This server's local libraries, one folder each.
    fn libraries(&self) -> std::path::PathBuf {
        let server: String = self.auth.base.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
        self.auth.state_dir.join("libraries").join(server)
    }

    /// Deletes this server's local libraries, as once signed out: nothing is kept without a session.
    fn forget_libraries(&self) {
        match std::fs::remove_dir_all(self.libraries()) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => tracing::error!("could not delete the local library: {e}"),
            _ => {}
        }
    }

    /// Starts syncing the signed-in library into its own folder, one per server and library.
    fn open_library(&self, account: &Account) -> Result<Library, String> {
        let api_key = self.auth.api_key()?.ok_or("The saved session is missing its key.")?;
        let (on_links, on_status) = (self.ui.clone(), self.ui.clone());
        let dir = self.libraries().join(&account.library_id);
        images::open(dir.join("images"), &shell::IMAGE_SIZES);
        Ok(library::start(
            library::Config { base: self.auth.base.clone(), library_id: account.library_id.clone(), api_key, dir },
            move |links| {
                images::prefetch(shell::wanted_images(&links));
                on_links.update(move |s, tx| {
                    if !s.loaded {
                        // A library just opened starts at its top, wherever the last one was left.
                        tx.scroll_to_y("viewport", 0.0);
                    }
                    s.links = links;
                    s.loaded = true;
                })
            },
            move |status| {
                on_status.update(move |s, _| {
                    s.sync = match status {
                        Ok(true) => Sync::Online,
                        Ok(false) if s.sync == Sync::Connecting => Sync::Connecting,
                        Ok(false) => Sync::Offline,
                        Err(e) => Sync::Failed(e),
                    }
                });
            },
            {
                let ui = self.ui.clone();
                move || ui.update(update::too_old)
            },
        ))
    }
}

/// Opens a saved link in the browser. Only web addresses: anyone in the library can save a link,
/// and macOS would open a `file:` or app link as readily.
fn open_link(link: &str) {
    match url::Url::parse(link) {
        Ok(url) if matches!(url.scheme(), "http" | "https") => open_browser(url.as_str()),
        _ => tracing::warn!("not opening a saved link that isn't a web address"),
    }
}

fn open_browser(url: &str) {
    let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    if let Err(e) = std::process::Command::new(opener).arg(url).spawn() {
        eprintln!("could not open the browser ({e}); open this URL to sign in:\n{url}");
        tracing::warn!("could not open the browser: {e}");
    }
}

fn start_sign_in(s: &mut State) {
    let Some(backend) = &s.backend else {
        return;
    };
    s.notice = None;
    match backend.auth.begin_sign_in() {
        Ok(page) => {
            s.phase = Phase::WaitingForBrowser;
            open_browser(&page);
        }
        Err(e) => s.notice = Some(e),
    }
}

fn cancel_sign_in(s: &mut State) {
    if let Some(backend) = &s.backend {
        backend.auth.cancel_sign_in();
    }
    s.phase = Phase::SignedOut;
}

/// Receives `cloudstash://` links from macOS, including the one that launched the app.
fn open_url(s: &mut State, link: &str, _: &mut Tx) {
    let Some(backend) = s.backend.clone() else {
        s.early_link = Some(link.to_owned());
        return;
    };
    let Link::SignIn { code, verifier } = backend.auth.accept_link(link) else {
        return;
    };
    s.notice = None;
    s.phase = Phase::Finishing;
    backend.ui.open();
    std::thread::spawn(move || {
        let result = backend.auth.complete_sign_in(&code, &verifier);
        backend.show(result.map(Some));
    });
}

/// The dev meter's readings: downloads running and waiting in view, then the pictures' cache on
/// disk and how much of the background fill is done; clicking the cache empties it.
fn devtools_probes() {
    fps::probe(|| {
        let s = images::stats();
        if s.waiting == 0 { format!("{} req", s.downloading) } else { format!("{} req +{}", s.downloading, s.waiting) }
    });
    fps::probe_pressable(
        || {
            let s = images::stats();
            let mb = s.disk_bytes as f64 / 1_048_576.0;
            if s.filled < s.to_fill { format!("{mb:.1} MB · {}/{}", s.filled, s.to_fill) } else { format!("{mb:.1} MB") }
        },
        images::reset,
    );
}

fn sign_out(s: &mut State) {
    let Some(backend) = s.backend.clone() else {
        return;
    };
    settings::close(s);
    s.notice = None;
    s.phase = Phase::SigningOut;
    images::close();
    let library = s.library.take();
    s.links.clear();
    s.place = nav::Place::default();
    s.preview = None;
    std::thread::spawn(move || {
        let key = backend.auth.take_key();
        if let Some(library) = library {
            library.close();
        }
        backend.forget_libraries();
        backend.ui.update(|s, _| s.phase = Phase::SignedOut);
        let revoked = key.and_then(|key| key.map_or(Ok(()), |key| backend.auth.revoke(&key)));
        if let Err(e) = revoked {
            backend.ui.update(move |s, _| s.notice = Some(e));
        }
    });
}

fn view(s: &State, cx: &mut Cx<State>) -> El {
    sphere::hide();
    let t = theme::palette(cx.system_dark());
    let opening = s.intro && matches!(s.phase, Phase::SignedIn(_)) && !matches!(s.sync, Sync::Failed(_));
    if !opening {
        sphere::cancel();
    }
    if let update::Update::Required(progress) = s.update {
        return screen(col().key("content").w_full().max_w(280.0).items_center().child(must_update(s, progress, t)), t);
    }
    let content = match (&s.phase, &s.notice) {
        (Phase::SignedOut, Some(notice)) => {
            problem("Couldn't finish signing in", notice.clone(), t).child(primary_button("sign-in", "Try again", t).on_press(start_sign_in))
        }
        (Phase::SignedOut, None) => welcome("Sign in to Cloudstash", "Access your saved links from anywhere.".into(), t)
            .child(primary_button("sign-in", "Sign in", t).on_press(start_sign_in)),
        (Phase::SigningOut, _) => progress("Signing out", "Removing this Mac's copy of your library.".into(), t),
        (Phase::Restoring, _) => progress("Opening Cloudstash for Mac", "Checking for a saved session. This takes a moment.".into(), t),
        (Phase::WaitingForBrowser, _) => progress("Finish signing in in your browser", "Cloudstash opens again when you're done.".into(), t)
            .child(outline_button("cancel", "Cancel", t).on_press(cancel_sign_in)),
        (Phase::Finishing, _) => progress("Signing in to Cloudstash for Mac", "Preparing your sign-in. This takes a moment.".into(), t),
        (Phase::SignedIn(account), _) if opening => {
            // The library, once it has its links, under the logo that opens into it.
            let (under, pictures) = if s.loaded {
                (shell::view(s, account, cx), shell::opening_pictures(s, cx.system_dark()))
            } else {
                (el().w_full().h_full().fill(t.card).window_drag(), Vec::new())
            };
            return el().key("root").w_full().h_full().child(under).child(sphere::opening::<State>(t.card_foreground, t.card, s.loaded, pictures));
        }
        (Phase::SignedIn(_), _) if !s.loaded && !matches!(s.sync, Sync::Failed(_)) => {
            progress("Opening your library", "Getting your latest links.".into(), t)
        }
        // Under the same root as while the logo opened, so the grid keeps its place when the opening ends.
        (Phase::SignedIn(account), _) => return el().key("root").w_full().h_full().child(shell::view(s, account, cx)),
    };
    screen(col().key("content").w_full().max_w(320.0).child(content), t)
}

/// A whole-window screen, as signing in shows: `content` in the middle of the card.
fn screen(content: El, t: Palette) -> El {
    col()
        .key("window")
        .w_full()
        .h_full()
        .padding(28.0)
        .center()
        .fill(t.card)
        .window_drag()
        .on_pointer_move_local(|_: &mut State, p, tx| {
            sphere::pointer(Some([p.window_x, p.window_y]));
            tx.live_only();
        })
        .on_hover_change(|_: &mut State, inside, tx| {
            if !inside {
                sphere::pointer(None);
            }
            tx.live_only();
        })
        .child(content)
}

/// This version is too old to use, signed in or out: the window only offers the update, and
/// signing out.
fn must_update(s: &State, progress: Option<u8>, t: Palette) -> El {
    let signed_in = matches!(s.phase, Phase::SignedIn(_));
    let body = if signed_in {
        "This version can’t sync your library anymore. The update takes a few seconds and your library is right where you left it."
    } else {
        "This version is too old to sign in. The update takes a few seconds."
    };
    let label = match progress {
        None => "Update and restart".to_owned(),
        Some(p) if p < 100 => format!("Downloading… {p}%"),
        Some(_) => "Restarting…".to_owned(),
    };
    let done = f32::from(progress.unwrap_or(0)) / 100.0;
    let mut button = row()
        .key("update")
        .role("button")
        .label(label.clone())
        .focusable(progress.is_none())
        .w_full()
        .h(32.0)
        .mt(24.0)
        .padding(1.0)
        .radius(8.0)
        .border(1.0, t.card)
        .press_scale(0.96)
        .child(
            row()
                .w_full()
                .h_full()
                .center()
                .radius(7.0)
                .clip_rounded(7.0)
                .fill(t.primary)
                .child(el().pin(Some(0.0), Some(0.0), None, Some(0.0)).w_frac(done).fill(t.primary_foreground.alpha(0.18)))
                .child(text(label).font(TextStyle::new(12.0, 500.0).lh(19.5).features("'tnum' 1")).color(t.primary_foreground)),
        );
    if progress.is_none() {
        button = button.on_press(update::update_now);
    }
    let mut screen = col()
        .key("must-update")
        .w_full()
        .items_center()
        .child(
            row()
                .key("status-icon")
                .size(48.0, 48.0)
                .center()
                .radius(24.0)
                .fill(t.muted)
                .box_shadow(ring_1(t.foreground_10))
                .child(icon(&icons::ARROW_UP, 20.0).color(t.card_foreground)),
        )
        .child(
            text("Update Cloudstash to continue")
                .key("title")
                .font(TextStyle::new(20.0, 600.0).lh(28.0).tracking(-0.5))
                .color(t.card_foreground)
                .align(Align::Center)
                .wrap()
                .mt(20.0),
        )
        .child(
            text(body)
                .key("body")
                .font(TextStyle::new(12.0, 400.0).lh(19.5))
                .color(t.muted_foreground)
                .align(Align::Center)
                .wrap()
                .max_w(280.0)
                .mt(8.0),
        )
        .child(button);
    if signed_in && progress.is_none() {
        screen = screen.child(
            row()
                .key("sign-out")
                .role("button")
                .label("Sign out")
                .focusable(true)
                .h(28.0)
                .px(10.0)
                .mt(12.0)
                .center()
                .radius(7.0)
                .hover(t.muted)
                .press_scale(0.96)
                .child(text("Sign out").font(TextStyle::new(12.0, 500.0).lh(19.5)).color(t.muted_foreground))
                .on_press(sign_out),
        );
    }
    screen.child(
        text(format!("Version {}", env!("CARGO_PKG_VERSION")))
            .key("version")
            .font(TextStyle::new(11.5, 400.0).features("'tnum' 1"))
            .color(t.muted_foreground)
            .opacity(0.8)
            .mt(28.0),
    )
}

/// The logo above a title and a line of text, all centred: what the sign-in screens share.
fn welcome(title: &'static str, body: String, t: Palette) -> El {
    scene(title, body, false, t)
}

fn header(title: &'static str, body: String, t: Palette) -> El {
    col()
        .key("header")
        .w_full()
        .items_center()
        .child(
            text(title).key("title").font(TextStyle::new(20.0, 600.0).lh(28.0).tracking(-0.5)).color(t.card_foreground).align(Align::Center).wrap(),
        )
        .child(text(body).key("body").font(TextStyle::new(12.0, 400.0).lh(19.5)).color(t.muted_foreground).align(Align::Center).wrap().mt(8.0))
}

/// Something is under way: the welcome with the logo turning faster.
fn progress(title: &'static str, body: String, t: Palette) -> El {
    scene(title, body, true, t)
}

fn scene(title: &'static str, body: String, busy: bool, t: Palette) -> El {
    col().key("welcome").w_full().items_center().child(sphere::live::<State>(96.0, t.card_foreground, busy)).child(header(title, body, t).mt(24.0))
}

/// Something went wrong: a warning badge takes the logo's place.
fn problem(title: &'static str, body: String, t: Palette) -> El {
    col()
        .key("status")
        .w_full()
        .items_center()
        .child(
            row()
                .key("status-icon")
                .size(48.0, 48.0)
                .center()
                .radius(24.0)
                .fill(t.destructive_10)
                .box_shadow(ring_1(t.destructive_20))
                .child(icon(&icons::TRIANGLE_ALERT, 20.0).color(t.destructive)),
        )
        .child(header(title, body, t).mt(20.0))
}

fn ring_1(color: Color) -> Shadow {
    Shadow { spread: 1.0, color, ..Shadow::default() }
}

fn primary_button(key: &'static str, label: &'static str, t: Palette) -> El {
    button(key, label, t.primary, t.card, t.primary_foreground)
}

fn outline_button(key: &'static str, label: &'static str, t: Palette) -> El {
    button(key, label, t.outline_fill, t.border, t.card_foreground)
}

fn button(key: &'static str, label: &'static str, fill: Color, border: Color, ink: Color) -> El {
    row().key(key).role("button").label(label).focusable(true).w_full().h(32.0).mt(24.0).padding(1.0).radius(8.0).border(1.0, border).child(
        row().w_full().h_full().px(9.0).center().radius(7.0).fill(fill).child(text(label).font(TextStyle::new(12.0, 500.0).lh(19.5)).color(ink)),
    )
}

fn signed_in_scene(s: &mut State, tab: Tab) {
    s.phase =
        Phase::SignedIn(Account { name: Some("Ada Example".to_owned()), email: "ada@example.com".to_owned(), library_id: "org_example".to_owned() });
    s.sync = Sync::Online;
    s.loaded = true;
    s.place = nav::Place::Tab(tab);
    let link = |id: &str, title: &str, status: &str, created_at: i64, completed_at: Option<i64>| LinkItem {
        id: id.to_owned(),
        title: title.to_owned(),
        url: format!("https://example.com/{id}"),
        domain: "example.com".to_owned(),
        image: None,
        favicon: None,
        description: None,
        summary: None,
        tags: Vec::new(),
        status: status.to_owned(),
        created_at,
        completed_at,
        deleted_at: None,
    };
    s.links = vec![
        link("a", "How we built a local-first sync engine", "unread", 5, None),
        link("b", "The Rust Programming Language", "unread", 4, None),
        link("c", "https://example.com/an-untitled-page", "unread", 3, None),
        link("d", "Designing calm interfaces", "completed", 2, Some(9)),
        link("e", "OKLCH in CSS: why we moved from RGB and HSL", "completed", 1, Some(8)),
    ];
}

/// Worst-case links after Emil Kowalski's break-ui catalog, shaped like the library's: an X
/// post's title with line breaks and emoji, a bare URL as the title, a one-letter title, markup
/// that must stay literal, a long host, and enough links to scroll. English only for now.
fn worst_case_scene(s: &mut State, tab: Tab) {
    signed_in_scene(s, tab);
    let link = |id: String, title: &str, url: &str, status: &str, created_at: i64| LinkItem {
        id,
        title: title.to_owned(),
        url: url.to_owned(),
        domain: url::Url::parse(url).ok().and_then(|u| u.host_str().map(|h| h.trim_start_matches("www.").to_owned())).unwrap_or_default(),
        image: None,
        favicon: None,
        description: None,
        summary: None,
        tags: Vec::new(),
        status: status.to_owned(),
        created_at,
        completed_at: None,
        deleted_at: None,
    };
    let worst = [
        (
            "Edo: Infinite canvas with Baroque-era artworks (because it's really cool)\n\nArticle on @codrops + codebase below👇",
            "https://x.com/edo/status/1",
        ),
        (
            "https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved",
            "https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved",
        ),
        ("J", "https://j.example.org/"),
        ("<script>alert(1)</script> &amp; **bold** in a saved title", "https://example.org/escaping"),
        ("Release notes", "https://sub.department.region.northwind-industries-holdings.example.com/releases"),
    ];
    let mut links: Vec<LinkItem> = worst.iter().enumerate().map(|(i, (t, u))| link(format!("w{i}"), t, u, "unread", 1_000 - i as i64)).collect();
    links.extend((0..40).map(|i| {
        link(format!("f{i}"), &format!("Canvas rendering notes, part {}", i + 1), &format!("https://example.com/canvas/{i}"), "unread", 500 - i)
    }));
    links[3].tags = vec!["security".to_owned()];
    links[4].summary = Some("What changed in the sync engine this quarter: faster cold starts, and CRDT compaction that keeps the event log small on long-lived libraries.".to_owned());
    links[5].description = Some("Field notes on drawing thousands of cards on a GPU canvas without dropping frames.".to_owned());
    s.links = links;
}

fn main() {
    log::start();
    let size = if headless() { None } else { rune_mac::saved_size(ui_state::WINDOW) };
    let size = size.unwrap_or((1180.0, 760.0));
    let mut app = App::new(AppSpec::<State> {
        scenes: &[
            ("signed-out", |s| s.phase = Phase::SignedOut),
            ("error", |s| {
                s.phase = Phase::SignedOut;
                s.notice = Some("The sign-in link expired".to_owned());
            }),
            ("waiting", |s| s.phase = Phase::WaitingForBrowser),
            ("finishing", |s| s.phase = Phase::Finishing),
            ("opening", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.intro = true;
                sphere::begin();
            }),
            ("opening-wide", |s| {
                worst_case_scene(s, Tab::Inbox);
                s.sidebar.set_open(false);
                s.intro = true;
                sphere::begin();
            }),
            ("signed-in", |s| signed_in_scene(s, Tab::Inbox)),
            ("completed", |s| signed_in_scene(s, Tab::Completed)),
            ("collapsed", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.sidebar.set_open(false);
            }),
            ("peek", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.sidebar.set_open(false);
                s.sidebar.peek();
            }),
            ("offline", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.sync = Sync::Offline;
            }),
            ("palette", |s| {
                signed_in_scene(s, Tab::Inbox);
                shell::toggle_palette(s);
            }),
            ("pictures", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.zoom = shell::Zoom::Pictures;
            }),
            ("summaries", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.zoom = shell::Zoom::Summaries;
            }),
            ("feed", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.zoom = shell::Zoom::Feed;
            }),
            ("preview", |s| {
                signed_in_scene(s, Tab::Inbox);
                let id = s.links[0].id.clone();
                shell::preview(s, &id, false);
            }),
            ("preview-open", |s| {
                signed_in_scene(s, Tab::Inbox);
                let id = s.links[0].id.clone();
                shell::preview(s, &id, true);
            }),
            ("preview-open-no-sidebar", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.sidebar.set_open(false);
                let id = s.links[0].id.clone();
                shell::preview(s, &id, true);
            }),
            ("signed-in-worst", |s| worst_case_scene(s, Tab::Inbox)),
            ("palette-worst", |s| {
                worst_case_scene(s, Tab::Inbox);
                s.palette = Some(shell::Palette::showing("e", 0));
            }),
            ("palette-search", |s| {
                worst_case_scene(s, Tab::Inbox);
                s.palette = Some(shell::Palette::showing("canvas", 1));
            }),
            ("palette-evidence", |s| {
                worst_case_scene(s, Tab::Inbox);
                s.palette = Some(shell::Palette::showing("compaction", 0));
            }),
            ("palette-fuzzy", |s| {
                worst_case_scene(s, Tab::Inbox);
                s.palette = Some(shell::Palette::showing("cnvs rend gpu", 0));
            }),
            ("palette-tag", |s| {
                worst_case_scene(s, Tab::Inbox);
                s.palette = Some(shell::Palette::showing("secur", 0));
            }),
            ("update-ready", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.update = update::Update::Ready;
            }),
            ("update-installing", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.update = update::Update::Installing;
            }),
            ("update-confirm", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.update = update::Update::Ready;
                s.confirm_update = true;
            }),
            ("update-failed", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.update = update::Update::Failed;
            }),
            ("account-menu", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.account_menu = true;
            }),
            ("account-menu-peek", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.sidebar.set_open(false);
                s.sidebar.peek();
                s.sidebar.hold_peek();
                s.account_menu = true;
            }),
            ("must-update", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.update = update::Update::Required(None);
            }),
            ("must-update-downloading", |s| {
                signed_in_scene(s, Tab::Inbox);
                s.update = update::Update::Required(Some(60));
            }),
            ("must-update-signed-out", |s| {
                s.phase = Phase::SignedOut;
                s.update = update::Update::Required(None);
            }),
            ("palette-empty", |s| {
                worst_case_scene(s, Tab::Inbox);
                s.palette = Some(shell::Palette::showing("kubernetes operator", 0));
            }),
        ],
        fonts: FONTS,
        families: (NOTO_SANS, NOTO_SANS),
        min_size: Some((900.0, 560.0)),
        on_key: Some(shell::on_key),
        poll: Some(poll),
        ..AppSpec::new(APP_TITLE, size, new_state, view)
    })
    .chrome(Chrome { full_size_content: true, traffic_lights: Some((21.0, 21.0)), drag_regions: true })
    .font_smoothing(FontSmoothing::Off)
    .on_frame_encoded({
        devtools_probes();
        let mut tracker = fps::Tracker::default();
        move |frame| {
            tracker.frame(frame);
            sphere::frame(frame, headless().then_some(1.0 / 60.0));
        }
    })
    .on_modifiers(shell::on_modifiers)
    .on_quit(|s, _| ui_state::flush(s))
    .on_open_url(open_url)
    .menu_item(MenuItem::new("Settings…", |s: &mut State, _| settings::open(s)).key_equivalent("cmd+comma".parse().expect("a valid shortcut")));
    let (settings_ui, settings_window) = app.window(settings::window(FONTS, NOTO_SANS));
    let auth = match Auth::from_env() {
        Ok(auth) => Arc::new(auth),
        Err(e) => {
            eprintln!("{e}");
            tracing::error!("{e}");
            std::process::exit(2);
        }
    };
    let backend = Backend {
        auth,
        ui: {
            let ui = app.handle();
            sphere::on_opened({
                let ui = ui.clone();
                move || ui.update(|s, _| s.intro = false)
            });
            fps::on_relayout({
                let ui = ui.clone();
                move || ui.update(|_, _| {})
            });
            ui
        },
    };
    let stored = backend.clone();
    let link = settings::link(settings_ui, settings_window, backend.ui.clone());
    backend.ui.update(move |s, tx| {
        s.backend = Some(stored);
        s.settings = Some(link);
        if let Some(link) = s.early_link.take() {
            open_url(s, &link, tx);
        }
        if !headless() {
            update::start(s);
        }
    });
    if !headless() {
        std::thread::spawn(move || backend.show(backend.auth.restore()));
    }
    app.run();
}

#[cfg(test)]
mod tests;
