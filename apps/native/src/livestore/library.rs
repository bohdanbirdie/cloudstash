//! The signed-in library: a LiveStore client (livestore-contrib's Rust crates) that syncs the
//! library over Cloudstash's `/sync` WebSocket, authorized by the app's API key, and keeps a local
//! SQLite copy. Read-only: the app commits no events.

use std::collections::hash_map::RandomState;
use std::hash::BuildHasher;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use futures::StreamExt;
use livestore::{
    InMemoryAdapter, QueryInput, ShutdownDeferred, Store, StoreOptions, SubscribeOptions, await_shutdown, create_store, make_shutdown_deferred,
    query_db,
};
use livestore_schema::{UnknownEventContext, UnknownEventHandling};
use livestore_sqlite::Row;
use livestore_sync::{BackendOverride, InitialSyncOptions, PageInfo, Storage, SyncBackend, SyncBackendConstructor, SyncOptions, constructor};
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

pub(super) const LINKS_SQL: &str = "SELECT l.id, l.url, l.status, l.createdAt, l.completedAt, l.deletedAt, s.title, s.image, s.favicon,
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
    stop: Option<oneshot::Sender<()>>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Library {
    /// Stops the store and waits until it has closed its files, so they can be deleted.
    pub fn close(mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for Library {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
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

/// How long opening waits for the server to say there is nothing more to fetch. After it, or offline,
/// the library opens with what this Mac has and catches up in the background. The web waits 5 seconds.
const CATCH_UP: std::time::Duration = std::time::Duration::from_secs(10);

/// This build's version, as the library folder records it.
const VERSION: &str = env!("CARGO_PKG_VERSION");
/// The file naming the app version that last opened a library folder.
const OPENED_BY: &str = "app-version";
/// The file naming the app version that met data too new for it in this folder.
const TOO_OLD: &str = "too-old";

/// Starts syncing on its own thread. `on_links` first hears once the library has caught up with the
/// server ([`CATCH_UP`]), then gets every link after each change, and
/// `on_status` the connection state (or an error that stopped the store, a panic included).
/// `on_too_old` hears, once, that the library holds data only a newer version can apply, and
/// `on_caught_up`, once, that it has everything the server had (which may come after it opened).
pub fn start(
    config: Config,
    on_links: impl Fn(Vec<LinkItem>) + Send + Sync + 'static,
    on_status: impl Fn(Result<bool, String>) + Send + Sync + 'static,
    on_too_old: impl Fn() + Send + Sync + 'static,
    on_caught_up: impl Fn() + Send + Sync + 'static,
) -> Library {
    let on_too_old: Arc<dyn Fn() + Send + Sync> = Arc::new(on_too_old);
    let on_caught_up: Arc<dyn Fn() + Send + Sync> = Arc::new(on_caught_up);
    let (stop, stopped) = oneshot::channel();
    let thread = std::thread::Builder::new()
        .name("sync".to_owned())
        .spawn(move || {
            let run = std::panic::AssertUnwindSafe(|| {
                tokio::runtime::Runtime::new()
                    .map_err(|e| e.to_string())
                    .and_then(|rt| rt.block_on(serve(&config, stopped, on_links, &on_status, on_too_old, on_caught_up)))
            });
            let result = std::panic::catch_unwind(run).unwrap_or_else(|_| Err("Sync crashed; the log has the details".to_owned()));
            if let Err(e) = result {
                tracing::error!("sync stopped: {e}");
                on_status(Err(e));
            }
        })
        .expect("sync thread");
    Library { stop: Some(stop), thread: Some(thread) }
}

async fn serve(
    config: &Config,
    mut stopped: oneshot::Receiver<()>,
    on_links: impl Fn(Vec<LinkItem>) + Send + Sync + 'static,
    on_status: &(impl Fn(Result<bool, String>) + Send + Sync),
    on_too_old: Arc<dyn Fn() + Send + Sync>,
    on_caught_up: Arc<dyn Fn() + Send + Sync>,
) -> Result<(), String> {
    let shutdown = make_shutdown_deferred();
    let began = std::time::Instant::now();
    let store = open(config, &shutdown, on_too_old, on_caught_up).await?;
    tracing::info!("the library opened after {} ms", began.elapsed().as_millis());
    let subscription = store.subscribe(
        &query_db(QueryInput::sql(LINKS_SQL).queried_tables(&["links", "link_snapshots", "link_summaries", "link_tags", "tags"])),
        move |rows| on_links(rows.iter().filter_map(LinkItem::from_row).collect()),
        &SubscribeOptions::default(),
    );
    let mut online = store.network_status();
    on_status(Ok(*online.borrow()));
    loop {
        tokio::select! {
            _ = &mut stopped => break,
            exit = await_shutdown(&shutdown) => {
                return Err(match exit {
                    Ok(()) => "Sync stopped".to_owned(),
                    Err(e) => format!("Sync stopped: {e}"),
                });
            }
            changed = online.changed() => {
                if changed.is_err() {
                    return Err("Sync stopped".to_owned());
                }
                on_status(Ok(*online.borrow()));
            }
        }
    }
    drop(subscription);
    store.shutdown(None).await;
    Ok(())
}

async fn open(
    config: &Config,
    shutdown: &ShutdownDeferred,
    on_too_old: Arc<dyn Fn() + Send + Sync>,
    on_caught_up: Arc<dyn Fn() + Send + Sync>,
) -> Result<Store, String> {
    std::fs::create_dir_all(&config.dir).map_err(|e| e.to_string())?;
    let too_old = Arc::new(AtomicBool::new(false));
    if version_changed(&config.dir).map_err(|e| e.to_string())? {
        tracing::info!("first open by {VERSION}: the library's state is rebuilt from its eventlog");
    } else if config.dir.join(TOO_OLD).exists() {
        too_old.store(true, Ordering::Relaxed);
        on_too_old();
    }
    let unknown = UnknownEventHandling::Callback(Arc::new({
        let dir = config.dir.clone();
        move |event: &UnknownEventContext| {
            if !super::schema::is_newer_version(&event.event_name) || too_old.swap(true, Ordering::Relaxed) {
                return;
            }
            tracing::warn!("{} is newer than this version understands", event.event_name);
            if let Err(e) = std::fs::write(dir.join(TOO_OLD), VERSION) {
                tracing::warn!("could not remember that this version is too old: {e}");
            }
            on_too_old();
        }
    }));
    let url = format!("{}/sync", config.base.trim_end_matches('/')).replacen("https://", "wss://", 1).replacen("http://", "ws://", 1);
    let (payload, folder) = (json!({ "apiKey": config.api_key }), config.dir.clone());
    let backend = watch_catch_up(make_ws_sync(&url, ClientOptions::default()), on_caught_up);
    let adapter = InMemoryAdapter {
        client_id: client_id(&config.dir).map_err(|e| e.to_string())?,
        session_id: random_id(),
        leader_builder: Some(Arc::new(move |builder| {
            builder.sync_payload(payload.clone()).storage(Storage::Folder(folder.clone())).sync(SyncOptions {
                backend: Some(Arc::clone(&backend)),
                initial_sync: InitialSyncOptions::Blocking { timeout: CATCH_UP },
                ..SyncOptions::default()
            })
        })),
        ..InMemoryAdapter::default()
    };
    let mut options = StoreOptions::new(super::schema::with_unknown(unknown), adapter.build(), &config.library_id);
    options.shutdown_deferred = Some(Arc::clone(shutdown));
    create_store(options).await.map_err(|e| e.to_string())
}

/// Wraps the connection to hear when the library has caught up with the server, which marks the last
/// page of what it has `NoMore`. In a debug build `CLOUDSTASH_SLOW_SYNC=<ms>` holds each page back that
/// long until then, to watch a slow first sync (or, with enough pages, the [`CATCH_UP`] limit) against
/// a fast local server.
fn watch_catch_up(make: SyncBackendConstructor, on_caught_up: Arc<dyn Fn() + Send + Sync>) -> SyncBackendConstructor {
    let delay = std::env::var("CLOUDSTASH_SLOW_SYNC")
        .ok()
        .filter(|_| cfg!(debug_assertions))
        .and_then(|ms| ms.parse().ok())
        .map(std::time::Duration::from_millis);
    let caught_up = Arc::new(AtomicBool::new(false));
    constructor(move |args| {
        let (made, caught_up, on_caught_up) = (make(args), Arc::clone(&caught_up), Arc::clone(&on_caught_up));
        async move {
            let backend = BackendOverride::new(made.await?).pull(move |inner, cursor, options| {
                let (caught_up, on_caught_up) = (Arc::clone(&caught_up), Arc::clone(&on_caught_up));
                inner
                    .pull(cursor, options)
                    .then(move |page| {
                        let (caught_up, on_caught_up) = (Arc::clone(&caught_up), Arc::clone(&on_caught_up));
                        async move {
                            if let Ok(page) = &page
                                && !caught_up.load(Ordering::Relaxed)
                            {
                                if let Some(delay) = delay {
                                    tokio::time::sleep(delay).await;
                                }
                                if page.page_info == PageInfo::NoMore && !caught_up.swap(true, Ordering::Relaxed) {
                                    on_caught_up();
                                }
                            }
                            page
                        }
                    })
                    .boxed()
            });
            Ok(Arc::new(backend) as Arc<dyn SyncBackend>)
        }
    })
}

/// Records this version as the folder's, and whether another one opened it before. When one
/// did, the state files go and boot replays the eventlog into a new one, so whatever an older
/// version skipped gets applied, and what it noted as too new for it is forgotten.
fn version_changed(dir: &Path) -> std::io::Result<bool> {
    let file = dir.join(OPENED_BY);
    if std::fs::read_to_string(&file).is_ok_and(|v| v.trim() == VERSION) {
        return Ok(false);
    }
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if (name.starts_with("state") && name.contains(".db")) || name == TOO_OLD {
            std::fs::remove_file(&path)?;
        }
    }
    std::fs::write(&file, VERSION)?;
    Ok(true)
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

    use std::sync::atomic::AtomicUsize;

    use futures::future::BoxFuture;
    use livestore_sync::{
        BackendIdStore, BackendMetadata, ConnectError, MakeBackendArgs, PingError, PullCursor, PullError, PullOptions, PullResItem, PullStream,
        PushError, Supports,
    };

    /// A server that answers every pull with the same pages.
    struct Pages(Vec<PageInfo>);

    impl SyncBackend for Pages {
        fn connect(&self) -> BoxFuture<'static, Result<(), ConnectError>> {
            Box::pin(async { Ok(()) })
        }
        fn pull(&self, _: Option<PullCursor>, _: PullOptions) -> PullStream {
            futures::stream::iter(self.0.clone().into_iter().map(|page_info| Ok::<_, PullError>(PullResItem { batch: Vec::new(), page_info })))
                .boxed()
        }
        fn push(&self, _: Vec<livestore_core::GlobalEvent>) -> BoxFuture<'static, Result<(), PushError>> {
            Box::pin(async { Ok(()) })
        }
        fn ping(&self) -> BoxFuture<'static, Result<(), PingError>> {
            Box::pin(async { Ok(()) })
        }
        fn is_connected(&self) -> tokio::sync::watch::Receiver<bool> {
            tokio::sync::watch::channel(true).1
        }
        fn metadata(&self) -> BackendMetadata {
            BackendMetadata { name: "pages".to_owned(), description: String::new(), extra: serde_json::Map::new() }
        }
        fn supports(&self) -> Supports {
            Supports { pull_page_info_known: true, pull_live: true }
        }
    }

    struct NoId;

    impl BackendIdStore for NoId {
        fn get(&self) -> Option<String> {
            None
        }
        fn set(&self, _: &str) {}
    }

    #[test]
    fn it_hears_once_that_the_library_caught_up_at_the_last_page() {
        let pages = vec![PageInfo::MoreKnown { remaining: 2 }, PageInfo::MoreUnknown, PageInfo::NoMore, PageInfo::NoMore];
        let heard = Arc::new(AtomicUsize::new(0));
        let server = constructor(move |_| {
            let pages = pages.clone();
            async move { Ok(Arc::new(Pages(pages)) as Arc<dyn SyncBackend>) }
        });
        let make = watch_catch_up(server, {
            let heard = Arc::clone(&heard);
            Arc::new(move || _ = heard.fetch_add(1, Ordering::Relaxed))
        });
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let args = MakeBackendArgs { store_id: "s".to_owned(), client_id: "c".to_owned(), payload: None, backend_id: Arc::new(NoId) };
            let backend = make(args).await.unwrap();
            let mut pull = backend.pull(None, PullOptions { live: true });
            for (page, heard_by_then) in [0, 0, 1, 1].into_iter().enumerate() {
                pull.next().await.unwrap().unwrap();
                assert_eq!(heard.load(Ordering::Relaxed), heard_by_then, "after page {}", page + 1);
            }
            backend.pull(None, PullOptions { live: true }).count().await;
        });
        assert_eq!(heard.load(Ordering::Relaxed), 1, "a later pull that ends the same way says nothing new");
    }

    #[test]
    fn another_version_opening_the_folder_drops_its_state_and_keeps_its_eventlog() {
        let dir = std::env::temp_dir().join(format!("cloudstash-version-{}", random_id()));
        std::fs::create_dir_all(&dir).unwrap();
        for file in ["state123.db", "state123.db-wal", "eventlog.db", "client-id", TOO_OLD] {
            std::fs::write(dir.join(file), "").unwrap();
        }
        std::fs::write(dir.join(OPENED_BY), "0.0.1").unwrap();
        assert!(version_changed(&dir).unwrap());
        let mut left: Vec<String> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        left.sort();
        assert_eq!(left, ["app-version", "client-id", "eventlog.db"]);
        assert_eq!(std::fs::read_to_string(dir.join(OPENED_BY)).unwrap(), VERSION);
        std::fs::write(dir.join("state123.db"), "").unwrap();
        assert!(!version_changed(&dir).unwrap(), "the same version again");
        assert!(dir.join("state123.db").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

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
