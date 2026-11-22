//! Cloudstash for Mac, prototype: sign in through the browser and show the signed-in library.
//!
//! ```text
//! cargo run                                         # against https://cloudstash.dev
//! CLOUDSTASH_URL=http://127.0.0.1:3000 cargo run    # against a local dev server
//! ```

mod auth;
mod library;

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use auth::{Auth, Session};
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
    SignedIn {
        session: Session,
        /// `None` while the library request is in flight.
        links: Option<Result<Vec<String>, String>>,
    },
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
    fn signed_in(&self, session: Session) {
        let shown = session.clone();
        self.ui.update(move |s, _| {
            s.phase = Phase::SignedIn {
                session: shown,
                links: None,
            };
        });
        let links = library::recent_links(&self.auth.resource(), &session);
        self.ui.update(move |s, _| {
            if let Phase::SignedIn { links: slot, .. } = &mut s.phase {
                *slot = Some(links);
            }
        });
    }

    fn restore(&self) {
        match self.auth.restore() {
            Ok(Some(session)) => self.signed_in(session),
            Ok(None) => self.ui.update(|s, _| s.phase = Phase::SignedOut),
            Err(e) => self.ui.update(move |s, _| {
                s.phase = Phase::SignedOut;
                s.notice = Some(e);
            }),
        }
    }

    fn sign_in(&self, cancel: &AtomicBool) {
        match self.auth.sign_in(open_browser, cancel) {
            Ok(session) => {
                self.ui.open();
                self.signed_in(session);
            }
            Err(e) => self.ui.update(move |s, _| {
                s.phase = Phase::SignedOut;
                s.notice = Some(e);
            }),
        }
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
    std::thread::spawn(move || backend.sign_in(&cancel));
}

fn cancel_sign_in(s: &mut State) {
    if let Phase::WaitingForBrowser(cancel) = &s.phase {
        cancel.store(true, Ordering::Relaxed);
    }
}

fn refresh(s: &mut State) {
    let Some(backend) = s.backend.clone() else {
        return;
    };
    s.notice = None;
    s.phase = Phase::Restoring;
    std::thread::spawn(move || backend.restore());
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
            .child(secondary("Sign in with your Cloudstash account in the browser.", t))
            .child(row().child(button("sign-in", "Sign in with browser", t).on_press(start_sign_in))),
        Phase::WaitingForBrowser(_) => window
            .child(secondary("Finish signing in in your browser. This window updates when you're done.", t))
            .child(row().child(button("cancel", "Cancel", t).on_press(cancel_sign_in))),
        Phase::SignedIn { session, links } => {
            let mut card = col()
                .key("account")
                .w_full()
                .padding(space::S3)
                .gap(space::S1)
                .radius(radius::MD)
                .fill(t.card)
                .border(1.0, t.card_border)
                .child(text("Signed in").font(type_::BODY).color(tok::accent(0, true)))
                .child(secondary(format!("User {}", session.user_id), t))
                .child(secondary(
                    format!("Library {}", session.workspace_id.as_deref().unwrap_or("none")),
                    t,
                ))
                .child(secondary(format!("Access {}", session.scope), t));
            card = match links {
                None => card.child(secondary("Loading your latest links…", t)),
                Some(Err(e)) => card.child(error(format!("Couldn't load links: {e}"))),
                Some(Ok(links)) if links.is_empty() => card.child(secondary("Your library has no links yet.", t)),
                Some(Ok(links)) => {
                    let mut list = col().key("links").gap(space::S1).child(secondary("Latest links", t));
                    for link in links {
                        list = list.child(text(link.clone()).font(type_::BODY).color(t.text));
                    }
                    card.child(list)
                }
            };
            window.child(card).child(
                row()
                    .gap(space::S2)
                    .child(button("refresh", "Refresh session", t).on_press(refresh))
                    .child(button("sign-out", "Sign out", t).on_press(sign_out)),
            )
        }
    };
    if let Some(notice) = &s.notice {
        window = window.child(error(notice.clone()));
    }
    window
}

fn secondary(label: impl Into<String>, t: Theme) -> El {
    text(label.into()).font(type_::LABEL).color(t.text_secondary)
}

fn error(message: String) -> El {
    text(message)
        .key("notice")
        .font(type_::LABEL)
        .color(rune::oklch(0.65, 0.2, 25.0))
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
    let auth = match Auth::from_env() {
        Ok(auth) => Arc::new(auth),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    };
    let app = App::new(AppSpec::<State> {
        scenes: &[
            ("signed-out", |s| s.phase = Phase::SignedOut),
            ("waiting", |s| s.phase = Phase::WaitingForBrowser(Arc::default())),
            ("signed-in", |s| {
                s.phase = Phase::SignedIn {
                    session: Session {
                        access_token: String::new(),
                        user_id: "user_example".to_owned(),
                        workspace_id: Some("org_example".to_owned()),
                        scope: "openid offline_access links:read".to_owned(),
                    },
                    links: Some(Ok(vec!["An example saved link".to_owned(), "https://example.com/another".to_owned()])),
                };
            }),
        ],
        ..AppSpec::new(APP_TITLE, (520.0, 420.0), State::default, view)
    });
    let backend = Backend {
        auth,
        ui: app.handle(),
    };
    let stored = backend.clone();
    backend.ui.update(move |s, _| s.backend = Some(stored));
    // Headless snapshots render a named scene and must not touch the keychain or network.
    if !std::env::args().any(|arg| arg == "--snap" || arg == "--tree") {
        std::thread::spawn(move || backend.restore());
    }
    app.run();
}

#[cfg(test)]
mod tests;
