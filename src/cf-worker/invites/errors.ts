import { Schema } from "effect";

import { InviteId } from "../db/branded";

export class InvitesUnauthorizedError extends Schema.TaggedError<InvitesUnauthorizedError>()(
  "InvitesUnauthorizedError",
  {}
) {}

export class InvitesForbiddenError extends Schema.TaggedError<InvitesForbiddenError>()(
  "InvitesForbiddenError",
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
  | InvitesUnauthorizedError
  | InvitesForbiddenError
  | InvalidInviteError
  | InviteNotFoundError;
