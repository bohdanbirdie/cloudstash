import { Schema } from "effect";

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  {}
) {}

export class NoActiveOrgError extends Schema.TaggedError<NoActiveOrgError>()(
  "NoActiveOrgError",
  {
    userId: Schema.String,
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
  | UnauthorizedError
  | NoActiveOrgError
  | KeyCreationError
  | MissingCodeError
  | InvalidCodeError;
