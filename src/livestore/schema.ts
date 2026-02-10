import { Events, makeSchema, Schema, State } from "@livestore/livestore";

/*
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                         ⚠️  EVENTS ARE IMMUTABLE  ⚠️                        ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                           ║
 * ║  Once an event is deployed and used in production, its schema MUST NOT   ║
 * ║  be modified in any backward-incompatible way. Events are persisted      ║
 * ║  forever and replayed to rebuild state.                                  ║
 * ║                                                                           ║
 * ║  FORBIDDEN CHANGES:                                                       ║
 * ║  ❌ Adding required fields (old events won't have them)                   ║
 * ║  ❌ Removing fields (old events still contain them)                       ║
 * ║  ❌ Changing field types (breaks deserialization)                         ║
 * ║  ❌ Renaming the event name (old events use the old name)                 ║
 * ║                                                                           ║
 * ║  ALLOWED CHANGES:                                                         ║
 * ║  ✅ Adding optional fields with Schema.optional() or Schema.NullOr()     ║
 * ║  ✅ Creating new events (use v2.EventName for breaking changes)          ║
 * ║  ✅ Deprecating events (stop emitting, keep materializer for replay)     ║
 * ║                                                                           ║
 * ║  If you need a breaking change, create a NEW event (e.g., v2.LinkCreated)║
 * ║  and handle migration in materializers or via a data migration script.   ║
 * ║                                                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

export const tables = {
  linkInteractions: State.SQLite.table({
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      linkId: State.SQLite.text(),
      type: State.SQLite.text(),
      occurredAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
    name: "link_interactions",
  }),
  linkTags: State.SQLite.table({
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      linkId: State.SQLite.text({ default: "" }),
      tagId: State.SQLite.text({ default: "" }),
      createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
    indexes: [
      { columns: ["linkId"], name: "idx_link_tags_link" },
      { columns: ["tagId"], name: "idx_link_tags_tag" },
      {
        columns: ["linkId", "tagId"],
        isUnique: true,
        name: "idx_link_tags_unique",
      },
    ],
    name: "link_tags",
  }),
  linkProcessingStatus: State.SQLite.table({
    columns: {
      linkId: State.SQLite.text({ primaryKey: true }),
      status: State.SQLite.text({ default: "pending" }),
      error: State.SQLite.text({ nullable: true }),
      updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
    name: "link_processing_status",
  }),
  linkSnapshots: State.SQLite.table({
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      linkId: State.SQLite.text({ default: "" }),
      title: State.SQLite.text({ nullable: true }),
      description: State.SQLite.text({ nullable: true }),
      image: State.SQLite.text({ nullable: true }),
      favicon: State.SQLite.text({ nullable: true }),
      fetchedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
    name: "link_snapshots",
  }),
  linkSummaries: State.SQLite.table({
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      linkId: State.SQLite.text({ default: "" }),
      summary: State.SQLite.text({ default: "" }),
      model: State.SQLite.text({ default: "" }),
      summarizedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
    name: "link_summaries",
  }),
  links: State.SQLite.table({
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      url: State.SQLite.text({ default: "" }),
      domain: State.SQLite.text({ default: "" }),
      status: State.SQLite.text({ default: "unread" }),
      createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
      completedAt: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateFromNumber,
      }),
      deletedAt: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateFromNumber,
      }),
    },
    indexes: [
      { name: "idx_links_url_unique", columns: ["url"], isUnique: true },
    ],
    name: "links",
  }),
  tags: State.SQLite.table({
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      name: State.SQLite.text({ default: "" }),
      sortOrder: State.SQLite.integer({ default: 0 }),
      createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
      deletedAt: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateFromNumber,
      }),
    },
    name: "tags",
  }),
};

export const events = {
  linkCompleted: Events.synced({
    name: "v1.LinkCompleted",
    schema: Schema.Struct({ completedAt: Schema.Date, id: Schema.String }),
  }),
  linkCreated: Events.synced({
    name: "v1.LinkCreated",
    schema: Schema.Struct({
      createdAt: Schema.Date,
      domain: Schema.String,
      id: Schema.String,
      url: Schema.String,
    }),
  }),
  linkDeleted: Events.synced({
    name: "v1.LinkDeleted",
    schema: Schema.Struct({ deletedAt: Schema.Date, id: Schema.String }),
  }),
  linkInteracted: Events.synced({
    name: "v1.LinkInteracted",
    schema: Schema.Struct({
      id: Schema.String,
      linkId: Schema.String,
      occurredAt: Schema.Date,
      type: Schema.String,
    }),
  }),
  linkMetadataFetched: Events.synced({
    name: "v1.LinkMetadataFetched",
    schema: Schema.Struct({
      description: Schema.NullOr(Schema.String),
      favicon: Schema.NullOr(Schema.String),
      fetchedAt: Schema.Date,
      id: Schema.String,
      image: Schema.NullOr(Schema.String),
      linkId: Schema.String,
      title: Schema.NullOr(Schema.String),
    }),
  }),
  linkProcessingCompleted: Events.synced({
    name: "v1.LinkProcessingCompleted",
    schema: Schema.Struct({
      linkId: Schema.String,
      updatedAt: Schema.Date,
    }),
  }),
  linkProcessingFailed: Events.synced({
    name: "v1.LinkProcessingFailed",
    schema: Schema.Struct({
      error: Schema.String,
      linkId: Schema.String,
      updatedAt: Schema.Date,
    }),
  }),
  linkProcessingStarted: Events.synced({
    name: "v1.LinkProcessingStarted",
    schema: Schema.Struct({
      linkId: Schema.String,
      updatedAt: Schema.Date,
    }),
  }),
  linkRestored: Events.synced({
    name: "v1.LinkRestored",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  linkSummarized: Events.synced({
    name: "v1.LinkSummarized",
    schema: Schema.Struct({
      id: Schema.String,
      linkId: Schema.String,
      model: Schema.String,
      summarizedAt: Schema.Date,
      summary: Schema.String,
    }),
  }),
  linkUncompleted: Events.synced({
    name: "v1.LinkUncompleted",
    schema: Schema.Struct({ id: Schema.String }),
  }),

  tagCreated: Events.synced({
    name: "v1.TagCreated",
    schema: Schema.Struct({
      createdAt: Schema.Date,
      id: Schema.String,
      name: Schema.String,
      sortOrder: Schema.Number,
    }),
  }),
  tagDeleted: Events.synced({
    name: "v1.TagDeleted",
    schema: Schema.Struct({
      deletedAt: Schema.Date,
      id: Schema.String,
    }),
  }),
  tagRenamed: Events.synced({
    name: "v1.TagRenamed",
    schema: Schema.Struct({
      id: Schema.String,
      name: Schema.String,
    }),
  }),
  tagReordered: Events.synced({
    name: "v1.TagReordered",
    schema: Schema.Struct({
      id: Schema.String,
      sortOrder: Schema.Number,
    }),
  }),

  linkTagged: Events.synced({
    name: "v1.LinkTagged",
    schema: Schema.Struct({
      createdAt: Schema.Date,
      id: Schema.String,
      linkId: Schema.String,
      tagId: Schema.String,
    }),
  }),
  linkUntagged: Events.synced({
    name: "v1.LinkUntagged",
    schema: Schema.Struct({
      id: Schema.String,
    }),
  }),
};

const materializers = State.SQLite.materializers(events, {
  "v1.LinkCompleted": ({ id, completedAt }) =>
    tables.links.update({ completedAt, status: "completed" }).where({ id }),
  "v1.LinkCreated": ({ id, url, domain, createdAt }) =>
    tables.links
      .insert({ createdAt, domain, id, status: "unread", url })
      .onConflict("url", "ignore"),
  "v1.LinkDeleted": ({ id, deletedAt }) =>
    tables.links.update({ deletedAt }).where({ id }),
  "v1.LinkInteracted": ({ id, linkId, type, occurredAt }) =>
    tables.linkInteractions.insert({ id, linkId, occurredAt, type }),
  "v1.LinkMetadataFetched": ({
    id,
    linkId,
    title,
    description,
    image,
    favicon,
    fetchedAt,
  }) =>
    tables.linkSnapshots.insert({
      description,
      favicon,
      fetchedAt,
      id,
      image,
      linkId,
      title,
    }),
  "v1.LinkProcessingCompleted": ({ linkId, updatedAt }) =>
    tables.linkProcessingStatus
      .update({ status: "completed", updatedAt })
      .where({ linkId }),
  "v1.LinkProcessingFailed": ({ linkId, error, updatedAt }) =>
    tables.linkProcessingStatus
      .update({ error, status: "failed", updatedAt })
      .where({ linkId }),
  "v1.LinkProcessingStarted": ({ linkId, updatedAt }) =>
    tables.linkProcessingStatus.insert({
      error: null,
      linkId,
      status: "pending",
      updatedAt,
    }),
  "v1.LinkRestored": ({ id }) =>
    tables.links.update({ deletedAt: null }).where({ id }),
  "v1.LinkSummarized": ({ id, linkId, summary, model, summarizedAt }) =>
    tables.linkSummaries.insert({ id, linkId, model, summarizedAt, summary }),
  "v1.LinkUncompleted": ({ id }) =>
    tables.links.update({ completedAt: null, status: "unread" }).where({ id }),

  "v1.TagCreated": ({ id, name, sortOrder, createdAt }) =>
    tables.tags
      .insert({ createdAt, deletedAt: null, id, name, sortOrder })
      .onConflict("id", "ignore"),
  "v1.TagDeleted": ({ id, deletedAt }) => [
    tables.tags.update({ deletedAt }).where({ id }),
    tables.linkTags.delete().where({ tagId: id }),
  ],
  "v1.TagRenamed": ({ id, name }) => tables.tags.update({ name }).where({ id }),
  "v1.TagReordered": ({ id, sortOrder }) =>
    tables.tags.update({ sortOrder }).where({ id }),

  "v1.LinkTagged": ({ id, linkId, tagId, createdAt }) =>
    tables.linkTags
      .insert({ createdAt, id, linkId, tagId })
      .onConflict("id", "ignore"),
  "v1.LinkUntagged": ({ id }) => tables.linkTags.delete().where({ id }),
});

const state = State.SQLite.makeState({ materializers, tables });

export const schema = makeSchema({ events, state });
