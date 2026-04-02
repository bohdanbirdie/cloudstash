import { Schema } from "effect";

export class LinkProcessorInvalidUrlError extends Schema.TaggedError<LinkProcessorInvalidUrlError>()(
  "LinkProcessorInvalidUrlError",
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
