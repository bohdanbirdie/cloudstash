import { makeWorker } from "@livestore/adapter-web/worker";
import { makeWsSync } from "@livestore/sync-cf/client";

import { schema } from "./livestore/schema";

makeWorker({
  schema,
  sync: {
    backend: makeWsSync({
      url: `${globalThis.location.origin}/sync`,
      ping: { requestInterval: 10_000 },
    }),
    initialSyncOptions: { _tag: "Blocking", timeout: 5000 },
  },
});
