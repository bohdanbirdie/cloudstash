//! The whole sign-in flow against a stand-in authorization server on loopback.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use url::Url;

use crate::auth::{Auth, TokenStore};
use crate::library;

#[derive(Default)]
struct MemoryStore(Mutex<Option<String>>);

impl TokenStore for Arc<MemoryStore> {
    fn load(&self) -> Result<Option<String>, String> {
        Ok(self.0.lock().unwrap().clone())
    }
    fn save(&self, refresh_token: &str) -> Result<(), String> {
        *self.0.lock().unwrap() = Some(refresh_token.to_owned());
        Ok(())
    }
    fn clear(&self) -> Result<(), String> {
        *self.0.lock().unwrap() = None;
        Ok(())
    }
}

#[derive(Default)]
struct Server {
    challenge: Option<String>,
    registrations: u32,
    /// The refresh token the server currently accepts.
    refresh_token: Option<String>,
    issued: u32,
    revoked: bool,
}

fn access_token() -> String {
    let claims = json!({
        "sub": "user_1",
        "scope": "openid offline_access links:read",
        "https://cloudstash.dev/claims/workspace-id": "org_1",
    });
    format!("e30.{}.sig", URL_SAFE_NO_PAD.encode(claims.to_string()))
}

fn serve(listener: TcpListener, base: String, server: Arc<Mutex<Server>>) {
    for stream in listener.incoming() {
        let Ok(mut stream) = stream else { return };
        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        let mut parts = line.split_whitespace();
        let (method, path) = (parts.next().unwrap().to_owned(), parts.next().unwrap().to_owned());
        let (mut length, mut bearer) = (0usize, None);
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
                "authorization" => bearer = Some(value.trim().to_owned()),
                _ => {}
            }
        }
        let mut body = vec![0u8; length];
        reader.read_exact(&mut body).unwrap();
        let form = |name: &str| {
            url::form_urlencoded::parse(&body)
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.into_owned())
        };
        let mut server = server.lock().unwrap();
        let issue = |server: &mut Server| {
            server.issued += 1;
            let refresh = format!("refresh-{}", server.issued);
            server.refresh_token = Some(refresh.clone());
            (200, json!({ "access_token": access_token(), "refresh_token": refresh, "expires_in": 300 }))
        };
        let (status, reply): (u16, Value) = match (method.as_str(), path.as_str()) {
            ("GET", "/.well-known/oauth-authorization-server/api/auth") => (200, json!({
                "issuer": format!("{base}/api/auth"),
                "authorization_endpoint": format!("{base}/api/auth/oauth2/authorize"),
                "token_endpoint": format!("{base}/api/auth/oauth2/token"),
                "registration_endpoint": format!("{base}/api/auth/oauth2/register"),
                "revocation_endpoint": format!("{base}/api/auth/oauth2/revoke"),
            })),
            ("POST", "/api/auth/oauth2/register") => {
                let request: Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(request["token_endpoint_auth_method"], "none");
                assert_eq!(request["application_type"], "native");
                server.registrations += 1;
                (201, json!({ "client_id": "client_1" }))
            }
            ("POST", "/api/auth/oauth2/token") => match form("grant_type").as_deref() {
                Some("authorization_code") => {
                    let digest = Sha256::digest(form("code_verifier").unwrap().as_bytes());
                    if form("code").as_deref() == Some("code_1")
                        && Some(URL_SAFE_NO_PAD.encode(digest)) == server.challenge
                    {
                        issue(&mut server)
                    } else {
                        (400, json!({ "error": "invalid_grant" }))
                    }
                }
                Some("refresh_token") if form("refresh_token") == server.refresh_token => issue(&mut server),
                _ => (400, json!({ "error": "invalid_grant" })),
            },
            ("POST", "/api/auth/oauth2/revoke") => {
                if form("token") == server.refresh_token {
                    server.refresh_token = None;
                    server.revoked = true;
                }
                (200, Value::Null)
            }
            ("POST", "/mcp") if bearer == Some(format!("Bearer {}", access_token())) => {
                let links = json!([{ "title": "First", "url": "https://a.example" }, { "title": null, "url": "https://b.example" }]);
                (200, json!({ "id": 1, "jsonrpc": "2.0", "result": { "content": [{ "type": "text", "text": links.to_string() }] } }))
            }
            _ => (404, json!({ "error": "not_found" })),
        };
        let reply = if reply.is_null() { String::new() } else { reply.to_string() };
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
    state_dir: PathBuf,
}

fn fixture(name: &str) -> Fixture {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = Arc::new(Mutex::new(Server::default()));
    let (serving, served_base) = (server.clone(), base.clone());
    std::thread::spawn(move || serve(listener, served_base, serving));
    // A free port for the redirect, released for the app to bind.
    let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let state_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("target/test-state/{name}"));
    let _ = std::fs::remove_dir_all(&state_dir);
    let store = Arc::new(MemoryStore::default());
    Fixture {
        auth: Auth { base, port, state_dir: state_dir.clone(), store: Box::new(store.clone()) },
        server,
        store,
        state_dir,
    }
}

/// Plays the browser: approves at once and follows the redirect, optionally altering it.
fn browser(server: Arc<Mutex<Server>>, alter: fn(&mut Url)) -> impl FnOnce(&str) {
    move |authorize: &str| {
        let authorize = Url::parse(authorize).unwrap();
        let param = |name: &str| authorize.query_pairs().find(|(key, _)| key == name).unwrap().1.into_owned();
        assert_eq!(param("code_challenge_method"), "S256");
        assert_eq!(param("scope"), "openid offline_access links:read");
        server.lock().unwrap().challenge = Some(param("code_challenge"));
        let mut redirect = Url::parse_with_params(&param("redirect_uri"), [("code", "code_1"), ("state", &param("state"))]).unwrap();
        alter(&mut redirect);
        std::thread::spawn(move || {
            let mut stream = TcpStream::connect(redirect.socket_addrs(|| None).unwrap()[0]).unwrap();
            write!(stream, "GET {}?{} HTTP/1.1\r\nHost: x\r\n\r\n", redirect.path(), redirect.query().unwrap()).unwrap();
            let _ = stream.read_to_end(&mut Vec::new());
        });
    }
}

#[test]
fn signs_in_reads_the_library_restores_and_signs_out() {
    let f = fixture("happy");
    let cancel = AtomicBool::new(false);
    let session = f.auth.sign_in(browser(f.server.clone(), |_| {}), &cancel).unwrap();
    assert_eq!(session.user_id, "user_1");
    assert_eq!(session.workspace_id.as_deref(), Some("org_1"));
    assert_eq!(f.store.load().unwrap().as_deref(), Some("refresh-1"));

    let links = library::recent_links(&f.auth.resource(), &session).unwrap();
    assert_eq!(links, ["First", "https://b.example"]);

    // A relaunch resumes from the stored token, keeps the rotated one, and reuses the client.
    let restored = f.auth.restore().unwrap().unwrap();
    assert_eq!(restored.user_id, "user_1");
    assert_eq!(f.store.load().unwrap().as_deref(), Some("refresh-2"));
    assert_eq!(f.server.lock().unwrap().registrations, 1);

    f.auth.sign_out().unwrap();
    assert!(f.server.lock().unwrap().revoked);
    assert_eq!(f.store.load().unwrap(), None);
    assert!(f.auth.restore().unwrap().is_none());
    let _ = std::fs::remove_dir_all(&f.state_dir);
}

#[test]
fn a_rejected_stored_token_signs_out() {
    let f = fixture("rejected");
    f.store.save("stale").unwrap();
    assert!(f.auth.restore().unwrap().is_none());
    assert_eq!(f.store.load().unwrap(), None);
    let _ = std::fs::remove_dir_all(&f.state_dir);
}

#[test]
fn a_redirect_with_the_wrong_state_is_ignored_until_cancelled() {
    let f = fixture("state");
    let cancel = Arc::new(AtomicBool::new(false));
    let stop = cancel.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(600));
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
    });
    let forged = |url: &mut Url| {
        url.set_query(Some("code=code_1&state=forged"));
    };
    let Err(error) = f.auth.sign_in(browser(f.server.clone(), forged), &cancel) else {
        panic!("a forged state must not sign in");
    };
    assert_eq!(error, "sign-in cancelled");
    assert_eq!(f.store.load().unwrap(), None);
    let _ = std::fs::remove_dir_all(&f.state_dir);
}

#[test]
fn an_authorization_error_is_reported() {
    let f = fixture("denied");
    let denied = |url: &mut Url| {
        let state = url.query_pairs().find(|(key, _)| key == "state").unwrap().1.into_owned();
        url.set_query(Some(&format!("error=access_denied&error_description=Denied&state={state}")));
    };
    let Err(error) = f.auth.sign_in(browser(f.server.clone(), denied), &AtomicBool::new(false)) else {
        panic!("a denied authorization must not sign in");
    };
    assert_eq!(error, "Denied");
    let _ = std::fs::remove_dir_all(&f.state_dir);
}
