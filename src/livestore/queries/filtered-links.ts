import { queryDb } from "@livestore/livestore";

import { allLinks$ } from "./links";
import { linksWithDetailsSchema } from "./schemas";

export type LinkStatus = "inbox" | "completed" | "all" | "trash";

export interface TagFilterOptions {
  tagIds: string[];
  untagged: boolean;
}

export const linksWithTag$ = (tagId: string) =>
  queryDb(
    {
      bindValues: [tagId],
      query: `
        SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
               s.title, s.description, s.image, s.favicon,
               sum.summary
        FROM links l
        INNER JOIN link_tags lt ON lt.linkId = l.id AND lt.tagId = ?
        INNER JOIN tags t ON t.id = lt.tagId AND t.deletedAt IS NULL
        LEFT JOIN link_snapshots s ON s.id = (
          SELECT s2.id FROM link_snapshots s2
          WHERE s2.linkId = l.id ORDER BY s2.fetchedAt DESC LIMIT 1
        )
        LEFT JOIN link_summaries sum ON sum.id = (
          SELECT sum2.id FROM link_summaries sum2
          WHERE sum2.linkId = l.id ORDER BY sum2.summarizedAt DESC LIMIT 1
        )
        WHERE l.deletedAt IS NULL
        ORDER BY l.createdAt DESC
      `,
      schema: linksWithDetailsSchema,
    },
    { label: `linksWithTag:${tagId}` }
  );

export const untaggedLinks$ = queryDb(
  () => ({
    query: `
      SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
             s.title, s.description, s.image, s.favicon,
             sum.summary
      FROM links l
      LEFT JOIN link_snapshots s ON s.id = (
        SELECT s2.id FROM link_snapshots s2
        WHERE s2.linkId = l.id ORDER BY s2.fetchedAt DESC LIMIT 1
      )
      LEFT JOIN link_summaries sum ON sum.id = (
        SELECT sum2.id FROM link_summaries sum2
        WHERE sum2.linkId = l.id ORDER BY sum2.summarizedAt DESC LIMIT 1
      )
      WHERE l.deletedAt IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM link_tags lt
          JOIN tags t ON lt.tagId = t.id
          WHERE lt.linkId = l.id AND t.deletedAt IS NULL
        )
      ORDER BY l.createdAt DESC
    `,
    schema: linksWithDetailsSchema,
  }),
  { label: "untaggedLinks" }
);

export const linksWithAllTags$ = (tagIds: string[]) => {
  if (tagIds.length === 0) {
    return allLinks$;
  }

  const placeholders = tagIds.map(() => "?").join(", ");

  return queryDb(
    {
      bindValues: [...tagIds, tagIds.length],
      query: `
        SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
               s.title, s.description, s.image, s.favicon,
               sum.summary
        FROM links l
        LEFT JOIN link_snapshots s ON s.id = (
          SELECT s2.id FROM link_snapshots s2
          WHERE s2.linkId = l.id ORDER BY s2.fetchedAt DESC LIMIT 1
        )
        LEFT JOIN link_summaries sum ON sum.id = (
          SELECT sum2.id FROM link_summaries sum2
          WHERE sum2.linkId = l.id ORDER BY sum2.summarizedAt DESC LIMIT 1
        )
        WHERE l.deletedAt IS NULL
          AND (
            SELECT COUNT(DISTINCT lt.tagId) FROM link_tags lt
            JOIN tags t ON lt.tagId = t.id
            WHERE lt.linkId = l.id AND lt.tagId IN (${placeholders}) AND t.deletedAt IS NULL
          ) = ?
        ORDER BY l.createdAt DESC
      `,
      schema: linksWithDetailsSchema,
    },
    { label: `linksWithAllTags:${tagIds.length}` }
  );
};

function buildTagFilterClause(options: TagFilterOptions): {
  clause: string;
  bindValues: (string | number)[];
} {
  const { tagIds, untagged } = options;

  if (untagged) {
    return {
      clause: `AND NOT EXISTS (
        SELECT 1 FROM link_tags lt
        JOIN tags t ON lt.tagId = t.id
        WHERE lt.linkId = l.id AND t.deletedAt IS NULL
      )`,
      bindValues: [],
    };
  }

  if (tagIds.length === 0) {
    return { clause: "", bindValues: [] };
  }

  const placeholders = tagIds.map(() => "?").join(", ");
  return {
    clause: `AND (
      SELECT COUNT(DISTINCT lt.tagId) FROM link_tags lt
      JOIN tags t ON lt.tagId = t.id
      WHERE lt.linkId = l.id AND lt.tagId IN (${placeholders}) AND t.deletedAt IS NULL
    ) = ?`,
    bindValues: [...tagIds, tagIds.length],
  };
}

function buildStatusClause(status: LinkStatus): string {
  switch (status) {
    case "inbox":
      return "l.status = 'unread' AND l.deletedAt IS NULL";
    case "completed":
      return "l.status = 'completed' AND l.deletedAt IS NULL";
    case "all":
      return "l.deletedAt IS NULL";
    case "trash":
      return "l.deletedAt IS NOT NULL";
  }
}

function buildOrderByClause(status: LinkStatus): string {
  switch (status) {
    case "completed":
      return "ORDER BY l.completedAt DESC";
    case "trash":
      return "ORDER BY l.deletedAt DESC";
    default:
      return "ORDER BY l.createdAt DESC";
  }
}

export const filteredLinks$ = (
  status: LinkStatus,
  options: TagFilterOptions
) => {
  const statusClause = buildStatusClause(status);
  const orderByClause = buildOrderByClause(status);
  const { clause: tagClause, bindValues } = buildTagFilterClause(options);

  const query = `
    SELECT l.id, l.url, l.domain, l.status, l.createdAt, l.completedAt, l.deletedAt,
           s.title, s.description, s.image, s.favicon,
           sum.summary
    FROM links l
    LEFT JOIN link_snapshots s ON s.id = (
      SELECT s2.id FROM link_snapshots s2
      WHERE s2.linkId = l.id ORDER BY s2.fetchedAt DESC LIMIT 1
    )
    LEFT JOIN link_summaries sum ON sum.id = (
      SELECT sum2.id FROM link_summaries sum2
      WHERE sum2.linkId = l.id ORDER BY sum2.summarizedAt DESC LIMIT 1
    )
    WHERE ${statusClause}
    ${tagClause}
    ${orderByClause}
  `;

  const label = `filteredLinks:${status}:${options.untagged ? "untagged" : options.tagIds.join(",")}`;

  if (bindValues.length === 0) {
    return queryDb({ query, schema: linksWithDetailsSchema }, { label });
  }

  return queryDb(
    { bindValues, query, schema: linksWithDetailsSchema },
    { label }
  );
};
