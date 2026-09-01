import { Effect, Schema } from "effect";

export class TelegramMissingApiKeyError extends Schema.TaggedError<TelegramMissingApiKeyError>()(
  "TelegramMissingApiKeyError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("No API key provided"))
    ),
  }
) {}

export class TelegramInvalidApiKeyError extends Schema.TaggedError<TelegramInvalidApiKeyError>()(
  "TelegramInvalidApiKeyError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(
        Effect.succeed("Invalid or expired API key")
      )
    ),
  }
) {}

export class TelegramMissingOrgIdError extends Schema.TaggedError<TelegramMissingOrgIdError>()(
  "TelegramMissingOrgIdError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("API key missing orgId"))
    ),
  }
) {}

export class NotConnectedError extends Schema.TaggedError<NotConnectedError>()(
  "NotConnectedError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(
        Effect.succeed("Telegram chat not connected")
      )
    ),
  }
) {}

export class RateLimitError extends Schema.TaggedError<RateLimitError>()(
  "RateLimitError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("Rate limit exceeded"))
    ),
  }
) {}

export class TelegramAuthUnavailableError extends Schema.TaggedError<TelegramAuthUnavailableError>()(
  "TelegramAuthUnavailableError",
  {
    cause: Schema.Defect(),
    operation: Schema.Literals([
      "getSession",
      "verifyApiKey",
      "lookupUser",
      "lookupMembership",
      "lookupCapabilities",
    ]),
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
  | TelegramAuthUnavailableError
  | TelegramQueueSendError;
