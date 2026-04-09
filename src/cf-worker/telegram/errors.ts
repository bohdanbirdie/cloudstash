import { Schema } from "effect";

export class TelegramMissingApiKeyError extends Schema.TaggedError<TelegramMissingApiKeyError>()(
  "TelegramMissingApiKeyError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "No API key provided",
    }),
  }
) {}

export class TelegramInvalidApiKeyError extends Schema.TaggedError<TelegramInvalidApiKeyError>()(
  "TelegramInvalidApiKeyError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "Invalid or expired API key",
    }),
  }
) {}

export class TelegramMissingOrgIdError extends Schema.TaggedError<TelegramMissingOrgIdError>()(
  "TelegramMissingOrgIdError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "API key missing orgId",
    }),
  }
) {}

export class NotConnectedError extends Schema.TaggedError<NotConnectedError>()(
  "NotConnectedError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "Telegram chat not connected",
    }),
  }
) {}

export class RateLimitError extends Schema.TaggedError<RateLimitError>()(
  "RateLimitError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "Rate limit exceeded",
    }),
  }
) {}

export class TelegramQueueSendError extends Schema.TaggedError<TelegramQueueSendError>()(
  "TelegramQueueSendError",
  {
    cause: Schema.Unknown,
  }
) {}

export type TelegramError =
  | TelegramMissingApiKeyError
  | TelegramInvalidApiKeyError
  | TelegramMissingOrgIdError
  | NotConnectedError
  | RateLimitError
  | TelegramQueueSendError;
