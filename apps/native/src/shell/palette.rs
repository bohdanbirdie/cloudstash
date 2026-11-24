//! The ⌘K command palette, after Raycast and cmdk: one search field over a single list of
//! commands and links, grouped so the consequence of ↵ is obvious, and a footer naming it. ↵
//! opens a link in the browser or runs a command. It opens with a quick fade and a slight scale,
//! closes with a shorter fade, and moving the selection lands at once: no highlight fade, no
//! scroll glide.

use std::cell::{Cell, RefCell};
use std::ops::Range;
use std::rc::Rc;

use rune::{
    Color, Cursor, El, Icon, Key, KeyEvent, PointerEvent, ScrollSpec, Shadow, Span, Spring, SpringPair, SurfaceFit, TextEdit, Transition, Tx, col,
    el, icon, oklcha, rich, row, text, text_input,
};

use super::{ALL, ARCHIVE, DONE, FAVICON, FEED, GRID, INBOX, Look, Mode, RESET, RETURN, SEARCH, SIGN_OUT, font, scroll_bar};
use rune_kit::ScrollBar;

use crate::State;
use crate::images::{self, Lane, Request};
use crate::livestore::library::{LinkItem, Tab};
use crate::search::{self, Evidence, Field, Hit};

/// Links shown for a query at most; typing narrows them.
const LIMIT: usize = 50;
/// Links shown before anything is typed.
const RECENT: usize = 8;
const ROW_H: f32 = 40.0;
/// A row with a second line saying why it's listed.
const ROW_H_EVIDENCE: f32 = 54.0;
/// The list's inset and the rows' radius, so the panel's corner is concentric with theirs.
const INSET: f32 = 6.0;
const ROW_R: f32 = 8.0;
const LIST_H: f32 = 360.0;
/// In over 150 ms, out over 100 ms, without bounce: it's summoned many times a day.
const OPEN: SpringPair = SpringPair::new(Spring::new(0.15, 0.0), Spring::new(0.1, 0.0));

#[derive(Clone, Debug, Default)]
pub struct Palette {
    query: TextEdit,
    sel: usize,
    /// The query `sel` was picked for: a new query starts back at the top.
    sel_for: String,
    /// Where the pointer last was over a row, in window points. Rows report the pointer moving
    /// while the list scrolls under a still one; only a real move picks a row.
    pointer: Cell<Option<(f32, f32)>>,
}

impl Palette {
    /// A palette already showing `query` with row `sel` picked, for snapshot scenes.
    pub fn showing(query: &str, sel: usize) -> Palette {
        Palette { query: TextEdit::new(query), sel, sel_for: query.to_owned(), pointer: Cell::new(None) }
    }

    fn selected(&self, count: usize) -> usize {
        if self.sel_for == self.query.text { self.sel.min(count.saturating_sub(1)) } else { 0 }
    }
}

pub fn toggle(s: &mut State) {
    s.palette = if s.palette.is_some() { None } else { Some(Palette::default()) };
}

#[derive(Clone, Copy)]
struct Command {
    name: &'static str,
    glyph: &'static Icon,
    run: fn(&mut State),
}

#[derive(Clone)]
enum Item {
    Link(Box<Hit>),
    /// A command and the letters of its name that matched.
    Command(Command, Vec<Range<usize>>),
}

struct Entry {
    group: &'static str,
    item: Item,
}

fn go(s: &mut State, tab: Tab) {
    s.space = None;
    s.tab = tab;
}

fn commands(s: &State) -> [(&'static str, Command); 7] {
    let mode = match s.mode {
        Mode::Grid => Command { name: "Show as feed", glyph: &FEED, run: |s| s.mode = Mode::Feed },
        Mode::Feed => Command { name: "Show as grid", glyph: &GRID, run: |s| s.mode = Mode::Grid },
    };
    [
        ("Go to", Command { name: "Inbox", glyph: &INBOX, run: |s| go(s, Tab::Inbox) }),
        ("Go to", Command { name: "Done", glyph: &DONE, run: |s| go(s, Tab::Completed) }),
        ("Go to", Command { name: "Archive", glyph: &ARCHIVE, run: |s| go(s, Tab::Archive) }),
        ("Go to", Command { name: "All links", glyph: &ALL, run: |s| go(s, Tab::All) }),
        ("Actions", mode),
        ("Actions", Command { name: "Clear picture cache", glyph: &RESET, run: |_| images::reset() }),
        ("Actions", Command { name: "Sign out", glyph: &SIGN_OUT, run: crate::sign_out }),
    ]
}

/// The query, the library's links' address and length, and the view mode.
type FoundFor = (String, usize, usize, Mode);

thread_local! {
    /// The last entries and what they were found for: the query, the library (its links' address
    /// and length, as each sync replaces them) and the view mode the commands name. A rebuild
    /// that changes none of these (a new selection, a scroll) doesn't search again.
    static FOUND: RefCell<Option<(FoundFor, Rc<Vec<Entry>>)>> = const { RefCell::new(None) };
}

fn entries(s: &State, query: &str) -> Rc<Vec<Entry>> {
    let key = (query.to_owned(), s.links.as_ptr() as usize, s.links.len(), s.mode);
    if let Some(found) = FOUND.with_borrow(|f| f.as_ref().filter(|(k, _)| *k == key).map(|(_, e)| Rc::clone(e))) {
        return found;
    }
    let found = Rc::new(find(s, query));
    FOUND.set(Some((key, Rc::clone(&found))));
    found
}

/// Nothing typed: every command, then the newest links. A query: the commands it names, then
/// the links it finds, best first.
fn find(s: &State, query: &str) -> Vec<Entry> {
    if query.trim().is_empty() {
        let recent =
            Tab::All.links(&s.links).into_iter().take(RECENT).map(|l| Entry { group: "Recently saved", item: Item::Link(Box::new(Hit::plain(l))) });
        return commands(s).into_iter().map(|(group, c)| Entry { group, item: Item::Command(c, Vec::new()) }).chain(recent).collect();
    }
    let mut named: Vec<(u32, Command, Vec<Range<usize>>)> =
        commands(s).into_iter().filter_map(|(_, c)| search::name(c.name, query).map(|(n, marks)| (n, c, marks))).collect();
    named.sort_by_key(|(n, ..)| std::cmp::Reverse(*n));
    let named = named.into_iter().map(|(_, c, marks)| Entry { group: "Commands", item: Item::Command(c, marks) });
    let links = search::links(&Tab::All.links(&s.links), query, LIMIT).into_iter().map(|h| Entry { group: "Links", item: Item::Link(Box::new(h)) });
    named.chain(links).collect()
}

fn select(s: &mut State, i: usize, tx: &mut Tx) {
    let Some(p) = &mut s.palette else { return };
    p.sel = i;
    p.sel_for = p.query.text.clone();
    tx.scroll_into_view(format!("palette-row-{i}"));
}

/// The pointer moved onto row `i`: it's picked, as a key would, but nothing scrolls. Rows also
/// hear of the pointer while the list scrolls under it standing still, and the first report
/// after opening only says where it is; neither picks anything, so rows don't light up one
/// after another as they pass.
fn point(s: &mut State, i: usize, at: PointerEvent, tx: &mut Tx) {
    let Some(p) = &mut s.palette else { return };
    let at = (at.window_x, at.window_y);
    let moved = p.pointer.replace(Some(at)).is_some_and(|last| last != at);
    if !moved || p.sel == i && p.sel_for == p.query.text {
        return tx.live_only();
    }
    tx.instant();
    p.sel = i;
    p.sel_for = p.query.text.clone();
}

/// ↵ (with or without ⌘) opens a link in the browser or runs a command.
fn activate(s: &mut State, item: &Item) {
    s.palette = None;
    match item {
        Item::Link(hit) => crate::open_link(&hit.link.url),
        Item::Command(c, _) => (c.run)(s),
    }
}

fn on_key(s: &mut State, e: &KeyEvent, tx: &mut Tx) -> bool {
    let Some(p) = &s.palette else { return false };
    let found = entries(s, &p.query.text);
    let sel = p.selected(found.len());
    match &e.key {
        Key::Down if !found.is_empty() => {
            tx.instant();
            select(s, (sel + 1).min(found.len() - 1), tx)
        }
        Key::Up => {
            tx.instant();
            select(s, sel.saturating_sub(1), tx)
        }
        Key::Enter => {
            if let Some(entry) = found.get(sel) {
                activate(s, &entry.item);
            }
        }
        Key::Escape => s.palette = None,
        _ => return false,
    }
    true
}

/// A favicon, or the domain's initial when there's none or it can't be loaded, with the hairline outline pictures get.
fn favicon(link: &LinkItem, l: &Look) -> El {
    let outline = if l.dark { oklcha(1.0, 0.0, 0.0, 0.1) } else { oklcha(0.0, 0.0, 0.0, 0.1) };
    let tile = row().size(16.0, 16.0).center().radius(4.0).fill(l.tile);
    let tile = match link.favicon.as_deref().map(|url| Request::new(url, FAVICON, Lane::Icon)).filter(|r| !images::failed(r)) {
        Some(req) => tile.pixels_fit(&images::picture(&req), SurfaceFit::Fill),
        None => {
            let initial: String = link.domain.chars().take(1).flat_map(char::to_uppercase).collect();
            tile.child(text(initial).font(font(9.0, 600.0)).color(l.fg2))
        }
    };
    tile.child(el().pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0)).radius(4.0).border(1.0, outline))
}

/// `content` with its matched letters drawn in `strong` at weight 600.
fn marked(content: &str, marks: &[Range<usize>], size: f32, color: Color, strong: Color) -> El {
    let spans = marks.iter().map(|r| Span::new(r.start, r.end).weight(600.0).color(strong)).collect();
    rich(content, spans).font(font(size, 400.0)).color(color).truncate()
}

/// Why a link is listed when the match isn't in its title or domain: the field, then the
/// stretch of it that matched.
fn evidence(e: &Evidence, l: &Look) -> El {
    let label = match e.field {
        Field::Tag => "Tagged",
        Field::Description => "Description",
        Field::Summary => "Summary",
        _ => "URL",
    };
    let at = label.len() + 1;
    let content = format!("{label} {}", e.text);
    let spans = std::iter::once(Span::new(0, label.len()).weight(500.0))
        .chain(e.marks.iter().map(|r| Span::new(r.start + at, r.end + at).weight(600.0).color(l.fg2)))
        .collect();
    rich(content, spans).font(font(12.0, 400.0)).color(l.fg3).truncate().min_w(0.0)
}

fn entry_row(i: usize, entry: &Entry, on: bool, l: &Look) -> El {
    let (lead, label, body, trail) = match &entry.item {
        Item::Link(hit) => {
            let title = marked(&hit.title, &hit.title_marks, 13.5, l.fg, l.fg).min_w(0.0);
            let body = match &hit.evidence {
                Some(e) => col().gap(2.0).child(title).child(evidence(e, l)),
                None => col().child(title),
            };
            (favicon(&hit.link, l), hit.title.clone(), body, Some(marked(&hit.link.domain, &hit.domain_marks, 12.0, l.fg3, l.fg2).max_w(180.0)))
        }
        Item::Command(c, marks) => {
            let glyph = row().size(16.0, 16.0).center().child(icon(c.glyph, 16.0).color(if on { l.fg } else { l.fg2 }));
            (glyph, c.name.to_owned(), col().child(marked(c.name, marks, 13.5, l.fg, l.fg)), None)
        }
    };
    let two_lines = matches!(&entry.item, Item::Link(h) if h.evidence.is_some());
    let item = entry.item.clone();
    let r = row()
        .key(format!("palette-row-{i}"))
        .role("option")
        .label(label)
        .w_full()
        .h(if two_lines { ROW_H_EVIDENCE } else { ROW_H })
        .px(10.0)
        .gap(10.0)
        .center_y()
        .radius(ROW_R)
        .cursor(Cursor::Pointer)
        .child(lead)
        .child(body.grow(1.0).min_w(0.0))
        .children(trail)
        .on_pointer_move_local(move |s: &mut State, at, tx: &mut Tx| point(s, i, at, tx))
        .on_press(move |s: &mut State| activate(s, &item));
    if on { r.fill(l.active) } else { r }
}

/// A key cap: square for one glyph. Return is drawn, since the UI font's ↵ is a tiny fallback.
fn cap(key: &str, l: &Look) -> El {
    let cap = row().h(20.0).min_w(20.0).px(4.0).center().radius(5.0).fill(l.hover);
    match key {
        "↵" => cap.child(icon(&RETURN, 12.0).color(l.fg2)),
        _ => cap.child(text(key).font(font(12.0, 500.0)).color(l.fg2)),
    }
}

fn hint(label: &str, keys: &[&str], l: &Look) -> El {
    keys.iter().fold(row().gap(4.0).center_y().child(text(label).font(font(12.0, 400.0)).color(l.fg3).mr(2.0)), |r, k| r.child(cap(k, l)))
}

/// The panel's lift: a hairline ring, then a soft drop in light mode.
fn lifted(e: El, l: &Look) -> El {
    let ring = if l.dark { oklcha(1.0, 0.0, 0.0, 0.12) } else { oklcha(0.0, 0.0, 0.0, 0.08) };
    let e = e.box_shadow(Shadow { spread: 1.0, color: ring, ..Shadow::default() });
    let (near, far): (Color, Color) =
        if l.dark { (oklcha(0.0, 0.0, 0.0, 0.3), oklcha(0.0, 0.0, 0.0, 0.5)) } else { (oklcha(0.0, 0.0, 0.0, 0.06), oklcha(0.0, 0.0, 0.0, 0.16)) };
    e.box_shadow(Shadow { y: 2.0, blur: 6.0, color: near, ..Shadow::default() }).box_shadow(Shadow {
        y: 16.0,
        blur: 48.0,
        color: far,
        ..Shadow::default()
    })
}

/// The scrim and the palette over the window, while it's open.
pub fn layers(s: &State, l: &Look) -> Vec<El> {
    let Some(p) = &s.palette else { return Vec::new() };
    let found = entries(s, &p.query.text);
    let sel = p.selected(found.len());
    let line = || el().w_full().h(1.0).fill(l.line);

    let field = text_input(&p.query, font(15.0, 400.0))
        .key("palette-query")
        .single_line()
        .placeholder("Search links and commands…", l.fg3)
        .color(l.fg)
        .grow(1.0)
        .min_w(0.0)
        .on_edit(|s: &mut State| &mut s.palette.get_or_insert_with(Palette::default).query)
        .on_input_key(on_key);
    let input = row().w_full().h(52.0).px(16.0).gap(10.0).center_y().child(icon(&SEARCH, 16.0).color(l.fg3)).child(field);

    let mut list = col().key("palette-list").w_full().grow(1.0).min_h(0.0).scroll(ScrollSpec { stick_bottom: false }).padding(INSET).gap(1.0);
    let mut heading = None;
    for (i, entry) in found.iter().enumerate() {
        if heading != Some(entry.group) {
            let top = if heading.is_none() { 4.0 } else { 12.0 };
            list = list.child(text(entry.group).font(font(11.5, 500.0)).color(l.fg3).px(10.0).pt(top).pb(4.0));
            heading = Some(entry.group);
        }
        list = list.child(entry_row(i, entry, i == sel, l));
    }
    if found.is_empty() {
        list = list.child(
            row().w_full().h_full().center().child(text(format!("No results for “{}”", p.query.text.trim())).font(font(13.0, 400.0)).color(l.fg3)),
        );
    }

    let action = match found.get(sel).map(|e| &e.item) {
        Some(Item::Link(_)) => vec![hint("Open link", &["↵"], l)],
        Some(Item::Command(..)) => vec![hint("Run", &["↵"], l)],
        None => vec![hint("Close", &["esc"], l)],
    };
    let footer = row().w_full().h(40.0).px(12.0).gap(16.0).center_y().child(el().grow(1.0)).children(action);

    let panel = col()
        .key("palette")
        .role("dialog")
        .label("Command palette")
        .w_full()
        .max_w(640.0)
        .radius(INSET + ROW_R)
        .clip_rounded(INSET + ROW_R)
        .fill(l.panel)
        .child(input)
        .child(line())
        .child(col().w_full().h(LIST_H).child(list.scroll_bar_styled(scroll_bar(l))))
        .child(line())
        .child(footer);
    let panel = lifted(panel, l).modal(true, |s: &mut State| s.palette = None);
    vec![
        el().key("palette-scrim")
            .absolute(0.0, 0.0)
            .w_full()
            .h_full()
            .fill(oklcha(0.0, 0.0, 0.0, if l.dark { 0.3 } else { 0.08 }))
            .transition(Transition::opacity().springs(OPEN))
            .a11y_hidden(),
        col()
            .key("palette-layer")
            .absolute(0.0, 0.0)
            .w_full()
            .h_full()
            .px(16.0)
            .pt(96.0)
            .items_center()
            .transition(Transition::asymmetric(Transition::scale_anchor(0.96, rune::Vec2::new(0.5, 0.15)), Transition::opacity()).springs(OPEN))
            .child(panel),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn link(id: &str, title: &str, url: &str, created_at: i64) -> LinkItem {
        LinkItem {
            id: id.to_owned(),
            title: title.to_owned(),
            url: url.to_owned(),
            domain: url::Url::parse(url).unwrap().host_str().unwrap().to_owned(),
            image: None,
            favicon: None,
            description: None,
            summary: None,
            tags: Vec::new(),
            status: "unread".to_owned(),
            created_at,
            completed_at: None,
            deleted_at: None,
        }
    }

    #[test]
    fn commands_come_first_and_a_query_keeps_only_those_it_names() {
        let s = State { links: vec![link("a", "Inbox zero, a guide", "https://a.dev/x", 1)], ..State::default() };
        let groups = |q: &str| entries(&s, q).iter().map(|e| e.group).collect::<Vec<_>>();
        assert_eq!(groups(""), ["Go to", "Go to", "Go to", "Go to", "Actions", "Actions", "Actions", "Recently saved"]);
        assert_eq!(groups("inbox"), ["Commands", "Links"]);
        assert!(groups("nothing like this").is_empty());
    }
}
