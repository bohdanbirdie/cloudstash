import { makePersistedAdapter } from "@livestore/adapter-web";
import { queryDb, Schema, StoreRegistry } from "@livestore/livestore";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";

import LiveStoreSharedWorker from "../../lib/livestore-shared-worker?sharedworker";
import LiveStoreWorker from "../../lib/livestore.worker?worker";

export const adapter = makePersistedAdapter({
  sharedWorker: LiveStoreSharedWorker,
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
});

export const storeRegistry = new StoreRegistry({
  defaultOptions: { batchUpdates },
});

const recentLinksSchema = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    url: Schema.String,
    domain: Schema.String,
    title: Schema.NullOr(Schema.String),
    createdAt: Schema.Number,
  })
);

export type RecentLink = {
  id: string;
  url: string;
  domain: string;
  title: string | null;
};

export const recentLinks$ = queryDb(
  () => ({
    query: `
      SELECT l.id, l.url, l.domain, l.createdAt, s.title
      FROM links l
      LEFT JOIN link_snapshots s ON s.id = (
        SELECT s2.id FROM link_snapshots s2
        WHERE s2.linkId = l.id
        ORDER BY s2.fetchedAt DESC
        LIMIT 1
      )
      WHERE l.deletedAt IS NULL
      ORDER BY l.createdAt DESC
      LIMIT 5
    `,
    schema: recentLinksSchema,
  }),
  { label: "popup:recentLinks" }
);
