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
    message:
      /* TODO(effect-v4-codemod): manual migration required for schema-optionalWith-manual */ Schema.optionalWith(
        Schema.String,
        {
          default: () => "AI call failed",
        }
      ),
    url: Schema.optional(Schema.String),
    model: Schema.optional(Schema.String),
    cause: Schema.Unknown,
  }
) {}

export const ContentExtractionReason = Schema.Literals([
  "scheme-rejected",
  "too-many-redirects",
  "body-too-large",
  "upstream-http-error",
  "unknown",
]);
export type ContentExtractionReason = typeof ContentExtractionReason.Type;

export class ContentExtractionError extends Schema.TaggedError<ContentExtractionError>()(
  "ContentExtractionError",
  {
    message:
      /* TODO(effect-v4-codemod): manual migration required for schema-optionalWith-manual */ Schema.optionalWith(
        Schema.String,
        {
          default: () => "Content extraction failed",
        }
      ),
    reason:
      /* TODO(effect-v4-codemod): manual migration required for schema-optionalWith-manual */ Schema.optionalWith(
        ContentExtractionReason,
        {
          default: () => "unknown" as const,
        }
      ),
    url: Schema.optional(Schema.String),
    cause: Schema.Unknown,
  }
) {}

export class ContentExtractorFailure extends Error {
  constructor(
    public readonly reason: ContentExtractionReason,
    message: string
  ) {
    super(message);
    this.name = "ContentExtractorFailure";
  }
}
