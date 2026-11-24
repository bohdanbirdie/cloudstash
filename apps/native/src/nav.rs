//! Where the window is. [`Place`] says which page shows and [`go`] is the one way to change it,
//! so a click, the palette, a shortcut, a menu item or another thread (through
//! `AppHandle::update`) all navigate the same way. Rune draws from state, so there's no router
//! beyond this.

use crate::State;
use crate::livestore::library::Tab;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Place {
    /// One of the library's states: inbox, done, archive or all links.
    Tab(Tab),
    /// A space in the sidebar, by its id.
    Space(&'static str),
}

impl Place {
    /// Its name in `ui.json`: `inbox`, `done`, `archive`, `all` or `space:<id>`.
    pub fn name(self) -> String {
        match self {
            Place::Tab(Tab::Inbox) => "inbox".to_owned(),
            Place::Tab(Tab::Completed) => "done".to_owned(),
            Place::Tab(Tab::Archive) => "archive".to_owned(),
            Place::Tab(Tab::All) => "all".to_owned(),
            Place::Space(id) => format!("space:{id}"),
        }
    }

    /// The place `name` names, if it still exists.
    pub fn named(name: &str) -> Option<Place> {
        match name {
            "inbox" => Some(Place::Tab(Tab::Inbox)),
            "done" => Some(Place::Tab(Tab::Completed)),
            "archive" => Some(Place::Tab(Tab::Archive)),
            "all" => Some(Place::Tab(Tab::All)),
            _ => name.strip_prefix("space:").and_then(crate::shell::space).map(Place::Space),
        }
    }
}

impl Default for Place {
    fn default() -> Self {
        Place::Tab(Tab::Inbox)
    }
}

/// Shows `place`, closing the palette if it's open over the page.
pub fn go(s: &mut State, place: Place) {
    s.place = place;
    s.palette = None;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shell;

    #[test]
    fn every_place_reads_back_from_its_name() {
        for place in [Tab::Inbox, Tab::Completed, Tab::Archive, Tab::All].map(Place::Tab).into_iter().chain([Place::Space("design")]) {
            assert_eq!(Place::named(&place.name()), Some(place));
        }
        assert_eq!(Place::named("space:gone"), None);
        assert_eq!(Place::named("Inbox"), None);
    }

    #[test]
    fn going_somewhere_shows_it_and_closes_the_palette() {
        let mut s = State::default();
        assert_eq!(s.place, Place::Tab(Tab::Inbox));
        shell::toggle_palette(&mut s);
        go(&mut s, Place::Space("design"));
        assert_eq!(s.place, Place::Space("design"));
        assert!(s.palette.is_none());
    }
}
