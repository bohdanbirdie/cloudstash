import { Events, makeSchema, Schema, State } from "@livestore/livestore"

// State tables
export const tables = {
  links: State.SQLite.table({
    name: "links",
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
  }),
  linkSnapshots: State.SQLite.table({
    name: "link_snapshots",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      linkId: State.SQLite.text({ default: "" }),
      title: State.SQLite.text({ nullable: true }),
      description: State.SQLite.text({ nullable: true }),
      image: State.SQLite.text({ nullable: true }),
      favicon: State.SQLite.text({ nullable: true }),
      fetchedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
  }),
  linkSummaries: State.SQLite.table({
    name: "link_summaries",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      linkId: State.SQLite.text({ default: "" }),
      summary: State.SQLite.text({ default: "" }),
      model: State.SQLite.text({ default: "" }),
      summarizedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
  }),
  linkProcessingStatus: State.SQLite.table({
    name: "link_processing_status",
    columns: {
      linkId: State.SQLite.text({ primaryKey: true }),
      status: State.SQLite.text({ default: "pending" }), // pending | completed | failed
      error: State.SQLite.text({ nullable: true }),
      updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
  }),
}

// Events describe data changes
export const events = {
  linkCreated: Events.synced({
    name: "v1.LinkCreated",
    schema: Schema.Struct({
      id: Schema.String,
      url: Schema.String,
      domain: Schema.String,
      createdAt: Schema.Date,
    }),
  }),
  linkMetadataFetched: Events.synced({
    name: "v1.LinkMetadataFetched",
    schema: Schema.Struct({
      id: Schema.String,
      linkId: Schema.String,
      title: Schema.NullOr(Schema.String),
      description: Schema.NullOr(Schema.String),
      image: Schema.NullOr(Schema.String),
      favicon: Schema.NullOr(Schema.String),
      fetchedAt: Schema.Date,
    }),
  }),
  linkCompleted: Events.synced({
    name: "v1.LinkCompleted",
    schema: Schema.Struct({ id: Schema.String, completedAt: Schema.Date }),
  }),
  linkUncompleted: Events.synced({
    name: "v1.LinkUncompleted",
    schema: Schema.Struct({ id: Schema.String }),
  }),
  linkDeleted: Events.synced({
    name: "v1.LinkDeleted",
    schema: Schema.Struct({ id: Schema.String, deletedAt: Schema.Date }),
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
      summary: Schema.String,
      model: Schema.String,
      summarizedAt: Schema.Date,
    }),
  }),
  linkProcessingStarted: Events.synced({
    name: "v1.LinkProcessingStarted",
    schema: Schema.Struct({
      linkId: Schema.String,
      updatedAt: Schema.Date,
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
      linkId: Schema.String,
      error: Schema.String,
      updatedAt: Schema.Date,
    }),
  }),
}

// Materializers map events to state
const materializers = State.SQLite.materializers(events, {
  "v1.LinkCreated": ({ id, url, domain, createdAt }) =>
    tables.links.insert({ id, url, domain, createdAt, status: "unread" }),
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
      id,
      linkId,
      title,
      description,
      image,
      favicon,
      fetchedAt,
    }),
  "v1.LinkCompleted": ({ id, completedAt }) =>
    tables.links.update({ status: "completed", completedAt }).where({ id }),
  "v1.LinkUncompleted": ({ id }) =>
    tables.links.update({ status: "unread", completedAt: null }).where({ id }),
  "v1.LinkDeleted": ({ id, deletedAt }) =>
    tables.links.update({ deletedAt }).where({ id }),
  "v1.LinkRestored": ({ id }) =>
    tables.links.update({ deletedAt: null }).where({ id }),
  "v1.LinkSummarized": ({ id, linkId, summary, model, summarizedAt }) =>
    tables.linkSummaries.insert({ id, linkId, summary, model, summarizedAt }),
  "v1.LinkProcessingStarted": ({ linkId, updatedAt }) =>
    tables.linkProcessingStatus.insert({
      linkId,
      status: "pending",
      error: null,
      updatedAt,
    }),
  "v1.LinkProcessingCompleted": ({ linkId, updatedAt }) =>
    tables.linkProcessingStatus
      .update({ status: "completed", updatedAt })
      .where({ linkId }),
  "v1.LinkProcessingFailed": ({ linkId, error, updatedAt }) =>
    tables.linkProcessingStatus
      .update({ status: "failed", error, updatedAt })
      .where({ linkId }),
})

const state = State.SQLite.makeState({ tables, materializers })

export const schema = makeSchema({ events, state })

// Sync payload for authentication
export const SyncPayload = Schema.Struct({ authToken: Schema.String })
