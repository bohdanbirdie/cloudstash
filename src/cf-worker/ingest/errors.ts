import { Schema } from "effect";

export class IngestMissingApiKeyError extends Schema.TaggedError<IngestMissingApiKeyError>()(
  "IngestMissingApiKeyError",
  {}
) {}

export class IngestInvalidApiKeyError extends Schema.TaggedError<IngestInvalidApiKeyError>()(
  "IngestInvalidApiKeyError",
  {}
) {}

export class IngestMissingOrgIdError extends Schema.TaggedError<IngestMissingOrgIdError>()(
  "IngestMissingOrgIdError",
  {}
) {}

export class IngestMissingUrlError extends Schema.TaggedError<IngestMissingUrlError>()(
  "IngestMissingUrlError",
  {}
) {}

export class IngestInvalidUrlError extends Schema.TaggedError<IngestInvalidUrlError>()(
  "IngestInvalidUrlError",
  {
    url: Schema.String,
  }
) {}

export class IngestQueueSendError extends Schema.TaggedError<IngestQueueSendError>()(
  "IngestQueueSendError",
  {
    cause: Schema.Unknown,
  }
) {}

export type IngestError =
  | IngestMissingApiKeyError
  | IngestInvalidApiKeyError
  | IngestMissingOrgIdError
  | IngestMissingUrlError
  | IngestInvalidUrlError
  | IngestQueueSendError;
