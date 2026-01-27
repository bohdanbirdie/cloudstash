import { Schema } from "effect";

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  {}
) {}

export class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
  "ForbiddenError",
  {}
) {}

export class InvalidInviteError extends Schema.TaggedError<InvalidInviteError>()(
  "InvalidInviteError",
  {}
) {}

export class InviteNotFoundError extends Schema.TaggedError<InviteNotFoundError>()(
  "InviteNotFoundError",
  {}
) {}

export type InviteError =
  | UnauthorizedError
  | ForbiddenError
  | InvalidInviteError
  | InviteNotFoundError;
