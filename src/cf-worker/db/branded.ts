import { Schema } from "effect";

export const UserId = Schema.String.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

export const OrgId = Schema.String.pipe(Schema.brand("OrgId"));
export type OrgId = typeof OrgId.Type;

export const LinkId = Schema.String.pipe(Schema.brand("LinkId"));
export type LinkId = typeof LinkId.Type;

export const InviteId = Schema.String.pipe(Schema.brand("InviteId"));
export type InviteId = typeof InviteId.Type;

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

export const TagId = Schema.String.pipe(Schema.brand("TagId"));
export type TagId = typeof TagId.Type;

export const MemberId = Schema.String.pipe(Schema.brand("MemberId"));
export type MemberId = typeof MemberId.Type;

export const WorkflowInstanceId = Schema.String.pipe(
  Schema.brand("WorkflowInstanceId")
);
export type WorkflowInstanceId = typeof WorkflowInstanceId.Type;

export const XUserId = Schema.String.pipe(Schema.brand("XUserId"));
export type XUserId = typeof XUserId.Type;

export const XTweetId = Schema.String.pipe(Schema.brand("XTweetId"));
export type XTweetId = typeof XTweetId.Type;

export const XUsername = Schema.String.pipe(Schema.brand("XUsername"));
export type XUsername = typeof XUsername.Type;

export const StripeCustomerId = Schema.String.pipe(
  Schema.brand("StripeCustomerId")
);
export type StripeCustomerId = typeof StripeCustomerId.Type;

export const StripeSubscriptionId = Schema.String.pipe(
  Schema.brand("StripeSubscriptionId")
);
export type StripeSubscriptionId = typeof StripeSubscriptionId.Type;

export const StripeSubscriptionItemId = Schema.String.pipe(
  Schema.brand("StripeSubscriptionItemId")
);
export type StripeSubscriptionItemId = typeof StripeSubscriptionItemId.Type;

export const StripePriceId = Schema.String.pipe(Schema.brand("StripePriceId"));
export type StripePriceId = typeof StripePriceId.Type;
