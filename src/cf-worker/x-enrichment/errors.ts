import { Schema } from "effect";

import { OrgId, XTweetId } from "../db/branded";

export class ThreadProviderInvalidUrlError extends Schema.TaggedError<ThreadProviderInvalidUrlError>()(
  "ThreadProviderInvalidUrlError",
  {
    url: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export class ThreadProviderTransportError extends Schema.TaggedError<ThreadProviderTransportError>()(
  "ThreadProviderTransportError",
  {
    url: Schema.String,
    cause: Schema.Defect,
  }
) {}

export class ThreadProviderHttpError extends Schema.TaggedError<ThreadProviderHttpError>()(
  "ThreadProviderHttpError",
  {
    url: Schema.String,
    status: Schema.Number,
    tweetId: Schema.optional(XTweetId),
  }
) {}

export class ThreadProviderResponseError extends Schema.TaggedError<ThreadProviderResponseError>()(
  "ThreadProviderResponseError",
  {
    url: Schema.String,
    tweetId: Schema.optional(XTweetId),
    cause: Schema.Defect,
  }
) {}

export class ThreadProviderEmptyError extends Schema.TaggedError<ThreadProviderEmptyError>()(
  "ThreadProviderEmptyError",
  {
    url: Schema.String,
    tweetId: XTweetId,
  }
) {}

export class ThreadProviderTimeoutError extends Schema.TaggedError<ThreadProviderTimeoutError>()(
  "ThreadProviderTimeoutError",
  {
    url: Schema.String,
    tweetId: Schema.optional(XTweetId),
  }
) {}

export type AnyThreadProviderError =
  | ThreadProviderInvalidUrlError
  | ThreadProviderTransportError
  | ThreadProviderHttpError
  | ThreadProviderResponseError
  | ThreadProviderEmptyError
  | ThreadProviderTimeoutError;

export class EnrichmentBudgetExhaustedError extends Schema.TaggedError<EnrichmentBudgetExhaustedError>()(
  "EnrichmentBudgetExhaustedError",
  {
    storeId: OrgId,
    period: Schema.String,
    used: Schema.Number,
    cap: Schema.Number,
  }
) {}

export class EnrichmentGenerateError extends Schema.TaggedError<EnrichmentGenerateError>()(
  "EnrichmentGenerateError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "Enrichment LLM call failed",
    }),
    model: Schema.String,
    promptChars: Schema.optional(Schema.Number),
    inputTokens: Schema.optional(Schema.Number),
    outputTokens: Schema.optional(Schema.Number),
    cause: Schema.Defect,
  }
) {}
