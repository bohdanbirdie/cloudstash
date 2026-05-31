import { makeWorker } from "@livestore/adapter-web/worker";
import { makeWsSync } from "@livestore/sync-cf/client";
import { schema } from "@web/livestore/schema";

import { SYNC_URL } from "./config";

makeWorker({
  schema,
  sync: {
    backend: makeWsSync({
      url: SYNC_URL,
      ping: { requestInterval: 10_000 },
    }),
    initialSyncOptions: { _tag: "Blocking", timeout: 5000 },
  },
});
