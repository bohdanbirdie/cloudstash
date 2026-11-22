//! Cloudstash for Mac, prototype: sign in through the browser and show who is signed in.
//!
//! ```text
//! scripts/run.sh                                    # against https://cloudstash.dev
//! CLOUDSTASH_URL=http://127.0.0.1:3000 scripts/run.sh   # against a local dev server
//! ```

mod auth;
mod theme;

use std::sync::Arc;

use auth::{Account, Auth, Link};
use rune::{App, AppHandle, AppSpec, Color, Cx, El, TextStyle, Tx, col, row, text};
use theme::Palette;

const APP_TITLE: &str = "Cloudstash";
/// Tailwind's `text-xs/relaxed`.
const TEXT_XS_RELAXED: TextStyle = TextStyle::new(12.0, 400.0).lh(19.5);

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
    let body = |label: String| text(label).font(TEXT_XS_RELAXED).color(t.muted_foreground).wrap().mt(8.0);
    let mut content = col().key("content").w_full().max_w(320.0).child(
        text(APP_TITLE)
            .key("title")
            .font(TextStyle::new(20.0, 600.0).lh(28.0).tracking(-0.5))
            .color(t.foreground),
    );
    content = match &s.phase {
        Phase::Restoring => content.child(body("Checking for a saved session…".into())),
        Phase::SignedOut => content
            .child(body("Sign in with your Cloudstash account.".into()))
            .child(primary_button("sign-in", "Sign in", t).on_press(start_sign_in)),
        Phase::WaitingForBrowser => content
            .child(body("Finish signing in in your browser. Cloudstash opens again when you're done.".into()))
            .child(outline_button("cancel", "Cancel", t).on_press(cancel_sign_in)),
        Phase::Finishing => content.child(body("Signing in…".into())),
        Phase::SignedIn(account) => content
            .child(body(format!("Library {}", account.library_id)))
            .child(account_chip(account, t))
            .child(outline_button("sign-out", "Sign out", t).on_press(sign_out)),
    };
    if let Some(notice) = &s.notice {
        content = content.child(text(notice.clone()).key("notice").font(TEXT_XS_RELAXED).color(t.destructive).wrap().mt(20.0));
    }
    col().key("window").w_full().h_full().padding(28.0).fill(t.background).child(content)
}

fn account_chip(account: &Account, t: Palette) -> El {
    let label = account.name.as_deref().unwrap_or(&account.email);
    let initial: String = label.chars().take(1).flat_map(char::to_uppercase).collect();
    let mut lines = col().key("account-lines");
    if let Some(name) = &account.name {
        lines = lines.child(text(name.clone()).font(TextStyle::new(14.0, 500.0).lh(20.0)).color(t.foreground).truncate());
    }
    lines = lines.child(text(account.email.clone()).font(TextStyle::new(12.0, 400.0).lh(16.0)).color(t.muted_foreground).truncate());
    row()
        .key("account")
        .w_full()
        .mt(20.0)
        .items_center()
        .gap(12.0)
        .px(12.0)
        .py(10.0)
        .radius(8.0)
        .fill(t.muted_half)
        .border(1.0, t.ring_foreground)
        .child(
            row()
                .key("avatar")
                .size(32.0, 32.0)
                .center()
                .radius(16.0)
                .fill(t.muted)
                .border(1.0, t.border)
                .child(text(initial).font(TextStyle::new(14.0, 400.0).lh(20.0)).color(t.muted_foreground)),
        )
        .child(lines)
}

fn primary_button(key: &'static str, label: &'static str, t: Palette) -> El {
    button(key, label, t.primary, t.primary, t.primary_foreground)
}

fn outline_button(key: &'static str, label: &'static str, t: Palette) -> El {
    button(key, label, t.outline_fill, t.border, t.foreground)
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
        .px(10.0)
        .center()
        .radius(8.0)
        .fill(fill)
        .border(1.0, border)
        .child(text(label).font(TextStyle::new(12.0, 500.0).lh(19.5)).color(ink))
}

fn main() {
    let app = App::new(AppSpec::<State> {
        scenes: &[
            ("signed-out", |s| s.phase = Phase::SignedOut),
            ("waiting", |s| s.phase = Phase::WaitingForBrowser),
            ("signed-in", |s| {
                s.phase = Phase::SignedIn(Account {
                    name: Some("Ada Example".to_owned()),
                    email: "ada@example.com".to_owned(),
                    library_id: "org_example".to_owned(),
                });
            }),
        ],
        ..AppSpec::new(APP_TITLE, (520.0, 420.0), State::default, view)
    })
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
