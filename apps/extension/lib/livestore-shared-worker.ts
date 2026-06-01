import { makeWorker } from "@livestore/adapter-web/shared-worker";

if (typeof makeWorker !== "function") throw new Error("unreachable");
