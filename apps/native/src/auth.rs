//! Sign-in through the browser. The app opens Cloudstash's `/connect/native` page with a
//! PKCE challenge, the signed-in page sends a one-time code to a loopback listener (RFC 8252),
//! and the app exchanges the code and its verifier for its own API key, kept in the keychain.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use url::Url;

pub const DEFAULT_BASE: &str = "https://cloudstash.dev";
pub const DEFAULT_PORT: u16 = 53127;
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);
const KEYCHAIN_SERVICE: &str = "dev.cloudstash.native";

struct HttpError {
    /// Set when the server answered; a rejected key is a status, a dropped connection is not.
    status: Option<u16>,
    message: String,
}

fn http_json(result: Result<ureq::Response, ureq::Error>) -> Result<Value, HttpError> {
    match result {
        Ok(response) => response.into_json().map_err(|e| HttpError {
            status: None,
            message: format!("unreadable response: {e}"),
        }),
        Err(ureq::Error::Status(status, response)) => {
            let detail = response
                .into_json::<Value>()
                .ok()
                .and_then(|v| v["error"].as_str().map(str::to_owned))
                .unwrap_or_else(|| "request failed".to_owned());
            Err(HttpError {
                status: Some(status),
                message: format!("{detail} (HTTP {status})"),
            })
        }
        Err(e) => Err(HttpError {
            status: None,
            message: e.to_string(),
        }),
    }
}

pub trait KeyStore: Send + Sync {
    fn load(&self) -> Result<Option<String>, String>;
    fn save(&self, api_key: &str) -> Result<(), String>;
    fn clear(&self) -> Result<(), String>;
}

pub struct Keychain {
    account: String,
}

impl Keychain {
    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new(KEYCHAIN_SERVICE, &self.account).map_err(|e| e.to_string())
    }
}

impl KeyStore for Keychain {
    fn load(&self) -> Result<Option<String>, String> {
        match self.entry()?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("keychain: {e}")),
        }
    }

    fn save(&self, api_key: &str) -> Result<(), String> {
        self.entry()?
            .set_password(api_key)
            .map_err(|e| format!("keychain: {e}"))
    }

    fn clear(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("keychain: {e}")),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Account {
    pub name: Option<String>,
    pub email: String,
    pub library_id: String,
}

pub struct Auth {
    /// Origin of the Cloudstash deployment, without a trailing slash.
    pub base: String,
    pub port: u16,
    pub store: Box<dyn KeyStore>,
}

impl Auth {
    pub fn from_env() -> Auth {
        let base = std::env::var("CLOUDSTASH_URL").unwrap_or_else(|_| DEFAULT_BASE.to_owned());
        let base = base.trim_end_matches('/').to_owned();
        Auth {
            store: Box::new(Keychain {
                account: base.clone(),
            }),
            base,
            port: DEFAULT_PORT,
        }
    }

    fn account(&self, api_key: &str) -> Result<Account, HttpError> {
        let url = format!("{}/api/connect/native/account", self.base);
        let body = http_json(
            ureq::get(&url)
                .set("Authorization", &format!("Bearer {api_key}"))
                .call(),
        )?;
        let field = |value: &Value| value.as_str().map(str::to_owned);
        match (field(&body["user"]["email"]), field(&body["orgId"])) {
            (Some(email), Some(library_id)) => Ok(Account {
                name: field(&body["user"]["name"]),
                email,
                library_id,
            }),
            _ => Err(HttpError {
                status: None,
                message: "the account response was incomplete".to_owned(),
            }),
        }
    }

    /// Runs the browser sign-in. `open` receives the page to show; `cancel` stops the wait.
    pub fn sign_in(&self, open: impl FnOnce(&str), cancel: &AtomicBool) -> Result<Account, String> {
        // Bind before opening the browser so the redirect always has somewhere to land.
        let listener = TcpListener::bind(("127.0.0.1", self.port)).map_err(|e| {
            format!("cannot listen on 127.0.0.1:{} for the sign-in redirect: {e}", self.port)
        })?;
        let verifier = random_token()?;
        let state = random_token()?;
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let redirect_uri = format!("http://127.0.0.1:{}/callback", self.port);
        let page = Url::parse_with_params(
            &format!("{}/connect/native", self.base),
            [
                ("state", state.as_str()),
                ("redirect_uri", redirect_uri.as_str()),
                ("code_challenge", challenge.as_str()),
            ],
        )
        .map_err(|e| e.to_string())?;
        open(page.as_str());
        let (browser, code) = wait_for_code(&listener, &state, cancel)?;
        let result = self.exchange(&code, &verifier);
        // The browser waits on the loopback request, so it lands on the page for the real outcome.
        let outcome = if result.is_ok() { "connected" } else { "failed" };
        redirect(&browser, &format!("{}/connect/native?{outcome}=1", self.base));
        result
    }

    fn exchange(&self, code: &str, verifier: &str) -> Result<Account, String> {
        let url = format!("{}/api/connect/native/exchange", self.base);
        let body = http_json(ureq::post(&url).send_json(json!({
            "code": code,
            "codeVerifier": verifier,
            "deviceName": device_name(),
        })))
        .map_err(|e| e.message)?;
        let api_key = body["apiKey"]
            .as_str()
            .ok_or("the sign-in response had no key")?;
        self.store.save(api_key)?;
        self.account(api_key).map_err(|e| e.message)
    }

    /// Resumes the stored session. `Ok(None)` means signed out: nothing stored, or the server
    /// rejected the stored key, which is then removed.
    pub fn restore(&self) -> Result<Option<Account>, String> {
        let Some(api_key) = self.store.load()? else {
            return Ok(None);
        };
        match self.account(&api_key) {
            Ok(account) => Ok(Some(account)),
            Err(HttpError {
                status: Some(401), ..
            }) => {
                self.store.clear()?;
                Ok(None)
            }
            Err(e) => Err(e.message),
        }
    }

    /// Removes the stored key, then revokes it on the server.
    pub fn sign_out(&self) -> Result<(), String> {
        let Some(api_key) = self.store.load()? else {
            return Ok(());
        };
        self.store.clear()?;
        let url = format!("{}/api/connect/native", self.base);
        http_json(
            ureq::delete(&url)
                .set("Authorization", &format!("Bearer {api_key}"))
                .call(),
        )
        .map(|_| ())
        .map_err(|e| {
            format!(
                "Signed out on this Mac, but the server did not revoke the session: {}",
                e.message
            )
        })
    }
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|e| e.to_string())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

/// Names this Mac in the list of connected apps on the web.
fn device_name() -> String {
    std::process::Command::new("hostname")
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|name| name.trim().trim_end_matches(".local").to_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Mac".to_owned())
}

/// Waits for the browser's redirect and returns its connection, still open, with the code.
fn wait_for_code(
    listener: &TcpListener,
    state: &str,
    cancel: &AtomicBool,
) -> Result<(TcpStream, String), String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + SIGN_IN_TIMEOUT;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("Sign-in cancelled.".to_owned());
        }
        if Instant::now() > deadline {
            return Err("Sign-in timed out waiting for the browser.".to_owned());
        }
        match listener.accept() {
            Ok((stream, _)) => {
                if let Some(code) = read_code(&stream, state) {
                    return Ok((stream, code));
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Reads one loopback request. Anything but this sign-in's redirect is answered and ignored.
fn read_code(stream: &TcpStream, state: &str) -> Option<String> {
    stream.set_nonblocking(false).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let mut request_line = String::new();
    BufReader::new(stream).read_line(&mut request_line).ok()?;
    let target = request_line.split_whitespace().nth(1)?;
    let url = Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    let param = |name: &str| {
        url.query_pairs()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.into_owned())
    };
    if url.path() == "/callback"
        && param("state").as_deref() == Some(state)
        && let Some(code) = param("code")
    {
        return Some(code);
    }
    respond(stream, "400 Bad Request", "", "This sign-in link is not valid.");
    None
}

fn redirect(stream: &TcpStream, location: &str) {
    respond(stream, "302 Found", &format!("Location: {location}\r\n"), "Returning to Cloudstash.");
}

fn respond(mut stream: &TcpStream, status: &str, headers: &str, message: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\n{headers}Content-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{message}",
        message.len()
    );
}
