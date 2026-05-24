import type { Store } from "@livestore/livestore";
import { Effect, Layer } from "effect";

import { events } from "../../../livestore/schema";
import type { schema } from "../../../livestore/schema";
import { digestEventSinkErrorFromUnknown } from "../errors";
import { DigestEventSink } from "../services";

export const DigestEventSinkLive = (store: Store<typeof schema>) =>
  Layer.succeed(DigestEventSink, {
    commit: (params) =>
      Effect.try({
        catch: digestEventSinkErrorFromUnknown,
        try: () =>
          store.commit(
            events.weeklyDigestGenerated({
              contentMd: params.contentMd,
              generatedAt: params.generatedAt,
              id: params.id,
              period: params.period,
            })
          ),
      }),
  });
