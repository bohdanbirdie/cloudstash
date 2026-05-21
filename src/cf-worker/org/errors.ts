import { Schema } from "effect";

import { OrgId, UserId } from "../db/branded";

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
  {
    orgId: OrgId,
    userId: UserId,
  }
) {}

export class OrgUpstreamError extends Schema.TaggedError<OrgUpstreamError>()(
  "OrgUpstreamError",
  {
    orgId: OrgId,
    cause: Schema.Defect,
  }
) {}

export type OrgError =
  | OrgUnauthorizedError
  | OrgNotFoundError
  | AccessDeniedError
  | OrgUpstreamError;
