//! Remote pictures for the app, kept as small copies on disk. The app asks for a picture at the
//! size it draws it ([`Request`]) and gets a [`Pixels`] that fills in when it's ready; it says
//! which pictures are on screen ([`visible`]) and which it will want later ([`prefetch`]), and
//! reads [`stats`] for the dev meter. Nothing here knows about the views or the meter.
//!
//! A picture is downloaded once, shrunk to its size and saved (`store`, `codec`); every later
//! load reads that small file. Downloads wait in one queue (`fetch`): what's on screen first,
//! then the rows just built around it, newest first, then the background fill in the order
//! given, which only runs while nothing in view waits.

mod codec;
mod fetch;
mod store;

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};

use rune::Pixels;
use tokio::runtime::Runtime;
use tokio::sync::Semaphore;

use store::Store;

/// Downloads at once, and of those per site, favicons and background fill.
const TOTAL: usize = 8;
const PER_HOST: usize = 4;
const ICONS: usize = 2;
const BACKGROUND: usize = 2;
/// Small copies read from disk and decoded at once.
const DISK: usize = 4;
/// Pictures kept decoded in memory after they scroll away.
const KEEP: usize = 120;

/// Which slots a download takes: favicons have their own few, so they never hold up pictures.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Lane {
    Picture,
    Icon,
}

/// A picture at the size it's drawn, in pixels.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Request {
    pub url: String,
    pub size: (u32, u32),
    pub lane: Lane,
}

impl Request {
    pub fn new(url: &str, size: (u32, u32), lane: Lane) -> Self {
        Request { url: url.to_owned(), size, lane }
    }
}

/// What the dev meter shows: downloads running and waiting in view, the small copies' size on
/// disk, and how much of the background fill is done.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Stats {
    pub downloading: usize,
    pub waiting: usize,
    pub disk_bytes: u64,
    pub filled: usize,
    pub to_fill: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum Rank {
    Visible,
    Near,
    Background,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Job {
    rank: Rank,
    /// When it was asked for; the newest goes first in view, the background fill in order.
    order: u64,
}

impl Job {
    fn key(self) -> (Rank, u64) {
        (self.rank, if self.rank == Rank::Background { self.order } else { u64::MAX - self.order })
    }
}

#[derive(Default)]
struct Inner {
    /// Bumped by `close`, so downloads already running drop their results.
    epoch: u64,
    store: Option<Store>,
    memory: HashMap<Request, Pixels>,
    recent: VecDeque<Request>,
    queue: HashMap<Request, Job>,
    running: HashMap<Request, (Rank, String)>,
    fill: Vec<Request>,
    seq: u64,
}

fn inner() -> MutexGuard<'static, Inner> {
    static INNER: OnceLock<Mutex<Inner>> = OnceLock::new();
    INNER.get_or_init(Mutex::default).lock().expect("images")
}

fn runtime() -> &'static Runtime {
    static RUNTIME: OnceLock<Runtime> = OnceLock::new();
    RUNTIME.get_or_init(|| Runtime::new().expect("images runtime"))
}

fn disk() -> Arc<Semaphore> {
    static DISK_PERMITS: OnceLock<Arc<Semaphore>> = OnceLock::new();
    Arc::clone(DISK_PERMITS.get_or_init(|| Arc::new(Semaphore::new(DISK))))
}

/// Keeps small copies in `dir` from now on, as a library opens. Copies at a size not in
/// `sizes` are deleted, so changing a size makes new ones rather than keeping the old.
pub fn open(dir: PathBuf, sizes: &[(u32, u32)]) {
    let store = Store::open(dir, sizes);
    let mut g = inner();
    g.store = store;
}

/// Forgets everything and stops using the folder, as on sign-out; the folder goes with the
/// library's. Downloads already running finish without saving.
pub fn close() {
    let mut g = inner();
    let epoch = g.epoch + 1;
    *g = Inner { epoch, ..Inner::default() };
}

/// Deletes every saved copy and failure note and loads it all again: pictures on screen go
/// blank and come back, then the background fill starts over. For experiments.
pub fn reset() {
    let mut g = inner();
    g.epoch += 1;
    g.running.clear();
    g.queue.clear();
    if let Some(store) = &mut g.store {
        store.clear();
    }
    let shown: Vec<Request> = g.memory.keys().cloned().collect();
    for req in &shown {
        g.memory[req].set(0, 0, Vec::new());
        g.want(req, Rank::Near);
    }
    let fill = std::mem::take(&mut g.fill);
    drop(g);
    prefetch(fill);
}

/// The picture for `req`, empty until it loads, and left empty if it can't be.
pub fn picture(req: &Request) -> Pixels {
    let mut g = inner();
    if let Some(pixels) = g.memory.get(req) {
        return pixels.clone();
    }
    let pixels = Pixels::new();
    g.memory.insert(req.clone(), pixels.clone());
    g.recent.push_back(req.clone());
    if g.recent.len() > KEEP
        && let Some(old) = g.recent.pop_front()
    {
        g.memory.remove(&old);
    }
    if let Some(path) = g.store.as_ref().and_then(|s| s.path(req)) {
        let (target, permits) = (pixels.clone(), disk());
        runtime().spawn(async move {
            let Ok(_permit) = permits.acquire_owned().await else {
                return;
            };
            let loaded = tokio::task::spawn_blocking(move || std::fs::read(path).ok().and_then(|b| codec::load(&b))).await;
            if let Ok(Some((w, h, rgba))) = loaded {
                target.set(w, h, rgba);
            }
        });
    } else {
        g.want(req, Rank::Near);
        g.pump();
    }
    pixels
}

/// Whether `req` is known not to load, so the view can draw something in its place. A failure
/// shows on the view's next build.
pub fn failed(req: &Request) -> bool {
    inner().store.as_ref().is_some_and(|s| s.failed(req))
}

/// The pictures on screen now: they go first, and what was waiting for rows scrolled past goes
/// behind the background fill.
pub fn visible(reqs: Vec<Request>) {
    let mut g = inner();
    let shown: HashSet<&Request> = reqs.iter().collect();
    let next = g.seq + 1_000_000;
    for (req, job) in g.queue.iter_mut() {
        if job.rank != Rank::Background && !shown.contains(req) {
            *job = Job { rank: Rank::Background, order: next };
        }
    }
    for req in &reqs {
        g.want(req, Rank::Visible);
    }
    g.pump();
}

/// Everything worth having ahead of time, in the order to fetch it; replaces the last list.
pub fn prefetch(reqs: Vec<Request>) {
    let mut g = inner();
    g.queue.retain(|_, job| job.rank != Rank::Background);
    for (i, req) in reqs.iter().enumerate() {
        if g.missing(req) && !g.queue.contains_key(req) {
            g.queue.insert(req.clone(), Job { rank: Rank::Background, order: i as u64 });
        }
    }
    g.fill = reqs;
    g.pump();
}

pub fn stats() -> Stats {
    let g = inner();
    let Some(store) = &g.store else {
        return Stats::default();
    };
    Stats {
        downloading: g.running.len(),
        waiting: g.queue.values().filter(|j| j.rank != Rank::Background).count(),
        disk_bytes: store.bytes(),
        filled: g.fill.iter().filter(|r| store.done(r)).count(),
        to_fill: g.fill.len(),
    }
}

impl Inner {
    /// Neither saved, nor known to fail, nor downloading.
    fn missing(&self, req: &Request) -> bool {
        self.store.as_ref().is_some_and(|s| !s.done(req)) && !self.running.contains_key(req)
    }

    fn want(&mut self, req: &Request, rank: Rank) {
        if !self.missing(req) {
            return;
        }
        self.seq += 1;
        let job = Job { rank, order: self.seq };
        match self.queue.get_mut(req) {
            Some(old) if old.rank < rank => {}
            Some(old) => *old = job,
            None => {
                self.queue.insert(req.clone(), job);
            }
        }
    }

    /// Starts the best downloads the limits allow.
    fn pump(&mut self) {
        while self.running.len() < TOTAL {
            let Some(store) = &self.store else { return };
            let Some((req, job)) = pick(&self.queue, &self.running) else {
                return;
            };
            let path = store.target(&req);
            self.queue.remove(&req);
            self.running.insert(req.clone(), (job.rank, host(&req.url)));
            let (epoch, client) = (self.epoch, fetch::client());
            runtime().spawn(async move {
                let made = match fetch::get(&client, &req.url).await {
                    Some(bytes) => {
                        let size = req.size;
                        tokio::task::spawn_blocking(move || codec::make(&bytes, size).filter(|m| inner().epoch == epoch && m.save(&path)))
                            .await
                            .ok()
                            .flatten()
                    }
                    None => None,
                };
                inner().finish(&req, epoch, made);
            });
        }
    }

    fn finish(&mut self, req: &Request, epoch: u64, made: Option<codec::Made>) {
        if epoch != self.epoch {
            return;
        }
        self.running.remove(req);
        if let Some(store) = &mut self.store {
            match made {
                Some(m) => {
                    store.saved(req, m.ext, m.file_len);
                    if let Some(pixels) = self.memory.get(req) {
                        pixels.set(m.width, m.height, m.rgba);
                    }
                }
                None => store.fail(req),
            }
        }
        self.pump();
    }
}

/// The waiting download to start next, if the limits allow one: by rank, newest first in view,
/// in order for the background fill, which waits while anything in view does.
fn pick(queue: &HashMap<Request, Job>, running: &HashMap<Request, (Rank, String)>) -> Option<(Request, Job)> {
    let in_view = queue.values().any(|j| j.rank != Rank::Background);
    let icons = running.keys().filter(|r| r.lane == Lane::Icon).count();
    let background = running.values().filter(|(rank, _)| *rank == Rank::Background).count();
    queue
        .iter()
        .filter(|(req, job)| {
            (req.lane != Lane::Icon || icons < ICONS)
                && (job.rank != Rank::Background || (!in_view && background < BACKGROUND))
                && running.values().filter(|(_, h)| *h == host(&req.url)).count() < PER_HOST
        })
        .min_by_key(|(_, job)| job.key())
        .map(|(req, job)| (req.clone(), *job))
}

fn host(url: &str) -> String {
    url::Url::parse(url).ok().and_then(|u| u.host_str().map(str::to_owned)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(url: &str, lane: Lane) -> Request {
        Request::new(url, (8, 8), lane)
    }

    #[test]
    fn what_is_on_screen_goes_first_then_the_newest_near_it() {
        let mut queue = HashMap::new();
        queue.insert(req("https://a.com/1", Lane::Picture), Job { rank: Rank::Near, order: 1 });
        queue.insert(req("https://a.com/2", Lane::Picture), Job { rank: Rank::Near, order: 2 });
        queue.insert(req("https://a.com/3", Lane::Picture), Job { rank: Rank::Visible, order: 0 });
        let running = HashMap::new();
        assert_eq!(pick(&queue, &running).unwrap().0.url, "https://a.com/3");
        queue.remove(&req("https://a.com/3", Lane::Picture));
        assert_eq!(pick(&queue, &running).unwrap().0.url, "https://a.com/2");
    }

    #[test]
    fn the_background_fill_waits_for_pictures_in_view_and_keeps_its_order() {
        let mut queue = HashMap::new();
        queue.insert(req("https://a.com/1", Lane::Picture), Job { rank: Rank::Background, order: 1 });
        queue.insert(req("https://a.com/0", Lane::Picture), Job { rank: Rank::Background, order: 0 });
        let mut running = HashMap::new();
        assert_eq!(pick(&queue, &running).unwrap().0.url, "https://a.com/0");
        queue.insert(req("https://b.com/x", Lane::Picture), Job { rank: Rank::Near, order: 5 });
        running.insert(req("https://b.com/x", Lane::Picture), (Rank::Near, "b.com".to_owned()));
        queue.remove(&req("https://b.com/x", Lane::Picture));
        queue.insert(req("https://b.com/y", Lane::Picture), Job { rank: Rank::Near, order: 6 });
        running.insert(req("https://b.com/z", Lane::Picture), (Rank::Near, "b.com".to_owned()));
        running.insert(req("https://b.com/w", Lane::Picture), (Rank::Near, "b.com".to_owned()));
        running.insert(req("https://b.com/v", Lane::Picture), (Rank::Near, "b.com".to_owned()));
        assert_eq!(pick(&queue, &running), None, "b.com is at its limit and the fill waits for it");
    }

    #[test]
    fn favicons_take_at_most_their_own_slots() {
        let mut queue = HashMap::new();
        queue.insert(req("https://c.com/i", Lane::Icon), Job { rank: Rank::Visible, order: 1 });
        let mut running = HashMap::new();
        running.insert(req("https://a.com/i", Lane::Icon), (Rank::Visible, "a.com".to_owned()));
        running.insert(req("https://b.com/i", Lane::Icon), (Rank::Visible, "b.com".to_owned()));
        assert_eq!(pick(&queue, &running), None);
    }
}
