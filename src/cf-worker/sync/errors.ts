import { Schema } from "effect";

import { OrgId } from "../db/branded";

export class MissingSessionCookieError extends Schema.TaggedError<MissingSessionCookieError>()(
  "MissingSessionCookieError",
  {}
) {
  override get message() {
    return "Missing session cookie";
  }
}

export class InvalidSessionError extends Schema.TaggedError<InvalidSessionError>()(
  "InvalidSessionError",
  {}
) {
  override get message() {
    return "Invalid or expired session";
  }
}

export class OrgAccessDeniedError extends Schema.TaggedError<OrgAccessDeniedError>()(
  "OrgAccessDeniedError",
  {
    sessionOrgId: Schema.NullOr(OrgId),
    storeId: OrgId,
  }
) {
  override get message() {
    return "Access denied: not a member of this organization";
  }
}

export class AuthBackendError extends Schema.TaggedError<AuthBackendError>()(
  "AuthBackendError",
  { cause: Schema.Defect }
) {
  override get message() {
    return "Auth backend unavailable";
  }
}

export class MissingApiKeyReferenceError extends Schema.TaggedError<MissingApiKeyReferenceError>()(
  "MissingApiKeyReferenceError",
  {}
) {
  override get message() {
    return "API key missing user reference";
  }
}

export class ForbiddenExtensionOriginError extends Schema.TaggedError<ForbiddenExtensionOriginError>()(
  "ForbiddenExtensionOriginError",
  { origin: Schema.String }
) {
  override get message() {
    return "Extension origin is not allow-listed";
  }
}

export type SyncAuthError =
  | MissingSessionCookieError
  | InvalidSessionError
  | OrgAccessDeniedError
  | AuthBackendError
  | MissingApiKeyReferenceError
  | ForbiddenExtensionOriginError;
