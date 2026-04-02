import { Schema } from "effect";

import { OrgId } from "../db/branded";

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  {}
) {}

export class OrgNotFoundError extends Schema.TaggedError<OrgNotFoundError>()(
  "OrgNotFoundError",
  {
    orgId: OrgId,
  }
) {}

export class AccessDeniedError extends Schema.TaggedError<AccessDeniedError>()(
  "AccessDeniedError",
  {}
) {}

export type OrgError = UnauthorizedError | OrgNotFoundError | AccessDeniedError;
