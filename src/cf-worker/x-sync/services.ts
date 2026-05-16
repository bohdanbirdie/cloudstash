import { Context, Schema } from "effect";
import type { Effect } from "effect";

import { XTweetId, XUserId, XUsername } from "../db/branded";
import type {
  XApiError,
  XPaymentRequiredError,
  XRateLimitedError,
  XUnauthorizedError,
} from "./errors";

export const XBookmarkTweet = Schema.Struct({
  id: XTweetId,
  text: Schema.String,
  author_id: XUserId,
  created_at: Schema.optional(Schema.String),
});
export type XBookmarkTweet = typeof XBookmarkTweet.Type;

export const XUserMe = Schema.Struct({
  id: XUserId,
  username: XUsername,
  name: Schema.String,
  profileImageUrl: Schema.optional(Schema.String),
});
export type XUserMe = typeof XUserMe.Type;

export const BookmarksPage = Schema.Struct({
  data: Schema.Array(XBookmarkTweet),
  nextToken: Schema.optional(Schema.String),
});
export type BookmarksPage = typeof BookmarksPage.Type;

export interface GetBookmarksParams {
  readonly xUserId: XUserId;
  readonly accessToken: string;
  readonly maxResults: number;
  readonly paginationToken?: string;
}

export class XApiClient extends Context.Tag("@cloudstash/x-sync/XApiClient")<
  XApiClient,
  {
    readonly getMe: (
      accessToken: string
    ) => Effect.Effect<XUserMe, XUnauthorizedError | XApiError>;
    readonly getBookmarks: (
      params: GetBookmarksParams
    ) => Effect.Effect<
      BookmarksPage,
      XUnauthorizedError | XPaymentRequiredError | XRateLimitedError | XApiError
    >;
  }
>() {}
