//! The app's log, for people and agents debugging it: warnings and errors from the app and the
//! libraries it uses (LiveStore's sync among them), the app's own notes, and every panic with
//! its thread and backtrace, appended to `~/Library/Logs/Cloudstash/cloudstash.log`, where
//! Console.app lists it. A file past 5 MB moves to `cloudstash.old.log` at launch, so the log
//! never takes more than about 10 MB.

use std::fs::{self, OpenOptions};
use std::path::PathBuf;
use std::sync::Mutex;

use tracing_subscriber::filter::{LevelFilter, Targets};
use tracing_subscriber::prelude::*;

const MAX_BYTES: u64 = 5_000_000;

pub fn path() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Library/Logs/Cloudstash/cloudstash.log"))
}

/// Starts logging and records panics; without a home folder or a writable log, does neither.
pub fn start() {
    let Some(path) = path() else { return };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    if fs::metadata(&path).is_ok_and(|m| m.len() > MAX_BYTES) {
        let _ = fs::rename(&path, path.with_file_name("cloudstash.old.log"));
    }
    let Ok(file) = OpenOptions::new().create(true).append(true).open(&path) else { return };
    let levels = Targets::new().with_default(LevelFilter::WARN).with_target(env!("CARGO_CRATE_NAME"), LevelFilter::INFO);
    let layer = tracing_subscriber::fmt::layer().with_writer(Mutex::new(file)).with_ansi(false).with_thread_names(true);
    if tracing_subscriber::registry().with(layer.with_filter(levels)).try_init().is_err() {
        return;
    }
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        tracing::error!("panic: {info}\n{}", std::backtrace::Backtrace::force_capture());
        default(info);
    }));
    tracing::info!(version = env!("CARGO_PKG_VERSION"), pid = std::process::id(), "started");
}
