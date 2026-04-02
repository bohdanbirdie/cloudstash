import type { Store } from "@livestore/livestore";
import { Effect, Layer } from "effect";

import { tables } from "../../../livestore/schema";
import type { schema } from "../../../livestore/schema";
import { TagId } from "../../db/branded";
import { LinkEventStore } from "../services";

export const LinkEventStoreLive = (store: Store<typeof schema>) =>
  Layer.succeed(LinkEventStore, {
    commit: (event) => Effect.sync(() => store.commit(event)),
    queryTags: () =>
      Effect.sync(() =>
        store
          .query(tables.tags.where({ deletedAt: null }))
          .map((t) => ({ id: TagId.make(t.id), name: t.name }))
      ),
  });
