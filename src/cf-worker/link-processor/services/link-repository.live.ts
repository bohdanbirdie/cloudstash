import { queryDb } from "@livestore/livestore";
import type { Store } from "@livestore/livestore";
import { Effect, Layer } from "effect";

import { tables } from "../../../livestore/schema";
import type { schema, StoreEvent } from "../../../livestore/schema";
import type { DurableObjectRetiredError } from "../../durable-object-retirement";
import { LinkRepository } from "../services";

type Commit = (
  ...events: StoreEvent[]
) => Effect.Effect<void, DurableObjectRetiredError>;

export const LinkRepositoryLive = (
  store: Store<typeof schema>,
  commit: Commit = (...events) => Effect.sync(() => store.commit(...events))
) =>
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

    commitEvents: commit,
  });
