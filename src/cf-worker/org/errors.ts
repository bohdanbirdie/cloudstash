import { Schema } from "effect";

import { OrgId } from "../db/branded";

export class OrgUnauthorizedError extends Schema.TaggedError<OrgUnauthorizedError>()(
  "OrgUnauthorizedError",
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

export type OrgError =
  | OrgUnauthorizedError
  | OrgNotFoundError
  | AccessDeniedError;
