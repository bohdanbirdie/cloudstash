import { Effect, Schema } from "effect";

import { OrgId, XTweetId } from "../db/branded";

export class ThreadProviderInvalidUrlError extends Schema.TaggedErrorClass<ThreadProviderInvalidUrlError>()(
  "ThreadProviderInvalidUrlError",
  {
    url: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  }
) {}

export class ThreadProviderTransportError extends Schema.TaggedErrorClass<ThreadProviderTransportError>()(
  "ThreadProviderTransportError",
  {
    url: Schema.String,
    cause: Schema.Defect(),
  }
) {}

export class ThreadProviderHttpError extends Schema.TaggedErrorClass<ThreadProviderHttpError>()(
  "ThreadProviderHttpError",
  {
    url: Schema.String,
    status: Schema.Number,
    tweetId: Schema.optional(XTweetId),
  }
) {}

export class ThreadProviderResponseError extends Schema.TaggedErrorClass<ThreadProviderResponseError>()(
  "ThreadProviderResponseError",
  {
    url: Schema.String,
    tweetId: Schema.optional(XTweetId),
    cause: Schema.Defect(),
  }
) {}

export class ThreadProviderEmptyError extends Schema.TaggedErrorClass<ThreadProviderEmptyError>()(
  "ThreadProviderEmptyError",
  {
    url: Schema.String,
    tweetId: XTweetId,
  }
) {}

export class ThreadProviderTimeoutError extends Schema.TaggedErrorClass<ThreadProviderTimeoutError>()(
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

export class EnrichmentBudgetExhaustedError extends Schema.TaggedErrorClass<EnrichmentBudgetExhaustedError>()(
  "EnrichmentBudgetExhaustedError",
  {
    storeId: OrgId,
    period: Schema.String,
    used: Schema.Number,
    cap: Schema.Number,
  }
) {}

export class EnrichmentGenerateError extends Schema.TaggedErrorClass<EnrichmentGenerateError>()(
  "EnrichmentGenerateError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(
        Effect.succeed("Enrichment LLM call failed")
      )
    ),
    model: Schema.String,
    promptChars: Schema.optional(Schema.Number),
    inputTokens: Schema.optional(Schema.Number),
    outputTokens: Schema.optional(Schema.Number),
    cause: Schema.Defect(),
  }
) {}
