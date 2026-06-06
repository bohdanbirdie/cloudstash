import { queryDb, Schema } from "@livestore/livestore";

import type { LinkStatus } from "./filtered-links";
import {
  TagCountSchema,
  TagSchema,
  TagSuggestionSchema,
  TagWithCountSchema,
} from "./schemas";

export type { Tag, TagWithCount } from "./schemas";

export const TagByLinkRowSchema = Schema.Struct({
  linkId: Schema.String,
  id: Schema.String,
  name: Schema.String,
  sortOrder: Schema.Number,
  createdAt: Schema.Number,
  deletedAt: Schema.NullOr(Schema.Number),
});

export type TagByLinkRow = typeof TagByLinkRowSchema.Type;

export const allTags$ = queryDb(
  () => ({
    query: `
      SELECT * FROM tags
      WHERE deletedAt IS NULL
      ORDER BY sortOrder ASC
    `,
    schema: Schema.Array(TagSchema),
  }),
  { label: "allTags" }
);

export const tagsForLink$ = (linkId: string) =>
  queryDb(
    {
      bindValues: [linkId],
      query: `
        SELECT t.* FROM tags t
        JOIN link_tags lt ON t.id = lt.tagId
        WHERE lt.linkId = ? AND t.deletedAt IS NULL
        ORDER BY t.sortOrder ASC
      `,
      schema: Schema.Array(TagSchema),
    },
    { label: `tagsForLink:${linkId}` }
  );

export const tagsByLink$ = queryDb(
  () => ({
    query: `
      SELECT lt.linkId, t.id, t.name, t.sortOrder, t.createdAt, t.deletedAt
      FROM tags t
      JOIN link_tags lt ON t.id = lt.tagId
      WHERE t.deletedAt IS NULL
      ORDER BY lt.linkId ASC, t.sortOrder ASC
    `,
    schema: Schema.Array(TagByLinkRowSchema),
  }),
  { label: "tagsByLink" }
);

export const pendingTagsByLink$ = queryDb(
  () => ({
    query: `
      SELECT
        ts.linkId,
        COALESCE(t.id, t_by_name.id, ts.suggestedName) AS id,
        COALESCE(t.name, t_by_name.name, ts.suggestedName) AS name,
        COALESCE(t.sortOrder, t_by_name.sortOrder, 0) AS sortOrder,
        COALESCE(t.createdAt, t_by_name.createdAt, ts.suggestedAt) AS createdAt,
        NULL AS deletedAt
      FROM tag_suggestions ts
      LEFT JOIN tags t ON t.id = ts.tagId AND t.deletedAt IS NULL
      LEFT JOIN tags t_by_name
        ON ts.tagId IS NULL
        AND t_by_name.id = ts.suggestedName
        AND t_by_name.deletedAt IS NULL
      WHERE ts.status = 'pending'
        AND (ts.tagId IS NULL OR t.id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM link_tags lt
          WHERE lt.linkId = ts.linkId
            AND lt.tagId = COALESCE(t.id, t_by_name.id, ts.suggestedName)
        )
      ORDER BY ts.linkId ASC, ts.suggestedAt ASC
    `,
    schema: Schema.Array(TagByLinkRowSchema),
  }),
  { label: "pendingTagsByLink" }
);

export const tagCounts$ = queryDb(
  () => ({
    query: `
      SELECT lt.tagId, COUNT(*) as count
      FROM link_tags lt
      JOIN links l ON lt.linkId = l.id
      JOIN tags t ON lt.tagId = t.id
      WHERE l.deletedAt IS NULL AND t.deletedAt IS NULL
      GROUP BY lt.tagId
    `,
    schema: Schema.Array(TagCountSchema),
  }),
  { label: "tagCounts" }
);

export const allTagsWithCounts$ = queryDb(
  () => ({
    query: `
      SELECT t.id, t.name, t.sortOrder,
             COALESCE((
               SELECT COUNT(*) FROM link_tags lt
               JOIN links l ON lt.linkId = l.id
               WHERE lt.tagId = t.id AND l.deletedAt IS NULL
             ), 0) as count
      FROM tags t
      WHERE t.deletedAt IS NULL
      ORDER BY t.createdAt DESC, t.id DESC
    `,
    schema: Schema.Array(TagWithCountSchema),
  }),
  { label: "allTagsWithCounts" }
);

function linkFilterForStatus(status: LinkStatus): string {
  switch (status) {
    case "inbox":
      return "l.status = 'unread' AND l.deletedAt IS NULL";
    case "completed":
      return "l.status = 'completed' AND l.deletedAt IS NULL";
    case "all":
      return "l.deletedAt IS NULL";
    case "archive":
      return "l.deletedAt IS NOT NULL";
  }
}

export const tagsWithCountsForStatus$ = (status: LinkStatus) =>
  queryDb(
    {
      query: `
        SELECT t.id, t.name, t.sortOrder, c.count AS count
        FROM tags t
        JOIN (
          SELECT eff.tagId AS tagId,
                 COUNT(DISTINCT eff.linkId) AS count
          FROM (
            SELECT lt.tagId AS tagId, lt.linkId AS linkId FROM link_tags lt
            UNION
            SELECT ts.tagId AS tagId, ts.linkId AS linkId FROM tag_suggestions ts
              WHERE ts.tagId IS NOT NULL AND ts.status = 'pending'
            UNION
            SELECT ts.suggestedName AS tagId, ts.linkId AS linkId FROM tag_suggestions ts
              WHERE ts.tagId IS NULL AND ts.status = 'pending'
          ) eff
          JOIN links l ON l.id = eff.linkId
          WHERE ${linkFilterForStatus(status)}
          GROUP BY eff.tagId
        ) c ON c.tagId = t.id
        WHERE t.deletedAt IS NULL
        ORDER BY c.count DESC, t.name ASC
      `,
      schema: Schema.Array(TagWithCountSchema),
    },
    { label: `tagsWithCountsForStatus:${status}` }
  );

export const newTagSuggestionsWithCountsForStatus$ = (status: LinkStatus) =>
  queryDb(
    {
      query: `
        SELECT
          ts.suggestedName AS id,
          ts.suggestedName AS name,
          0 AS sortOrder,
          COUNT(DISTINCT ts.linkId) AS count
        FROM tag_suggestions ts
        JOIN links l ON l.id = ts.linkId
        WHERE ts.tagId IS NULL
          AND ts.status = 'pending'
          AND ${linkFilterForStatus(status)}
          AND NOT EXISTS (
            SELECT 1 FROM tags t
            WHERE t.id = ts.suggestedName AND t.deletedAt IS NULL
          )
        GROUP BY ts.suggestedName
        ORDER BY count DESC, ts.suggestedName ASC
        LIMIT 8
      `,
      schema: Schema.Array(TagWithCountSchema),
    },
    { label: `newTagSuggestionsWithCountsForStatus:${status}` }
  );

export const pendingSuggestionsForLink$ = (linkId: string) =>
  queryDb(
    {
      bindValues: [linkId],
      query: `
        SELECT * FROM tag_suggestions
        WHERE linkId = ? AND status = 'pending'
        ORDER BY suggestedAt ASC
      `,
      schema: Schema.Array(TagSuggestionSchema),
    },
    { label: `pendingSuggestions:${linkId}` }
  );
