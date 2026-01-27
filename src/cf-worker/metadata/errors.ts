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

export class MissingUrlError extends Schema.TaggedError<MissingUrlError>()(
  "MissingUrlError",
  {}
) {}

export type MetadataError =
  | MetadataFetchError
  | MetadataParseError
  | MissingUrlError;
