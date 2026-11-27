import { IncomingMessage } from "node:http";
import { Socket } from "node:net";

import { describe, expect, it } from "vitest";

import { devSeedApplies, syncConnection } from "../vite-plugin";

const request = (url: string, headers: Record<string, string> = {}) => {
  const req = new IncomingMessage(new Socket());
  req.url = url;
  req.headers = headers;
  return req;
};

describe("devSeedApplies", () => {
  it("runs only in the dev server", () => {
    expect(devSeedApplies("serve", {})).toBe(true);
    expect(devSeedApplies("build", {})).toBe(false);
  });

  it("stays off in tests and Storybook", () => {
    expect(devSeedApplies("serve", { VITEST: "true" })).toBe(false);
    expect(devSeedApplies("serve", { STORYBOOK: "true" })).toBe(false);
  });
});

describe("syncConnection", () => {
  it("reads the library and session from a /sync upgrade", () => {
    expect(
      syncConnection(
        request("/sync?storeId=org_1&transport=ws", {
          cookie: "session=abc",
          origin: "http://127.0.0.1:3000",
        })
      )
    ).toEqual({
      cookie: "session=abc",
      origin: "http://127.0.0.1:3000",
      storeId: "org_1",
    });
  });

  it("ignores other upgrades and connections without a session", () => {
    expect(
      syncConnection(request("/?token=x", { cookie: "session=abc" }))
    ).toBeUndefined();
    expect(syncConnection(request("/sync?storeId=org_1"))).toBeUndefined();
    expect(
      syncConnection(request("/sync", { cookie: "session=abc" }))
    ).toBeUndefined();
  });
});
