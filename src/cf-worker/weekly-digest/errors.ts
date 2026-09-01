import { Schema } from "effect";

interface AiSdkErrorShape {
  statusCode?: number;
  lastError?: { statusCode?: number };
  message?: string;
}

const isObject = (e: unknown): e is AiSdkErrorShape =>
  e !== null && typeof e === "object";

export class WeeklyDigestGenerateError extends Schema.TaggedError<WeeklyDigestGenerateError>()(
  "WeeklyDigestGenerateError",
  {
    message: Schema.String,
    statusCode: Schema.optional(Schema.Number),
    model: Schema.optional(Schema.String),
    linkCount: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Unknown),
  }
) {}

export interface WeeklyDigestGenerateContext {
  readonly model: string;
  readonly linkCount: number;
}

export const weeklyDigestGenerateErrorFromAiSdk =
  (context: WeeklyDigestGenerateContext) =>
  (cause: unknown): WeeklyDigestGenerateError => {
    const message =
      isObject(cause) && typeof cause.message === "string"
        ? cause.message
        : String(cause);
    const statusCode = isObject(cause)
      ? (cause.statusCode ?? cause.lastError?.statusCode)
      : undefined;
    return new WeeklyDigestGenerateError({
      cause,
      linkCount: context.linkCount,
      message,
      model: context.model,
      statusCode,
    });
  };

export class DigestLinkSourceError extends Schema.TaggedError<DigestLinkSourceError>()(
  "DigestLinkSourceError",
  {
    message: Schema.String,
    operation: Schema.Literal("collect"),
    cause: Schema.optional(Schema.Unknown),
  }
) {}

export const digestLinkSourceErrorFromUnknown = (
  cause: unknown
): DigestLinkSourceError =>
  new DigestLinkSourceError({
    cause,
    message: cause instanceof Error ? cause.message : String(cause),
    operation: "collect",
  });

export class DigestEventSinkError extends Schema.TaggedError<DigestEventSinkError>()(
  "DigestEventSinkError",
  {
    message: Schema.String,
    operation: Schema.Literal("commit"),
    cause: Schema.optional(Schema.Unknown),
  }
) {}

export const digestEventSinkErrorFromUnknown = (
  cause: unknown
): DigestEventSinkError =>
  new DigestEventSinkError({
    cause,
    message: cause instanceof Error ? cause.message : String(cause),
    operation: "commit",
  });
