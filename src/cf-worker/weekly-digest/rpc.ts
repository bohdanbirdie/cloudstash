import { Schema } from "effect";

export const WeeklyDigestFailureReason = Schema.Literal(
  "generator",
  "link-source",
  "event-sink",
  "defect"
);
export type WeeklyDigestFailureReason = Schema.Schema.Type<
  typeof WeeklyDigestFailureReason
>;

export const WeeklyDigestRpcResult = Schema.Union(
  Schema.Struct({
    linkCount: Schema.Number,
    period: Schema.String,
    status: Schema.Literal("generated"),
  }),
  Schema.Struct({
    period: Schema.String,
    status: Schema.Literal("skipped-empty"),
  }),
  Schema.Struct({
    message: Schema.String,
    reason: WeeklyDigestFailureReason,
    status: Schema.Literal("failed"),
  }),
  Schema.Struct({
    status: Schema.Literal("dropped-deletion"),
  })
);
export type WeeklyDigestRpcResult = Schema.Schema.Type<
  typeof WeeklyDigestRpcResult
>;
