//! Cloudstash for Mac, prototype: sign in through the browser and show who is signed in.
//!
//! ```text
//! cargo run                                         # against https://cloudstash.dev
//! CLOUDSTASH_URL=http://127.0.0.1:3000 cargo run    # against a local dev server
//! ```

mod auth;

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use auth::{Account, Auth};
use rune::tok::{self, Theme, radius, space, type_};
use rune::{App, AppHandle, AppSpec, Cx, El, col, row, text};

const APP_TITLE: &str = "Cloudstash";

#[derive(Default)]
enum Phase {
    #[default]
    Restoring,
    SignedOut,
    /// The browser is open; the flag cancels the wait for its redirect.
    WaitingForBrowser(Arc<AtomicBool>),
    SignedIn(Account),
}

#[derive(Default)]
struct State {
    phase: Phase,
    notice: Option<String>,
    backend: Option<Backend>,
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
    let Some(backend) = s.backend.clone() else {
        return;
    };
    let cancel = Arc::new(AtomicBool::new(false));
    s.notice = None;
    s.phase = Phase::WaitingForBrowser(cancel.clone());
    std::thread::spawn(move || {
        let result = backend.auth.sign_in(open_browser, &cancel);
        if result.is_ok() {
            backend.ui.open();
        }
        backend.show(result.map(Some));
    });
}

fn cancel_sign_in(s: &mut State) {
    if let Phase::WaitingForBrowser(cancel) = &s.phase {
        cancel.store(true, Ordering::Relaxed);
    }
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
    let t = tok::theme(cx.system_dark());
    let mut window = col()
        .key("window")
        .w_full()
        .h_full()
        .padding(space::S6)
        .gap(space::S3)
        .fill(t.bg)
        .child(
            text(APP_TITLE)
                .key("title")
                .font(rune::TextStyle::new(28.0, 700.0))
                .color(t.text),
        );
    window = match &s.phase {
        Phase::Restoring => window.child(secondary("Checking for a saved session…", t)),
        Phase::SignedOut => window
            .child(secondary("Sign in with your Cloudstash account.", t))
            .child(row().child(button("sign-in", "Sign in", t).on_press(start_sign_in))),
        Phase::WaitingForBrowser(_) => window
            .child(secondary("Finish signing in in your browser.", t))
            .child(row().child(button("cancel", "Cancel", t).on_press(cancel_sign_in))),
        Phase::SignedIn(account) => {
            let mut card = col()
                .key("account")
                .w_full()
                .padding(space::S3)
                .gap(space::S1)
                .radius(radius::MD)
                .fill(t.card)
                .border(1.0, t.card_border)
                .child(secondary("Signed in as", t));
            if let Some(name) = &account.name {
                card = card.child(text(name.clone()).font(type_::BODY).color(t.text));
            }
            card = card
                .child(text(account.email.clone()).font(type_::BODY).color(t.text))
                .child(secondary(format!("Library {}", account.library_id), t));
            window
                .child(card)
                .child(row().child(button("sign-out", "Sign out", t).on_press(sign_out)))
        }
    };
    if let Some(notice) = &s.notice {
        window = window.child(
            text(notice.clone())
                .key("notice")
                .font(type_::LABEL)
                .color(rune::oklch(0.65, 0.2, 25.0)),
        );
    }
    window
}

fn secondary(label: impl Into<String>, t: Theme) -> El {
    text(label.into()).font(type_::LABEL).color(t.text_secondary)
}

fn button(key: &'static str, label: &'static str, t: Theme) -> El {
    row()
        .key(key)
        .role("button")
        .label(label)
        .focusable(true)
        .h(32.0)
        .px(space::S3)
        .center()
        .radius(radius::MD)
        .fill(t.card)
        .border(1.0, t.card_border)
        .child(text(label).font(type_::LABEL).color(t.text))
}

fn main() {
    let app = App::new(AppSpec::<State> {
        scenes: &[
            ("signed-out", |s| s.phase = Phase::SignedOut),
            ("waiting", |s| s.phase = Phase::WaitingForBrowser(Arc::default())),
            ("signed-in", |s| {
                s.phase = Phase::SignedIn(Account {
                    name: Some("Ada Example".to_owned()),
                    email: "ada@example.com".to_owned(),
                    library_id: "org_example".to_owned(),
                });
            }),
        ],
        ..AppSpec::new(APP_TITLE, (520.0, 420.0), State::default, view)
    });
    let backend = Backend {
        auth: Arc::new(Auth::from_env()),
        ui: app.handle(),
    };
    let stored = backend.clone();
    backend.ui.update(move |s, _| s.backend = Some(stored));
    // Headless snapshots render a named scene and must not touch the keychain or network.
    if !std::env::args().any(|arg| arg == "--snap" || arg == "--tree") {
        std::thread::spawn(move || backend.show(backend.auth.restore()));
    }
    app.run();
}

#[cfg(test)]
mod tests;
