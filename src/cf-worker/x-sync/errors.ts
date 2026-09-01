import { Schema } from "effect";

// Tag names are bare (no reverse-domain namespace) to match the existing
// convention in `link-processor/errors.ts`, `invites/errors.ts`, etc., so
// `Effect.catchTag(s)` calls stay readable across the codebase.

export class XUnauthorizedError extends Schema.TaggedError<XUnauthorizedError>()(
  "XUnauthorizedError",
  {
    endpoint: Schema.String,
  }
) {}

export class XPaymentRequiredError extends Schema.TaggedError<XPaymentRequiredError>()(
  "XPaymentRequiredError",
  {
    endpoint: Schema.String,
  }
) {}

export class XRateLimitedError extends Schema.TaggedError<XRateLimitedError>()(
  "XRateLimitedError",
  {
    endpoint: Schema.String,
    retryAfterMs: Schema.Number,
  }
) {}

export class XApiError extends Schema.TaggedError<XApiError>()("XApiError", {
  endpoint: Schema.String,
  status: Schema.Number,
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class XSyncStorageError extends Schema.TaggedError<XSyncStorageError>()(
  "XSyncStorageError",
  {
    op: Schema.String,
    cause: Schema.Unknown,
  }
) {}

export class XSyncSideEffectError extends Schema.TaggedError<XSyncSideEffectError>()(
  "XSyncSideEffectError",
  {
    op: Schema.String,
    cause: Schema.Unknown,
  }
) {}

export type XApiFailure =
  | XUnauthorizedError
  | XPaymentRequiredError
  | XRateLimitedError
  | XApiError;
