import { Schema } from "effect";

import { UserId } from "../db/branded";

export class ConnectUnauthorizedError extends Schema.TaggedError<ConnectUnauthorizedError>()(
  "ConnectUnauthorizedError",
  {}
) {}

export class NoActiveOrgError extends Schema.TaggedError<NoActiveOrgError>()(
  "NoActiveOrgError",
  {
    userId: UserId,
  }
) {}

export class KeyCreationError extends Schema.TaggedError<KeyCreationError>()(
  "KeyCreationError",
  {
    cause: Schema.Defect,
  }
) {}

export class MissingCodeError extends Schema.TaggedError<MissingCodeError>()(
  "MissingCodeError",
  {}
) {}

export class InvalidCodeError extends Schema.TaggedError<InvalidCodeError>()(
  "InvalidCodeError",
  {}
) {}

export type ConnectError =
  | ConnectUnauthorizedError
  | NoActiveOrgError
  | KeyCreationError
  | MissingCodeError
  | InvalidCodeError;
