import { Schema } from 'effect'

export class MissingSessionCookieError extends Schema.TaggedError<MissingSessionCookieError>()(
  'MissingSessionCookieError',
  {},
) {
  get message() {
    return 'Missing session cookie'
  }
}

export class InvalidSessionError extends Schema.TaggedError<InvalidSessionError>()(
  'InvalidSessionError',
  {},
) {
  get message() {
    return 'Invalid or expired session'
  }
}

export class OrgAccessDeniedError extends Schema.TaggedError<OrgAccessDeniedError>()(
  'OrgAccessDeniedError',
  {
    storeId: Schema.String,
    sessionOrgId: Schema.NullOr(Schema.String),
  },
) {
  get message() {
    return 'Access denied: not a member of this organization'
  }
}

export type SyncAuthError = MissingSessionCookieError | InvalidSessionError | OrgAccessDeniedError
