//! Sign-in against Cloudstash's OAuth server as a public native client (RFC 8252):
//! dynamic client registration, authorization code with PKCE, a loopback redirect,
//! and a rotating refresh token kept in the system keychain.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use url::Url;

pub const DEFAULT_BASE: &str = "https://cloudstash.dev";
pub const DEFAULT_PORT: u16 = 53127;
const SCOPES: &str = "openid offline_access links:read";
const WORKSPACE_CLAIM: &str = "https://cloudstash.dev/claims/workspace-id";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);
const KEYCHAIN_SERVICE: &str = "dev.cloudstash.native";

pub struct HttpError {
    /// Set when the server answered; a rejected grant is a status, a dropped connection is not.
    pub status: Option<u16>,
    pub message: String,
}

pub fn http_json(result: Result<ureq::Response, ureq::Error>) -> Result<Value, HttpError> {
    match result {
        Ok(response) => response.into_json().map_err(|e| HttpError {
            status: None,
            message: format!("unreadable response: {e}"),
        }),
        Err(ureq::Error::Status(status, response)) => {
            let body = response.into_string().unwrap_or_default();
            let detail = serde_json::from_str::<Value>(&body)
                .ok()
                .and_then(|v| {
                    v.get("error_description")
                        .or_else(|| v.get("error"))
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                })
                .unwrap_or(body);
            Err(HttpError {
                status: Some(status),
                message: format!("HTTP {status}: {detail}"),
            })
        }
        Err(e) => Err(HttpError {
            status: None,
            message: e.to_string(),
        }),
    }
}

pub trait TokenStore: Send + Sync {
    fn load(&self) -> Result<Option<String>, String>;
    fn save(&self, refresh_token: &str) -> Result<(), String>;
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

impl TokenStore for Keychain {
    fn load(&self) -> Result<Option<String>, String> {
        match self.entry()?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("keychain: {e}")),
        }
    }

    fn save(&self, refresh_token: &str) -> Result<(), String> {
        self.entry()?
            .set_password(refresh_token)
            .map_err(|e| format!("keychain: {e}"))
    }

    fn clear(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("keychain: {e}")),
        }
    }
}

#[derive(Deserialize)]
struct Metadata {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    registration_endpoint: String,
    revocation_endpoint: Option<String>,
}

#[derive(Clone)]
pub struct Session {
    pub access_token: String,
    pub user_id: String,
    pub workspace_id: Option<String>,
    pub scope: String,
}

pub struct Auth {
    /// Origin of the Cloudstash deployment, without a trailing slash.
    pub base: String,
    pub port: u16,
    /// Holds the registered client id, which is not a secret.
    pub state_dir: PathBuf,
    pub store: Box<dyn TokenStore>,
}

impl Auth {
    pub fn from_env() -> Result<Auth, String> {
        let base = std::env::var("CLOUDSTASH_URL").unwrap_or_else(|_| DEFAULT_BASE.to_owned());
        let base = base.trim_end_matches('/').to_owned();
        let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_owned())?;
        let state_dir = if cfg!(target_os = "macos") {
            PathBuf::from(home).join("Library/Application Support/dev.cloudstash.native")
        } else {
            PathBuf::from(home).join(".config/cloudstash-native")
        };
        Ok(Auth {
            store: Box::new(Keychain {
                account: base.clone(),
            }),
            base,
            port: DEFAULT_PORT,
            state_dir,
        })
    }

    pub fn resource(&self) -> String {
        format!("{}/mcp", self.base)
    }

    fn issuer(&self) -> String {
        format!("{}/api/auth", self.base)
    }

    fn redirect_uri(&self) -> String {
        format!("http://127.0.0.1:{}/callback", self.port)
    }

    fn metadata(&self) -> Result<Metadata, String> {
        let url = format!(
            "{}/.well-known/oauth-authorization-server/api/auth",
            self.base
        );
        let value = http_json(ureq::get(&url).call()).map_err(|e| e.message)?;
        let metadata: Metadata =
            serde_json::from_value(value).map_err(|e| format!("server metadata: {e}"))?;
        if metadata.issuer != self.issuer() {
            return Err(format!("unexpected issuer {}", metadata.issuer));
        }
        let prefix = format!("{}/", self.base);
        let endpoints = [
            Some(&metadata.authorization_endpoint),
            Some(&metadata.token_endpoint),
            Some(&metadata.registration_endpoint),
            metadata.revocation_endpoint.as_ref(),
        ];
        if endpoints.into_iter().flatten().any(|e| !e.starts_with(&prefix)) {
            return Err("server metadata names an endpoint on another origin".to_owned());
        }
        Ok(metadata)
    }

    fn client_file(&self) -> PathBuf {
        self.state_dir.join("client.json")
    }

    /// The client id registered for this issuer and redirect, registering once if needed.
    fn client_id(&self, metadata: &Metadata) -> Result<String, String> {
        let redirect_uri = self.redirect_uri();
        let saved = std::fs::read_to_string(self.client_file())
            .ok()
            .and_then(|text| serde_json::from_str::<Value>(&text).ok());
        if let Some(saved) = saved
            && saved["issuer"] == metadata.issuer
            && saved["redirect_uri"] == redirect_uri
            && let Some(id) = saved["client_id"].as_str()
        {
            return Ok(id.to_owned());
        }
        let registered = http_json(ureq::post(&metadata.registration_endpoint).send_json(json!({
            "client_name": "Cloudstash for Mac",
            "application_type": "native",
            "grant_types": ["authorization_code", "refresh_token"],
            "redirect_uris": [redirect_uri],
            "resources": [self.resource()],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
        })))
        .map_err(|e| format!("client registration: {}", e.message))?;
        let id = registered["client_id"]
            .as_str()
            .ok_or("client registration returned no client_id")?
            .to_owned();
        std::fs::create_dir_all(&self.state_dir).map_err(|e| e.to_string())?;
        let saved = json!({ "issuer": metadata.issuer, "redirect_uri": redirect_uri, "client_id": id });
        std::fs::write(self.client_file(), saved.to_string()).map_err(|e| e.to_string())?;
        Ok(id)
    }

    /// Runs the browser sign-in. `open` receives the authorization URL; `cancel` stops the wait.
    pub fn sign_in(&self, open: impl FnOnce(&str), cancel: &AtomicBool) -> Result<Session, String> {
        let metadata = self.metadata()?;
        // Bind before opening the browser so the redirect always has somewhere to land.
        let listener = TcpListener::bind(("127.0.0.1", self.port)).map_err(|e| {
            format!("cannot listen on 127.0.0.1:{} for the sign-in redirect: {e}", self.port)
        })?;
        let client_id = self.client_id(&metadata)?;
        let verifier = random_token()?;
        let state = random_token()?;
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let redirect_uri = self.redirect_uri();
        let resource = self.resource();
        let authorize = Url::parse_with_params(
            &metadata.authorization_endpoint,
            [
                ("client_id", client_id.as_str()),
                ("code_challenge", challenge.as_str()),
                ("code_challenge_method", "S256"),
                ("redirect_uri", redirect_uri.as_str()),
                ("resource", resource.as_str()),
                ("response_type", "code"),
                ("scope", SCOPES),
                ("state", state.as_str()),
            ],
        )
        .map_err(|e| e.to_string())?;
        open(authorize.as_str());
        let code = wait_for_code(&listener, &state, &metadata.issuer, cancel)?;
        drop(listener);
        let tokens = http_json(ureq::post(&metadata.token_endpoint).send_form(&[
            ("client_id", client_id.as_str()),
            ("code", code.as_str()),
            ("code_verifier", verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri.as_str()),
            ("resource", resource.as_str()),
        ]))
        .map_err(|e| format!("token exchange: {}", e.message))?;
        self.accept_tokens(&tokens)
    }

    /// Resumes the stored session. `Ok(None)` means signed out: nothing stored, or the server
    /// rejected the stored token, which is then removed.
    pub fn restore(&self) -> Result<Option<Session>, String> {
        let Some(refresh_token) = self.store.load()? else {
            return Ok(None);
        };
        let metadata = self.metadata()?;
        let client_id = self.client_id(&metadata)?;
        let resource = self.resource();
        let result = http_json(ureq::post(&metadata.token_endpoint).send_form(&[
            ("client_id", client_id.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
            ("resource", resource.as_str()),
        ]));
        match result {
            Ok(tokens) => self.accept_tokens(&tokens).map(Some),
            Err(HttpError {
                status: Some(400 | 401),
                ..
            }) => {
                self.store.clear()?;
                Ok(None)
            }
            Err(e) => Err(format!("session refresh: {}", e.message)),
        }
    }

    /// Removes the stored token, then asks the server to revoke it.
    pub fn sign_out(&self) -> Result<(), String> {
        let Some(refresh_token) = self.store.load()? else {
            return Ok(());
        };
        self.store.clear()?;
        let metadata = self.metadata()?;
        let Some(revocation_endpoint) = &metadata.revocation_endpoint else {
            return Err("signed out here; the server offers no revocation".to_owned());
        };
        let client_id = self.client_id(&metadata)?;
        http_json(ureq::post(revocation_endpoint).send_form(&[
            ("client_id", client_id.as_str()),
            ("token", refresh_token.as_str()),
            ("token_type_hint", "refresh_token"),
        ]))
        .map(|_| ())
        .or_else(|e| match e.status {
            // RFC 7009 answers 200 with an empty body, which is not JSON.
            None if e.message.starts_with("unreadable response") => Ok(()),
            _ => Err(format!(
                "signed out here, but the server did not revoke the session: {}",
                e.message
            )),
        })
    }

    fn accept_tokens(&self, tokens: &Value) -> Result<Session, String> {
        let access_token = tokens["access_token"]
            .as_str()
            .ok_or("token response has no access_token")?;
        let refresh_token = tokens["refresh_token"]
            .as_str()
            .ok_or("token response has no refresh_token")?;
        self.store.save(refresh_token)?;
        // The token came straight from the token endpoint over TLS, so its claims are
        // read for display without verifying the signature; the server verifies it on use.
        let claims = access_token
            .split('.')
            .nth(1)
            .and_then(|part| URL_SAFE_NO_PAD.decode(part).ok())
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .ok_or("access token is not a JWT")?;
        Ok(Session {
            access_token: access_token.to_owned(),
            user_id: claims["sub"].as_str().unwrap_or_default().to_owned(),
            workspace_id: claims[WORKSPACE_CLAIM].as_str().map(str::to_owned),
            scope: claims["scope"].as_str().unwrap_or_default().to_owned(),
        })
    }
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|e| e.to_string())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn wait_for_code(
    listener: &TcpListener,
    state: &str,
    issuer: &str,
    cancel: &AtomicBool,
) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + SIGN_IN_TIMEOUT;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("sign-in cancelled".to_owned());
        }
        if Instant::now() > deadline {
            return Err("sign-in timed out waiting for the browser".to_owned());
        }
        match listener.accept() {
            Ok((stream, _)) => {
                if let Some(outcome) = handle_redirect(stream, state, issuer) {
                    return outcome;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Answers one loopback request. `None` means it was not the sign-in redirect.
fn handle_redirect(stream: TcpStream, state: &str, issuer: &str) -> Option<Result<String, String>> {
    stream.set_nonblocking(false).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let mut request_line = String::new();
    BufReader::new(&stream).read_line(&mut request_line).ok()?;
    let target = request_line.split_whitespace().nth(1)?;
    let url = Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    if url.path() != "/callback" {
        respond(&stream, "404 Not Found", "Not found.");
        return None;
    }
    let param = |name: &str| {
        url.query_pairs()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.into_owned())
    };
    let outcome = if param("state").as_deref() != Some(state) {
        // Not the response to this sign-in: ignore it and keep waiting.
        respond(&stream, "400 Bad Request", "This sign-in link is not valid.");
        return None;
    } else if param("iss").is_some_and(|iss| iss != issuer) {
        Err("the sign-in response came from an unexpected issuer".to_owned())
    } else if let Some(error) = param("error") {
        Err(param("error_description").unwrap_or(error))
    } else {
        param("code").ok_or_else(|| "the sign-in response had no code".to_owned())
    };
    match &outcome {
        Ok(_) => respond(&stream, "200 OK", "You're signed in. You can close this tab and return to Cloudstash."),
        Err(_) => respond(&stream, "400 Bad Request", "Sign-in didn't complete. Return to Cloudstash for details."),
    }
    Some(outcome)
}

fn respond(mut stream: &TcpStream, status: &str, message: &str) {
    let body = format!(
        "<!doctype html><meta charset=utf-8><title>Cloudstash</title>\
         <body style=\"font:16px system-ui;margin:20vh auto;max-width:28rem;text-align:center\">{message}"
    );
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}
