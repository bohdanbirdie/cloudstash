//! The signed-in library: a LiveStore client (livestore-contrib's Rust crates) that syncs the
//! library over Cloudstash's `/sync` WebSocket, authorized by the app's API key, and keeps a local
//! SQLite copy. Read-only: the app commits no events.

use std::collections::hash_map::RandomState;
use std::hash::BuildHasher;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use livestore::{InMemoryAdapter, QueryInput, Store, StoreOptions, SubscribeOptions, create_store, query_db};
use livestore_sqlite::Row;
use livestore_sync::{Storage, SyncOptions};
use livestore_sync_cf::make_ws_sync;
use livestore_sync_cf::transport::ClientOptions;
use serde_json::{Value, json};
use tokio::sync::oneshot;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Tab {
    #[default]
    Inbox,
    All,
    Completed,
    Archive,
}

impl Tab {
    /// The web's `src/livestore/queries/filtered-links.ts` filter and order for each page.
    pub fn links(self, links: &[LinkItem]) -> Vec<&LinkItem> {
        let mut shown: Vec<&LinkItem> = links
            .iter()
            .filter(|l| match self {
                Tab::Inbox => l.status == "unread" && l.deleted_at.is_none(),
                Tab::All => l.deleted_at.is_none(),
                Tab::Completed => l.status == "completed" && l.deleted_at.is_none(),
                Tab::Archive => l.deleted_at.is_some(),
            })
            .collect();
        shown.sort_by_key(|l| {
            std::cmp::Reverse(match self {
                Tab::Inbox | Tab::All => Some(l.created_at),
                Tab::Completed => l.completed_at,
                Tab::Archive => l.deleted_at,
            })
        });
        shown
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct LinkItem {
    pub id: String,
    /// What the web's `displayTitle` shows: the newest snapshot's title, else origin and path.
    pub title: String,
    pub url: String,
    /// The URL's host without `www.`, shown under the title.
    pub domain: String,
    /// The newest snapshot's preview picture and favicon.
    pub image: Option<String>,
    pub favicon: Option<String>,
    /// The newest snapshot's description and the newest summary on one line, for search.
    pub description: Option<String>,
    pub summary: Option<String>,
    /// The names of its tags, for search.
    pub tags: Vec<String>,
    pub status: String,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub deleted_at: Option<i64>,
}

impl LinkItem {
    fn from_row(row: &Row) -> Option<LinkItem> {
        let text = |k: &str| row.get(k).and_then(Value::as_str);
        let millis = |k: &str| row.get(k).and_then(Value::as_i64);
        let url = text("url").unwrap_or_default();
        let parsed = url::Url::parse(url).ok();
        let title = match text("title").filter(|t| !t.is_empty()) {
            Some(t) => decode_entities(t),
            None => parsed.as_ref().map_or_else(|| url.to_owned(), |u| format!("{}{}", u.origin().ascii_serialization(), u.path())),
        };
        let host = parsed.as_ref().and_then(url::Url::host_str).unwrap_or_default();
        Some(LinkItem {
            id: text("id")?.to_owned(),
            title,
            url: url.to_owned(),
            domain: host.strip_prefix("www.").unwrap_or(host).to_owned(),
            image: text("image").filter(|u| u.starts_with("http")).map(decode_entities),
            favicon: text("favicon").filter(|u| u.starts_with("http")).map(decode_entities),
            description: text("description").map(|d| one_line(&decode_entities(d))).filter(|d| !d.is_empty()),
            summary: text("summary").map(one_line).filter(|d| !d.is_empty()),
            tags: text("tags").map(|t| t.split('\u{1f}').filter(|t| !t.is_empty()).map(str::to_owned).collect()).unwrap_or_default(),
            status: text("status").unwrap_or_default().to_owned(),
            created_at: millis("createdAt").unwrap_or_default(),
            completed_at: millis("completedAt"),
            deleted_at: millis("deletedAt"),
        })
    }
}

/// Text on one line, whitespace runs collapsed.
fn one_line(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

const LINKS_SQL: &str = "SELECT l.id, l.url, l.status, l.createdAt, l.completedAt, l.deletedAt, s.title, s.image, s.favicon,
    s.description,
    (SELECT m.summary FROM link_summaries m WHERE m.linkId = l.id ORDER BY m.summarizedAt DESC LIMIT 1) AS summary,
    (SELECT group_concat(t.name, char(31)) FROM link_tags lt JOIN tags t ON t.id = lt.tagId
      WHERE lt.linkId = l.id AND t.deletedAt IS NULL) AS tags
  FROM links l
  LEFT JOIN link_snapshots s ON s.id = (
    SELECT s2.id FROM link_snapshots s2 WHERE s2.linkId = l.id ORDER BY s2.fetchedAt DESC LIMIT 1
  )";

/// A running sync; dropping it stops the store and keeps the local copy.
pub struct Library {
    stop: Option<oneshot::Sender<bool>>,
}

impl Library {
    /// Stops the store and deletes the local copy, as on sign-out.
    pub fn close_and_forget(mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(true);
        }
    }
}

impl Drop for Library {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(false);
        }
    }
}

pub struct Config {
    /// `https://cloudstash.dev` or a dev server; the socket is `/sync` on it.
    pub base: String,
    pub library_id: String,
    pub api_key: String,
    /// Where this library's eventlog and state live.
    pub dir: PathBuf,
}

/// Starts syncing on its own thread. `on_links` gets every link after each change and
/// `on_status` the connection state (or an error that stopped the store, a panic included).
pub fn start(
    config: Config,
    on_links: impl Fn(Vec<LinkItem>) + Send + Sync + 'static,
    on_status: impl Fn(Result<bool, String>) + Send + Sync + 'static,
) -> Library {
    let (stop, stopped) = oneshot::channel();
    std::thread::Builder::new()
        .name("sync".to_owned())
        .spawn(move || {
            let run = std::panic::AssertUnwindSafe(|| {
                tokio::runtime::Runtime::new().map_err(|e| e.to_string()).and_then(|rt| rt.block_on(serve(&config, stopped, on_links, &on_status)))
            });
            let result = std::panic::catch_unwind(run).unwrap_or_else(|_| Err("Sync crashed; the log has the details".to_owned()));
            if let Err(e) = result {
                tracing::error!("sync stopped: {e}");
                on_status(Err(e));
            }
        })
        .expect("sync thread");
    Library { stop: Some(stop) }
}

async fn serve(
    config: &Config,
    mut stopped: oneshot::Receiver<bool>,
    on_links: impl Fn(Vec<LinkItem>) + Send + Sync + 'static,
    on_status: &(impl Fn(Result<bool, String>) + Send + Sync),
) -> Result<(), String> {
    let store = open(config).await?;
    let subscription = store.subscribe(
        &query_db(QueryInput::sql(LINKS_SQL).queried_tables(&["links", "link_snapshots", "link_summaries", "link_tags", "tags"])),
        move |rows| on_links(rows.iter().filter_map(LinkItem::from_row).collect()),
        &SubscribeOptions::default(),
    );
    let mut online = store.network_status();
    on_status(Ok(*online.borrow()));
    let forget = loop {
        tokio::select! {
            forget = &mut stopped => break forget.unwrap_or(false),
            changed = online.changed() => {
                if changed.is_err() {
                    break false;
                }
                on_status(Ok(*online.borrow()));
            }
        }
    };
    drop(subscription);
    store.shutdown(None).await;
    if forget {
        std::fs::remove_dir_all(&config.dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn open(config: &Config) -> Result<Store, String> {
    std::fs::create_dir_all(&config.dir).map_err(|e| e.to_string())?;
    let url = format!("{}/sync", config.base.trim_end_matches('/')).replacen("https://", "wss://", 1).replacen("http://", "ws://", 1);
    let (payload, folder) = (json!({ "apiKey": config.api_key }), config.dir.clone());
    let adapter = InMemoryAdapter {
        client_id: client_id(&config.dir).map_err(|e| e.to_string())?,
        session_id: random_id(),
        leader_builder: Some(Arc::new(move |builder| {
            builder
                .sync_payload(payload.clone())
                .storage(Storage::Folder(folder.clone()))
                .sync(SyncOptions { backend: Some(make_ws_sync(&url, ClientOptions::default())), ..SyncOptions::default() })
        })),
        ..InMemoryAdapter::default()
    };
    create_store(StoreOptions::new(super::schema::schema(), adapter.build(), &config.library_id)).await.map_err(|e| e.to_string())
}

/// Stable per library folder, like the client id the web keeps in storage.
fn client_id(dir: &Path) -> std::io::Result<String> {
    let path = dir.join("client-id");
    if let Ok(id) = std::fs::read_to_string(&path) {
        return Ok(id.trim().to_owned());
    }
    let id = random_id()[..8].to_owned();
    std::fs::write(&path, &id)?;
    Ok(id)
}

fn random_id() -> String {
    let (a, b) = (RandomState::new().hash_one(0u8), RandomState::new().hash_one(1u8));
    let b = (b & 0x3fff_ffff_ffff_ffff) | 0x8000_0000_0000_0000;
    let a = (a & 0xffff_ffff_ffff_0fff) | 0x4000;
    format!("{:08x}-{:04x}-{:04x}-{:04x}-{:012x}", a >> 32, (a >> 16) & 0xffff, a & 0xffff, b >> 48, b & 0xffff_ffff_ffff)
}

/// The entities page titles carry, as the web's `decodeHtmlEntities` resolves them.
fn decode_entities(text: &str) -> String {
    if !text.contains('&') {
        return text.to_owned();
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        let entity = rest[1..].find(';').filter(|&n| n <= 10).map(|n| &rest[1..=n]);
        let decoded = entity.and_then(|e| match e {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some('\u{a0}'),
            _ => e
                .strip_prefix("#x")
                .or_else(|| e.strip_prefix("#X"))
                .and_then(|h| u32::from_str_radix(h, 16).ok())
                .or_else(|| e.strip_prefix('#').and_then(|d| d.parse().ok()))
                .and_then(char::from_u32),
        });
        match (entity, decoded) {
            (Some(e), Some(c)) => {
                out.push(c);
                rest = &rest[e.len() + 2..];
            }
            _ => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn link(id: &str, status: &str, created: i64, completed: Option<i64>, deleted: Option<i64>) -> LinkItem {
        LinkItem {
            id: id.to_owned(),
            title: id.to_owned(),
            url: String::new(),
            domain: String::new(),
            image: None,
            favicon: None,
            description: None,
            summary: None,
            tags: Vec::new(),
            status: status.to_owned(),
            created_at: created,
            completed_at: completed,
            deleted_at: deleted,
        }
    }

    #[test]
    fn tabs_filter_and_order_like_the_web() {
        let links = [
            link("old-unread", "unread", 1, None, None),
            link("new-unread", "unread", 3, None, None),
            link("done-early", "completed", 2, Some(10), None),
            link("done-late", "completed", 0, Some(20), None),
            link("gone", "unread", 4, None, Some(5)),
            link("gone-later", "completed", 5, Some(1), Some(9)),
        ];
        let ids = |tab: Tab| tab.links(&links).iter().map(|l| l.id.as_str()).collect::<Vec<_>>();
        assert_eq!(ids(Tab::Inbox), ["new-unread", "old-unread"]);
        assert_eq!(ids(Tab::All), ["new-unread", "done-early", "old-unread", "done-late"]);
        assert_eq!(ids(Tab::Completed), ["done-late", "done-early"]);
        assert_eq!(ids(Tab::Archive), ["gone-later", "gone"]);
    }

    #[test]
    fn titles_fall_back_and_decode_like_display_title() {
        let row = |title: Value, url: &str| -> Row {
            serde_json::from_value(json!({"id": "a", "url": url, "status": "unread", "createdAt": 1, "title": title})).expect("row")
        };
        let title = |r: Row| LinkItem::from_row(&r).expect("link").title;
        let domain = |r: Row| LinkItem::from_row(&r).expect("link").domain;
        assert_eq!(domain(row(Value::Null, "https://www.example.com/a")), "example.com");
        assert_eq!(title(row(json!("Tom &amp; Jerry &#8211; &#x27;hi&#39; &bogus;"), "https://a.b/")), "Tom & Jerry – 'hi' &bogus;");
        assert_eq!(title(row(Value::Null, "https://example.com/post?x=1#y")), "https://example.com/post");
        assert_eq!(title(row(json!(""), "not a url")), "not a url");
    }
}
