import { queryDb, type Store } from "@livestore/livestore";
import { Effect, Layer } from "effect";

import { type schema, tables } from "../../../livestore/schema";
import { LinkRepository } from "../services";

export const LinkRepositoryLive = (store: Store<typeof schema>) =>
  Layer.succeed(LinkRepository, {
    findByUrl: (url) =>
      Effect.sync(() => {
        const results = store.query(queryDb(tables.links.where({ url })));
        return results.length > 0 ? results[0] : null;
      }),

    queryActiveLinks: () =>
      Effect.sync(() =>
        store.query(queryDb(tables.links.where({ deletedAt: null })))
      ),

    queryStatuses: () =>
      Effect.sync(() =>
        store.query(queryDb(tables.linkProcessingStatus.where({})))
      ),

    commitEvent: (event) => Effect.sync(() => store.commit(event)),
  });
