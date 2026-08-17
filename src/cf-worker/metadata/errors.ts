import { Effect, Schema } from "effect";

import { BoundedFetchReason } from "../net/bounded-fetch";

export class MetadataFetchError extends Schema.TaggedErrorClass<MetadataFetchError>()(
  "MetadataFetchError",
  {
    errorType: Schema.optional(Schema.String),
    reason: BoundedFetchReason,
    statusCode: Schema.optional(Schema.Number),
  }
) {}

export class MetadataParseError extends Schema.TaggedErrorClass<MetadataParseError>()(
  "MetadataParseError",
  {
    errorType: Schema.String,
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

export class MetadataInvalidTargetError extends Schema.TaggedErrorClass<MetadataInvalidTargetError>()(
  "MetadataInvalidTargetError",
  {}
) {}

export class MetadataRateLimitedError extends Schema.TaggedErrorClass<MetadataRateLimitedError>()(
  "MetadataRateLimitedError",
  {
    retryAfterSeconds: Schema.Number,
  }
) {}

export class MetadataRateLimitBackendError extends Schema.TaggedErrorClass<MetadataRateLimitBackendError>()(
  "MetadataRateLimitBackendError",
  {
    cause: Schema.Defect(),
  }
) {}

export const MetadataError = Schema.Union([
  MetadataFetchError,
  MetadataParseError,
  MetadataMissingUrlError,
  MetadataInvalidTargetError,
  MetadataRateLimitedError,
  MetadataRateLimitBackendError,
]);
export type MetadataError = typeof MetadataError.Type;
