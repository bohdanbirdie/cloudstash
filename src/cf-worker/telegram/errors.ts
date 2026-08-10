import { Effect, Schema } from "effect";

export class TelegramMissingApiKeyError extends Schema.TaggedErrorClass<TelegramMissingApiKeyError>()(
  "TelegramMissingApiKeyError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("No API key provided"))
    ),
  }
) {}

export class TelegramInvalidApiKeyError extends Schema.TaggedErrorClass<TelegramInvalidApiKeyError>()(
  "TelegramInvalidApiKeyError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(
        Effect.succeed("Invalid or expired API key")
      )
    ),
  }
) {}

export class TelegramMissingOrgIdError extends Schema.TaggedErrorClass<TelegramMissingOrgIdError>()(
  "TelegramMissingOrgIdError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("API key missing orgId"))
    ),
  }
) {}

export class NotConnectedError extends Schema.TaggedErrorClass<NotConnectedError>()(
  "NotConnectedError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(
        Effect.succeed("Telegram chat not connected")
      )
    ),
  }
) {}

export class RateLimitError extends Schema.TaggedErrorClass<RateLimitError>()(
  "RateLimitError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("Rate limit exceeded"))
    ),
  }
) {}

export class TelegramQueueSendError extends Schema.TaggedErrorClass<TelegramQueueSendError>()(
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
