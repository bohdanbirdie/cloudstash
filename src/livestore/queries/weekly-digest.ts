import { queryDb, Schema } from "@livestore/livestore";

const WeeklyDigestRowSchema = Schema.Struct({
  contentMd: Schema.String,
  generatedAt: Schema.Number,
  id: Schema.String,
  period: Schema.String,
});

export type WeeklyDigestRow = typeof WeeklyDigestRowSchema.Type;

export const weeklyDigests$ = queryDb(
  () => ({
    query: `
      SELECT id, period, contentMd, generatedAt
      FROM weekly_digests
      ORDER BY generatedAt DESC
    `,
    schema: Schema.Array(WeeklyDigestRowSchema),
  }),
  { label: "weeklyDigests" }
);
