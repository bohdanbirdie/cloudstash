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
    message: Schema.optionalWith(Schema.String, {
      default: () => "AI call failed",
    }),
    url: Schema.optional(Schema.String),
    model: Schema.optional(Schema.String),
    cause: Schema.Unknown,
  }
) {}

export class ContentExtractionError extends Schema.TaggedError<ContentExtractionError>()(
  "ContentExtractionError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "Content extraction failed",
    }),
    url: Schema.optional(Schema.String),
    cause: Schema.Unknown,
  }
) {}
