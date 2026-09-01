import { Schema } from "effect";

import { OrgId, UserId } from "../db/branded";

export class OrgUnauthorizedError extends Schema.TaggedErrorClass<OrgUnauthorizedError>()(
  "OrgUnauthorizedError",
  {}
) {}

export class OrgNotFoundError extends Schema.TaggedErrorClass<OrgNotFoundError>()(
  "OrgNotFoundError",
  {
    orgId: OrgId,
  }
) {}

export class AccessDeniedError extends Schema.TaggedErrorClass<AccessDeniedError>()(
  "AccessDeniedError",
  {
    orgId: OrgId,
    userId: UserId,
  }
) {}

export class OrgUpstreamError extends Schema.TaggedErrorClass<OrgUpstreamError>()(
  "OrgUpstreamError",
  {
    orgId: OrgId,
    cause: Schema.Defect(),
  }
) {}

export type OrgError =
  | OrgUnauthorizedError
  | OrgNotFoundError
  | AccessDeniedError
  | OrgUpstreamError;
