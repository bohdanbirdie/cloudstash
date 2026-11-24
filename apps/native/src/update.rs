//! Updates. A release is a GitHub Release of this repository (`scripts/release.sh`, run by
//! `.github/workflows/native-release.yml`) with a feed, `latest.json`, naming its version, the
//! zipped app and an Ed25519 signature of that zip. The app reads the newest release's feed on
//! launch and every few hours; a newer version downloads in the background into the caches
//! folder, and the sidebar offers to restart once it's checked:
//!
//! 1. the zip's signature verifies with [`PUBLIC_KEY`], whose private half only the release
//!    workflow holds;
//! 2. the app inside is Cloudstash at the feed's version, and macOS confirms it's signed by
//!    [`TEAM_ID`]'s Developer ID certificate, sealed and unaltered.
//!
//! Restarting swaps the new app in where this one is (one rename each way, rolled back if the
//! second fails) and launches it. A copy that can't be swapped in place (run from the disk image,
//! moved to a read-only place) doesn't check at all, nor does a debug build unless
//! `CLOUDSTASH_UPDATE_FEED` points it at a feed to try.
//!
//! `CLOUDSTASH_FAKE_UPDATE` pretends instead, to try the UI without a release
//! (`scripts/run.sh` passes it on):
//!
//! - `ready`: three seconds after launch a "Restart to update" row appears above the account;
//!   clicking it restarts the app.
//! - `failed`: the same, but the first restart fails and the row asks to try again.
//! - `required`: this version is too old, so the whole window asks to update, signed in or out.
//!
//! A restarted app comes back on the new version, so the pretend update is gone after it.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use base64::Engine;
use rune::AppHandle;
use serde::Deserialize;

use crate::State;

/// The newest release's feed. GitHub redirects `latest/download` to the release marked latest.
/// `CLOUDSTASH_UPDATE_FEED` points elsewhere, to try a release before publishing it; what it
/// serves still has to pass every check.
const FEED: &str = "https://github.com/bohdanbirdie/cloudstash/releases/latest/download/latest.json";
/// The Ed25519 public key release zips are signed with, as base64 of its 32 bytes. Its private
/// half is the release workflow's `NATIVE_UPDATE_KEY` secret.
const PUBLIC_KEY: &str = "6iwO3zA/UKsnfXXM2OwrzXnjyUznrKjWvhQyRUURoQw=";
/// The Apple team whose Developer ID signs releases.
const TEAM_ID: &str = "E6JHWE4P5L";
const BUNDLE_ID: &str = "dev.cloudstash.native";
/// This build's version (Cargo.toml's).
const VERSION: &str = env!("CARGO_PKG_VERSION");
/// How long the app waits between checks while nothing is ready.
const CHECK_EVERY: Duration = Duration::from_secs(4 * 60 * 60);

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum Update {
    /// Up to date, or an update is still downloading: nothing shows.
    #[default]
    None,
    /// Downloaded and checked: the sidebar offers to restart.
    Ready,
    /// The row was clicked: the new version replaces this one, then the app restarts.
    Installing,
    /// Replacing the app failed; clicking the row tries again.
    Failed,
    /// This version is too old to use: the whole window asks to update. `Some(percent)` once
    /// the update downloads.
    Required(Option<u8>),
}

impl Update {
    /// Whether the sidebar shows its update row.
    pub fn in_sidebar(self) -> bool {
        matches!(self, Update::Ready | Update::Installing | Update::Failed)
    }
}

/// What the feed says about the newest release.
#[derive(Clone, Debug, Deserialize)]
struct Feed {
    version: String,
    url: String,
    /// Base64 of the Ed25519 signature of the zip at `url`.
    signature: String,
}

/// A downloaded, checked app, waiting to be swapped in.
static STAGED: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Starts checking for updates in the background.
pub fn start(ui: AppHandle<State>) {
    tracing::info!("Cloudstash {VERSION}");
    if let Some(fake) = fake() {
        return start_fake(ui, fake);
    }
    let Some(bundle) = updatable() else { return };
    std::thread::spawn(move || {
        let cache = cache_dir();
        let _ = std::fs::remove_dir_all(&cache);
        loop {
            match newer().and_then(|feed| feed.map(|f| download(&f, &cache, &bundle, |_| {})).transpose()) {
                Ok(Some(app)) => {
                    tracing::info!("update ready: {}", app.display());
                    *STAGED.lock().unwrap() = Some(app);
                    ui.update(|s, tx| {
                        tx.animated();
                        if s.update == Update::None {
                            s.update = Update::Ready;
                        }
                    });
                    return;
                }
                Ok(None) => tracing::debug!("up to date at {VERSION}"),
                Err(e) => tracing::warn!("update check failed: {e}"),
            }
            std::thread::sleep(CHECK_EVERY);
        }
    });
}

/// The sidebar row: swaps the downloaded update in and restarts.
pub fn restart(s: &mut State) {
    let Some(ui) = s.backend.as_ref().map(|b| b.ui.clone()) else { return };
    s.update = Update::Installing;
    if let Some(fake) = fake() {
        return restart_fake(ui, fake);
    }
    std::thread::spawn(move || {
        let staged = STAGED.lock().unwrap().clone();
        match staged.ok_or_else(|| "no update is downloaded".to_owned()).and_then(|app| install(&app)) {
            Ok(()) => ui.relaunch(),
            Err(e) => {
                tracing::warn!("installing the update failed: {e}");
                ui.update(|s, _| s.update = Update::Failed);
            }
        }
    });
}

/// The must-update screen's button: downloads the update (unless it's here already), swaps it
/// in and restarts.
pub fn update_now(s: &mut State) {
    let Some(ui) = s.backend.as_ref().map(|b| b.ui.clone()) else { return };
    s.update = Update::Required(Some(0));
    if fake().is_some() {
        return update_now_fake(ui);
    }
    std::thread::spawn(move || {
        let progress = |percent: u8| ui.update(move |s, _| s.update = Update::Required(Some(percent)));
        let result = (|| {
            let bundle = updatable().ok_or("this copy can't update itself")?;
            let staged = STAGED.lock().unwrap().clone();
            let app = match staged {
                Some(app) => app,
                None => {
                    let feed = newer()?.ok_or("no newer version is published")?;
                    download(&feed, &cache_dir(), &bundle, progress)?
                }
            };
            progress(100);
            install(&app)
        })();
        match result {
            Ok(()) => ui.relaunch(),
            Err(e) => {
                tracing::warn!("updating failed: {e}");
                ui.update(|s, _| s.update = Update::Required(None));
            }
        }
    });
}

/// The app bundle this process runs from, when it's a release that can replace itself there.
fn updatable() -> Option<PathBuf> {
    if cfg!(debug_assertions) && std::env::var_os("CLOUDSTASH_UPDATE_FEED").is_none() {
        tracing::info!("updates are off: development build");
        return None;
    }
    let exe = std::env::current_exe().ok()?;
    let bundle = exe.ancestors().nth(3).filter(|b| b.extension().is_some_and(|e| e == "app"))?.to_path_buf();
    let parent = bundle.parent()?;
    let translocated = bundle.components().any(|c| c.as_os_str() == "AppTranslocation");
    let writable = parent.metadata().is_ok_and(|m| !m.permissions().readonly()) && tempfile_in(parent);
    if translocated || !writable {
        tracing::info!("updates are off: {} can't be replaced in place", bundle.display());
        return None;
    }
    Some(bundle)
}

/// Whether a file can be made in `dir` (permissions alone don't show a read-only volume).
fn tempfile_in(dir: &Path) -> bool {
    let probe = dir.join(format!(".cloudstash-update-probe-{}", std::process::id()));
    let made = std::fs::File::create(&probe).is_ok();
    let _ = std::fs::remove_file(&probe);
    made
}

fn cache_dir() -> PathBuf {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    home.join("Library/Caches").join(BUNDLE_ID).join("update")
}

/// The newest release's feed, when it's newer than this build.
fn newer() -> Result<Option<Feed>, String> {
    let url = std::env::var("CLOUDSTASH_UPDATE_FEED").unwrap_or_else(|_| FEED.to_owned());
    let feed: Feed = ureq::get(&url).timeout(Duration::from_secs(30)).call().map_err(|e| e.to_string())?.into_json().map_err(|e| e.to_string())?;
    Ok(is_newer(&feed.version, VERSION)?.then_some(feed))
}

fn is_newer(published: &str, current: &str) -> Result<bool, String> {
    let parse = |v: &str| semver::Version::parse(v.trim_start_matches('v')).map_err(|e| format!("version {v:?}: {e}"));
    Ok(parse(published)? > parse(current)?)
}

/// Downloads the release's zip, checks its signature, unpacks it and checks the app inside.
/// `progress` hears the download's percent.
fn download(feed: &Feed, cache: &Path, bundle: &Path, progress: impl Fn(u8)) -> Result<PathBuf, String> {
    let dir = cache.join(&feed.version);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let response = ureq::get(&feed.url).timeout(Duration::from_secs(15 * 60)).call().map_err(|e| e.to_string())?;
    let total = response.header("Content-Length").and_then(|v| v.parse::<u64>().ok());
    let mut reader = response.into_reader();
    let mut zip = Vec::with_capacity(total.unwrap_or(0) as usize);
    let mut chunk = [0u8; 64 * 1024];
    let mut last = 0;
    loop {
        let n = reader.read(&mut chunk).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        zip.extend_from_slice(&chunk[..n]);
        if let Some(total) = total.filter(|t| *t > 0) {
            let percent = (zip.len() as u64 * 99 / total).min(99) as u8;
            if percent != last {
                last = percent;
                progress(percent);
            }
        }
    }
    verify_signature(&zip, &feed.signature, PUBLIC_KEY)?;
    let archive = dir.join("update.zip");
    std::fs::File::create(&archive).and_then(|mut f| f.write_all(&zip)).map_err(|e| format!("{}: {e}", archive.display()))?;
    run(Command::new("/usr/bin/ditto").arg("-x").arg("-k").arg(&archive).arg(&dir))?;
    let _ = std::fs::remove_file(&archive);
    let name = bundle.file_name().ok_or("the app has no name")?;
    let app = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .find(|p| p.extension().is_some_and(|e| e == "app"))
        .ok_or("the zip holds no app")?;
    let app = if app.file_name() == Some(name) {
        app
    } else {
        let renamed = dir.join(name);
        std::fs::rename(&app, &renamed).map_err(|e| e.to_string())?;
        renamed
    };
    check_app(&app, &feed.version)?;
    Ok(app)
}

/// The zip was signed by the release workflow's key.
fn verify_signature(zip: &[u8], signature: &str, public_key: &str) -> Result<(), String> {
    let b64 = base64::engine::general_purpose::STANDARD;
    let key: [u8; 32] = b64.decode(public_key).ok().and_then(|k| k.try_into().ok()).ok_or("the update key is malformed")?;
    let key = ed25519_dalek::VerifyingKey::from_bytes(&key).map_err(|e| e.to_string())?;
    let signature: [u8; 64] = b64.decode(signature.trim()).ok().and_then(|s| s.try_into().ok()).ok_or("the update's signature is malformed")?;
    key.verify_strict(zip, &ed25519_dalek::Signature::from_bytes(&signature)).map_err(|_| "the update's signature doesn't match".to_owned())
}

/// The unpacked app is Cloudstash at the feed's version, sealed and signed by our team.
fn check_app(app: &Path, version: &str) -> Result<(), String> {
    let plist = app.join("Contents/Info.plist");
    let read = |key: &str| run(Command::new("/usr/libexec/PlistBuddy").arg("-c").arg(format!("Print :{key}")).arg(&plist));
    if read("CFBundleIdentifier")? != BUNDLE_ID {
        return Err("the update isn't Cloudstash".into());
    }
    if read("CFBundleShortVersionString")? != version.trim_start_matches('v') {
        return Err("the update's version doesn't match its feed".into());
    }
    let requirement = format!(
        "=anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] and certificate leaf[field.1.2.840.113635.100.6.1.13] and certificate leaf[subject.OU] = \"{TEAM_ID}\""
    );
    run(Command::new("/usr/bin/codesign").args(["--verify", "--deep", "--strict", "-R"]).arg(requirement).arg(app))?;
    Ok(())
}

/// Swaps `app` in where this app is: the new one goes beside it, then two renames trade them,
/// and the old one is deleted. A failed second rename puts the old one back.
fn install(app: &Path) -> Result<(), String> {
    let bundle = updatable().ok_or("this copy can't update itself")?;
    let parent = bundle.parent().ok_or("the app has no folder")?;
    let name = bundle.file_name().ok_or("the app has no name")?.to_string_lossy().into_owned();
    let incoming = parent.join(format!(".{name}.incoming"));
    let old = parent.join(format!(".{name}.old"));
    for leftover in [&incoming, &old] {
        if leftover.exists() {
            std::fs::remove_dir_all(leftover).map_err(|e| format!("{}: {e}", leftover.display()))?;
        }
    }
    run(Command::new("/usr/bin/ditto").arg(app).arg(&incoming))?;
    std::fs::rename(&bundle, &old).map_err(|e| format!("moving the old app aside: {e}"))?;
    if let Err(e) = std::fs::rename(&incoming, &bundle) {
        let _ = std::fs::rename(&old, &bundle);
        let _ = std::fs::remove_dir_all(&incoming);
        return Err(format!("moving the new app in: {e}"));
    }
    let _ = std::fs::remove_dir_all(&old);
    let _ = std::fs::remove_dir_all(cache_dir());
    Ok(())
}

/// Runs a command, giving its trimmed output, or its error output when it fails.
fn run(cmd: &mut Command) -> Result<String, String> {
    let out = cmd.output().map_err(|e| format!("{cmd:?}: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_owned())
    } else {
        Err(format!("{cmd:?}: {}", String::from_utf8_lossy(&out.stderr).trim()))
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Fake {
    Ready,
    Failed,
    Required,
}

/// The pretend update this launch shows. None after a restart: rune's relaunch tells the new
/// process the pid it waits for, so a launch that has it is the "updated" app.
fn fake() -> Option<Fake> {
    if std::env::var_os("RUNE_RELAUNCH_AFTER").is_some() {
        return None;
    }
    match std::env::var("CLOUDSTASH_FAKE_UPDATE").ok()?.as_str() {
        "ready" => Some(Fake::Ready),
        "failed" => Some(Fake::Failed),
        "required" => Some(Fake::Required),
        other => {
            tracing::warn!("CLOUDSTASH_FAKE_UPDATE={other:?} isn't ready, failed or required");
            None
        }
    }
}

/// Whether the pretend failure has happened, so the retry works.
static FAILED_ONCE: AtomicBool = AtomicBool::new(false);

fn start_fake(ui: AppHandle<State>, fake: Fake) {
    std::thread::spawn(move || {
        if fake != Fake::Required {
            std::thread::sleep(Duration::from_secs(3));
        }
        ui.update(move |s, tx| {
            tx.animated();
            s.update = if fake == Fake::Required { Update::Required(None) } else { Update::Ready };
        });
    });
}

fn restart_fake(ui: AppHandle<State>, fake: Fake) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1200));
        if fake == Fake::Failed && !FAILED_ONCE.swap(true, Ordering::Relaxed) {
            tracing::warn!("pretend update: replacing the app failed");
            ui.update(|s, _| s.update = Update::Failed);
            return;
        }
        ui.relaunch();
    });
}

fn update_now_fake(ui: AppHandle<State>) {
    std::thread::spawn(move || {
        for percent in (4..=100).step_by(4) {
            std::thread::sleep(Duration::from_millis(80));
            ui.update(move |s, _| s.update = Update::Required(Some(percent)));
        }
        std::thread::sleep(Duration::from_millis(400));
        ui.relaunch();
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::Signer;

    #[test]
    fn only_a_higher_version_is_newer() {
        assert_eq!(is_newer("v0.2.0", "0.1.9"), Ok(true));
        assert_eq!(is_newer("0.1.0", "0.1.0"), Ok(false));
        assert_eq!(is_newer("0.1.0", "0.2.0"), Ok(false));
        assert_eq!(is_newer("0.2.0-beta.1", "0.2.0"), Ok(false), "a pre-release of this version is older");
        assert!(is_newer("latest", "0.1.0").is_err());
    }

    #[test]
    fn a_zip_verifies_only_with_its_own_signature_and_key() {
        let b64 = base64::engine::general_purpose::STANDARD;
        let key = ed25519_dalek::SigningKey::from_bytes(&[7; 32]);
        let public = b64.encode(key.verifying_key().to_bytes());
        let zip = b"the app";
        let signature = b64.encode(key.sign(zip).to_bytes());
        assert_eq!(verify_signature(zip, &signature, &public), Ok(()));
        assert!(verify_signature(b"another app", &signature, &public).is_err(), "altered bytes");
        let other = b64.encode(ed25519_dalek::SigningKey::from_bytes(&[8; 32]).verifying_key().to_bytes());
        assert!(verify_signature(zip, &signature, &other).is_err(), "another key");
        assert!(verify_signature(zip, "not base64", &public).is_err());
    }
}
