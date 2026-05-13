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
        SELECT t.id, t.name, t.sortOrder,
               (
                 SELECT COUNT(*) FROM link_tags lt
                 JOIN links l ON l.id = lt.linkId
                 WHERE lt.tagId = t.id AND ${linkFilterForStatus(status)}
               ) AS count
        FROM tags t
        WHERE t.deletedAt IS NULL
          AND EXISTS (SELECT 1 FROM link_tags lt WHERE lt.tagId = t.id)
        ORDER BY
          (
            SELECT COUNT(*) FROM link_tags lt
            JOIN links l ON l.id = lt.linkId
            WHERE lt.tagId = t.id
              AND l.status = 'unread' AND l.deletedAt IS NULL
          ) DESC,
          t.name ASC
      `,
      schema: Schema.Array(TagWithCountSchema),
    },
    { label: `tagsWithCountsForStatus:${status}` }
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
