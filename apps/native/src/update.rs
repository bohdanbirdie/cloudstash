//! Updates, pretend for now: the UI the real updater will drive, so it can be seen and tried
//! before releases exist. Nothing downloads.
//!
//! `CLOUDSTASH_FAKE_UPDATE` picks what the pretend update does (`scripts/run.sh` passes it on):
//!
//! - `ready`: three seconds after launch a "Restart to update" row appears above the account;
//!   clicking it restarts the app.
//! - `failed`: the same, but the first restart fails and the row asks to try again.
//! - `required`: this version is too old, so the whole window asks to update, signed in or out.
//!
//! A restarted app comes back on the new version, so the pretend update is gone after it.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use rune::AppHandle;

use crate::State;

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

/// Starts the pretend update check.
pub fn start(ui: AppHandle<State>) {
    let Some(fake) = fake() else { return };
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

/// The sidebar row: installs the downloaded update and restarts.
pub fn restart(s: &mut State) {
    let Some(ui) = s.backend.as_ref().map(|b| b.ui.clone()) else { return };
    s.update = Update::Installing;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1200));
        if fake() == Some(Fake::Failed) && !FAILED_ONCE.swap(true, Ordering::Relaxed) {
            tracing::warn!("pretend update: replacing the app failed");
            ui.update(|s, _| s.update = Update::Failed);
            return;
        }
        ui.relaunch();
    });
}

/// The must-update screen's button: downloads the update, installs it and restarts.
pub fn update_now(s: &mut State) {
    let Some(ui) = s.backend.as_ref().map(|b| b.ui.clone()) else { return };
    s.update = Update::Required(Some(0));
    std::thread::spawn(move || {
        for percent in (4..=100).step_by(4) {
            std::thread::sleep(Duration::from_millis(80));
            ui.update(move |s, _| s.update = Update::Required(Some(percent)));
        }
        std::thread::sleep(Duration::from_millis(400));
        ui.relaunch();
    });
}
