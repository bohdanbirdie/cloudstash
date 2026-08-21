import { queryDb, Schema } from "@livestore/livestore";
import { SchemaTransformation } from "effect";

import { MAX_LINK_SEARCH_RESULTS } from "../../lib/link-search";
import type {
  LinkCollectionState,
  LinkListSort,
  LinkSearchMatch,
} from "../../lib/links-contract";
import { tables } from "../schema";
import {
  ApiLinkRowSchema,
  apiLinkRowsSchema,
  linksListSchema,
  linkByIdSchema,
  searchResultsSchema,
} from "./schemas";
import type { ApiLinkRow } from "./schemas";

export type { LinkListItem, LinkWithDetails, SearchResult } from "./schemas";

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

export const anyLinksCount$ = queryDb(tables.links.count(), {
  label: "anyLinksCount",
});

const archiveCountSchema = Schema.Array(
  Schema.Struct({ count: Schema.Number })
).pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: (rows) => rows[0]?.count ?? 0,
      encode: (count) => [{ count }],
    })
  )
);

export const archiveCount$ = queryDb(
  () => ({
    query: "SELECT COUNT(*) as count FROM links WHERE deletedAt IS NOT NULL",
    schema: archiveCountSchema,
  }),
  { label: "archiveCount" }
);

export const inboxLinks$ = queryDb(
  () => ({
    query: `
      SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
             s.title, s.description, s.image, s.favicon
      FROM links l
      LEFT JOIN link_snapshots s ON s.id = (
        SELECT s2.id FROM link_snapshots s2
        WHERE s2.linkId = l.id
        ORDER BY s2.fetchedAt DESC
        LIMIT 1
      )
      WHERE l.status = 'unread' AND l.deletedAt IS NULL
      ORDER BY l.createdAt DESC
    `,
    schema: linksListSchema,
  }),
  { label: "inboxLinks" }
);

export const completedLinks$ = queryDb(
  () => ({
    query: `
      SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
             s.title, s.description, s.image, s.favicon
      FROM links l
      LEFT JOIN link_snapshots s ON s.id = (
        SELECT s2.id FROM link_snapshots s2
        WHERE s2.linkId = l.id
        ORDER BY s2.fetchedAt DESC
        LIMIT 1
      )
      WHERE l.status = 'completed' AND l.deletedAt IS NULL
      ORDER BY l.completedAt DESC
    `,
    schema: linksListSchema,
  }),
  { label: "completedLinks" }
);

export const allLinks$ = queryDb(
  () => ({
    query: `
      SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
             s.title, s.description, s.image, s.favicon
      FROM links l
      LEFT JOIN link_snapshots s ON s.id = (
        SELECT s2.id FROM link_snapshots s2
        WHERE s2.linkId = l.id
        ORDER BY s2.fetchedAt DESC
        LIMIT 1
      )
      WHERE l.deletedAt IS NULL
      ORDER BY l.createdAt DESC
    `,
    schema: linksListSchema,
  }),
  { label: "allLinks" }
);

export const archiveLinks$ = queryDb(
  () => ({
    query: `
      SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
             s.title, s.description, s.image, s.favicon
      FROM links l
      LEFT JOIN link_snapshots s ON s.id = (
        SELECT s2.id FROM link_snapshots s2
        WHERE s2.linkId = l.id
        ORDER BY s2.fetchedAt DESC
        LIMIT 1
      )
      WHERE l.deletedAt IS NOT NULL
      ORDER BY l.deletedAt DESC
    `,
    schema: linksListSchema,
  }),
  { label: "archiveLinks" }
);

function apiLinkStateFilter(state: LinkCollectionState): string {
  switch (state) {
    case "inbox":
      return "l.status = 'unread' AND l.deletedAt IS NULL";
    case "completed":
      return "l.status = 'completed' AND l.deletedAt IS NULL";
    case "active":
    case "all": // Backward-compatible alias for active.
      return "l.deletedAt IS NULL";
    case "any":
      return "1 = 1";
    case "archive":
      return "l.deletedAt IS NOT NULL";
  }
}

const LINK_DETAILS_COLUMNS = `
  l.id, l.url, l.domain, l.status, l.source, l.createdAt, l.completedAt, l.deletedAt,
  s.title, s.description, s.image, s.favicon,
  sum.summary
`;

const LINK_DETAILS_FROM = `
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
`;

const API_LINKS_SELECT = `
  SELECT ${LINK_DETAILS_COLUMNS},
         ps.status AS processingStatus
  ${LINK_DETAILS_FROM}
  LEFT JOIN link_processing_status ps ON ps.linkId = l.id
`;

// Keyset (cursor) page over the org's links, ordered createdAt DESC, id DESC.
// `limitPlusOne` should be the page size + 1 so callers can detect a next page.
// `cursor` is the (createdAt, id) of the last item from the previous page.
export const apiLinksPage$ = (opts: {
  state: LinkCollectionState;
  limitPlusOne: number;
  cursor: { createdAt: number; id: string } | null;
  sort?: LinkListSort;
  createdAfter?: number;
  createdBefore?: number;
}) => {
  const filter = apiLinkStateFilter(opts.state);
  const limit = Math.max(1, Math.floor(opts.limitPlusOne));
  const descending = opts.sort !== "oldest";
  const direction = descending ? "DESC" : "ASC";
  const comparison = descending ? "<" : ">";
  const order = `ORDER BY l.createdAt ${direction}, l.id ${direction}`;
  const clauses = [filter];
  const bindValues: Array<number | string> = [];

  if (opts.cursor) {
    clauses.push(
      `(l.createdAt ${comparison} ? OR (l.createdAt = ? AND l.id ${comparison} ?))`
    );
    bindValues.push(
      opts.cursor.createdAt,
      opts.cursor.createdAt,
      opts.cursor.id
    );
  }
  if (opts.createdAfter !== undefined) {
    clauses.push("l.createdAt >= ?");
    bindValues.push(opts.createdAfter);
  }
  if (opts.createdBefore !== undefined) {
    clauses.push("l.createdAt < ?");
    bindValues.push(opts.createdBefore);
  }

  return queryDb(
    {
      bindValues,
      query: `${API_LINKS_SELECT}
        WHERE ${clauses.join(" AND ")}
        ${order}
        LIMIT ${limit}`,
      schema: apiLinkRowsSchema,
    },
    {
      label: `apiLinksPage:${opts.state}:${opts.sort ?? "newest"}:${opts.cursor?.id ?? "head"}:${limit}`,
    }
  );
};

export const apiLinksFilteredCount$ = (opts: {
  state: LinkCollectionState;
  createdAfter?: number;
  createdBefore?: number;
}) => {
  const clauses = [apiLinkStateFilter(opts.state)];
  const bindValues: number[] = [];
  if (opts.createdAfter !== undefined) {
    clauses.push("l.createdAt >= ?");
    bindValues.push(opts.createdAfter);
  }
  if (opts.createdBefore !== undefined) {
    clauses.push("l.createdAt < ?");
    bindValues.push(opts.createdBefore);
  }
  return queryDb(
    {
      bindValues,
      query: `SELECT COUNT(*) AS count FROM links l WHERE ${clauses.join(" AND ")}`,
      schema: archiveCountSchema,
    },
    { label: `apiLinksFilteredCount:${opts.state}` }
  );
};

const apiLinkByIdSchema = apiLinkRowsSchema.pipe(
  Schema.decodeTo(
    Schema.NullOr(ApiLinkRowSchema),
    SchemaTransformation.transform<
      ApiLinkRow | null,
      ReadonlyArray<ApiLinkRow>
    >({
      decode: (rows) => rows[0] ?? null,
      encode: (row) => (row === null ? [] : [row]),
    })
  )
);

export const apiLinkById$ = (id: string) =>
  queryDb(
    {
      bindValues: [id],
      query: `${API_LINKS_SELECT} WHERE l.id = ?`,
      schema: apiLinkByIdSchema,
    },
    { label: `apiLinkById:${id}` }
  );

export const apiLinksCount$ = (state: LinkCollectionState) => {
  switch (state) {
    case "inbox":
      return inboxCount$;
    case "completed":
      return completedCount$;
    case "active":
    case "all":
      return allLinksCount$;
    case "any":
      return anyLinksCount$;
    case "archive":
      return archiveCount$;
  }
};

export const linkProcessingStatus$ = (linkId: string) =>
  queryDb(tables.linkProcessingStatus.where({ linkId }).first(), {
    label: `linkProcessingStatus:${linkId}`,
  });

const linkCreatedAtSchema = Schema.Struct({ createdAt: Schema.Number });

export const linkCreatedAts$ = queryDb(
  () => ({
    query: `SELECT createdAt FROM links`,
    schema: Schema.Array(linkCreatedAtSchema),
  }),
  { label: "linkCreatedAts" }
);

export const linkById$ = (id: string) =>
  queryDb(
    {
      bindValues: [id],
      query: `
        SELECT ${LINK_DETAILS_COLUMNS}
        ${LINK_DETAILS_FROM}
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
        SELECT ${LINK_DETAILS_COLUMNS}
        ${LINK_DETAILS_FROM}
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
        query: `${API_LINKS_SELECT} WHERE 0`,
        schema: apiLinkRowsSchema,
      },
      { label: "linksByIds:empty" }
    );
  }

  const placeholders = ids.map(() => "?").join(", ");
  return queryDb(
    {
      bindValues: ids,
      query: `
        ${API_LINKS_SELECT}
        WHERE l.id IN (${placeholders})
      `,
      schema: apiLinkRowsSchema,
    },
    { label: `linksByIds:${ids.length}` }
  );
};

export const searchLinks$ = (
  query: string,
  options: {
    state?: LinkCollectionState;
    match?: LinkSearchMatch;
    createdAfter?: number;
    createdBefore?: number;
    limit?: number;
  } = {}
) => {
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

  const tagMatchExists = (i: number) => `(
    EXISTS (
      SELECT 1 FROM link_tags lt
      JOIN tags t ON t.id = lt.tagId
      WHERE lt.linkId = l.id
        AND t.deletedAt IS NULL
        AND LOWER(t.name) LIKE ?${i * 6 + 6} ESCAPE '\\'
    )
    OR EXISTS (
      SELECT 1 FROM tag_suggestions ts
      LEFT JOIN tags t ON t.id = ts.tagId
      WHERE ts.linkId = l.id
        AND ts.status = 'pending'
        AND (ts.tagId IS NULL OR t.deletedAt IS NULL)
        AND LOWER(COALESCE(t.name, ts.suggestedName)) LIKE ?${i * 6 + 6} ESCAPE '\\'
    )
  )`;

  const wordConditions = `(${words
    .map(
      (_, i) => `
      (
        LOWER(COALESCE(s.title, '')) LIKE ?${i * 6 + 1} ESCAPE '\\'
        OR LOWER(l.domain) LIKE ?${i * 6 + 2} ESCAPE '\\'
        OR LOWER(COALESCE(s.description, '')) LIKE ?${i * 6 + 3} ESCAPE '\\'
        OR LOWER(COALESCE(sum.summary, '')) LIKE ?${i * 6 + 4} ESCAPE '\\'
        OR LOWER(l.url) LIKE ?${i * 6 + 5} ESCAPE '\\'
        OR ${tagMatchExists(i)}
      )`
    )
    .join(options.match === "all" ? " AND " : " OR ")})`;

  const scoreExpressions = words
    .map(
      (_, i) => `
      CASE WHEN LOWER(COALESCE(s.title, '')) LIKE ?${i * 6 + 1} ESCAPE '\\' THEN 100 ELSE 0 END +
      CASE WHEN ${tagMatchExists(i)} THEN 80 ELSE 0 END +
      CASE WHEN LOWER(l.domain) LIKE ?${i * 6 + 2} ESCAPE '\\' THEN 50 ELSE 0 END +
      CASE WHEN LOWER(COALESCE(s.description, '')) LIKE ?${i * 6 + 3} ESCAPE '\\' THEN 30 ELSE 0 END +
      CASE WHEN LOWER(COALESCE(sum.summary, '')) LIKE ?${i * 6 + 4} ESCAPE '\\' THEN 20 ELSE 0 END +
      CASE WHEN LOWER(l.url) LIKE ?${i * 6 + 5} ESCAPE '\\' THEN 10 ELSE 0 END`
    )
    .join(" + ");

  const bindValues = words.flatMap((word) => {
    const pattern = `%${word.replace(/[\\%_]/g, "\\$&")}%`;
    return [pattern, pattern, pattern, pattern, pattern, pattern];
  });

  const filters = [
    options.state === undefined
      ? "l.deletedAt IS NULL"
      : apiLinkStateFilter(options.state),
    wordConditions,
  ];
  if (options.createdAfter !== undefined) filters.push("l.createdAt >= ?");
  if (options.createdBefore !== undefined) filters.push("l.createdAt < ?");
  const filterValues = [
    ...(options.createdAfter === undefined ? [] : [options.createdAfter]),
    ...(options.createdBefore === undefined ? [] : [options.createdBefore]),
  ];
  const limit = Math.max(
    1,
    Math.min(options.limit ?? MAX_LINK_SEARCH_RESULTS, MAX_LINK_SEARCH_RESULTS)
  );

  return queryDb(
    {
      bindValues: [...bindValues, ...filterValues],
      query: `
        SELECT ${LINK_DETAILS_COLUMNS},
          ps.status AS processingStatus,
          (${scoreExpressions}) AS score
        ${LINK_DETAILS_FROM}
        LEFT JOIN link_processing_status ps ON ps.linkId = l.id
        WHERE ${filters.join(" AND ")}
        ORDER BY score DESC, l.createdAt DESC, l.id DESC
        LIMIT ${limit}
      `,
      schema: searchResultsSchema,
    },
    { label: `searchLinks:${query}` }
  );
};
