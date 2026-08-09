import { Schema } from "effect";

export class IngestMissingApiKeyError extends Schema.TaggedErrorClass<IngestMissingApiKeyError>()(
  "IngestMissingApiKeyError",
  {}
) {}

export class IngestInvalidApiKeyError extends Schema.TaggedErrorClass<IngestInvalidApiKeyError>()(
  "IngestInvalidApiKeyError",
  {}
) {}

export class IngestMissingOrgIdError extends Schema.TaggedErrorClass<IngestMissingOrgIdError>()(
  "IngestMissingOrgIdError",
  {}
) {}

export class IngestMissingUrlError extends Schema.TaggedErrorClass<IngestMissingUrlError>()(
  "IngestMissingUrlError",
  {}
) {}

export class IngestInvalidUrlError extends Schema.TaggedErrorClass<IngestInvalidUrlError>()(
  "IngestInvalidUrlError",
  {
    url: Schema.String,
  }
) {}

export class IngestQueueSendError extends Schema.TaggedErrorClass<IngestQueueSendError>()(
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
