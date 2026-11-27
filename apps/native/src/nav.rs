//! Where the window is. [`Place`] says which page shows and [`go`] is the one way to change it,
//! so a click, the palette, a shortcut, a menu item or another thread (through
//! `AppHandle::update`) all navigate the same way. Rune draws from state, so there's no router
//! beyond this.

use rune::Tx;

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

/// Shows `place`, closing the palette, the find field and any link shown over the page: a
/// search was for the page it was typed on. The page swaps at
/// once, as a Mac sidebar does: a fade would cross the two pages' cards, and the old page's
/// extra rows would linger over the new one's empty space.
pub fn go(s: &mut State, place: Place, tx: &mut Tx) {
    tx.instant();
    s.place = place;
    s.palette = None;
    s.find = None;
    s.preview = None;
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
    fn going_somewhere_shows_it_and_closes_the_palette_and_the_search() {
        let mut s = State::default();
        assert_eq!(s.place, Place::Tab(Tab::Inbox));
        shell::toggle_palette(&mut s);
        s.find = Some(rune::TextEdit::new("rust"));
        go(&mut s, Place::Space("design"), &mut Tx::default());
        assert_eq!(s.place, Place::Space("design"));
        assert!(s.palette.is_none());
        assert!(s.find.is_none(), "a search was for the page it was typed on");
    }
}
