import { Schema } from "effect";

import { UserId } from "../db/branded";

export class ConnectUnauthorizedError extends Schema.TaggedErrorClass<ConnectUnauthorizedError>()(
  "ConnectUnauthorizedError",
  {}
) {}

export class NoActiveOrgError extends Schema.TaggedErrorClass<NoActiveOrgError>()(
  "NoActiveOrgError",
  {
    userId: UserId,
  }
) {}

export class KeyCreationError extends Schema.TaggedErrorClass<KeyCreationError>()(
  "KeyCreationError",
  {
    reason: Schema.Literals(["auth_backend", "missing_key", "missing_id"]),
    cause: Schema.optional(Schema.Defect()),
  }
) {}

export class MissingCodeError extends Schema.TaggedErrorClass<MissingCodeError>()(
  "MissingCodeError",
  {}
) {}

export class InvalidCodeError extends Schema.TaggedErrorClass<InvalidCodeError>()(
  "InvalidCodeError",
  {}
) {}

export class SessionLookupError extends Schema.TaggedErrorClass<SessionLookupError>()(
  "SessionLookupError",
  {
    cause: Schema.Defect(),
  }
) {}

export type ConnectError =
  | ConnectUnauthorizedError
  | NoActiveOrgError
  | KeyCreationError
  | MissingCodeError
  | InvalidCodeError
  | SessionLookupError;
