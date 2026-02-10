import { Schema } from "@livestore/livestore";

export const TagSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  sortOrder: Schema.Number,
  createdAt: Schema.Number,
  deletedAt: Schema.NullOr(Schema.Number),
});

export type Tag = typeof TagSchema.Type;

export const TagCountSchema = Schema.Struct({
  tagId: Schema.String,
  count: Schema.Number,
});

export const TagWithCountSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  sortOrder: Schema.Number,
  count: Schema.Number,
});

export type TagWithCount = typeof TagWithCountSchema.Type;

export const LinkWithDetailsSchema = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  domain: Schema.String,
  status: Schema.String,
  createdAt: Schema.Number,
  completedAt: Schema.NullOr(Schema.Number),
  deletedAt: Schema.NullOr(Schema.Number),
  title: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  image: Schema.NullOr(Schema.String),
  favicon: Schema.NullOr(Schema.String),
  summary: Schema.NullOr(Schema.String),
});

export type LinkWithDetails = typeof LinkWithDetailsSchema.Type;

export const linksWithDetailsSchema = Schema.Array(LinkWithDetailsSchema);

export const SearchResultSchema = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  domain: Schema.String,
  status: Schema.String,
  createdAt: Schema.Number,
  completedAt: Schema.NullOr(Schema.Number),
  deletedAt: Schema.NullOr(Schema.Number),
  title: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  image: Schema.NullOr(Schema.String),
  favicon: Schema.NullOr(Schema.String),
  summary: Schema.NullOr(Schema.String),
  score: Schema.Number,
});

export type SearchResult = typeof SearchResultSchema.Type;

export const searchResultsSchema = Schema.Array(SearchResultSchema);

export const linkByIdSchema = Schema.transform(
  Schema.Array(LinkWithDetailsSchema),
  Schema.NullOr(LinkWithDetailsSchema),
  {
    decode: (arr) => arr[0] ?? null,
    encode: (item) => (item ? [item] : []),
  }
);
