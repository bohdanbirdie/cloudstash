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
    queryLinkTagNames: (linkId) =>
      Effect.sync(() => {
        const allTags = store.query(tables.tags.where({ deletedAt: null }));
        const tagMap = new Map(allTags.map((t) => [t.id, t.name]));

        const appliedTags = store
          .query(tables.linkTags.where({ linkId }))
          .map((lt) => tagMap.get(lt.tagId))
          .filter((name): name is string => name != null);

        const suggestedTags = store
          .query(tables.tagSuggestions.where({ linkId }))
          .filter((s) => s.status !== "dismissed")
          .map((s) => s.suggestedName);

        return [...new Set([...appliedTags, ...suggestedTags])];
      }),
  });
