import { Context, Schema } from "effect";
import type { Effect } from "effect";

import { XTweetId, XUsername } from "../db/branded";
import type { AnyThreadProviderError } from "./errors";

export const ThreadTweet = Schema.Struct({
  id: XTweetId,
  text: Schema.String,
  authorScreenName: Schema.NullOr(XUsername),
  authorName: Schema.NullOr(Schema.String),
  createdAt: Schema.NullOr(Schema.String),
  quotedText: Schema.NullOr(Schema.String),
  quotedAuthorScreenName: Schema.NullOr(XUsername),
  inReplyToId: Schema.NullOr(XTweetId),
  conversationId: Schema.NullOr(XTweetId),
  externalUrls: Schema.Array(Schema.String),
});
export type ThreadTweet = typeof ThreadTweet.Type;

export const ThreadContext = Schema.Struct({
  root: ThreadTweet,
  authorContinuations: Schema.Array(ThreadTweet),
  isReply: Schema.Boolean,
});
export type ThreadContext = typeof ThreadContext.Type;

export interface FetchThreadParams {
  readonly url: string;
}

export class ThreadProvider extends Context.Tag("@cloudstash/ThreadProvider")<
  ThreadProvider,
  {
    readonly fetchContext: (
      params: FetchThreadParams
    ) => Effect.Effect<ThreadContext, AnyThreadProviderError>;
  }
>() {}
