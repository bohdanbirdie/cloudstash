import { describe, expect, it } from "vitest";

import { WORKER_EFFECTIVE_COMPATIBILITY_FLAGS } from "../../../../worker.config";

describe("Worker compatibility flags", () => {
  it("matches the flags Alchemy deploys, so an Alchemy update cannot change them silently", () => {
    expect(WORKER_EFFECTIVE_COMPATIBILITY_FLAGS).toEqual([
      "nodejs_compat",
      "new_module_registry",
    ]);
  });
});
