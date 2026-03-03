import { Schema } from "effect";

export class MissingApiKeyError extends Schema.TaggedError<MissingApiKeyError>()(
  "MissingApiKeyError",
  {}
) {}

export class InvalidApiKeyError extends Schema.TaggedError<InvalidApiKeyError>()(
  "InvalidApiKeyError",
  {}
) {}

export class MissingOrgIdError extends Schema.TaggedError<MissingOrgIdError>()(
  "MissingOrgIdError",
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

export class QueueSendError extends Schema.TaggedError<QueueSendError>()(
  "QueueSendError",
  {
    cause: Schema.Unknown,
  }
) {}

export type TelegramError =
  | MissingApiKeyError
  | InvalidApiKeyError
  | MissingOrgIdError
  | NotConnectedError
  | RateLimitError
  | QueueSendError;
