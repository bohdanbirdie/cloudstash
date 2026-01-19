import { queryDb, Schema } from "@livestore/livestore"

import { tables } from "./schema"

export const inboxCount$ = queryDb(
  tables.links.count().where({ status: "unread", deletedAt: null }),
  { label: "inboxCount" },
)

export const completedCount$ = queryDb(
  tables.links.count().where({ status: "completed", deletedAt: null }),
  { label: "completedCount" },
)

export const allLinksCount$ = queryDb(
  tables.links.count().where({ deletedAt: null }),
  {
    label: "allLinksCount",
  },
)

// For trash, we need raw SQL to query "deletedAt IS NOT NULL"
const trashCountSchema = Schema.Struct({ count: Schema.Number }).pipe(
  Schema.Array,
  Schema.headOrElse(() => ({ count: 0 })),
)

export const trashCount$ = queryDb(
  () => ({
    query: "SELECT COUNT(*) as count FROM links WHERE deletedAt IS NOT NULL",
    schema: trashCountSchema,
  }),
  { label: "trashCount" },
)

// Schema for raw SQL join results (dates are numbers from SQLite)
const LinkWithDetailsSchema = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  domain: Schema.String,
  status: Schema.String,
  createdAt: Schema.Number,
  completedAt: Schema.NullOr(Schema.Number),
  deletedAt: Schema.NullOr(Schema.Number),
  // From link_snapshots
  title: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  image: Schema.NullOr(Schema.String),
  favicon: Schema.NullOr(Schema.String),
  // From link_summaries
  summary: Schema.NullOr(Schema.String),
})

export type LinkWithDetails = typeof LinkWithDetailsSchema.Type
/** @deprecated Use LinkWithDetails instead */
export type LinkWithSnapshot = LinkWithDetails

const linksWithDetailsSchema = Schema.Array(LinkWithDetailsSchema)

// Inbox links (unread, not deleted)
export const inboxLinks$ = queryDb(
  () => ({
    query: `
      SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
             s.title, s.description, s.image, s.favicon,
             sum.summary
      FROM links l
      LEFT JOIN link_snapshots s ON s.id = (
        SELECT s2.id FROM link_snapshots s2
        WHERE s2.linkId = l.id
        ORDER BY s2.fetchedAt DESC
        LIMIT 1
      )
      LEFT JOIN link_summaries sum ON sum.id = (
        SELECT sum2.id FROM link_summaries sum2
        WHERE sum2.linkId = l.id
        ORDER BY sum2.summarizedAt DESC
        LIMIT 1
      )
      WHERE l.status = 'unread' AND l.deletedAt IS NULL
      ORDER BY l.createdAt DESC
    `,
    schema: linksWithDetailsSchema,
  }),
  { label: "inboxLinks" },
)

// Completed links (completed, not deleted)
export const completedLinks$ = queryDb(
  () => ({
    query: `
      SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
             s.title, s.description, s.image, s.favicon,
             sum.summary
      FROM links l
      LEFT JOIN link_snapshots s ON s.id = (
        SELECT s2.id FROM link_snapshots s2
        WHERE s2.linkId = l.id
        ORDER BY s2.fetchedAt DESC
        LIMIT 1
      )
      LEFT JOIN link_summaries sum ON sum.id = (
        SELECT sum2.id FROM link_summaries sum2
        WHERE sum2.linkId = l.id
        ORDER BY sum2.summarizedAt DESC
        LIMIT 1
      )
      WHERE l.status = 'completed' AND l.deletedAt IS NULL
      ORDER BY l.completedAt DESC
    `,
    schema: linksWithDetailsSchema,
  }),
  { label: "completedLinks" },
)

// All links (not deleted)
export const allLinks$ = queryDb(
  () => ({
    query: `
      SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
             s.title, s.description, s.image, s.favicon,
             sum.summary
      FROM links l
      LEFT JOIN link_snapshots s ON s.id = (
        SELECT s2.id FROM link_snapshots s2
        WHERE s2.linkId = l.id
        ORDER BY s2.fetchedAt DESC
        LIMIT 1
      )
      LEFT JOIN link_summaries sum ON sum.id = (
        SELECT sum2.id FROM link_summaries sum2
        WHERE sum2.linkId = l.id
        ORDER BY sum2.summarizedAt DESC
        LIMIT 1
      )
      WHERE l.deletedAt IS NULL
      ORDER BY l.createdAt DESC
    `,
    schema: linksWithDetailsSchema,
  }),
  { label: "allLinks" },
)

// Trash links (deleted)
export const trashLinks$ = queryDb(
  () => ({
    query: `
      SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
             s.title, s.description, s.image, s.favicon,
             sum.summary
      FROM links l
      LEFT JOIN link_snapshots s ON s.id = (
        SELECT s2.id FROM link_snapshots s2
        WHERE s2.linkId = l.id
        ORDER BY s2.fetchedAt DESC
        LIMIT 1
      )
      LEFT JOIN link_summaries sum ON sum.id = (
        SELECT sum2.id FROM link_summaries sum2
        WHERE sum2.linkId = l.id
        ORDER BY sum2.summarizedAt DESC
        LIMIT 1
      )
      WHERE l.deletedAt IS NOT NULL
      ORDER BY l.deletedAt DESC
    `,
    schema: linksWithDetailsSchema,
  }),
  { label: "trashLinks" },
)

// Processing status for a single link
export const linkProcessingStatus$ = (linkId: string) =>
  queryDb(tables.linkProcessingStatus.where({ linkId }).first(), {
    label: `linkProcessingStatus:${linkId}`,
  })
