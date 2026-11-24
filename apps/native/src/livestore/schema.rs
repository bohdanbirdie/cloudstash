//! The part of the web app's `src/livestore/schema.ts` this app reads: links, their metadata
//! snapshots and summaries, and tags, with the same tables, event names, and materializers. Every other event in the
//! eventlog is skipped, so the app syncs the whole library but only materializes what it shows.

use std::sync::{Arc, LazyLock};

use livestore_schema::event_def::DateFromString;
use livestore_schema::query_builder::{Filter, OnConflict, QueryBuilderError, SqlQuery};
use livestore_schema::{Column, Event, MaterializeError, Schema, SqlStatement, Table, UnknownEventHandling};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.LinkCreated")]
#[serde(rename_all = "camelCase")]
pub struct LinkCreated {
    pub created_at: DateFromString,
    pub domain: String,
    pub id: String,
    pub url: String,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v2.LinkCreated")]
#[serde(rename_all = "camelCase")]
pub struct LinkCreatedV2 {
    pub created_at: DateFromString,
    pub domain: String,
    pub id: String,
    pub source: String,
    pub source_meta: Option<String>,
    pub url: String,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.LinkCompleted")]
#[serde(rename_all = "camelCase")]
pub struct LinkCompleted {
    pub completed_at: DateFromString,
    pub id: String,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.LinkUncompleted")]
pub struct LinkUncompleted {
    pub id: String,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.LinkDeleted")]
#[serde(rename_all = "camelCase")]
pub struct LinkDeleted {
    pub deleted_at: DateFromString,
    pub id: String,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.LinkRestored")]
pub struct LinkRestored {
    pub id: String,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.LinkMetadataFetched")]
#[serde(rename_all = "camelCase")]
pub struct LinkMetadataFetched {
    pub description: Option<String>,
    pub favicon: Option<String>,
    pub fetched_at: DateFromString,
    pub id: String,
    pub image: Option<String>,
    pub link_id: String,
    pub title: Option<String>,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.LinkSummarized")]
#[serde(rename_all = "camelCase")]
pub struct LinkSummarized {
    pub id: String,
    pub link_id: String,
    pub model: String,
    pub summarized_at: DateFromString,
    pub summary: String,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.TagCreated")]
#[serde(rename_all = "camelCase")]
pub struct TagCreated {
    pub created_at: DateFromString,
    pub id: String,
    pub name: String,
    pub sort_order: f64,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.TagDeleted")]
#[serde(rename_all = "camelCase")]
pub struct TagDeleted {
    pub deleted_at: DateFromString,
    pub id: String,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.TagRenamed")]
pub struct TagRenamed {
    pub id: String,
    pub name: String,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.TagReordered")]
#[serde(rename_all = "camelCase")]
pub struct TagReordered {
    pub id: String,
    pub sort_order: f64,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.LinkTagged")]
#[serde(rename_all = "camelCase")]
pub struct LinkTagged {
    pub created_at: DateFromString,
    pub id: String,
    pub link_id: String,
    pub tag_id: String,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v1.LinkUntagged")]
pub struct LinkUntagged {
    pub id: String,
}

#[derive(Event, Serialize, Deserialize, Clone, Debug)]
#[event(name = "v2.LinkUntagged")]
#[serde(rename_all = "camelCase")]
pub struct LinkUntaggedV2 {
    pub link_id: String,
    pub tag_id: String,
}

pub static LINKS: LazyLock<Table> = LazyLock::new(|| {
    Table::new("links")
        .column(Column::text("id").primary_key())
        .column(Column::text("url").default(""))
        .column(Column::text("domain").default(""))
        .column(Column::text("status").default("unread"))
        .column(Column::text("source").nullable())
        .column(Column::text("sourceMeta").nullable())
        .column(Column::datetime_millis("createdAt"))
        .column(Column::datetime_millis("completedAt").nullable())
        .column(Column::datetime_millis("deletedAt").nullable())
        .unique_index("idx_links_url_unique", &["url"])
        .index("idx_links_status_deleted_created", &["status", "deletedAt", "createdAt"])
        .index("idx_links_deleted_created", &["deletedAt", "createdAt"])
        .index("idx_links_status_deleted_completed", &["status", "deletedAt", "completedAt"])
        .index("idx_links_deleted", &["deletedAt"])
});

pub static LINK_SNAPSHOTS: LazyLock<Table> = LazyLock::new(|| {
    Table::new("link_snapshots")
        .column(Column::text("id").primary_key())
        .column(Column::text("linkId").default(""))
        .column(Column::text("title").nullable())
        .column(Column::text("description").nullable())
        .column(Column::text("image").nullable())
        .column(Column::text("favicon").nullable())
        .column(Column::datetime_millis("fetchedAt"))
        .index("idx_link_snapshots_link_fetched", &["linkId", "fetchedAt"])
});

pub static LINK_SUMMARIES: LazyLock<Table> = LazyLock::new(|| {
    Table::new("link_summaries")
        .column(Column::text("id").primary_key())
        .column(Column::text("linkId").default(""))
        .column(Column::text("summary").default(""))
        .column(Column::text("model").default(""))
        .column(Column::datetime_millis("summarizedAt"))
        .index("idx_link_summaries_link_summarized", &["linkId", "summarizedAt"])
});

pub static TAGS: LazyLock<Table> = LazyLock::new(|| {
    Table::new("tags")
        .column(Column::text("id").primary_key())
        .column(Column::text("name").default(""))
        .column(Column::integer("sortOrder").default(0))
        .column(Column::datetime_millis("createdAt"))
        .column(Column::datetime_millis("deletedAt").nullable())
});

pub static LINK_TAGS: LazyLock<Table> = LazyLock::new(|| {
    Table::new("link_tags")
        .column(Column::text("id").primary_key())
        .column(Column::text("linkId").default(""))
        .column(Column::text("tagId").default(""))
        .column(Column::datetime_millis("createdAt"))
        .index("idx_link_tags_link", &["linkId"])
        .index("idx_link_tags_tag", &["tagId"])
        .unique_index("idx_link_tags_unique", &["linkId", "tagId"])
});

/// The schema, skipping events it doesn't know.
#[must_use]
pub fn schema() -> Arc<Schema> {
    with_unknown(UnknownEventHandling::Ignore)
}

/// Whether `name`, an event this app doesn't know, is a newer version of one it keeps
/// (`v3.LinkCreated` beside `v1` and `v2`): data this version can't apply, so its library would
/// go stale. Events of names it doesn't keep at all are the web's own and stay skipped.
#[must_use]
pub fn is_newer_version(name: &str) -> bool {
    static KEPT: LazyLock<Vec<(u32, String)>> =
        LazyLock::new(|| schema().events().iter().filter_map(|e| versioned(&e.name)).map(|(v, n)| (v, n.to_owned())).collect());
    let Some((version, base)) = versioned(name) else { return false };
    KEPT.iter().filter(|(_, kept)| kept == base).map(|(v, _)| *v).max().is_some_and(|newest| version > newest)
}

/// `v2.LinkCreated` as `(2, "LinkCreated")`.
fn versioned(name: &str) -> Option<(u32, &str)> {
    let (version, base) = name.strip_prefix('v')?.split_once('.')?;
    Some((version.parse().ok()?, base))
}

/// The schema, handling events it doesn't know as `unknown` says.
#[must_use]
pub fn with_unknown(unknown: UnknownEventHandling) -> Arc<Schema> {
    let (links, snapshots, summaries, tags, link_tags) = (&*LINKS, &*LINK_SNAPSHOTS, &*LINK_SUMMARIES, &*TAGS, &*LINK_TAGS);
    Schema::builder()
        .table(links.clone())
        .table(snapshots.clone())
        .table(summaries.clone())
        .table(tags.clone())
        .table(link_tags.clone())
        .unknown_event_handling(unknown)
        .materialize::<LinkCreated, _>(move |a, _| {
            sql(links
                .query()
                .insert([
                    ("createdAt", json!(a.created_at)),
                    ("domain", json!(a.domain)),
                    ("id", json!(a.id)),
                    ("source", json!(null)),
                    ("sourceMeta", json!(null)),
                    ("status", json!("unread")),
                    ("url", json!(a.url)),
                ])
                .on_conflict(&["url"], OnConflict::Ignore)
                .as_sql())
        })
        .materialize::<LinkCreatedV2, _>(move |a, _| {
            sql(links
                .query()
                .insert([
                    ("createdAt", json!(a.created_at)),
                    ("domain", json!(a.domain)),
                    ("id", json!(a.id)),
                    ("source", json!(a.source)),
                    ("sourceMeta", json!(a.source_meta)),
                    ("status", json!("unread")),
                    ("url", json!(a.url)),
                ])
                .on_conflict(&["url"], OnConflict::Ignore)
                .as_sql())
        })
        .materialize::<LinkCompleted, _>(move |a, _| {
            sql(links
                .query()
                .update([("completedAt", json!(a.completed_at)), ("status", json!("completed"))])
                .where_all([("id", json!(a.id).into())])
                .as_sql())
        })
        .materialize::<LinkUncompleted, _>(move |a, _| {
            sql(links.query().update([("completedAt", json!(null)), ("status", json!("unread"))]).where_all([("id", json!(a.id).into())]).as_sql())
        })
        .materialize::<LinkDeleted, _>(move |a, _| {
            sql(links.query().update([("deletedAt", json!(a.deleted_at))]).where_all([("id", json!(a.id).into())]).as_sql())
        })
        .materialize::<LinkRestored, _>(move |a, _| {
            sql(links.query().update([("deletedAt", json!(null))]).where_all([("id", json!(a.id).into())]).as_sql())
        })
        .materialize::<LinkMetadataFetched, _>(move |a, _| {
            sql(snapshots
                .query()
                .insert([
                    ("description", json!(a.description)),
                    ("favicon", json!(a.favicon)),
                    ("fetchedAt", json!(a.fetched_at)),
                    ("id", json!(a.id)),
                    ("image", json!(a.image)),
                    ("linkId", json!(a.link_id)),
                    ("title", json!(a.title)),
                ])
                .on_conflict(&["id"], OnConflict::Ignore)
                .as_sql())
        })
        .materialize::<LinkSummarized, _>(move |a, _| {
            sql(summaries
                .query()
                .insert([
                    ("id", json!(a.id)),
                    ("linkId", json!(a.link_id)),
                    ("model", json!(a.model)),
                    ("summarizedAt", json!(a.summarized_at)),
                    ("summary", json!(a.summary)),
                ])
                .on_conflict(&["id"], OnConflict::Ignore)
                .as_sql())
        })
        .materialize::<TagCreated, _>(move |a, _| {
            sql(tags
                .query()
                .insert([
                    ("createdAt", json!(a.created_at)),
                    ("deletedAt", json!(null)),
                    ("id", json!(a.id)),
                    ("name", json!(a.name)),
                    ("sortOrder", json!(a.sort_order as i64)),
                ])
                .on_conflict(&["id"], OnConflict::Ignore)
                .as_sql())
        })
        .materialize::<TagDeleted, _>(move |a, _| {
            Ok(vec![
                sql(tags.query().update([("deletedAt", json!(a.deleted_at))]).where_all([("id", json!(a.id).into())]).as_sql())?,
                sql(link_tags.query().delete().where_all([("tagId", json!(a.id).into())]).as_sql())?,
            ])
        })
        .materialize::<TagRenamed, _>(move |a, _| {
            sql(tags.query().update([("name", json!(a.name))]).where_all([("id", json!(a.id).into())]).as_sql())
        })
        .materialize::<TagReordered, _>(move |a, _| {
            sql(tags.query().update([("sortOrder", json!(a.sort_order as i64))]).where_all([("id", json!(a.id).into())]).as_sql())
        })
        .materialize::<LinkTagged, _>(move |a, _| {
            sql(link_tags
                .query()
                .insert([("createdAt", json!(a.created_at)), ("id", json!(a.id)), ("linkId", json!(a.link_id)), ("tagId", json!(a.tag_id))])
                .on_conflict(&["linkId", "tagId"], OnConflict::Ignore)
                .as_sql())
        })
        .materialize::<LinkUntagged, _>(move |a, _| sql(link_tags.query().delete().where_all([("id", json!(a.id).into())]).as_sql()))
        .materialize::<LinkUntaggedV2, _>(move |a, _| {
            sql(link_tags.query().delete().where_all([("linkId", json!(a.link_id).into()), ("tagId", json!(a.tag_id).into())]).as_sql())
        })
        .build()
}

fn sql(query: Result<SqlQuery, QueryBuilderError>) -> Result<SqlStatement, MaterializeError> {
    query.map(SqlStatement::from).map_err(|e| MaterializeError::Other(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_newer_version_of_a_kept_event_is_too_new() {
        assert!(is_newer_version("v3.LinkCreated"));
        assert!(is_newer_version("v2.TagRenamed"));
        assert!(!is_newer_version("v2.LinkCreated"), "a version this app keeps");
        assert!(!is_newer_version("v1.LinkInteracted"), "an event the app doesn't keep");
        assert!(!is_newer_version("v2.LinkInteracted"), "a newer version of an event the app doesn't keep");
        assert!(!is_newer_version("LinkCreated"));
        assert!(!is_newer_version("vx.LinkCreated"));
    }
}
