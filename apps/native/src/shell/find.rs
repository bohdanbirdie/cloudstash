//! ⌘F's find in view, Linear's: a "Find in view…" field takes the toolbar's trailing edge and
//! the page shows only the links every typed word matches as a run of letters, in the page's
//! own order (`search::in_view`). Each card says why it's there: the matched words are marked,
//! and a match the card doesn't show (in a summary, a tag, the URL) takes its summary's place.
//! ↵ keeps the words and hands the keys back to the grid; Esc clears them and puts the field
//! away, and so does leaving it empty.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use rune::{Anim, Cursor, El, Key, KeyEvent, Shadow, TextEdit, Transition, Tx, col, el, icon, row, text, text_input};

use super::{CHEVRON, CLEAR, Look, PAGE_PAD_BOTTOM, PAGE_PAD_TOP, SEARCH, STATES, font};
use crate::State;
use crate::livestore::library::{LinkItem, Tab};
use crate::nav::{self, Place};
use crate::search::{self, Hit};

const FIELD: &str = "find";
/// The page's top and bottom padding together, which the "no matches" block evens out.
const CLEAR_OF_PAGE: f32 = PAGE_PAD_TOP + PAGE_PAD_BOTTOM;

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

/// A link card in the "no matches" drawing: its picture, two title lines and a site row, in the
/// grid's own shapes, `turn` radians off upright. Its corner is concentric with the picture's
/// (5 + the 6-point inset); the shadow is faint in dark, where depth comes from the border.
fn sketch_card(x: f32, turn: f32, lines: [f32; 2], l: &Look) -> El {
    let bar = |w: f32| el().w(w).h(4.0).radius(2.0).fill(l.line2);
    col()
        .pin(Some(x), Some(22.0), None, None)
        .size(60.0, 78.0)
        .padding(6.0)
        .radius(11.0)
        .fill(l.panel)
        .border(1.0, l.line2)
        .box_shadow(Shadow { y: 2.0, blur: 8.0, color: l.shadow, ..Shadow::default() })
        .rotate(turn)
        .child(el().w_full().h(33.0).radius(5.0).fill(l.tile))
        .child(el().h(8.0))
        .child(bar(lines[0]))
        .child(el().h(5.0))
        .child(bar(lines[1]))
        .child(el().h(7.0))
        .child(row().gap(3.0).center_y().child(el().size(4.5, 4.5).radius(2.25).fill(l.line2)).child(el().w(16.0).h(3.0).radius(1.5).fill(l.line2)))
}

/// Two link cards fanned out with a dashed blank one in front, where the match would be.
fn sketch(l: &Look) -> El {
    el().key("find-sketch")
        .size(160.0, 120.0)
        .a11y_hidden()
        .child(sketch_card(22.0, -10f32.to_radians(), [40.0, 28.0], l))
        .child(sketch_card(78.0, 10f32.to_radians(), [38.0, 22.0], l))
        .child(el().pin(Some(50.0), Some(16.0), None, None).size(60.0, 82.0).radius(11.0).fill(l.panel).border(1.2, l.fg3).border_dash(3.0, 4.0))
}

/// The first other page whose links the words match, and how many, in sidebar order with All
/// links last, as it repeats the others.
fn elsewhere(s: &State) -> Option<(Tab, &'static str, usize)> {
    let hits = hits(s)?;
    let Place::Tab(here) = s.place else { return None };
    let count = |tab: Tab| tab.links(&s.links).iter().filter(|l| hits.contains_key(&l.id)).count();
    STATES
        .iter()
        .filter(|(t, ..)| *t != here && *t != Tab::All)
        .chain(STATES.iter().filter(|(t, ..)| *t == Tab::All && here != Tab::All))
        .map(|(t, name, _)| (*t, *name, count(*t)))
        .find(|(.., n)| *n > 0)
}

/// Goes to `tab` with the same words in the field, as the "2 in Done" link does.
fn search_in(s: &mut State, tab: Tab, tx: &mut Tx) {
    let words = s.find.take().map(|f| f.text.clone());
    nav::go(s, Place::Tab(tab), tx);
    s.find = words.map(TextEdit::new);
}

/// A quiet text button: a 28-point plate shows on hover, but the whole 40-point row takes
/// the click, so the target is generous while the page stays calm.
fn text_button(key: &str, label: El, l: &Look) -> El {
    row()
        .key(key.to_owned())
        .role("button")
        .h(40.0)
        .px(10.0)
        .center_y()
        .hover_group()
        .press_scale(0.96)
        .cursor(Cursor::Pointer)
        .child(el().pin(Some(0.0), Some(6.0), Some(0.0), Some(6.0)).radius(8.0).fill(l.hover).group_opacity(0.0, 1.0))
        .child(label)
}

/// The page when the field's words match none of its links: the drawing, what was searched for
/// and where, what the search looks at, then the way on: the next page with matches, and clearing
/// the search. Its middle is the middle of the page in view, `height` tall: the page's
/// padding is cancelled, and the heavy drawing above lifts it no further.
pub fn empty(s: &State, page: &str, height: f32, l: &Look) -> Option<El> {
    let query = query(s)?;
    let title = format!("No links in {page} match “{query}”");
    let mut actions = row().key("find-empty-actions").gap(4.0).center_y();
    if let Some((tab, name, n)) = elsewhere(s) {
        let label = row()
            .gap(4.0)
            .center_y()
            .child(text(format!("{n} in {name}")).font(font(12.5, 500.0)).color(l.fg))
            .child(icon(&CHEVRON, 12.0).color(l.fg2));
        actions = actions.child(
            text_button("find-elsewhere", label, l)
                .label(format!("Search {name}"))
                .on_press_tx(move |s: &mut State, tx: &mut Tx| search_in(s, tab, tx)),
        );
    }
    let clear = row()
        .gap(6.0)
        .center_y()
        .child(text("Clear search").font(font(12.5, 400.0)).color(l.fg2))
        .child(text("esc").font(font(11.5, 400.0)).color(l.fg3));
    actions = actions.child(text_button("find-empty-clear", clear, l).label("Clear search").on_press_tx(close));
    Some(
        col()
            .key("find-empty")
            .w_full()
            .h((height - CLEAR_OF_PAGE).max(320.0))
            .pt(CLEAR_OF_PAGE - 2.0 * PAGE_PAD_TOP)
            .center()
            .child(sketch(l))
            .child(el().h(20.0))
            .child(text(title).font(font(14.0, 500.0).lh(20.0)).color(l.fg).wrap_anywhere().max_lines(2).align(rune::Align::Center).max_w(440.0))
            .child(el().h(4.0))
            .child(text("Searched titles, summaries, tags and addresses").font(font(12.5, 400.0)).color(l.fg3).align(rune::Align::Center))
            .child(el().h(8.0))
            .child(actions),
    )
}

fn on_key(s: &mut State, e: &KeyEvent, tx: &mut Tx) -> bool {
    match e.key {
        Key::Escape => close(s, tx),
        Key::Enter => tx.blur(),
        _ => return false,
    }
    true
}

/// ✕: the words go and the field keeps the keys, as a Mac search field's clear button does.
fn clear(s: &mut State, tx: &mut Tx) {
    tx.instant();
    s.find = Some(TextEdit::default());
    tx.focus(FIELD, false);
}

/// The field, while it's open, searching `page`, with ✕ once it has words. It appears in its
/// place, out of a blur and a fade, rather than travelling in from the toolbar's edge; it goes
/// at once, however it closes (Esc, or leaving it empty for another page), as a key used this
/// often should.
pub fn field(s: &State, page: &str, l: &Look) -> Option<El> {
    let edit = s.find.as_ref()?;
    let input = text_input(edit, font(12.5, 400.0))
        .key(FIELD)
        .single_line()
        .placeholder(format!("Search {page}…"), l.fg3)
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
            .transition_motion(Transition::blur(4.0).springs.enter, Anim::INSTANT)
            .enter_in_instant()
            .child(icon(&SEARCH, 14.0).color(l.fg3))
            .child(input)
            .children(query(s).map(|_| {
                row()
                    .key("find-clear")
                    .role("button")
                    .label("Clear")
                    .size(20.0, 20.0)
                    .mr(-4.0)
                    .center()
                    .radius(5.0)
                    .hover(l.hover)
                    .cursor(Cursor::Pointer)
                    .child(icon(&CLEAR, 14.0).color(l.fg2))
                    .on_press_tx(clear)
            })),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

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
    }
}
