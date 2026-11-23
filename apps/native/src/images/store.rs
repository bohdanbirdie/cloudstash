//! The small copies on disk: one file per picture and size, named by a hash of its URL, and an
//! empty `.fail` file for one that couldn't be downloaded or decoded, tried again after a day.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

use sha2::{Digest, Sha256};

use super::Request;

const RETRY: Duration = Duration::from_secs(24 * 60 * 60);

pub struct Store {
    dir: PathBuf,
    files: HashMap<String, (&'static str, u64)>,
    failed: HashSet<String>,
    bytes: u64,
}

fn name(req: &Request) -> String {
    let hash = Sha256::digest(req.url.as_bytes());
    let hex: String = hash.iter().take(16).map(|b| format!("{b:02x}")).collect();
    format!("{hex}-{}x{}", req.size.0, req.size.1)
}

impl Store {
    pub fn open(dir: PathBuf, sizes: &[(u32, u32)]) -> Option<Store> {
        std::fs::create_dir_all(&dir).ok()?;
        let tags: Vec<String> = sizes.iter().map(|(w, h)| format!("-{w}x{h}")).collect();
        let mut store = Store { dir, files: HashMap::new(), failed: HashSet::new(), bytes: 0 };
        for entry in std::fs::read_dir(&store.dir).ok()?.flatten() {
            let path = entry.path();
            let (Some(stem), Some(ext)) = (path.file_stem().and_then(|s| s.to_str()), path.extension().and_then(|e| e.to_str())) else {
                continue;
            };
            let meta = entry.metadata().ok();
            let stale = meta.as_ref().and_then(|m| m.modified().ok()).is_none_or(|t| SystemTime::now().duration_since(t).unwrap_or_default() > RETRY);
            let ext = match ext {
                "jpg" => "jpg",
                "png" => "png",
                "fail" if !stale => {
                    store.failed.insert(stem.to_owned());
                    continue;
                }
                _ => "",
            };
            if ext.is_empty() || !tags.iter().any(|t| stem.ends_with(t.as_str())) {
                let _ = std::fs::remove_file(&path);
                continue;
            }
            let len = meta.map_or(0, |m| m.len());
            store.bytes += len;
            store.files.insert(stem.to_owned(), (ext, len));
        }
        Some(store)
    }

    /// The saved copy of `req`, if there is one.
    pub fn path(&self, req: &Request) -> Option<PathBuf> {
        let name = name(req);
        self.files.get(&name).map(|(ext, _)| self.dir.join(format!("{name}.{ext}")))
    }

    /// Saved, or known to fail.
    pub fn done(&self, req: &Request) -> bool {
        let name = name(req);
        self.files.contains_key(&name) || self.failed.contains(&name)
    }

    pub fn failed(&self, req: &Request) -> bool {
        self.failed.contains(&name(req))
    }

    /// Where a new copy of `req` goes, without its extension.
    pub fn target(&self, req: &Request) -> PathBuf {
        self.dir.join(name(req))
    }

    pub fn saved(&mut self, req: &Request, ext: &'static str, len: u64) {
        if let Some((_, old)) = self.files.insert(name(req), (ext, len)) {
            self.bytes -= old;
        }
        self.bytes += len;
    }

    pub fn fail(&mut self, req: &Request) {
        let name = name(req);
        let _ = std::fs::write(self.dir.join(format!("{name}.fail")), b"");
        self.failed.insert(name);
    }

    /// Deletes every copy and failure note.
    pub fn clear(&mut self) {
        for entry in std::fs::read_dir(&self.dir).into_iter().flatten().flatten() {
            let _ = std::fs::remove_file(entry.path());
        }
        self.files.clear();
        self.failed.clear();
        self.bytes = 0;
    }

    pub fn bytes(&self) -> u64 {
        self.bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::images::Lane;

    #[test]
    fn it_counts_what_it_holds_and_drops_copies_at_old_sizes() {
        let dir = std::env::temp_dir().join(format!("cloudstash-store-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let req = Request::new("https://a.com/p.jpg", (8, 8), Lane::Picture);
        let mut store = Store::open(dir.clone(), &[(8, 8)]).unwrap();
        std::fs::write(store.target(&req).with_extension("jpg"), [0u8; 10]).unwrap();
        store.saved(&req, "jpg", 10);
        store.fail(&Request::new("https://a.com/gone.jpg", (8, 8), Lane::Picture));
        assert_eq!(store.bytes(), 10);
        let again = Store::open(dir.clone(), &[(8, 8)]).unwrap();
        assert!(again.path(&req).is_some());
        assert!(again.done(&Request::new("https://a.com/gone.jpg", (8, 8), Lane::Picture)));
        assert_eq!(again.bytes(), 10);
        let mut resized = Store::open(dir.clone(), &[(16, 16)]).unwrap();
        assert_eq!((resized.bytes(), resized.path(&req)), (0, None));
        resized.clear();
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0, "clear leaves the folder empty");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
