import { Schema } from "effect";

export class MetadataFetchError extends Schema.TaggedError<MetadataFetchError>()(
  "MetadataFetchError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "Metadata fetch failed",
    }),
    statusCode: Schema.Number,
    url: Schema.String,
  }
) {}

export class MetadataParseError extends Schema.TaggedError<MetadataParseError>()(
  "MetadataParseError",
  {
    cause: Schema.Defect,
    message: Schema.optionalWith(Schema.String, {
      default: () => "Metadata parse failed",
    }),
    url: Schema.String,
  }
) {}

export class MetadataMissingUrlError extends Schema.TaggedError<MetadataMissingUrlError>()(
  "MetadataMissingUrlError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "Missing url parameter",
    }),
  }
) {}

export type MetadataError =
  | MetadataFetchError
  | MetadataParseError
  | MetadataMissingUrlError;
