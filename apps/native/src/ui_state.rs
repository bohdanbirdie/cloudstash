//! What the window remembers between launches, in `ui.json` beside the sign-in files: where it
//! was, how links show and the sidebar. The window's position and size are AppKit's
//! (`rune_mac`). Every value is checked as it loads, and anything unknown falls back to its
//! default, so a file from another version, a space that's gone or a broken file never leaves the
//! app somewhere it can't show. It's written to a temporary file and renamed over the old one, so
//! a crash can't leave half a file.

use std::path::{Path, PathBuf};
use std::time::Duration;

use rune::Tx;
use serde::{Deserialize, Serialize};

use crate::State;
use crate::appearance::{self, THEMES, Theme};
use crate::menu_bar;
use crate::nav::Place;
use crate::shell::{self, Kind, Mode};

/// The window's name for AppKit's saved frame.
pub const WINDOW: &str = "main";
/// How long a change rests before it's written, so dragging the sidebar writes once or twice.
const SETTLE: f64 = 0.5;

const MODES: [(Mode, &str); 2] = [(Mode::Grid, "grid"), (Mode::Feed, "feed")];
const KINDS: [(Kind, &str); 4] = [(Kind::All, "all"), (Kind::Posts, "posts"), (Kind::Articles, "articles"), (Kind::Videos, "videos")];

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Saved {
    place: Option<String>,
    mode: Option<String>,
    kind: Option<String>,
    theme: Option<String>,
    dock_icon: Option<bool>,
    menu_bar: Option<bool>,
    sidebar_open: Option<bool>,
    sidebar_width: Option<f32>,
}

impl Saved {
    fn of(s: &State) -> Saved {
        Saved {
            place: Some(s.place.name()),
            mode: name(&MODES, s.mode),
            kind: name(&KINDS, s.kind),
            theme: name(&THEMES.map(|(theme, id, _)| (theme, id)), s.theme),
            dock_icon: Some(!s.hide_dock),
            menu_bar: Some(s.menu_bar),
            sidebar_open: Some(s.sidebar.is_open()),
            sidebar_width: Some(s.sidebar.width()),
        }
    }

    fn apply(&self, s: &mut State) {
        s.place = self.place.as_deref().and_then(Place::named).unwrap_or_default();
        s.mode = value(&MODES, &self.mode).unwrap_or_default();
        s.kind = value(&KINDS, &self.kind).unwrap_or_default();
        s.theme = value(&THEMES.map(|(theme, id, _)| (theme, id)), &self.theme).unwrap_or_default();
        s.menu_bar = self.menu_bar.unwrap_or(false);
        s.hide_dock = self.dock_icon == Some(false) && s.menu_bar;
        s.sidebar = match self.sidebar_width {
            Some(width) => shell::sidebar_state().with_width(width),
            None => shell::sidebar_state(),
        };
        s.sidebar.set_open(self.sidebar_open.unwrap_or(true));
    }
}

fn name<T: PartialEq>(table: &[(T, &str)], value: T) -> Option<String> {
    table.iter().find(|(v, _)| *v == value).map(|(_, n)| (*n).to_owned())
}

fn value<T: Copy>(table: &[(T, &str)], name: &Option<String>) -> Option<T> {
    table.iter().find(|(_, n)| Some(*n) == name.as_deref()).map(|(v, _)| *v)
}

/// Where the file is and what it last held, kept in the state.
#[derive(Default)]
pub struct Memory {
    /// None in tests and headless snapshots, which must not read or write the real file.
    file: Option<PathBuf>,
    written: Saved,
    /// When the state first differed from what's written.
    changed: Option<f64>,
    framed: bool,
    /// The theme the app was last given.
    applied: Option<Theme>,
    /// Whether the Dock icon was last hidden.
    docked: Option<bool>,
}

fn load(file: &Path) -> Saved {
    std::fs::read(file).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
}

fn save(file: &Path, saved: &Saved) -> std::io::Result<()> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let temp = file.with_extension("json.tmp");
    std::fs::write(&temp, serde_json::to_vec_pretty(saved)?)?;
    std::fs::rename(temp, file)
}

/// Puts the window back as `file` left it, and remembers it there from now on.
pub fn restore(s: &mut State, file: PathBuf) {
    let saved = load(&file);
    saved.apply(s);
    s.memory = Memory { file: Some(file), written: Saved::of(s), changed: None, framed: false, applied: None, docked: None };
}

/// Hands the window's frame to AppKit once it exists, gives the app its theme, Dock icon and menu
/// bar icon, and writes what changed once it settles.
pub fn poll(s: &mut State, now: f64, tx: &mut Tx) {
    if s.memory.file.is_none() {
        return;
    }
    if !s.memory.framed {
        s.memory.framed = rune_mac::remember_frame(WINDOW);
    }
    if s.memory.applied != Some(s.theme) {
        appearance::apply(s.theme);
        s.memory.applied = Some(s.theme);
    }
    if let Some(backend) = &s.backend {
        if s.menu_bar != s.tray.is_some() {
            s.tray = if s.menu_bar { menu_bar::show(backend.ui.clone()) } else { None };
            if s.tray.is_none() {
                s.menu_bar = false;
                s.hide_dock = false;
            }
        }
        if s.memory.docked != Some(s.hide_dock) {
            if !crate::settings::set_dock_icon(s, !s.hide_dock) {
                backend.ui.set_dock_icon(!s.hide_dock);
                if s.hide_dock {
                    backend.ui.focus();
                }
            }
            s.memory.docked = Some(s.hide_dock);
        }
    }
    let current = Saved::of(s);
    if current == s.memory.written {
        s.memory.changed = None;
        return;
    }
    match s.memory.changed {
        None => {
            s.memory.changed = Some(now);
            tx.wake_after(Duration::from_secs_f64(SETTLE));
        }
        Some(at) if now - at >= SETTLE => write(s, current),
        Some(_) => {}
    }
}

/// Writes what hasn't been yet, as the app quits.
pub fn flush(s: &mut State) {
    let current = Saved::of(s);
    if s.memory.file.is_some() && current != s.memory.written {
        write(s, current);
    }
}

fn write(s: &mut State, saved: Saved) {
    let Some(file) = &s.memory.file else {
        return;
    };
    if let Err(e) = save(file, &saved) {
        tracing::warn!("could not remember the window: {e}");
    }
    s.memory.written = saved;
    s.memory.changed = None;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::livestore::library::Tab;

    fn file(name: &str) -> PathBuf {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-state/ui");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join(format!("{name}.json"));
        let _ = std::fs::remove_file(&file);
        file
    }

    fn restored(file: &Path) -> State {
        let mut s = State::default();
        restore(&mut s, file.to_owned());
        s
    }

    #[test]
    fn what_it_writes_comes_back() {
        let file = file("round-trip");
        let mut s = restored(&file);
        s.place = Place::Space("design");
        s.mode = Mode::Feed;
        s.kind = Kind::Videos;
        s.theme = Theme::Dark;
        s.menu_bar = true;
        s.hide_dock = true;
        s.sidebar.set_width(280.0);
        s.sidebar.set_open(false);
        flush(&mut s);
        let back = restored(&file);
        assert_eq!((back.place, back.mode, back.kind, back.theme), (Place::Space("design"), Mode::Feed, Kind::Videos, Theme::Dark));
        assert_eq!((back.sidebar.width(), back.sidebar.is_open()), (280.0, false));
        assert_eq!((back.hide_dock, back.menu_bar), (true, true));
        assert!(!file.with_extension("json.tmp").exists(), "the temporary file is renamed away");
    }

    #[test]
    fn a_missing_or_broken_file_opens_the_defaults() {
        let file = file("broken");
        let fresh = restored(&file);
        assert_eq!((fresh.place, fresh.sidebar.is_open()), (Place::Tab(Tab::Inbox), true));
        std::fs::write(&file, b"{\"place\": 3, ").unwrap();
        let broken = restored(&file);
        assert_eq!((broken.place, broken.mode, broken.sidebar.width()), (Place::Tab(Tab::Inbox), Mode::Grid, shell::sidebar_state().width()));
    }

    #[test]
    fn the_app_never_comes_back_with_neither_a_dock_icon_nor_a_menu_bar_icon() {
        let file = file("hidden");
        std::fs::write(&file, r#"{"dock_icon": false, "menu_bar": false}"#).unwrap();
        let s = restored(&file);
        assert_eq!((s.hide_dock, s.menu_bar), (false, false), "the Dock icon comes back");
    }

    #[test]
    fn unknown_values_fall_back_one_by_one() {
        let file = file("unknown");
        let old =
            r#"{"place": "space:deleted", "mode": "carousel", "kind": "posts", "theme": "sepia", "sidebar_width": 5000, "from_the_future": true}"#;
        std::fs::write(&file, old).unwrap();
        let s = restored(&file);
        assert_eq!((s.place, s.mode, s.kind, s.theme), (Place::Tab(Tab::Inbox), Mode::Grid, Kind::Posts, Theme::System));
        assert_eq!(s.sidebar.width(), s.sidebar.max_width(), "a width out of range is kept inside it");
    }
}
