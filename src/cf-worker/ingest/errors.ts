import { Schema } from "effect";

export class MissingApiKeyError extends Schema.TaggedError<MissingApiKeyError>()(
  "MissingApiKeyError",
  {}
) {}

export class InvalidApiKeyError extends Schema.TaggedError<InvalidApiKeyError>()(
  "InvalidApiKeyError",
  {}
) {}

export class MissingOrgIdError extends Schema.TaggedError<MissingOrgIdError>()(
  "MissingOrgIdError",
  {}
) {}

export class MissingUrlError extends Schema.TaggedError<MissingUrlError>()(
  "MissingUrlError",
  {}
) {}

export class InvalidUrlError extends Schema.TaggedError<InvalidUrlError>()(
  "InvalidUrlError",
  {
    url: Schema.String,
  }
) {}

export type IngestError =
  | MissingApiKeyError
  | InvalidApiKeyError
  | MissingOrgIdError
  | MissingUrlError
  | InvalidUrlError;
