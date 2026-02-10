import { queryDb, Schema } from "@livestore/livestore";

import { TagSchema, TagCountSchema, TagWithCountSchema } from "./schemas";

export type { Tag, TagWithCount } from "./schemas";

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
      ORDER BY LOWER(t.name) ASC
    `,
    schema: Schema.Array(TagWithCountSchema),
  }),
  { label: "allTagsWithCounts" }
);

export const untaggedCount$ = queryDb(
  () => ({
    query: `
      SELECT COUNT(*) as count FROM links l
      WHERE l.deletedAt IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM link_tags lt
          JOIN tags t ON lt.tagId = t.id
          WHERE lt.linkId = l.id AND t.deletedAt IS NULL
        )
    `,
    schema: Schema.Struct({ count: Schema.Number }).pipe(
      Schema.Array,
      Schema.headOrElse(() => ({ count: 0 }))
    ),
  }),
  { label: "untaggedCount" }
);
