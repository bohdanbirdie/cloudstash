import { Events, makeSchema, Schema, State } from '@livestore/livestore'

// State tables
export const tables = {
  links: State.SQLite.table({
    name: 'links',
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      url: State.SQLite.text({ default: '' }),
      title: State.SQLite.text({ nullable: true }),
      description: State.SQLite.text({ nullable: true }),
      image: State.SQLite.text({ nullable: true }),
      favicon: State.SQLite.text({ nullable: true }),
      domain: State.SQLite.text({ default: '' }),
      status: State.SQLite.text({ default: 'unread' }),
      createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
      completedAt: State.SQLite.integer({ nullable: true, schema: Schema.DateFromNumber }),
      deletedAt: State.SQLite.integer({ nullable: true, schema: Schema.DateFromNumber }),
    },
  }),
}

// Events describe data changes
export const events = {
  linkCreated: Events.synced({
    name: 'v1.LinkCreated',
    schema: Schema.Struct({
      id: Schema.String,
      url: Schema.String,
      domain: Schema.String,
      createdAt: Schema.Date,
    }),
  }),
  linkMetadataFetched: Events.synced({
    name: 'v1.LinkMetadataFetched',
    schema: Schema.Struct({
      id: Schema.String,
      title: Schema.NullOr(Schema.String),
      description: Schema.NullOr(Schema.String),
      image: Schema.NullOr(Schema.String),
      favicon: Schema.NullOr(Schema.String),
    }),
  }),
  linkCompleted: Events.synced({
    name: 'v1.LinkCompleted',
    schema: Schema.Struct({ id: Schema.String, completedAt: Schema.Date }),
  }),
  linkUncompleted: Events.synced({
    name: 'v1.LinkUncompleted',
    schema: Schema.Struct({ id: Schema.String }),
  }),
  linkDeleted: Events.synced({
    name: 'v1.LinkDeleted',
    schema: Schema.Struct({ id: Schema.String, deletedAt: Schema.Date }),
  }),
}

// Materializers map events to state
const materializers = State.SQLite.materializers(events, {
  'v1.LinkCreated': ({ id, url, domain, createdAt }) =>
    tables.links.insert({ id, url, domain, createdAt, status: 'unread' }),
  'v1.LinkMetadataFetched': ({ id, title, description, image, favicon }) =>
    tables.links.update({ title, description, image, favicon }).where({ id }),
  'v1.LinkCompleted': ({ id, completedAt }) =>
    tables.links.update({ status: 'completed', completedAt }).where({ id }),
  'v1.LinkUncompleted': ({ id }) =>
    tables.links.update({ status: 'unread', completedAt: null }).where({ id }),
  'v1.LinkDeleted': ({ id, deletedAt }) =>
    tables.links.update({ deletedAt }).where({ id }),
})

const state = State.SQLite.makeState({ tables, materializers })

export const schema = makeSchema({ events, state })

// Sync payload for authentication
export const SyncPayload = Schema.Struct({ authToken: Schema.String })
