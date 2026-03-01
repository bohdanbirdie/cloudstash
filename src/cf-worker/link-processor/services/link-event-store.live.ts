import { type Store } from "@livestore/livestore";
import { Effect, Layer } from "effect";

import { type schema, tables } from "../../../livestore/schema";
import { LinkEventStore } from "../services";

export const LinkEventStoreLive = (store: Store<typeof schema>) =>
  Layer.succeed(LinkEventStore, {
    commit: (event) => Effect.sync(() => store.commit(event)),
    queryTags: () =>
      Effect.sync(() => store.query(tables.tags.where({ deletedAt: null }))),
  });
