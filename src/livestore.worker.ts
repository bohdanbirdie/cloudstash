import { makeWorker } from "@livestore/adapter-web/worker";
import { makeWsSync } from "@livestore/sync-cf/client";

import { schema } from "./livestore/schema";

makeWorker({
  schema,
  sync: {
    backend: makeWsSync({
      url: `${globalThis.location.origin}/sync`,
      ping: { requestInterval: 1_800_000 }, // 30 min instead of default 10s to reduce DO wake-ups
    }),
    initialSyncOptions: { _tag: "Blocking", timeout: 5000 },
  },
});
