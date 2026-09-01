import { Schema } from "effect";

// Tag names are bare (no reverse-domain namespace) to match the existing
// convention in `link-processor/errors.ts`, `invites/errors.ts`, etc., so
// `Effect.catchTag(s)` calls stay readable across the codebase.

export class XUnauthorizedError extends Schema.TaggedErrorClass<XUnauthorizedError>()(
  "XUnauthorizedError",
  {
    endpoint: Schema.String,
  }
) {}

export class XPaymentRequiredError extends Schema.TaggedErrorClass<XPaymentRequiredError>()(
  "XPaymentRequiredError",
  {
    endpoint: Schema.String,
  }
) {}

export class XRateLimitedError extends Schema.TaggedErrorClass<XRateLimitedError>()(
  "XRateLimitedError",
  {
    endpoint: Schema.String,
    retryAfterMs: Schema.Number,
  }
) {}

export class XApiError extends Schema.TaggedErrorClass<XApiError>()(
  "XApiError",
  {
    endpoint: Schema.String,
    status: Schema.Number,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  }
) {}

export class XSyncStorageError extends Schema.TaggedErrorClass<XSyncStorageError>()(
  "XSyncStorageError",
  {
    op: Schema.String,
    cause: Schema.Unknown,
  }
) {}

export class XSyncSideEffectError extends Schema.TaggedErrorClass<XSyncSideEffectError>()(
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
