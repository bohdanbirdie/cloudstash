import { Events, makeSchema, Schema, State } from "@livestore/livestore";

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
});

const state = State.SQLite.makeState({ materializers, tables });

export const schema = makeSchema({ events, state });
