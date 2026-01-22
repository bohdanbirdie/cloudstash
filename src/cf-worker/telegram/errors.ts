import { Schema } from 'effect'

export class MissingChatIdError extends Schema.TaggedError<MissingChatIdError>()(
  'MissingChatIdError',
  {},
) {}

export class MissingApiKeyError extends Schema.TaggedError<MissingApiKeyError>()(
  'MissingApiKeyError',
  {},
) {}

export class InvalidApiKeyError extends Schema.TaggedError<InvalidApiKeyError>()(
  'InvalidApiKeyError',
  {},
) {}

export class MissingOrgIdError extends Schema.TaggedError<MissingOrgIdError>()(
  'MissingOrgIdError',
  {},
) {}

export class NotConnectedError extends Schema.TaggedError<NotConnectedError>()(
  'NotConnectedError',
  {},
) {}

export type TelegramError =
  | MissingChatIdError
  | MissingApiKeyError
  | InvalidApiKeyError
  | MissingOrgIdError
  | NotConnectedError
