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

// Fired when Better Auth has no usable access token for the linked X account.
// Either the user has disconnected on X's side or the refresh token is gone;
// either way the DO should stop alarming and surface "needs reconnect" in UI.
export class NoAccessTokenError extends Schema.TaggedError<NoAccessTokenError>()(
  "NoAccessTokenError",
  {
    userId: Schema.String,
  }
) {}

// DO storage failure (transient CF Storage error). Always log-and-handle at
// the call site; failure semantics are intentionally simple — we don't want
// a single storage hiccup to crash the alarm loop.
export class XSyncStorageError extends Schema.TaggedError<XSyncStorageError>()(
  "XSyncStorageError",
  {
    op: Schema.String,
    cause: Schema.Unknown,
  }
) {}

// Catch-all for transient infrastructure failures (Cloudflare RPC, queue.send,
// storage.setAlarm). These are always log-and-swallow at the call site — no
// downstream branching depends on the variant — so one tagged error suffices.
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
