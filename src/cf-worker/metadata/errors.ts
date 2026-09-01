import { Effect, Schema } from "effect";

import { BoundedFetchReason } from "../net/bounded-fetch";

export class MetadataFetchError extends Schema.TaggedError<MetadataFetchError>()(
  "MetadataFetchError",
  {
    errorType: Schema.optional(Schema.String),
    reason: BoundedFetchReason,
    statusCode: Schema.optional(Schema.Number),
  }
) {}

export class MetadataParseError extends Schema.TaggedError<MetadataParseError>()(
  "MetadataParseError",
  {
    errorType: Schema.String,
  }
) {}

export class MetadataMissingUrlError extends Schema.TaggedError<MetadataMissingUrlError>()(
  "MetadataMissingUrlError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("Missing url parameter"))
    ),
  }
) {}

export class MetadataInvalidTargetError extends Schema.TaggedError<MetadataInvalidTargetError>()(
  "MetadataInvalidTargetError",
  {}
) {}

export class MetadataRateLimitedError extends Schema.TaggedError<MetadataRateLimitedError>()(
  "MetadataRateLimitedError",
  {
    retryAfterSeconds: Schema.Number,
  }
) {}

export class MetadataRateLimitBackendError extends Schema.TaggedError<MetadataRateLimitBackendError>()(
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
