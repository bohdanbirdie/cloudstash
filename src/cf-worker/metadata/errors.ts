import { Schema } from "effect";

export class MetadataFetchError extends Schema.TaggedError<MetadataFetchError>()(
  "MetadataFetchError",
  {
    message:
      /* TODO(effect-v4-codemod): manual migration required for schema-optionalWith-manual */ Schema.optionalWith(
        Schema.String,
        {
          default: () => "Metadata fetch failed",
        }
      ),
    statusCode: Schema.Number,
    url: Schema.String,
  }
) {}

export class MetadataParseError extends Schema.TaggedError<MetadataParseError>()(
  "MetadataParseError",
  {
    cause: Schema.Defect,
    message:
      /* TODO(effect-v4-codemod): manual migration required for schema-optionalWith-manual */ Schema.optionalWith(
        Schema.String,
        {
          default: () => "Metadata parse failed",
        }
      ),
    url: Schema.String,
  }
) {}

export class MetadataMissingUrlError extends Schema.TaggedError<MetadataMissingUrlError>()(
  "MetadataMissingUrlError",
  {
    message:
      /* TODO(effect-v4-codemod): manual migration required for schema-optionalWith-manual */ Schema.optionalWith(
        Schema.String,
        {
          default: () => "Missing url parameter",
        }
      ),
  }
) {}

export type MetadataError =
  | MetadataFetchError
  | MetadataParseError
  | MetadataMissingUrlError;
