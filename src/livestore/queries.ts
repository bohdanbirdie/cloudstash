import { queryDb, Schema } from "@livestore/livestore";

import { tables } from "./schema";

export const inboxCount$ = queryDb(
  tables.links.count().where({ status: "unread", deletedAt: null }),
  { label: "inboxCount" }
);

export const completedCount$ = queryDb(
  tables.links.count().where({ status: "completed", deletedAt: null }),
  { label: "completedCount" }
);

export const allLinksCount$ = queryDb(
  tables.links.count().where({ deletedAt: null }),
  { label: "allLinksCount" }
);

// For trash, we need raw SQL to query "deletedAt IS NOT NULL"
const trashCountSchema = Schema.Struct({ count: Schema.Number }).pipe(
  Schema.Array,
  Schema.headOrElse(() => ({ count: 0 }))
);

export const trashCount$ = queryDb(
  () => ({
    query: "SELECT COUNT(*) as count FROM links WHERE deletedAt IS NOT NULL",
    schema: trashCountSchema,
  }),
  { label: "trashCount" }
);
