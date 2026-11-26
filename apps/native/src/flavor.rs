//! Which app this build is. A release build is Cloudstash, the app people install; a debug build
//! (`scripts/run.sh`, `cargo test`) is Cloudstash Dev. They differ in everything macOS and the app
//! use to tell apps apart, so both run on one Mac at once without touching each other's
//! sign-in, data, log, deep links or updates: `scripts/bundle.sh` writes the same names into
//! each bundle's Info.plist. Production always talks to cloudstash.dev; Dev talks to the local
//! server unless `CLOUDSTASH_URL` says otherwise.

pub const DEV: bool = cfg!(debug_assertions);

/// The app's name, in the window title, the menu bar icon's tooltip and Settings.
pub const NAME: &str = if DEV { "Cloudstash Dev" } else { "Cloudstash" };
/// The bundle's identifier; also the data and caches folders' name and the release's keychain service.
pub const BUNDLE_ID: &str = if DEV { "dev.cloudstash.native.dev" } else { "dev.cloudstash.native" };
/// The deep link scheme the sign-in page opens to hand the app its code.
pub const SCHEME: &str = if DEV { "cloudstash-dev" } else { "cloudstash" };
/// The log's file name in `~/Library/Logs/Cloudstash/`, before `.log`.
pub const LOG: &str = if DEV { "cloudstash-dev" } else { "cloudstash" };

pub const PRODUCTION_BASE: &str = "https://cloudstash.dev";
const LOCAL_BASE: &str = "http://127.0.0.1:3000";

/// The Cloudstash deployment this build signs in to and syncs with, without a trailing slash.
pub fn base() -> String {
    let base = if DEV { std::env::var("CLOUDSTASH_URL").unwrap_or_else(|_| LOCAL_BASE.to_owned()) } else { PRODUCTION_BASE.to_owned() };
    base.trim_end_matches('/').to_owned()
}
