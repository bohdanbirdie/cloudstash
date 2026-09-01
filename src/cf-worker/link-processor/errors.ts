import { Effect, Schema } from "effect";

export class LinkProcessorInvalidUrlError extends Schema.TaggedError<LinkProcessorInvalidUrlError>()(
  "LinkProcessorInvalidUrlError",
  {
    url: Schema.String,
  }
) {}

export class AiCallError extends Schema.TaggedError<AiCallError>()(
  "AiCallError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("AI call failed"))
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
  "content-type-rejected",
  "timeout",
  "upstream-http-error",
  "unknown",
]);
export type ContentExtractionReason = typeof ContentExtractionReason.Type;

export class ContentExtractionError extends Schema.TaggedError<ContentExtractionError>()(
  "ContentExtractionError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("Content extraction failed"))
    ),
    reason: ContentExtractionReason.pipe(
      Schema.withConstructorDefault(Effect.succeed("unknown" as const))
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
