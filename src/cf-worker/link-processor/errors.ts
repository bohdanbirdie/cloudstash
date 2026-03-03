import { Schema } from "effect";

export class InvalidUrlError extends Schema.TaggedError<InvalidUrlError>()(
  "InvalidUrlError",
  {
    url: Schema.String,
  }
) {}

export class AiCallError extends Schema.TaggedError<AiCallError>()(
  "AiCallError",
  {
    cause: Schema.Unknown,
  }
) {}

export class ContentExtractionError extends Schema.TaggedError<ContentExtractionError>()(
  "ContentExtractionError",
  {
    cause: Schema.Unknown,
  }
) {}
