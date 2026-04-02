import { Schema } from "effect";

export class MetadataFetchError extends Schema.TaggedError<MetadataFetchError>()(
  "MetadataFetchError",
  {
    statusCode: Schema.Number,
    url: Schema.String,
  }
) {}

export class MetadataParseError extends Schema.TaggedError<MetadataParseError>()(
  "MetadataParseError",
  {
    error: Schema.Defect,
    url: Schema.String,
  }
) {}

export class MetadataMissingUrlError extends Schema.TaggedError<MetadataMissingUrlError>()(
  "MetadataMissingUrlError",
  {}
) {}

export type MetadataError =
  | MetadataFetchError
  | MetadataParseError
  | MetadataMissingUrlError;
