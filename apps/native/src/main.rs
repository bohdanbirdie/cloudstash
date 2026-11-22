//! Cloudstash for Mac, prototype: sign in through the browser and show who is signed in.
//!
//! ```text
//! scripts/run.sh                                    # against https://cloudstash.dev
//! CLOUDSTASH_URL=http://127.0.0.1:3000 scripts/run.sh   # against a local dev server
//! ```

mod auth;
mod icons;
mod theme;

use std::sync::Arc;

use auth::{Account, Auth, Link};
use rune::{App, AppHandle, AppSpec, Color, Cx, El, FontSmoothing, LoopSpec, Shadow, TextStyle, Tx, col, icon, row, text};
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

#[derive(Default)]
struct State {
    phase: Phase,
    notice: Option<String>,
    backend: Option<Backend>,
    /// A link that arrived before the backend was ready, as when it launched the app.
    early_link: Option<String>,
}

#[derive(Clone)]
struct Backend {
    auth: Arc<Auth>,
    ui: AppHandle<State>,
}

impl Backend {
    fn show(&self, result: Result<Option<Account>, String>) {
        self.ui.update(move |s, _| match result {
            Ok(Some(account)) => s.phase = Phase::SignedIn(account),
            Ok(None) => s.phase = Phase::SignedOut,
            Err(e) => {
                s.phase = Phase::SignedOut;
                s.notice = Some(e);
            }
        });
    }
}

fn open_browser(url: &str) {
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    if let Err(e) = std::process::Command::new(opener).arg(url).spawn() {
        eprintln!("could not open the browser ({e}); open this URL to sign in:\n{url}");
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

fn sign_out(s: &mut State) {
    let Some(backend) = s.backend.clone() else {
        return;
    };
    s.notice = None;
    s.phase = Phase::SignedOut;
    std::thread::spawn(move || {
        if let Err(e) = backend.auth.sign_out() {
            backend.ui.update(move |s, _| s.notice = Some(e));
        }
    });
}

fn view(s: &State, cx: &mut Cx<State>) -> El {
    let t = theme::palette(cx.system_dark());
    let content = match (&s.phase, &s.notice) {
        (Phase::SignedOut, Some(notice)) => status(
            Tone::Problem,
            "Couldn't finish signing in",
            notice.clone(),
            t,
        )
        .child(primary_button("sign-in", "Try again", t).on_press(start_sign_in)),
        (Phase::SignedOut, None) => header("Sign in to Cloudstash", "Access your saved links from anywhere.".into(), t)
            .child(primary_button("sign-in", "Sign in", t).on_press(start_sign_in)),
        (Phase::Restoring, _) => status(
            Tone::Progress,
            "Opening Cloudstash for Mac",
            "Checking for a saved session. This takes a moment.".into(),
            t,
        ),
        (Phase::WaitingForBrowser, _) => status(
            Tone::Progress,
            "Finish signing in in your browser",
            "Cloudstash opens again when you're done.".into(),
            t,
        )
        .child(outline_button("cancel", "Cancel", t).on_press(cancel_sign_in)),
        (Phase::Finishing, _) => status(
            Tone::Progress,
            "Signing in to Cloudstash for Mac",
            "Preparing your sign-in. This takes a moment.".into(),
            t,
        ),
        (Phase::SignedIn(account), notice) => {
            let body = notice.clone().unwrap_or_else(|| format!("Library {}", account.library_id));
            let tone = if notice.is_some() { Tone::Problem } else { Tone::Success };
            status(tone, "Signed in to Cloudstash", body, t)
                .child(account_chip(account, t))
                .child(outline_button("sign-out", "Sign out", t).on_press(sign_out))
        }
    };
    col()
        .key("window")
        .w_full()
        .h_full()
        .padding(28.0)
        .center()
        .fill(t.card)
        .child(
            col()
                .key("content")
                .w_full()
                .max_w(320.0)
                .child(brand_lockup(t))
                .child(content),
        )
}

enum Tone {
    Problem,
    Progress,
    Success,
}

fn brand_lockup(t: Palette) -> El {
    row()
        .key("brand")
        .items_center()
        .gap(8.0)
        .mb(28.0)
        .child(icon(&icons::LOGO, 24.0).color(t.primary))
        .child(
            text("cloudstash")
                .font(TextStyle::new(14.0, 600.0).lh(20.0).tracking(-0.35))
                .color(t.card_foreground),
        )
}

fn header(title: &'static str, body: String, t: Palette) -> El {
    col()
        .key("header")
        .w_full()
        .child(
            text(title)
                .key("title")
                .font(TextStyle::new(20.0, 600.0).lh(28.0).tracking(-0.5))
                .color(t.card_foreground)
                .wrap(),
        )
        .child(
            text(body)
                .key("body")
                .font(TextStyle::new(12.0, 400.0).lh(19.5))
                .color(t.muted_foreground)
                .wrap()
                .mt(8.0),
        )
}

fn status(tone: Tone, title: &'static str, body: String, t: Palette) -> El {
    let (fill, ink, ring, glyph) = match tone {
        Tone::Problem => (t.destructive_10, t.destructive, t.destructive_20, &icons::TRIANGLE_ALERT),
        Tone::Progress => (t.muted, t.muted_foreground, t.foreground_10, &icons::LOADER_CIRCLE),
        Tone::Success => (t.primary, t.primary_foreground, t.primary, &icons::CHECK),
    };
    let mut glyph = icon(glyph, 20.0).color(ink);
    if matches!(tone, Tone::Progress) {
        glyph = glyph.looping(LoopSpec::rotation(1.0));
    }
    col()
        .key("status")
        .w_full()
        .child(
            row()
                .key("status-icon")
                .size(40.0, 40.0)
                .center()
                .radius(20.0)
                .fill(fill)
                .box_shadow(ring_1(ring))
                .child(glyph),
        )
        .child(header(title, body, t).mt(20.0))
}

fn account_chip(account: &Account, t: Palette) -> El {
    let label = account.name.as_deref().unwrap_or(&account.email);
    let initial: String = label.chars().take(1).flat_map(char::to_uppercase).collect();
    let mut lines = col().key("account-lines").min_w(0.0);
    if let Some(name) = &account.name {
        lines = lines.child(
            text(name.clone())
                .font(TextStyle::new(14.0, 500.0).lh(20.0))
                .color(t.card_foreground)
                .truncate(),
        );
    }
    lines = lines.child(
        text(account.email.clone())
            .font(TextStyle::new(12.0, 400.0).lh(16.0))
            .color(t.muted_foreground)
            .truncate(),
    );
    row()
        .key("account")
        .w_full()
        .mt(20.0)
        .items_center()
        .gap(12.0)
        .px(12.0)
        .py(10.0)
        .radius(8.0)
        .fill(t.muted_50)
        .box_shadow(ring_1(t.foreground_10))
        .child(
            row()
                .key("avatar")
                .size(32.0, 32.0)
                .center()
                .radius(16.0)
                .fill(t.muted)
                .border(1.0, t.border)
                .child(
                    text(initial)
                        .font(TextStyle::new(14.0, 400.0).lh(20.0))
                        .color(t.muted_foreground),
                ),
        )
        .child(lines)
}

fn ring_1(color: Color) -> Shadow {
    Shadow {
        spread: 1.0,
        color,
        ..Shadow::default()
    }
}

fn primary_button(key: &'static str, label: &'static str, t: Palette) -> El {
    button(key, label, t.primary, t.card, t.primary_foreground)
}

fn outline_button(key: &'static str, label: &'static str, t: Palette) -> El {
    button(key, label, t.outline_fill, t.border, t.card_foreground)
}

fn button(key: &'static str, label: &'static str, fill: Color, border: Color, ink: Color) -> El {
    row()
        .key(key)
        .role("button")
        .label(label)
        .focusable(true)
        .w_full()
        .h(32.0)
        .mt(24.0)
        .padding(1.0)
        .radius(8.0)
        .border(1.0, border)
        .child(
            row()
                .w_full()
                .h_full()
                .px(9.0)
                .center()
                .radius(7.0)
                .fill(fill)
                .child(text(label).font(TextStyle::new(12.0, 500.0).lh(19.5)).color(ink)),
        )
}

fn main() {
    let app = App::new(AppSpec::<State> {
        scenes: &[
            ("signed-out", |s| s.phase = Phase::SignedOut),
            ("error", |s| {
                s.phase = Phase::SignedOut;
                s.notice = Some("The sign-in link expired".to_owned());
            }),
            ("waiting", |s| s.phase = Phase::WaitingForBrowser),
            ("finishing", |s| s.phase = Phase::Finishing),
            ("signed-in", |s| {
                s.phase = Phase::SignedIn(Account {
                    name: Some("Ada Example".to_owned()),
                    email: "ada@example.com".to_owned(),
                    library_id: "org_example".to_owned(),
                });
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
        ..AppSpec::new(APP_TITLE, (520.0, 420.0), State::default, view)
    })
    .font_smoothing(FontSmoothing::Off)
    .on_open_url(open_url);
    let auth = match Auth::from_env() {
        Ok(auth) => Arc::new(auth),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    };
    let backend = Backend {
        auth,
        ui: app.handle(),
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
