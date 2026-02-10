import { queryDb, Schema } from "@livestore/livestore";

import { tables } from "../schema";
import {
  linksWithDetailsSchema,
  linkByIdSchema,
  searchResultsSchema,
} from "./schemas";

export type { LinkWithDetails, SearchResult } from "./schemas";

export const inboxCount$ = queryDb(
  tables.links.count().where({ deletedAt: null, status: "unread" }),
  { label: "inboxCount" }
);

export const completedCount$ = queryDb(
  tables.links.count().where({ deletedAt: null, status: "completed" }),
  { label: "completedCount" }
);

export const allLinksCount$ = queryDb(
  tables.links.count().where({ deletedAt: null }),
  { label: "allLinksCount" }
);

const trashCountSchema = Schema.Struct({ count: Schema.Number }).pipe(
  Schema.Array,
  Schema.headOrElse(() => ({ count: 0 }))
);

export const trashCount$ = queryDb(
  () => ({
    query: "SELECT COUNT(*) as count FROM links WHERE deletedAt IS NOT NULL",
    schema: trashCountSchema,
  }),
  { label: "trashCount" }
);

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
  { label: "inboxLinks" }
);

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
  { label: "completedLinks" }
);

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
  { label: "allLinks" }
);

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
  { label: "trashLinks" }
);

export const linkProcessingStatus$ = (linkId: string) =>
  queryDb(tables.linkProcessingStatus.where({ linkId }).first(), {
    label: `linkProcessingStatus:${linkId}`,
  });

export const linkById$ = (id: string) =>
  queryDb(
    {
      bindValues: [id],
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
        WHERE l.id = ?
      `,
      schema: linkByIdSchema,
    },
    { label: `linkById:${id}` }
  );

export const linkByUrl$ = (url: string) =>
  queryDb(
    {
      bindValues: [url],
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
        WHERE l.url = ?
      `,
      schema: linkByIdSchema,
    },
    { label: `linkByUrl` }
  );

export const linksByIds$ = (ids: string[]) => {
  if (ids.length === 0) {
    return queryDb(
      {
        query: "SELECT * FROM links WHERE 0",
        schema: linksWithDetailsSchema,
      },
      { label: "linksByIds:empty" }
    );
  }

  const placeholders = ids.map(() => "?").join(", ");
  return queryDb(
    {
      bindValues: ids,
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
        WHERE l.id IN (${placeholders})
      `,
      schema: linksWithDetailsSchema,
    },
    { label: `linksByIds:${ids.length}` }
  );
};

export const recentlyOpenedLinks$ = queryDb(
  () => ({
    query: `
      SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
             s.title, s.description, s.image, s.favicon,
             sum.summary
      FROM links l
      INNER JOIN (
        SELECT linkId, MAX(occurredAt) as lastOpened
        FROM link_interactions
        WHERE type = 'opened'
        GROUP BY linkId
      ) i ON i.linkId = l.id
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
      ORDER BY i.lastOpened DESC
      LIMIT 10
    `,
    schema: linksWithDetailsSchema,
  }),
  { label: "recentlyOpenedLinks" }
);

export const searchLinks$ = (query: string) => {
  if (!query.trim()) {
    return queryDb(
      {
        query: "SELECT * FROM links WHERE 0",
        schema: searchResultsSchema,
      },
      { label: "searchLinks:empty" }
    );
  }

  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return queryDb(
      {
        query: "SELECT * FROM links WHERE 0",
        schema: searchResultsSchema,
      },
      { label: "searchLinks:empty" }
    );
  }

  const wordConditions = words
    .map(
      (_, i) => `
      (
        LOWER(COALESCE(s.title, '')) LIKE ?${i * 5 + 1}
        OR LOWER(l.domain) LIKE ?${i * 5 + 2}
        OR LOWER(COALESCE(s.description, '')) LIKE ?${i * 5 + 3}
        OR LOWER(COALESCE(sum.summary, '')) LIKE ?${i * 5 + 4}
        OR LOWER(l.url) LIKE ?${i * 5 + 5}
      )`
    )
    .join(" AND ");

  const scoreExpressions = words
    .map(
      (_, i) => `
      CASE WHEN LOWER(COALESCE(s.title, '')) LIKE ?${i * 5 + 1} THEN 100 ELSE 0 END +
      CASE WHEN LOWER(l.domain) LIKE ?${i * 5 + 2} THEN 50 ELSE 0 END +
      CASE WHEN LOWER(COALESCE(s.description, '')) LIKE ?${i * 5 + 3} THEN 30 ELSE 0 END +
      CASE WHEN LOWER(COALESCE(sum.summary, '')) LIKE ?${i * 5 + 4} THEN 20 ELSE 0 END +
      CASE WHEN LOWER(l.url) LIKE ?${i * 5 + 5} THEN 10 ELSE 0 END`
    )
    .join(" + ");

  const bindValues = words.flatMap((word) => {
    const pattern = `%${word}%`;
    return [pattern, pattern, pattern, pattern, pattern];
  });

  return queryDb(
    {
      bindValues,
      query: `
        SELECT
          l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
          s.title, s.description, s.image, s.favicon,
          sum.summary,
          (${scoreExpressions}) AS score
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
          AND ${wordConditions}
        ORDER BY score DESC
        LIMIT 20
      `,
      schema: searchResultsSchema,
    },
    { label: `searchLinks:${query}` }
  );
};
