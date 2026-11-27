//! ⌘F's find in view, Linear's: a "Find in view…" field takes the toolbar's trailing edge and
//! the page shows only the links every typed word matches as a run of letters, in the page's
//! own order (`search::in_view`). Each card says why it's there: the matched words are marked,
//! and a match the card doesn't show (in a summary, a tag, the URL) takes its summary's place.
//! ↵ keeps the words and hands the keys back to the grid; Esc clears them and puts the field
//! away, and so does leaving it empty.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use rune::{El, Key, KeyEvent, Shadow, TextEdit, Transition, Tx, icon, row, text_input};

use super::{Look, SEARCH, font};
use crate::State;
use crate::livestore::library::LinkItem;
use crate::search::{self, Hit};

const FIELD: &str = "find";

/// ⌘F: the field opens, or takes the keys again with its words selected, as a Mac app's find does.
pub fn open(s: &mut State, tx: &mut Tx) {
    tx.instant();
    s.find.get_or_insert_with(TextEdit::default);
    tx.focus(FIELD, false);
    tx.select_all_text(FIELD);
}

pub fn close(s: &mut State, tx: &mut Tx) {
    tx.instant();
    s.find = None;
}

/// What the field narrows the page to, when it has words.
fn query(s: &State) -> Option<&str> {
    s.find.as_ref().map(|f| f.text.trim()).filter(|q| !q.is_empty())
}

/// The query and the library's links' address and length.
type FoundFor = (String, usize, usize);

/// Hits by link id.
type Hits = Rc<HashMap<String, Hit>>;

thread_local! {
    /// The last query's hits by link id, and what it ran over: the query and the library's
    /// links' address and length, as each sync replaces them. A rebuild that changes none of
    /// these doesn't search again.
    static FOUND: RefCell<Option<(FoundFor, Hits)>> = const { RefCell::new(None) };
}

/// The field's hits over the whole library, by link id, while it has words.
pub fn hits(s: &State) -> Option<Hits> {
    let query = query(s)?;
    let key = (query.to_owned(), s.links.as_ptr() as usize, s.links.len());
    let found = FOUND.with_borrow(|f| f.as_ref().filter(|(k, _)| *k == key).map(|(_, hits)| Rc::clone(hits)));
    Some(found.unwrap_or_else(|| {
        let all: Vec<&LinkItem> = s.links.iter().collect();
        let hits: Hits = Rc::new(search::in_view(&all, query).into_iter().map(|h| (h.link.id.clone(), h)).collect());
        FOUND.set(Some((key, Rc::clone(&hits))));
        hits
    }))
}

/// `links`, a page's, narrowed to those the field's words match.
pub fn narrow<'a>(s: &State, links: Vec<&'a LinkItem>) -> Vec<&'a LinkItem> {
    let Some(hits) = hits(s) else { return links };
    links.into_iter().filter(|l| hits.contains_key(&l.id)).collect()
}

/// The words nothing on the page matches, for the empty page to say so.
pub fn missed(s: &State) -> Option<String> {
    query(s).map(|q| format!("No links match “{q}”"))
}

fn on_key(s: &mut State, e: &KeyEvent, tx: &mut Tx) -> bool {
    match e.key {
        Key::Escape => close(s, tx),
        Key::Enter => tx.blur(),
        _ => return false,
    }
    true
}

/// The field, while it's open. It appears in its place, out of a blur and a fade, rather than
/// travelling in from the toolbar's edge; it goes at once, as a key used this often should.
pub fn field(s: &State, l: &Look) -> Option<El> {
    let edit = s.find.as_ref()?;
    let input = text_input(edit, font(12.5, 400.0))
        .key(FIELD)
        .single_line()
        .placeholder("Find in view…", l.fg3)
        .color(l.fg)
        .grow(1.0)
        .min_w(0.0)
        .on_edit(|s: &mut State| s.find.get_or_insert_with(TextEdit::default))
        .on_input_key(on_key)
        .on_focus_change(|s: &mut State, focused, tx: &mut Tx| {
            if !focused && query(s).is_none() {
                close(s, tx);
            }
        });
    let ring = if edit.focused { l.accent } else { l.line2 };
    Some(
        row()
            .key("find-box")
            .w(220.0)
            .h(28.0)
            .px(8.0)
            .mr(6.0)
            .gap(6.0)
            .center_y()
            .radius(7.0)
            .box_shadow(Shadow { spread: 1.0, color: ring, ..Shadow::default() })
            .transition(Transition::blur(4.0))
            .enter_in_instant()
            .child(icon(&SEARCH, 14.0).color(l.fg3))
            .child(input),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::livestore::library::Tab;

    fn link(id: &str, title: &str, status: &str, created_at: i64) -> LinkItem {
        LinkItem {
            id: id.to_owned(),
            title: title.to_owned(),
            url: format!("https://example.com/{id}"),
            domain: "example.com".to_owned(),
            image: None,
            favicon: None,
            description: None,
            summary: None,
            tags: Vec::new(),
            status: status.to_owned(),
            created_at,
            completed_at: None,
            deleted_at: None,
        }
    }

    #[test]
    fn the_field_keeps_the_pages_links_its_words_match_in_the_pages_order() {
        let mut s = State {
            links: vec![
                link("a", "Calm interfaces", "unread", 3),
                link("b", "Rust in production", "unread", 2),
                link("c", "Designing calm tools", "unread", 1),
                link("d", "Calm, done", "completed", 4),
            ],
            ..State::default()
        };
        let ids = |s: &State| narrow(s, Tab::Inbox.links(&s.links)).iter().map(|l| l.id.clone()).collect::<Vec<_>>();
        assert_eq!(ids(&s), ["a", "b", "c"], "closed, the page is whole");
        s.find = Some(TextEdit::new("  "));
        assert_eq!(ids(&s), ["a", "b", "c"], "no words, nothing narrowed");
        s.find = Some(TextEdit::new("calm"));
        assert_eq!(ids(&s), ["a", "c"], "only the page's links, in its order");
        s.find = Some(TextEdit::new("calm rust"));
        assert!(ids(&s).is_empty(), "every word must match");
        assert_eq!(missed(&s).as_deref(), Some("No links match “calm rust”"));
    }
}
