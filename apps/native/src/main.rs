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
use rune::tok::{radius, space, type_};
use rune::{App, AppHandle, AppSpec, Color, Cx, El, Tx, col, row, text};
use theme::Palette;

const APP_TITLE: &str = "Cloudstash";
/// The web's `--radius` (0.625rem), which cards use as `rounded-lg`.
const CARD_RADIUS: f32 = 10.0;

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
    let mut window = col()
        .key("window")
        .w_full()
        .h_full()
        .padding(space::S6)
        .gap(space::S3)
        .fill(t.background)
        .child(
            text(APP_TITLE)
                .key("title")
                .font(rune::TextStyle::new(28.0, 700.0))
                .color(t.foreground),
        );
    window = match &s.phase {
        Phase::Restoring => window.child(secondary("Checking for a saved session…", t)),
        Phase::SignedOut => window
            .child(secondary("Sign in with your Cloudstash account.", t))
            .child(row().child(primary_button("sign-in", "Sign in", t).on_press(start_sign_in))),
        Phase::WaitingForBrowser => window
            .child(secondary(
                "Finish signing in in your browser. Cloudstash opens again when you're done.",
                t,
            ))
            .child(row().child(outline_button("cancel", "Cancel", t).on_press(cancel_sign_in))),
        Phase::Finishing => window.child(secondary("Signing in…", t)),
        Phase::SignedIn(account) => {
            let mut card = col()
                .key("account")
                .w_full()
                .padding(space::S3)
                .gap(space::S1)
                .radius(CARD_RADIUS)
                .fill(t.card)
                .border(1.0, t.card_ring)
                .child(secondary("Signed in as", t));
            if let Some(name) = &account.name {
                card = card.child(
                    text(name.clone())
                        .font(type_::BODY)
                        .color(t.card_foreground),
                );
            }
            card = card
                .child(
                    text(account.email.clone())
                        .font(type_::BODY)
                        .color(t.card_foreground),
                )
                .child(secondary(format!("Library {}", account.library_id), t));
            window
                .child(card)
                .child(row().child(outline_button("sign-out", "Sign out", t).on_press(sign_out)))
        }
    };
    if let Some(notice) = &s.notice {
        window = window.child(
            text(notice.clone())
                .key("notice")
                .font(type_::LABEL)
                .color(t.destructive),
        );
    }
    window
}

fn secondary(label: impl Into<String>, t: Palette) -> El {
    text(label.into())
        .font(type_::LABEL)
        .color(t.muted_foreground)
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
        .h(32.0)
        .px(space::S3)
        .center()
        .radius(radius::MD)
        .fill(fill)
        .border(1.0, border)
        .child(text(label).font(type_::LABEL).color(ink))
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
