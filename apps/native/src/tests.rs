//! The whole sign-in flow against a stand-in Cloudstash server on loopback.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use url::Url;

use crate::auth::{Account, Auth, KeyStore};

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
    device_name: Option<String>,
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
                let pending = server.challenge.take();
                if request["code"] == "code_1" && pending == Some(URL_SAFE_NO_PAD.encode(digest)) {
                    server.device_name = request["deviceName"].as_str().map(str::to_owned);
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

fn fixture() -> Fixture {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = Arc::new(Mutex::new(Server::default()));
    let serving = server.clone();
    std::thread::spawn(move || serve(listener, serving));
    // A free port for the redirect, released for the app to bind.
    let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let store = Arc::new(MemoryStore::default());
    Fixture {
        auth: Auth { base, port, store: Box::new(store.clone()) },
        server,
        store,
    }
}

/// Plays the signed-in web page: registers the challenge, then follows the redirect to the app
/// with `code` and the given state (the real one when `None`). Returns where the app sent
/// the browser afterwards.
fn browser(
    server: Arc<Mutex<Server>>,
    code: &'static str,
    forged_state: Option<&'static str>,
    landed: Arc<Mutex<Option<String>>>,
) -> impl FnOnce(&str) {
    move |page: &str| {
        let page = Url::parse(page).unwrap();
        assert_eq!(page.path(), "/connect/native");
        let param = |name: &str| page.query_pairs().find(|(key, _)| key == name).unwrap().1.into_owned();
        server.lock().unwrap().challenge = Some(param("code_challenge"));
        let state = forged_state.map_or_else(|| param("state"), str::to_owned);
        let redirect = Url::parse_with_params(&param("redirect_uri"), [("code", code), ("state", &state)]).unwrap();
        std::thread::spawn(move || {
            let mut stream = TcpStream::connect(redirect.socket_addrs(|| None).unwrap()[0]).unwrap();
            write!(stream, "GET {}?{} HTTP/1.1\r\nHost: x\r\n\r\n", redirect.path(), redirect.query().unwrap()).unwrap();
            let mut response = String::new();
            let _ = stream.read_to_string(&mut response);
            let location = response.lines().find_map(|line| line.strip_prefix("Location: "));
            *landed.lock().unwrap() = location.map(str::to_owned);
        });
    }
}

fn wait_for_landing(landed: &Arc<Mutex<Option<String>>>) -> String {
    for _ in 0..100 {
        if let Some(location) = landed.lock().unwrap().clone() {
            return location;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    panic!("the app never answered the browser");
}

#[test]
fn signs_in_restores_and_signs_out() {
    let f = fixture();
    let landed = Arc::default();
    let account = f
        .auth
        .sign_in(browser(f.server.clone(), "code_1", None, Arc::clone(&landed)), &AtomicBool::new(false))
        .unwrap();
    let expected = Account {
        name: Some("Ada".to_owned()),
        email: "ada@example.com".to_owned(),
        library_id: "org_1".to_owned(),
    };
    assert_eq!(account, expected);
    assert_eq!(f.store.load().unwrap().as_deref(), Some(API_KEY));
    assert!(f.server.lock().unwrap().device_name.is_some());
    assert_eq!(wait_for_landing(&landed), format!("{}/connect/native?connected=1", f.auth.base));

    // A relaunch resumes from the stored key.
    assert_eq!(f.auth.restore().unwrap(), Some(expected));

    f.auth.sign_out().unwrap();
    assert!(f.server.lock().unwrap().revoked);
    assert_eq!(f.store.load().unwrap(), None);
    assert_eq!(f.auth.restore().unwrap(), None);
}

#[test]
fn a_rejected_stored_key_signs_out() {
    let f = fixture();
    f.store.save("stale").unwrap();
    assert_eq!(f.auth.restore().unwrap(), None);
    assert_eq!(f.store.load().unwrap(), None);
}

#[test]
fn a_redirect_with_the_wrong_state_is_ignored_until_cancelled() {
    let f = fixture();
    let cancel = Arc::new(AtomicBool::new(false));
    let stop = cancel.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(600));
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
    });
    let error = f
        .auth
        .sign_in(browser(f.server.clone(), "code_1", Some("forged"), Arc::default()), &cancel)
        .unwrap_err();
    assert_eq!(error, "Sign-in cancelled.");
    assert_eq!(f.store.load().unwrap(), None);
}

#[test]
fn a_refused_code_fails_and_tells_the_browser() {
    let f = fixture();
    let landed = Arc::default();
    let error = f
        .auth
        .sign_in(browser(f.server.clone(), "wrong", None, Arc::clone(&landed)), &AtomicBool::new(false))
        .unwrap_err();
    assert_eq!(error, "Invalid or expired code (HTTP 400)");
    assert_eq!(f.store.load().unwrap(), None);
    assert_eq!(wait_for_landing(&landed), format!("{}/connect/native?failed=1", f.auth.base));
}
