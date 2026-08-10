import { Effect, Schema } from "effect";

export class MetadataFetchError extends Schema.TaggedErrorClass<MetadataFetchError>()(
  "MetadataFetchError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("Metadata fetch failed"))
    ),
    statusCode: Schema.Number,
    url: Schema.String,
  }
) {}

export class MetadataParseError extends Schema.TaggedErrorClass<MetadataParseError>()(
  "MetadataParseError",
  {
    cause: Schema.Defect(),
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("Metadata parse failed"))
    ),
    url: Schema.String,
  }
) {}

export class MetadataMissingUrlError extends Schema.TaggedErrorClass<MetadataMissingUrlError>()(
  "MetadataMissingUrlError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("Missing url parameter"))
    ),
  }
) {}

export type MetadataError =
  | MetadataFetchError
  | MetadataParseError
  | MetadataMissingUrlError;
