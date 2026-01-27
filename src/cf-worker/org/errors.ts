import { Schema } from "effect";

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  {}
) {}

export class OrgNotFoundError extends Schema.TaggedError<OrgNotFoundError>()(
  "OrgNotFoundError",
  {}
) {}

export class AccessDeniedError extends Schema.TaggedError<AccessDeniedError>()(
  "AccessDeniedError",
  {}
) {}

export type OrgError = UnauthorizedError | OrgNotFoundError | AccessDeniedError;
