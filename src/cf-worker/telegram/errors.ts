import { Schema } from "effect";

export class TelegramMissingApiKeyError extends Schema.TaggedError<TelegramMissingApiKeyError>()(
  "TelegramMissingApiKeyError",
  {}
) {}

export class TelegramInvalidApiKeyError extends Schema.TaggedError<TelegramInvalidApiKeyError>()(
  "TelegramInvalidApiKeyError",
  {}
) {}

export class TelegramMissingOrgIdError extends Schema.TaggedError<TelegramMissingOrgIdError>()(
  "TelegramMissingOrgIdError",
  {}
) {}

export class NotConnectedError extends Schema.TaggedError<NotConnectedError>()(
  "NotConnectedError",
  {}
) {}

export class RateLimitError extends Schema.TaggedError<RateLimitError>()(
  "RateLimitError",
  {}
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
