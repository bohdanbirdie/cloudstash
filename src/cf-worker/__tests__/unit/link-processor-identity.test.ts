import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stack = readFileSync(
  new URL("../../../../alchemy.run.ts", import.meta.url),
  "utf8"
);
const workerEntry = readFileSync(
  new URL("../../index.ts", import.meta.url),
  "utf8"
);

describe("LinkProcessorDO identity", () => {
  it("keeps production on its original class and namespace", () => {
    expect(stack).toMatch(
      /LINK_PROCESSOR_DO: Cloudflare\.DurableObject<LinkProcessorDO>\(\s*"LinkProcessorDO",\s*\{\s*className: "LinkProcessorDO",?\s*\}/
    );
    expect(stack).not.toContain("LibraryDO");
    expect(stack).not.toContain("renamedFrom");
    expect(workerEntry).toContain(
      'export { LinkProcessorDO } from "./link-processor";'
    );
  });
});

const durableObjects = [
  { binding: "SYNC_BACKEND_DO", className: "SyncBackendDO" },
  { binding: "LINK_PROCESSOR_DO", className: "LinkProcessorDO" },
  { binding: "Chat", className: "ChatAgentDO" },
  { binding: "X_BOOKMARK_SYNC_DO", className: "XBookmarkSyncDO" },
];

describe("Durable Object identity", () => {
  it.each(durableObjects)(
    "keeps $binding bound to $className, so its data is not deleted",
    ({ binding, className }) => {
      expect(stack).toMatch(
        new RegExp(
          `${binding}:\\s*Cloudflare\\.DurableObject<${className}>\\(\\s*"${className}",\\s*\\{\\s*className: "${className}",?\\s*\\}`
        )
      );
    }
  );

  it("binds no other Durable Object classes", () => {
    expect(stack.match(/Cloudflare\.DurableObject</g)).toHaveLength(
      durableObjects.length
    );
  });
});
