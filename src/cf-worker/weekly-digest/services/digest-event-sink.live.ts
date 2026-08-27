import type { Store } from "@livestore/livestore";
import { Effect, Layer } from "effect";

import { events } from "../../../livestore/schema";
import type { schema, StoreEvent } from "../../../livestore/schema";
import { digestEventSinkErrorFromUnknown } from "../errors";
import { DigestEventSink } from "../services";

type Commit = (event: StoreEvent) => void;

export const DigestEventSinkLive = (
  store: Store<typeof schema>,
  commit: Commit = (event) => store.commit(event)
) =>
  Layer.succeed(DigestEventSink, {
    commit: (params) =>
      Effect.try({
        catch: digestEventSinkErrorFromUnknown,
        try: () =>
          commit(
            events.weeklyDigestGenerated({
              contentMd: params.contentMd,
              generatedAt: params.generatedAt,
              id: params.id,
              period: params.period,
            })
          ),
      }),
  });
