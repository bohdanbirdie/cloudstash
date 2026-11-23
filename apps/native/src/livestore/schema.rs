//! The part of the web app's `src/livestore/schema.ts` this app reads: links and their metadata
//! snapshots, with the same tables, event names, and materializers. Every other event in the
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

#[must_use]
pub fn schema() -> Arc<Schema> {
    let (links, snapshots) = (&*LINKS, &*LINK_SNAPSHOTS);
    Schema::builder()
        .table(links.clone())
        .table(snapshots.clone())
        .unknown_event_handling(UnknownEventHandling::Ignore)
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
        .build()
}

fn sql(query: Result<SqlQuery, QueryBuilderError>) -> Result<SqlStatement, MaterializeError> {
    query.map(SqlStatement::from).map_err(|e| MaterializeError::Other(e.to_string()))
}
