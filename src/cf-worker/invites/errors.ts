import { Schema } from "effect";

import { InviteId } from "../db/branded";

export class InvitesUnauthorizedError extends Schema.TaggedErrorClass<InvitesUnauthorizedError>()(
  "InvitesUnauthorizedError",
  {}
) {}

export class InvitesForbiddenError extends Schema.TaggedErrorClass<InvitesForbiddenError>()(
  "InvitesForbiddenError",
  {}
) {}

export class InvalidInviteError extends Schema.TaggedErrorClass<InvalidInviteError>()(
  "InvalidInviteError",
  {}
) {}

export class InviteNotFoundError extends Schema.TaggedErrorClass<InviteNotFoundError>()(
  "InviteNotFoundError",
  {
    inviteId: InviteId,
  }
) {}

export class InvalidInviteRequestError extends Schema.TaggedErrorClass<InvalidInviteRequestError>()(
  "InvalidInviteRequestError",
  {
    reason: Schema.String,
  }
) {}

export type InviteError =
  | InvitesUnauthorizedError
  | InvitesForbiddenError
  | InvalidInviteError
  | InviteNotFoundError
  | InvalidInviteRequestError;
