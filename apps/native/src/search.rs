//! Ranked search over the library, in memory on every keystroke: the library is small enough
//! that every field of every link is matched each time, with no index to keep in step with sync.
//!
//! Each word typed must match somewhere in a link: fuzzily in its title, tags or domain (letters
//! in order, gaps allowed, word starts ranked first), or as a run of letters in its description,
//! summary or URL, where fuzzy matches would be scattered noise. A word scores by how well it
//! matched times how telling the field is, and a link by the sum. A hit says which letters of the
//! title and domain matched and, when a word matched elsewhere, where: the evidence the palette
//! shows under the title.

use std::ops::Range;

use nucleo_matcher::pattern::{Atom, AtomKind, CaseMatching, Normalization};
use nucleo_matcher::{Config, Matcher, Utf32Str};

use crate::livestore::library::LinkItem;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Field {
    Title,
    Tag,
    Domain,
    Description,
    Summary,
    Url,
}

impl Field {
    /// How much a match here says about the link.
    fn weight(self) -> u32 {
        match self {
            Field::Title => 8,
            Field::Tag => 6,
            Field::Domain => 4,
            Field::Description | Field::Summary => 3,
            Field::Url => 2,
        }
    }

    fn kind(self) -> AtomKind {
        match self {
            Field::Title | Field::Tag | Field::Domain => AtomKind::Fuzzy,
            Field::Description | Field::Summary | Field::Url => AtomKind::Substring,
        }
    }
}

/// Where a word matched outside the title and domain: the field and the stretch of it to show,
/// with the matched letters.
#[derive(Clone, Debug, PartialEq)]
pub struct Evidence {
    pub field: Field,
    pub text: String,
    pub marks: Vec<Range<usize>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Hit {
    pub link: LinkItem,
    /// The title on one line, as matched and shown, and its matched letters.
    pub title: String,
    pub title_marks: Vec<Range<usize>>,
    pub domain_marks: Vec<Range<usize>>,
    pub evidence: Option<Evidence>,
}

impl Hit {
    /// A link shown with nothing typed: no marks, no evidence.
    pub fn plain(link: &LinkItem) -> Hit {
        Hit { link: link.clone(), title: one_line(&link.title), title_marks: Vec::new(), domain_marks: Vec::new(), evidence: None }
    }
}

/// Text on one line: an X post's title keeps the post's line breaks.
pub fn one_line(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Letters shown before the first match in a long field, so it reads in context.
const LEAD: usize = 24;

struct Search {
    matcher: Matcher,
    /// Each word as a fuzzy and as a run-of-letters pattern, made once per search.
    words: Vec<[Atom; 2]>,
    buf: Vec<char>,
    indices: Vec<u32>,
}

impl Search {
    fn new(query: &str) -> Option<Search> {
        let atom = |w: &str, kind| Atom::new(w, CaseMatching::Ignore, Normalization::Smart, kind, false);
        let words: Vec<[Atom; 2]> = query.split_whitespace().map(|w| [atom(w, AtomKind::Fuzzy), atom(w, AtomKind::Substring)]).collect();
        (!words.is_empty()).then(|| Search { matcher: Matcher::new(Config::DEFAULT), words, buf: Vec::new(), indices: Vec::new() })
    }

    /// Word `w` in `text` as `field` matches it: the weighted score and, with `marks`, the
    /// matched byte ranges. A fuzzy match always works out its letters, to judge them.
    fn find(&mut self, w: usize, text: &str, field: Field, marks: bool) -> Option<(u32, Vec<Range<usize>>)> {
        let fuzzy = field.kind() == AtomKind::Fuzzy;
        let atom = &self.words[w][usize::from(!fuzzy)];
        let hay = Utf32Str::new(text, &mut self.buf);
        if !fuzzy && !marks {
            return atom.score(hay, &mut self.matcher).map(|n| (u32::from(n) * field.weight(), Vec::new()));
        }
        self.indices.clear();
        let score = atom.indices(hay, &mut self.matcher, &mut self.indices)?;
        self.indices.sort_unstable();
        self.indices.dedup();
        let found = ranges(text, &self.buf, &self.indices);
        (!fuzzy || word_like(text, &found)).then(|| (u32::from(score) * field.weight(), found))
    }
}

/// Byte ranges of the matched characters, merged where they touch. Matching counts grapheme
/// clusters; where those aren't single characters (some emoji) nothing is marked.
fn ranges(text: &str, buf: &[char], indices: &[u32]) -> Vec<Range<usize>> {
    let starts: Vec<usize> = if text.is_ascii() {
        (0..text.len()).collect()
    } else if text.chars().count() == buf.len() {
        text.char_indices().map(|(i, _)| i).collect()
    } else {
        return Vec::new();
    };
    let mut out: Vec<Range<usize>> = Vec::new();
    for &i in indices {
        let Some(&start) = starts.get(i as usize) else { continue };
        let end = start + text[start..].chars().next().map_or(0, char::len_utf8);
        match out.last_mut() {
            Some(last) if last.end == start => last.end = end,
            _ => out.push(start..end),
        }
    }
    out
}

/// Whether fuzzy-matched letters read as one: all inside one word ("cnvs" in "Canvas"), or each
/// run starting a word, as initials do. Letters picked from across a title are noise.
fn word_like(text: &str, marks: &[Range<usize>]) -> bool {
    let (Some(first), Some(last)) = (marks.first(), marks.last()) else { return true };
    let word = |c: char| c.is_alphanumeric();
    text[first.start..last.end].chars().all(word)
        || marks.iter().all(|r| {
            text[..r.start].chars().next_back().is_none_or(|c| !word(c) || c.is_lowercase() && text[r.start..].starts_with(char::is_uppercase))
        })
}

/// A command name's match: its score and matched letters, or none when a word misses.
pub fn name(name: &str, query: &str) -> Option<(u32, Vec<Range<usize>>)> {
    let mut s = Search::new(query)?;
    (0..s.words.len()).try_fold((0, Vec::new()), |(total, mut marks), w| {
        let (score, found) = s.find(w, name, Field::Title, true)?;
        marks.extend(found);
        Some((total + score, marks))
    })
}

/// The links every word of `query` matches, in `links`' order.
pub fn matching<'a>(links: &[&'a LinkItem], query: &str) -> Vec<&'a LinkItem> {
    let Some(mut s) = Search::new(query) else { return Vec::new() };
    links.iter().copied().filter(|l| score(&mut s, l, false).is_some()).collect()
}

/// The best `limit` links for `query`, best first; ties keep `links`' order. Every link is
/// ranked by score alone; only those shown work out their marks and evidence.
pub fn links(links: &[&LinkItem], query: &str, limit: usize) -> Vec<Hit> {
    let Some(mut s) = Search::new(query) else { return Vec::new() };
    let mut ranked: Vec<(u32, &LinkItem)> = links.iter().filter_map(|l| score(&mut s, l, false).map(|(n, _)| (n, *l))).collect();
    ranked.sort_by_key(|(n, _)| std::cmp::Reverse(*n));
    ranked.into_iter().take(limit).filter_map(|(_, l)| score(&mut s, l, true).and_then(|(_, hit)| hit)).collect()
}

/// `link`'s score when every word matches it, and with `marks` the hit to show.
fn score(s: &mut Search, link: &LinkItem, marks: bool) -> Option<(u32, Option<Hit>)> {
    let title = one_line(&link.title);
    let mut fields: Vec<(Field, &str)> = vec![(Field::Title, &title)];
    fields.extend(link.tags.iter().map(|t| (Field::Tag, t.as_str())));
    fields.push((Field::Domain, &link.domain));
    fields.extend(link.description.as_deref().map(|d| (Field::Description, d)));
    fields.extend(link.summary.as_deref().map(|d| (Field::Summary, d)));
    fields.push((Field::Url, &link.url));

    let mut total = 0;
    let (mut title_marks, mut domain_marks) = (Vec::new(), Vec::new());
    let mut elsewhere: Option<(usize, Vec<Range<usize>>)> = None;
    for w in 0..s.words.len() {
        let (at, n, found) =
            fields.iter().enumerate().filter_map(|(i, (f, text))| s.find(w, text, *f, false).map(|(n, m)| (i, n, m))).max_by_key(|(_, n, _)| *n)?;
        total += n;
        if !marks {
            continue;
        }
        let (field, text) = fields[at];
        let found = if field.kind() == AtomKind::Fuzzy { found } else { s.find(w, text, field, true).map(|(_, m)| m).unwrap_or_default() };
        match field {
            Field::Title => title_marks.extend(found),
            Field::Domain => domain_marks.extend(found),
            _ => match &mut elsewhere {
                Some((i, m)) if *i == at => m.extend(found),
                Some((i, _)) if fields[*i].0.weight() >= field.weight() => {}
                _ => elsewhere = Some((at, found)),
            },
        }
    }
    if !marks {
        return Some((total, None));
    }
    title_marks.sort_by_key(|r| r.start);
    domain_marks.sort_by_key(|r| r.start);
    let evidence = elsewhere.map(|(i, found)| excerpt(fields[i].0, fields[i].1, found));
    Some((total, Some(Hit { link: link.clone(), title, title_marks, domain_marks, evidence })))
}

/// The stretch of a field to show: a tag whole, as `#tag`; a long field from a little before
/// its first match, at a word start.
fn excerpt(field: Field, text: &str, mut marks: Vec<Range<usize>>) -> Evidence {
    marks.sort_by_key(|r| r.start);
    let (text, shift) = match field {
        Field::Tag => (format!("#{text}"), -1),
        _ => {
            let first = marks.first().map_or(0, |r| r.start);
            let mut from = text[..first].char_indices().rev().nth(LEAD).map_or(0, |(i, _)| i);
            if from > 0 {
                from = text[from..first].find(' ').map_or(from, |sp| from + sp + 1);
            }
            if from == 0 { (text.to_owned(), 0) } else { (format!("…{}", &text[from..]), from as isize - '…'.len_utf8() as isize) }
        }
    };
    let marks = marks.into_iter().map(|r| (r.start as isize - shift) as usize..(r.end as isize - shift) as usize).collect();
    Evidence { field, text, marks }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn link(id: &str, title: &str, url: &str) -> LinkItem {
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
            created_at: 0,
            completed_at: None,
            deleted_at: None,
        }
    }

    fn ids(all: &[LinkItem], q: &str) -> Vec<String> {
        let refs: Vec<&LinkItem> = all.iter().collect();
        links(&refs, q, 50).into_iter().map(|h| h.link.id).collect()
    }

    #[test]
    fn every_word_must_match_and_title_hits_rank_above_url_hits() {
        let all = [
            link("a", "Notes on Rust", "https://a.dev/zig"),
            link("b", "Zig in production", "https://b.dev/rust"),
            link("c", "Rust and Zig", "https://c.dev/x"),
        ];
        assert_eq!(ids(&all, "rust zig"), ["c", "a", "b"]);
        assert_eq!(ids(&all, "rust")[2], "b");
        assert!(ids(&all, "haskell").is_empty());
    }

    #[test]
    fn letters_in_order_find_a_title_and_are_marked() {
        let all = [link("a", "Canvas rendering notes", "https://a.dev/x")];
        let refs: Vec<&LinkItem> = all.iter().collect();
        let hit = &links(&refs, "cnvs rend", 50)[0];
        let marked: String = hit.title_marks.iter().map(|r| &hit.title[r.clone()]).collect();
        assert_eq!(marked, "Cnvsrend");
        assert_eq!(hit.evidence, None);
    }

    #[test]
    fn letters_scattered_across_words_do_not_match() {
        let all = [link("a", "Edo: canvas with Baroque-era artworks (because it's really cool)", "https://a.dev/x")];
        assert!(ids(&all, "secur").is_empty());
        assert_eq!(ids(&all, "baroque era"), ["a"]);
        assert_eq!(ids(&all, "bea"), ["a"]);
    }

    #[test]
    fn a_summary_match_is_shown_as_evidence_in_context() {
        let mut l = link("a", "A post", "https://a.dev/x");
        l.summary = Some("A long walk through how the engine merges operations, then CRDT compaction in detail.".to_owned());
        let refs = [&l];
        let e = links(&refs, "compaction", 50).remove(0).evidence.unwrap();
        assert_eq!(e.field, Field::Summary);
        assert!(e.text.starts_with('…'));
        assert_eq!(&e.text[e.marks[0].clone()], "compaction");
    }

    #[test]
    fn a_tag_match_is_shown_as_the_tag() {
        let mut l = link("a", "A post", "https://a.dev/x");
        l.tags = vec!["design".to_owned()];
        let refs = [&l];
        let e = links(&refs, "design", 50).remove(0).evidence.unwrap();
        assert_eq!((e.field, e.text.as_str(), &e.text[e.marks[0].clone()]), (Field::Tag, "#design", "design"));
    }

    #[test]
    fn command_names_match_at_word_starts_first() {
        let (out, _) = name("Sign out", "out").unwrap();
        let (layout, _) = name("Show as layout", "out").unwrap();
        assert!(out > layout);
        assert!(name("Inbox", "zzz").is_none());
    }
}
