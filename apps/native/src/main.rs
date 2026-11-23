//! Cloudstash for Mac, prototype: sign in through the browser, then sync the library with LiveStore
//! and show it in the "Inset" shell: a sidebar with the inbox, done, archive and all links,
//! beside a content card listing the chosen state's links (`shell.rs`).
//!
//! ```text
//! scripts/run.sh                                    # against https://cloudstash.dev
//! CLOUDSTASH_URL=http://127.0.0.1:3000 scripts/run.sh   # against a local dev server
//! ```

mod auth;
mod fps;
mod icons;
mod images;
mod livestore;
mod log;
mod search;
mod shell;
mod shell_kit;
mod theme;

use std::sync::Arc;

use auth::{Account, Auth, Link};
use livestore::library::{self, Library, LinkItem, Tab};
use rune::{App, AppHandle, AppSpec, Chrome, Color, Cx, El, FontSmoothing, LoopSpec, Shadow, TextStyle, Tx, col, icon, row, text};
use shell_kit::PaneState;
use theme::Palette;

const APP_TITLE: &str = "Cloudstash";
/// `@fontsource-variable/noto-sans` 5.2.10's subsets, one family each, listed so each
/// character falls back to its subset as the web's `unicode-range` faces do.
const NOTO_SANS: &str = "Noto Sans Latin, Noto Sans Latin Ext, Noto Sans Cyrillic, Noto Sans Cyrillic Ext, Noto Sans Greek, Noto Sans Greek Ext, Noto Sans Vietnamese, Noto Sans Devanagari";

#[derive(Default)]
enum Phase {
    #[default]
    Restoring,
    SignedOut,
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
    tab: Tab,
    sync: Sync,
    backend: Option<Backend>,
    /// A link that arrived before the backend was ready, as when it launched the app.
    early_link: Option<String>,
    sidebar: PaneState,
    /// The hardcoded space picked in the sidebar, shown in place of the tab.
    space: Option<usize>,
    kind: shell::Kind,
    mode: shell::Mode,
    /// The command palette, while it's open.
    palette: Option<shell::Palette>,
}

fn new_state() -> State {
    State { sidebar: shell::sidebar_state(), ..State::default() }
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
                match backend.open_library(&account) {
                    Ok(library) => s.library = Some(library),
                    Err(e) => s.sync = Sync::Failed(e),
                }
                s.phase = Phase::SignedIn(account);
            }
            Ok(None) => s.phase = Phase::SignedOut,
            Err(e) => {
                s.phase = Phase::SignedOut;
                s.notice = Some(e);
            }
        });
    }
}

impl Backend {
    /// Starts syncing the signed-in library into its own folder, one per server and library.
    fn open_library(&self, account: &Account) -> Result<Library, String> {
        let api_key = self.auth.api_key()?.ok_or("The saved session is missing its key.")?;
        let server: String = self.auth.base.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
        let (on_links, on_status) = (self.ui.clone(), self.ui.clone());
        let dir = self.auth.state_dir.join("libraries").join(server).join(&account.library_id);
        let _ = std::fs::remove_dir_all(dir.join("http-cache"));
        images::open(dir.join("images"), &shell::IMAGE_SIZES);
        Ok(library::start(
            library::Config { base: self.auth.base.clone(), library_id: account.library_id.clone(), api_key, dir },
            move |links| {
                images::prefetch(shell::wanted_images(&links));
                on_links.update(move |s, _| s.links = links)
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
        ))
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
    s.notice = None;
    s.phase = Phase::SignedOut;
    images::close();
    if let Some(library) = s.library.take() {
        library.close_and_forget();
    }
    s.links.clear();
    s.tab = Tab::default();
    std::thread::spawn(move || {
        if let Err(e) = backend.auth.sign_out() {
            backend.ui.update(move |s, _| s.notice = Some(e));
        }
    });
}

fn view(s: &State, cx: &mut Cx<State>) -> El {
    let t = theme::palette(cx.system_dark());
    let content = match (&s.phase, &s.notice) {
        (Phase::SignedOut, Some(notice)) => status(Tone::Problem, "Couldn't finish signing in", notice.clone(), t)
            .child(primary_button("sign-in", "Try again", t).on_press(start_sign_in)),
        (Phase::SignedOut, None) => header("Sign in to Cloudstash", "Access your saved links from anywhere.".into(), t)
            .child(primary_button("sign-in", "Sign in", t).on_press(start_sign_in)),
        (Phase::Restoring, _) => status(Tone::Progress, "Opening Cloudstash for Mac", "Checking for a saved session. This takes a moment.".into(), t),
        (Phase::WaitingForBrowser, _) => {
            status(Tone::Progress, "Finish signing in in your browser", "Cloudstash opens again when you're done.".into(), t)
                .child(outline_button("cancel", "Cancel", t).on_press(cancel_sign_in))
        }
        (Phase::Finishing, _) => status(Tone::Progress, "Signing in to Cloudstash for Mac", "Preparing your sign-in. This takes a moment.".into(), t),
        (Phase::SignedIn(account), _) => return shell::view(s, account, cx),
    };
    col()
        .key("window")
        .w_full()
        .h_full()
        .padding(28.0)
        .center()
        .fill(t.card)
        .window_drag()
        .child(col().key("content").w_full().max_w(320.0).child(brand_lockup(t)).child(content))
}

enum Tone {
    Problem,
    Progress,
}

fn brand_lockup(t: Palette) -> El {
    row()
        .key("brand")
        .items_center()
        .gap(8.0)
        .mb(28.0)
        .child(icon(&icons::LOGO, 24.0).color(t.primary))
        .child(text("cloudstash").font(TextStyle::new(14.0, 600.0).lh(20.0).tracking(-0.35)).color(t.card_foreground))
}

fn header(title: &'static str, body: String, t: Palette) -> El {
    col()
        .key("header")
        .w_full()
        .child(text(title).key("title").font(TextStyle::new(20.0, 600.0).lh(28.0).tracking(-0.5)).color(t.card_foreground).wrap())
        .child(text(body).key("body").font(TextStyle::new(12.0, 400.0).lh(19.5)).color(t.muted_foreground).wrap().mt(8.0))
}

fn status(tone: Tone, title: &'static str, body: String, t: Palette) -> El {
    let (fill, ink, ring, glyph) = match tone {
        Tone::Problem => (t.destructive_10, t.destructive, t.destructive_20, &icons::TRIANGLE_ALERT),
        Tone::Progress => (t.muted, t.muted_foreground, t.foreground_10, &icons::LOADER_CIRCLE),
    };
    let mut glyph = icon(glyph, 20.0).color(ink);
    if matches!(tone, Tone::Progress) {
        glyph = glyph.looping(LoopSpec::rotation(1.0));
    }
    col()
        .key("status")
        .w_full()
        .child(row().key("status-icon").size(40.0, 40.0).center().radius(20.0).fill(fill).box_shadow(ring_1(ring)).child(glyph))
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
    s.tab = tab;
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
    let app = App::new(AppSpec::<State> {
        scenes: &[
            ("signed-out", |s| s.phase = Phase::SignedOut),
            ("error", |s| {
                s.phase = Phase::SignedOut;
                s.notice = Some("The sign-in link expired".to_owned());
            }),
            ("waiting", |s| s.phase = Phase::WaitingForBrowser),
            ("finishing", |s| s.phase = Phase::Finishing),
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
            ("palette-empty", |s| {
                worst_case_scene(s, Tab::Inbox);
                s.palette = Some(shell::Palette::showing("kubernetes operator", 0));
            }),
        ],
        fonts: &[
            include_bytes!("../fonts/noto-sans-latin.ttf"),
            include_bytes!("../fonts/noto-sans-latin-ext.ttf"),
            include_bytes!("../fonts/noto-sans-cyrillic.ttf"),
            include_bytes!("../fonts/noto-sans-cyrillic-ext.ttf"),
            include_bytes!("../fonts/noto-sans-greek.ttf"),
            include_bytes!("../fonts/noto-sans-greek-ext.ttf"),
            include_bytes!("../fonts/noto-sans-vietnamese.ttf"),
            include_bytes!("../fonts/noto-sans-devanagari.ttf"),
        ],
        families: (NOTO_SANS, NOTO_SANS),
        min_size: Some((900.0, 560.0)),
        on_key: Some(shell::on_key),
        ..AppSpec::new(APP_TITLE, (1180.0, 760.0), new_state, view)
    })
    .chrome(Chrome { full_size_content: true, traffic_lights: Some((21.0, 21.0)), drag_regions: true })
    .font_smoothing(FontSmoothing::Off)
    .on_frame_encoded({
        devtools_probes();
        let mut tracker = fps::Tracker::default();
        move |frame| tracker.frame(frame)
    })
    .on_open_url(open_url);
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
            fps::on_relayout({
                let ui = ui.clone();
                move || ui.update(|_, _| {})
            });
            ui
        },
    };
    let stored = backend.clone();
    backend.ui.update(move |s, tx| {
        s.backend = Some(stored);
        if let Some(link) = s.early_link.take() {
            open_url(s, &link, tx);
        }
    });
    // Headless snapshots render a named scene and must not touch the keychain or network.
    if !std::env::args().any(|arg| arg == "--snap" || arg == "--tree") {
        std::thread::spawn(move || backend.show(backend.auth.restore()));
    }
    app.run();
}

#[cfg(test)]
mod tests;
