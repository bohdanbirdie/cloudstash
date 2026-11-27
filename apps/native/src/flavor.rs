//! Which app this build is. A release build is Cloudstash, the app people install; a debug build
//! (`scripts/run.sh`, `cargo test`) is Cloudstash Dev. They differ in everything macOS and the app
//! use to tell apps apart, so both run on one Mac at once without touching each other's
//! sign-in, data, log, deep links or updates: `scripts/bundle.sh` writes the same names into
//! each bundle's Info.plist. Production always talks to cloudstash.dev; Dev talks to the local
//! server unless `CLOUDSTASH_URL` says otherwise.
//!
//! `scripts/run.sh` builds one Cloudstash Dev per worktree and names it in the bundle's
//! environment (`CLOUDSTASH_INSTANCE`, `_LABEL`, `_BADGE`), so each worktree's copy has its own
//! names too, runs beside the others and shows which one it is on its Dock icon.

use std::sync::OnceLock;

pub const DEV: bool = cfg!(debug_assertions);

pub const PRODUCTION_BASE: &str = "https://cloudstash.dev";
const LOCAL_BASE: &str = "http://127.0.0.1:3000";

/// The names this copy goes by; `scripts/bundle.sh` writes the same ones into Info.plist.
#[derive(Debug, PartialEq, Eq)]
pub struct Identity {
    /// In the window title, the menu bar icon's tooltip and Settings.
    pub name: String,
    /// The bundle's identifier; also the data and caches folders' name and the release's keychain service.
    pub bundle_id: String,
    /// The deep link scheme the sign-in page opens to hand the app its code.
    pub scheme: String,
    /// The log's file name in `~/Library/Logs/Cloudstash/`, before `.log`.
    pub log: String,
    /// What the app tells the sign-in page it is (`app=`), so the page opens this copy's scheme.
    pub app: Option<String>,
    /// The Dock icon's badge.
    pub badge: Option<String>,
}

/// A worktree copy's id: lowercase letters and digits, as the sign-in page accepts it.
fn valid_instance(id: &str) -> bool {
    (1..=16).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

impl Identity {
    pub fn new(dev: bool, instance: Option<&str>, label: Option<&str>, badge: Option<&str>) -> Self {
        if !dev {
            return Self {
                name: "Cloudstash".into(),
                bundle_id: "dev.cloudstash.native".into(),
                scheme: "cloudstash".into(),
                log: "cloudstash".into(),
                app: None,
                badge: None,
            };
        }
        let Some(id) = instance.filter(|id| valid_instance(id)) else {
            return Self {
                name: "Cloudstash Dev".into(),
                bundle_id: "dev.cloudstash.native.dev".into(),
                scheme: "cloudstash-dev".into(),
                log: "cloudstash-dev".into(),
                app: Some("dev".into()),
                badge: None,
            };
        };
        let label = label.filter(|l| !l.is_empty()).unwrap_or(id);
        Self {
            name: format!("Cloudstash Dev · {label}"),
            bundle_id: format!("dev.cloudstash.native.dev.{id}"),
            scheme: format!("cloudstash-dev-{id}"),
            log: format!("cloudstash-dev-{id}"),
            app: Some(format!("dev-{id}")),
            badge: badge.filter(|b| !b.is_empty()).map(str::to_owned),
        }
    }
}

/// This copy's names, read once from the bundle's environment.
pub fn identity() -> &'static Identity {
    static IDENTITY: OnceLock<Identity> = OnceLock::new();
    IDENTITY.get_or_init(|| {
        let var = |name| std::env::var(name).ok();
        Identity::new(
            DEV,
            var("CLOUDSTASH_INSTANCE").as_deref(),
            var("CLOUDSTASH_INSTANCE_LABEL").as_deref(),
            var("CLOUDSTASH_INSTANCE_BADGE").as_deref(),
        )
    })
}

/// The Cloudstash deployment this build signs in to and syncs with, without a trailing slash.
pub fn base() -> String {
    let base = if DEV { std::env::var("CLOUDSTASH_URL").unwrap_or_else(|_| LOCAL_BASE.to_owned()) } else { PRODUCTION_BASE.to_owned() };
    base.trim_end_matches('/').to_owned()
}

/// Puts this copy's badge on its Dock icon. Call it on the main thread once the app is running;
/// it does its work once.
#[cfg(target_os = "macos")]
pub fn show_badge() {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSApplication;
    use objc2_foundation::NSString;

    static SHOWN: OnceLock<()> = OnceLock::new();
    let (Some(badge), Some(mtm)) = (identity().badge.as_deref(), MainThreadMarker::new()) else {
        return;
    };
    SHOWN.get_or_init(|| NSApplication::sharedApplication(mtm).dockTile().setBadgeLabel(Some(&NSString::from_str(badge))));
}

#[cfg(not(target_os = "macos"))]
pub fn show_badge() {}

#[cfg(test)]
mod tests {
    use super::Identity;

    #[test]
    fn the_release_and_the_plain_dev_build_keep_their_names() {
        let release = Identity::new(false, Some("abc123"), Some("x"), Some("3001"));
        assert_eq!((release.bundle_id.as_str(), release.scheme.as_str(), release.app), ("dev.cloudstash.native", "cloudstash", None));
        let dev = Identity::new(true, None, None, None);
        assert_eq!((dev.name.as_str(), dev.scheme.as_str(), dev.app.as_deref()), ("Cloudstash Dev", "cloudstash-dev", Some("dev")));
    }

    #[test]
    fn a_worktree_copy_gets_names_of_its_own() {
        let copy = Identity::new(true, Some("3f9a2c1b"), Some("fix-ui"), Some("3001"));
        assert_eq!(copy.name, "Cloudstash Dev · fix-ui");
        assert_eq!(copy.bundle_id, "dev.cloudstash.native.dev.3f9a2c1b");
        assert_eq!(copy.scheme, "cloudstash-dev-3f9a2c1b");
        assert_eq!(copy.log, "cloudstash-dev-3f9a2c1b");
        assert_eq!(copy.app.as_deref(), Some("dev-3f9a2c1b"));
        assert_eq!(copy.badge.as_deref(), Some("3001"));
    }

    #[test]
    fn an_id_the_sign_in_page_would_refuse_falls_back_to_plain_dev() {
        for id in ["", "UPPER", "a/b", "dev-x", "12345678901234567"] {
            assert_eq!(Identity::new(true, Some(id), Some("x"), Some("1")).scheme, "cloudstash-dev", "{id}");
        }
    }
}
