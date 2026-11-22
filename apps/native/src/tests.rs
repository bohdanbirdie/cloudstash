//! The whole sign-in flow against a stand-in Cloudstash server on loopback.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use url::Url;

use crate::auth::{Account, Auth, KeyStore, Link};

const API_KEY: &str = "lb_test_key";

#[derive(Default)]
struct MemoryStore(Mutex<Option<String>>);

impl KeyStore for Arc<MemoryStore> {
    fn load(&self) -> Result<Option<String>, String> {
        Ok(self.0.lock().unwrap().clone())
    }
    fn save(&self, api_key: &str) -> Result<(), String> {
        *self.0.lock().unwrap() = Some(api_key.to_owned());
        Ok(())
    }
    fn clear(&self) -> Result<(), String> {
        *self.0.lock().unwrap() = None;
        Ok(())
    }
}

#[derive(Default)]
struct Server {
    /// The challenge the web page registered for the pending code.
    challenge: Option<String>,
    revoked: bool,
}

fn serve(listener: TcpListener, server: Arc<Mutex<Server>>) {
    for stream in listener.incoming() {
        let Ok(mut stream) = stream else { return };
        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        let mut parts = line.split_whitespace();
        let (method, path) = (parts.next().unwrap().to_owned(), parts.next().unwrap().to_owned());
        let (mut length, mut authorized) = (0usize, false);
        loop {
            let mut header = String::new();
            reader.read_line(&mut header).unwrap();
            let header = header.trim();
            if header.is_empty() {
                break;
            }
            let (name, value) = header.split_once(':').unwrap();
            match name.to_ascii_lowercase().as_str() {
                "content-length" => length = value.trim().parse().unwrap(),
                "authorization" => authorized = value.trim() == format!("Bearer {API_KEY}"),
                _ => {}
            }
        }
        let mut body = vec![0u8; length];
        reader.read_exact(&mut body).unwrap();
        let mut server = server.lock().unwrap();
        let (status, reply): (u16, Value) = match (method.as_str(), path.as_str()) {
            ("POST", "/api/connect/native/exchange") => {
                let request: Value = serde_json::from_slice(&body).unwrap();
                let digest = Sha256::digest(request["codeVerifier"].as_str().unwrap().as_bytes());
                if request["code"] == "code_1" && server.challenge.take() == Some(URL_SAFE_NO_PAD.encode(digest)) {
                    (200, json!({ "apiKey": API_KEY }))
                } else {
                    (400, json!({ "error": "Invalid or expired code" }))
                }
            }
            (_, "/api/connect/native" | "/api/connect/native/account") if !authorized || server.revoked => {
                (401, json!({ "error": "Unauthorized" }))
            }
            ("GET", "/api/connect/native/account") => (
                200,
                json!({ "orgId": "org_1", "user": { "email": "ada@example.com", "name": "Ada" } }),
            ),
            ("DELETE", "/api/connect/native") => {
                server.revoked = true;
                (200, json!({ "ok": true }))
            }
            _ => (404, json!({ "error": "not_found" })),
        };
        let reply = reply.to_string();
        write!(
            stream,
            "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}",
            reply.len()
        )
        .unwrap();
    }
}

struct Fixture {
    auth: Auth,
    server: Arc<Mutex<Server>>,
    store: Arc<MemoryStore>,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.auth.state_dir);
    }
}

fn fixture(name: &str) -> Fixture {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = Arc::new(Mutex::new(Server::default()));
    let serving = server.clone();
    std::thread::spawn(move || serve(listener, serving));
    let state_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("target/test-state/{name}"));
    let _ = std::fs::remove_dir_all(&state_dir);
    let store = Arc::new(MemoryStore::default());
    Fixture {
        auth: Auth { base, state_dir, store: Box::new(store.clone()) },
        server,
        store,
    }
}

/// Plays the signed-in web page: registers the page's challenge with the server and returns the
/// deep link the page opens.
fn web_page(f: &Fixture, page: &str, code: &str) -> String {
    let page = Url::parse(page).unwrap();
    assert_eq!(page.path(), "/connect/native");
    let param = |name: &str| page.query_pairs().find(|(key, _)| key == name).unwrap().1.into_owned();
    f.server.lock().unwrap().challenge = Some(param("code_challenge"));
    Url::parse_with_params("cloudstash://auth/callback", [("code", code), ("state", &param("state"))])
        .unwrap()
        .into()
}

fn sign_in(f: &Fixture) -> Result<Account, String> {
    let page = f.auth.begin_sign_in().unwrap();
    let link = web_page(f, &page, "code_1");
    let Link::SignIn { code, verifier } = f.auth.accept_link(&link) else {
        panic!("the app ignored its own sign-in link");
    };
    f.auth.complete_sign_in(&code, &verifier)
}

#[test]
fn signs_in_restores_and_signs_out() {
    let f = fixture("happy");
    let expected = Account {
        name: Some("Ada".to_owned()),
        email: "ada@example.com".to_owned(),
        library_id: "org_1".to_owned(),
    };
    assert_eq!(sign_in(&f).unwrap(), expected);
    assert_eq!(f.store.load().unwrap().as_deref(), Some(API_KEY));

    // A relaunch resumes from the stored key.
    assert_eq!(f.auth.restore().unwrap(), Some(expected));

    f.auth.sign_out().unwrap();
    assert!(f.server.lock().unwrap().revoked);
    assert_eq!(f.store.load().unwrap(), None);
    assert_eq!(f.auth.restore().unwrap(), None);
}

#[test]
fn a_link_is_used_once() {
    let f = fixture("once");
    let page = f.auth.begin_sign_in().unwrap();
    let link = web_page(&f, &page, "code_1");
    assert!(matches!(f.auth.accept_link(&link), Link::SignIn { .. }));
    assert_eq!(f.auth.accept_link(&link), Link::Ignored);
}

#[test]
fn links_that_are_not_this_sign_in_are_ignored() {
    let f = fixture("ignored");
    let page = f.auth.begin_sign_in().unwrap();
    let link = web_page(&f, &page, "code_1");
    let forged = Url::parse_with_params("cloudstash://auth/callback", [("code", "code_1"), ("state", "forged")]).unwrap();
    for other in [
        forged.as_str(),
        "cloudstash://elsewhere/callback?code=code_1",
        "https://auth/callback?code=code_1",
        "not a link",
    ] {
        assert_eq!(f.auth.accept_link(other), Link::Ignored, "{other}");
    }
    // The genuine link still works after the others were ignored.
    assert!(matches!(f.auth.accept_link(&link), Link::SignIn { .. }));
}

#[test]
fn a_cancelled_sign_in_ignores_its_link() {
    let f = fixture("cancelled");
    let page = f.auth.begin_sign_in().unwrap();
    let link = web_page(&f, &page, "code_1");
    f.auth.cancel_sign_in();
    assert_eq!(f.auth.accept_link(&link), Link::Ignored);
}

#[test]
fn a_stale_sign_in_ignores_its_link() {
    let f = fixture("stale");
    let page = f.auth.begin_sign_in().unwrap();
    let link = web_page(&f, &page, "code_1");
    let pending = f.auth.state_dir.join("pending-sign-in.json");
    let mut saved: Value = serde_json::from_str(&std::fs::read_to_string(&pending).unwrap()).unwrap();
    saved["created"] = json!(0);
    std::fs::write(&pending, saved.to_string()).unwrap();
    assert_eq!(f.auth.accept_link(&link), Link::Ignored);
}

#[test]
fn the_pending_sign_in_is_private() {
    use std::os::unix::fs::PermissionsExt;
    let f = fixture("private");
    f.auth.begin_sign_in().unwrap();
    let mode = std::fs::metadata(f.auth.state_dir.join("pending-sign-in.json")).unwrap().permissions().mode();
    assert_eq!(mode & 0o777, 0o600);
}

#[test]
fn a_rejected_stored_key_signs_out() {
    let f = fixture("rejected");
    f.store.save("stale").unwrap();
    assert_eq!(f.auth.restore().unwrap(), None);
    assert_eq!(f.store.load().unwrap(), None);
}

#[test]
fn a_refused_code_reports_why() {
    let f = fixture("refused");
    let page = f.auth.begin_sign_in().unwrap();
    let link = web_page(&f, &page, "wrong");
    let Link::SignIn { code, verifier } = f.auth.accept_link(&link) else {
        panic!("the app ignored its own sign-in link");
    };
    assert_eq!(f.auth.complete_sign_in(&code, &verifier).unwrap_err(), "Invalid or expired code (HTTP 400)");
    assert_eq!(f.store.load().unwrap(), None);
}
