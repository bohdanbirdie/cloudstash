//! Sign-in through the browser with a `cloudstash://` deep link, the usual desktop pattern.
//!
//! The app opens Cloudstash's `/connect/native` page with a random `state` and a PKCE challenge,
//! and remembers both in a pending file so a link can complete sign-in even after a relaunch.
//! The signed-in page opens `cloudstash://auth/callback?code=…&state=…`, macOS hands the link to the
//! app, and the app exchanges the code and its verifier for its own API key, kept in the keychain.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use url::Url;

pub const DEFAULT_BASE: &str = "https://cloudstash.dev";
pub const SCHEME: &str = "cloudstash";
/// A pending sign-in older than this is ignored, matching the page's patience.
const PENDING_TTL_SECS: u64 = 10 * 60;
const KEYCHAIN_SERVICE: &str = "dev.cloudstash.native";

struct HttpError {
    /// Set when the server answered; a rejected key is a status, a dropped connection is not.
    status: Option<u16>,
    message: String,
}

fn http_json(result: Result<ureq::Response, ureq::Error>) -> Result<Value, HttpError> {
    match result {
        Ok(response) => response.into_json().map_err(|e| HttpError { status: None, message: format!("unreadable response: {e}") }),
        Err(ureq::Error::Status(status, response)) => {
            let detail = response
                .into_json::<Value>()
                .ok()
                .and_then(|v| v["error"].as_str().map(str::to_owned))
                .unwrap_or_else(|| "request failed".to_owned());
            Err(HttpError { status: Some(status), message: format!("{detail} (HTTP {status})") })
        }
        Err(e) => Err(HttpError { status: None, message: e.to_string() }),
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
        self.entry()?.set_password(api_key).map_err(|e| format!("keychain: {e}"))
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

/// What a deep link means for this app.
#[derive(Debug, PartialEq)]
pub enum Link {
    /// The sign-in this app started: exchange the code.
    SignIn { code: String, verifier: String },
    /// Not ours, stale, or already used: ignore it.
    Ignored,
}

/// The app's own folder: the pending sign-in, the libraries and the saved window.
pub fn state_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_owned())?;
    Ok(PathBuf::from(home).join("Library/Application Support/dev.cloudstash.native"))
}

pub struct Auth {
    /// Origin of the Cloudstash deployment, without a trailing slash.
    pub base: String,
    /// Holds the pending sign-in between opening the browser and receiving the link.
    pub state_dir: PathBuf,
    pub store: Box<dyn KeyStore>,
}

impl Auth {
    pub fn from_env() -> Result<Auth, String> {
        let base = std::env::var("CLOUDSTASH_URL").unwrap_or_else(|_| DEFAULT_BASE.to_owned());
        let base = base.trim_end_matches('/').to_owned();
        Ok(Auth { store: Box::new(Keychain { account: base.clone() }), base, state_dir: state_dir()? })
    }

    fn pending_file(&self) -> PathBuf {
        self.state_dir.join("pending-sign-in.json")
    }

    fn account(&self, api_key: &str) -> Result<Account, HttpError> {
        let url = format!("{}/api/connect/native/account", self.base);
        let body = http_json(ureq::get(&url).set("Authorization", &format!("Bearer {api_key}")).call())?;
        let field = |value: &Value| value.as_str().map(str::to_owned);
        match (field(&body["user"]["email"]), field(&body["orgId"])) {
            (Some(email), Some(library_id)) => Ok(Account { name: field(&body["user"]["name"]), email, library_id }),
            _ => Err(HttpError { status: None, message: "the account response was incomplete".to_owned() }),
        }
    }

    /// Starts a sign-in: remembers a fresh state and verifier and returns the page to open.
    pub fn begin_sign_in(&self) -> Result<String, String> {
        let verifier = random_token()?;
        let state = random_token()?;
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        write_private(&self.pending_file(), &json!({ "state": state, "verifier": verifier, "created": now() }).to_string())?;
        let page =
            Url::parse_with_params(&format!("{}/connect/native", self.base), [("state", state.as_str()), ("code_challenge", challenge.as_str())])
                .map_err(|e| e.to_string())?;
        Ok(page.into())
    }

    /// Forgets a sign-in in progress, so its link is ignored if it still arrives.
    pub fn cancel_sign_in(&self) {
        let _ = std::fs::remove_file(self.pending_file());
    }

    /// Matches a deep link against the pending sign-in, consuming it when it matches.
    pub fn accept_link(&self, link: &str) -> Link {
        let Ok(url) = Url::parse(link) else {
            return Link::Ignored;
        };
        if url.scheme() != SCHEME || url.host_str() != Some("auth") || url.path() != "/callback" {
            return Link::Ignored;
        }
        let param = |name: &str| url.query_pairs().find(|(key, _)| key == name).map(|(_, value)| value.into_owned());
        let pending = std::fs::read_to_string(self.pending_file()).ok().and_then(|text| serde_json::from_str::<Value>(&text).ok());
        let Some(pending) = pending else {
            return Link::Ignored;
        };
        let fresh = pending["created"].as_u64().is_some_and(|created| now().saturating_sub(created) < PENDING_TTL_SECS);
        let (Some(state), Some(verifier), Some(code)) = (pending["state"].as_str(), pending["verifier"].as_str(), param("code")) else {
            return Link::Ignored;
        };
        if !fresh || param("state").as_deref() != Some(state) {
            return Link::Ignored;
        }
        let verifier = verifier.to_owned();
        self.cancel_sign_in();
        Link::SignIn { code, verifier }
    }

    /// Exchanges a code from the deep link for this app's key.
    pub fn complete_sign_in(&self, code: &str, verifier: &str) -> Result<Account, String> {
        let url = format!("{}/api/connect/native/exchange", self.base);
        let body = http_json(ureq::post(&url).send_json(json!({
            "code": code,
            "codeVerifier": verifier,
            "deviceName": device_name(),
        })))
        .map_err(|e| e.message)?;
        let api_key = body["apiKey"].as_str().ok_or("the sign-in response had no key")?;
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
            Err(HttpError { status: Some(401), .. }) => {
                self.store.clear()?;
                Ok(None)
            }
            Err(e) => Err(e.message),
        }
    }

    /// The stored API key, which also authorizes library sync.
    pub fn api_key(&self) -> Result<Option<String>, String> {
        self.store.load()
    }

    /// Removes the stored key, then revokes it on the server.
    pub fn sign_out(&self) -> Result<(), String> {
        let Some(api_key) = self.store.load()? else {
            return Ok(());
        };
        self.store.clear()?;
        let url = format!("{}/api/connect/native", self.base);
        http_json(ureq::delete(&url).set("Authorization", &format!("Bearer {api_key}")).call())
            .map(|_| ())
            .map_err(|e| format!("Signed out on this Mac, but Cloudstash didn't revoke the session: {}", e.message))
    }
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|e| e.to_string())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

/// Writes a file only this user can read: it holds the PKCE verifier.
fn write_private(path: &PathBuf, contents: &str) -> Result<(), String> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)
        .and_then(|mut file| file.write_all(contents.as_bytes()))
        .map_err(|e| format!("cannot save the sign-in in progress: {e}"))
}

/// Names this Mac in the list of connected apps on the web.
fn device_name() -> String {
    std::process::Command::new("scutil")
        .args(["--get", "ComputerName"])
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|name| name.trim().to_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Mac".to_owned())
}
