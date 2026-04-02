import { Schema } from "effect";

import { InviteId } from "../db/branded";

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
  {
    inviteId: InviteId,
  }
) {}

export type InviteError =
  | UnauthorizedError
  | ForbiddenError
  | InvalidInviteError
  | InviteNotFoundError;
